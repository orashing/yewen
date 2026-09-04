import asyncio
import json
import random
from datetime import date, timedelta
from pathlib import Path

import httpx
from pydantic import BaseModel

from .errors import AIProviderError, BudgetExceededError
from .model_router import estimate_cost_usd, estimate_request_ceiling_usd, policy_for
from .settings import get_settings
from .usage_store import log_usage, month_spend_usd
from .schemas import (
    CalendarPlanEntry,
    CalendarPlanRequest,
    CalendarPlanResponse,
    CardPlanResponse,
    CardSpec,
    ComplianceFlag,
    ContentBrief,
    DraftResponse,
    FactCheckItem,
    FactCheckResponse,
    FactSource,
    OpinionContext,
    RadarTopicCandidate,
    RepurposeOutput,
    RepurposeResponse,
    TopicCandidate,
    TopicRadarResponse,
    TopicSuggestResponse,
    TrendSignal,
    TrendSignalSource,
    TrendSweepResponse,
    EditorialCandidate, EditorialDirectorResponse, EditorialPick, EditorialReviewResponse,
    XhsNativeTextPlanResponse,
)

ROOT = Path(__file__).resolve().parents[2]
PROMPTS = ROOT / "prompts"


def _read_prompt(name: str) -> str:
    return (PROMPTS / name).read_text(encoding="utf-8")


def _extract_output_text(payload: dict) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    chunks: list[str] = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            text = content.get("text")
            if isinstance(text, str):
                chunks.append(text)
    return "\n".join(chunks)


async def _post_responses(task: str, body: dict) -> dict:
    settings = get_settings()
    policy = policy_for(task)
    if not settings.openai_configured:
        raise AIProviderError("OPENAI_API_KEY is not configured")

    prompt_chars = len(json.dumps(body.get("input") or [], ensure_ascii=False))
    web_runs_ceiling = int(body.get("max_tool_calls") or 0)
    cap = settings.openai_monthly_budget_usd
    if cap > 0:
        spent = month_spend_usd()
        ceiling = estimate_request_ceiling_usd(task, prompt_chars, web_runs_ceiling)
        if spent + ceiling > cap:
            raise BudgetExceededError(
                f"AI monthly budget would be exceeded: spent=${spent:.4f}, request_ceiling=${ceiling:.4f}, cap=${cap:.2f}"
            )

    headers = {"Authorization": f"Bearer {settings.openai_api_key}", "Content-Type": "application/json"}
    last_exc: Exception | None = None
    for attempt in range(settings.openai_max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0)) as client:
                response = await client.post("https://api.openai.com/v1/responses", headers=headers, json=body)
            request_id = response.headers.get("x-request-id", "")
            if response.status_code in {429, 500, 502, 503, 504} and attempt < settings.openai_max_retries:
                await asyncio.sleep(min(6.0, 0.7 * (2 ** attempt) + random.random() * 0.35))
                continue
            response.raise_for_status()
            payload = response.json()
            web_runs = sum(1 for item in payload.get("output", []) if item.get("type") == "web_search_call")
            usage = payload.get("usage") or {}
            log_usage(
                task=task, model=policy.model, usage=usage, web_runs=web_runs,
                cost_usd=estimate_cost_usd(policy.model, usage, web_runs), success=True, request_id=request_id,
            )
            return payload
        except BudgetExceededError:
            raise
        except Exception as exc:
            last_exc = exc
            if attempt < settings.openai_max_retries and isinstance(exc, (httpx.TimeoutException, httpx.NetworkError)):
                await asyncio.sleep(min(6.0, 0.7 * (2 ** attempt) + random.random() * 0.35))
                continue
            break

    log_usage(task=task, model=policy.model, usage=None, web_runs=0, cost_usd=0, success=False, error_code=type(last_exc).__name__ if last_exc else 'unknown')
    raise AIProviderError(f"OpenAI request failed for task={task}: {last_exc}") from last_exc


def _base_body(task: str, system_prompt: str, user_prompt: str, schema_model: type[BaseModel]) -> dict:
    policy = policy_for(task)
    return {
        "model": policy.model,
        "store": False,
        "reasoning": {"effort": policy.reasoning_effort},
        "max_output_tokens": policy.max_output_tokens,
        "input": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": schema_model.__name__.lower(),
                "schema": schema_model.model_json_schema(),
                "strict": False,
            }
        },
    }


async def _call_openai(task: str, system_prompt: str, user_prompt: str, schema_model: type[BaseModel]) -> dict:
    body = _base_body(task, system_prompt, user_prompt, schema_model)
    payload = await _post_responses(task, body)
    text = _extract_output_text(payload)
    if not text.strip():
        raise AIProviderError(f"OpenAI returned no structured text for task={task}")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise AIProviderError(f"OpenAI returned invalid JSON for task={task}") from exc


def _collect_web_urls(payload: dict) -> set[str]:
    urls: set[str] = set()
    for item in payload.get("output", []):
        if item.get("type") == "web_search_call":
            action = item.get("action") or {}
            for source in action.get("sources", []) or []:
                url = source.get("url")
                if isinstance(url, str) and url.startswith("http"):
                    urls.add(url)
        for content in item.get("content", []) or []:
            for ann in content.get("annotations", []) or []:
                if ann.get("type") == "url_citation":
                    url = ann.get("url")
                    if isinstance(url, str) and url.startswith("http"):
                        urls.add(url)
    return urls


async def _call_openai_with_web(task: str, system_prompt: str, user_prompt: str, schema_model: type[BaseModel], max_tool_calls: int | None = None) -> tuple[dict, set[str], bool]:
    policy = policy_for(task)
    body = _base_body(task, system_prompt, user_prompt, schema_model)
    body.update({
        "max_tool_calls": max(1, min(4, max_tool_calls if max_tool_calls is not None else (policy.max_tool_calls or 2))),
        "tools": [{"type": "web_search", "search_context_size": "medium"}],
        "tool_choice": "auto",
    })
    payload = await _post_responses(task, body)
    text = _extract_output_text(payload)
    if not text.strip():
        raise AIProviderError(f"OpenAI returned no structured text for task={task}")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AIProviderError(f"OpenAI returned invalid JSON for task={task}") from exc
    searched = any(item.get("type") == "web_search_call" for item in payload.get("output", []))
    return parsed, _collect_web_urls(payload), searched


def _fallback_or_raise(exc: Exception, mock_value, mode: str = "mock"):
    # Budget is a hard stop even in local/dev. Falling back to mock after the cap is reached
    # would make the UI look successful while the requested real-AI operation never happened.
    if isinstance(exc, BudgetExceededError):
        raise exc
    if get_settings().mock_fallback_enabled:
        return mock_value, mode
    if isinstance(exc, AIProviderError):
        raise exc
    raise AIProviderError(str(exc)) from exc


def _opinion_payload(opinions: list[OpinionContext]) -> list[dict]:
    return [item.model_dump() for item in opinions]


def _mock_brief(topic: str, opinions: list[OpinionContext]) -> ContentBrief:
    opinion_hint = opinions[0].viewpoint if opinions else "把大学选择连接到毕业后的真实路径"
    return ContentBrief(
        target_audience="北京高二/高三学生及家长，尤其是中高分段、在学校/专业/城市之间纠结的家庭",
        purpose="decision",
        content_type="决策型",
        core_conflict="学校层次、专业匹配与城市机会之间的取舍",
        thesis=f"不要直接问“{topic}哪个更好”，先判断两种选择是否带来了足够大的培养和职业路径差异。",
        reader_takeaway="建立一个可重复使用的决策框架，而不是只记住一个学校结论。",
        creator_angle=f"结合个人观点库中的判断：{opinion_hint}",
        outline=[
            "先指出家长最容易掉进去的单一排名思维",
            "拆解学校层次差距是否足够大",
            "比较专业培养、转专业/保研与就业出口",
            "加入北京家庭对城市和实习机会的特殊权重",
            "给出三类学生分别怎么选",
            "用决策清单收尾",
        ],
        facts_to_verify=["涉及具体高校招生位次时核验最新北京数据", "涉及保研率或就业率时使用学校官方/权威来源"],
        risk_flags=["避免使用保录、一分不浪费、内部数据等表述", "具体分数/位次不核验不发布"],
    )


def _mock_draft(topic: str, brief: ContentBrief) -> DraftResponse:
    titles = [
        f"{topic}，真正该比的不是排名",
        f"北京家长纠结{topic}时，我会先看这4件事",
        f"别急着问{topic}选谁，先把这个账算清楚",
    ]
    body = (
        f"很多家长问我：{topic}到底怎么选？\n\n"
        "我通常不会先给学校排个高低，而是先问四件事。\n\n"
        "第一，学校层次的差距到底有多大。如果只是榜单上前后十几名，但培养平台、保研机会和就业认可没有形成明显跃迁，单纯为了一个标签去牺牲专业，未必划算。\n\n"
        "第二，专业差距是否会改变未来四年的学习体验和毕业出口。一个孩子对数学、编程、医学或人文完全没兴趣，再热门的专业也可能变成四年的消耗。\n\n"
        "第三，北京家庭要额外考虑城市机会。留京意味着实习、行业活动、家庭支持都更方便；但如果出京能换来明显更强的平台或更匹配的专业，这个交换就值得认真算。\n\n"
        "第四，看孩子未来想走什么路。保研、考公、进大厂、出国，对本科选择的权重并不一样。\n\n"
        f"所以我更认同这个判断：{brief.thesis}\n\n"
        "志愿最难的从来不是把专业组填满，而是知道自己到底在用什么换什么。"
    )
    return DraftResponse(
        titles=titles,
        body=body,
        tags=["#北京高考", "#高考志愿", "#大学专业", "#专业选择", "#升学规划"],
        factual_claims=["北京本科普通批志愿数量/规则（若正文具体引用则需核验）"],
    )


def _mock_topics(seed: str, count: int) -> TopicSuggestResponse:
    prefix = f"围绕“{seed}”： " if seed.strip() else ""
    raw = [
        ("北京650分，到底值不值得出京？", "城市便利 vs 学校/专业跃迁", "decision", 8.1, 8.8, 9.1, 7.2, 9.3),
        ("普通家庭本科读金融，我会先看这4个条件", "专业热度 vs 家庭资源与就业门槛", "conversion", 8.8, 9.1, 9.4, 6.8, 9.6),
        ("北邮计算机和普通985，到底怎么选？", "学校标签 vs 专业与就业确定性", "decision", 8.9, 9.0, 9.0, 7.4, 9.4),
        ("北京孩子为什么不该默认留北京读大学", "家庭惯性 vs 全国范围内的机会成本", "traffic", 8.6, 9.3, 8.5, 7.0, 9.2),
        ("高考志愿真正难的，不是把30个专业组填满", "填表技能 vs 家庭长期决策", "conversion", 7.7, 8.0, 9.7, 6.5, 9.7),
        ("计算机还值得报吗？先别急着看就业榜", "行业周期 vs 个体适配", "traffic", 9.5, 9.2, 8.4, 9.0, 8.9),
        ("为了985接受冷门专业，什么情况下值得？", "学校层级 vs 专业路径", "decision", 8.7, 8.9, 9.0, 7.1, 9.4),
        ("北京家长最容易高估的一个志愿优势：地理位置", "熟悉感 vs 真实培养收益", "trust", 7.9, 8.7, 8.7, 6.7, 9.0),
        ("孩子说‘我没什么喜欢的专业’，家长该怎么开始选？", "兴趣不明确 vs 决策截止时间", "trust", 8.4, 7.5, 9.3, 7.0, 9.2),
        ("保研、考公、进大厂：本科志愿的权重完全不同", "路径目标 vs 单一学校排名", "professional", 8.2, 8.1, 9.0, 7.2, 9.5),
    ]
    topics = []
    for title, angle, purpose, search, controversy, conversion, timely, fit in raw[:count]:
        topics.append(
            TopicCandidate(
                title=f"{prefix}{title}" if prefix else title,
                angle=angle,
                target_audience="北京高二/高三学生及家长",
                purpose=purpose,
                search_demand=search,
                controversy=controversy,
                conversion_value=conversion,
                timeliness=timely,
                creator_fit=fit,
                rationale="优先选择有明确取舍、能体现判断力且可能产生家长咨询的问题。",
            )
        )
    return TopicSuggestResponse(topics=topics)


async def generate_brief(topic: str, opinions: list[OpinionContext] | None = None) -> tuple[ContentBrief, str]:
    opinions = opinions or []
    try:
        data = await _call_openai(
            "brief", _read_prompt("content_brief.md"),
            json.dumps({"rough_topic": topic, "creator_opinions": _opinion_payload(opinions)}, ensure_ascii=False),
            ContentBrief,
        )
        return ContentBrief.model_validate(data), "openai"
    except Exception as exc:
        return _fallback_or_raise(exc, _mock_brief(topic, opinions))


async def generate_draft(topic: str, brief: ContentBrief, opinions: list[OpinionContext] | None = None) -> tuple[DraftResponse, str]:
    opinions = opinions or []
    try:
        data = await _call_openai(
            "draft", _read_prompt("writer.md"),
            json.dumps(
                {"topic": topic, "brief": brief.model_dump(), "creator_opinions": _opinion_payload(opinions)},
                ensure_ascii=False,
            ),
            DraftResponse,
        )
        return DraftResponse.model_validate(data), "openai"
    except Exception as exc:
        return _fallback_or_raise(exc, _mock_draft(topic, brief))


async def suggest_topics(
    seed: str, count: int, recent_topics: list[str], opinions: list[OpinionContext]
) -> tuple[TopicSuggestResponse, str]:
    try:
        data = await _call_openai(
            "topic_suggest", _read_prompt("topic_planner.md"),
            json.dumps(
                {
                    "seed": seed,
                    "count": count,
                    "recent_topics": recent_topics,
                    "creator_opinions": _opinion_payload(opinions),
                },
                ensure_ascii=False,
            ),
            TopicSuggestResponse,
        )
        return TopicSuggestResponse.model_validate(data), "openai"
    except Exception as exc:
        return _fallback_or_raise(exc, _mock_topics(seed, count))


def _mock_fact_check(claims: list[str], body: str) -> FactCheckResponse:
    items = []
    for claim in claims:
        items.append(FactCheckItem(
            claim=claim,
            status="needs_review",
            verdict="演示模式无法联网核验；请配置 OPENAI_API_KEY 后重新检查。",
            confidence=0.2,
            sources=[],
        ))
    flags = []
    risky = ["保录", "百分百", "一分不浪费", "内部渠道", "官方认证"]
    for word in risky:
        if word in body:
            flags.append(ComplianceFlag(severity="high", text=f"出现高风险营销表述：{word}", suggestion="删除结果承诺或权威暗示，改成条件化、可核验的咨询表述。"))
    return FactCheckResponse(items=items, compliance_flags=flags, summary="当前为演示核验；未配置联网模型。", searched_web=False)


def _mock_card_plan(title: str, body: str, count: int) -> CardPlanResponse:
    paras=[x.strip() for x in body.split("\n") if x.strip()]
    cards=[CardSpec(eyebrow="北京高考 · 决策", headline=title, body=["不是替你做决定，而是把取舍讲清楚"], layout="cover")]
    middle=max(2,count-2)
    for i in range(middle):
        txt=paras[i+1] if i+1 < len(paras) else (paras[i] if i < len(paras) else "先看学校层次、专业匹配、城市机会和未来路径。")
        cards.append(CardSpec(eyebrow=f"0{i+1}", headline=txt[:24].rstrip("，。！？"), body=[txt[:88]], layout="points"))
    cards.append(CardSpec(eyebrow="最后", headline="真正重要的是：你在用什么换什么", body=["把学校、专业、城市和未来路径放在同一张决策表里。"], layout="summary"))
    return CardPlanResponse(cards=cards[:count])


async def fact_check(topic: str, title: str, body: str, claims: list[str], max_web_runs: int = 2) -> tuple[FactCheckResponse, str]:
    claims = [x.strip() for x in claims if x and x.strip()]
    # In production/API mode we still inspect the final revised body even when the writer did not
    # explicitly flag claims. This prevents a rewrite from introducing an unchecked factual claim.
    if not claims and not get_settings().openai_configured:
        return FactCheckResponse(items=[], compliance_flags=[], summary="正文没有显式待核验事实项；当前未启用 API 自动抽取。", searched_web=False), "no_claims"
    try:
        raw, real_urls, searched = await _call_openai_with_web(
            "fact_check", _read_prompt("fact_checker.md"),
            json.dumps({
                "topic": topic, "title": title, "body": body, "claims": claims,
                "instruction": "除核验 claims 外，也检查最终正文中其他可验证、可能随时间变化且影响决策的事实；发现后直接作为 item 输出。"
            }, ensure_ascii=False),
            FactCheckResponse, max_tool_calls=max_web_runs,
        )
        result = FactCheckResponse.model_validate(raw)
        # Never display a model-invented URL as evidence. Keep only URLs observed in actual web-search output/citations.
        for item in result.items:
            item.sources = [src for src in item.sources if src.url in real_urls]
            if item.status == "verified" and not item.sources:
                item.status = "needs_review"
                item.verdict = f"{item.verdict}（未捕获到可验证的实际搜索来源，已降级为人工复核）"
                item.confidence = min(item.confidence, 0.55)
        result.searched_web = searched
        return result, "openai_web"
    except Exception as exc:
        return _fallback_or_raise(exc, _mock_fact_check(claims, body))


async def generate_card_plan(topic: str, title: str, body: str, count: int) -> tuple[CardPlanResponse, str]:
    system = """你是小红书图文卡片主编。把一篇升学决策文章拆成4-9张3:4卡片。\n规则：第一张必须是封面；每张只讲一个信息点；headline尽量18字内；body每条尽量36字内，最多4条；不要创造正文不存在的数据；最后一张做决策总结；不写夸大营销词。"""
    try:
        data = await _call_openai(
            "card_plan", system,
            json.dumps({"topic":topic,"title":title,"body":body,"card_count":count}, ensure_ascii=False),
            CardPlanResponse,
        )
        plan = CardPlanResponse.model_validate(data)
        cards = plan.cards[:count]
        if len(cards) < 4:
            return _mock_card_plan(title, body, count), "mock_fallback"
        cards[0].layout = "cover"
        cards[0].headline = cards[0].headline[:42]
        for card in cards[1:]:
            card.headline = card.headline[:36]
            card.body = [line[:80] for line in card.body[:6]]
        return CardPlanResponse(cards=cards), "openai"
    except Exception as exc:
        return _fallback_or_raise(exc, _mock_card_plan(title, body, count))


def _mock_radar(count: int) -> TopicRadarResponse:
    raw = [
        ("北京新高考政策变化，家长真正需要重新检查什么？", "把政策新闻翻译成家庭决策清单", "professional", "policy", 8.0, 6.2, 8.8, 9.2, 9.5),
        ("北京650分，到底值不值得为了学校层次出京？", "北京家庭的城市偏好 vs 平台跃迁", "decision", "evergreen", 8.6, 8.8, 9.1, 7.1, 9.6),
        ("普通家庭本科读金融，我会先看这4个条件", "专业光环 vs 学历、实习与家庭资源", "conversion", "career", 8.9, 9.1, 9.5, 8.2, 9.7),
        ("计算机还值得报吗？先分清行业周期和孩子适配", "热门专业热度 vs 个体长期能力", "traffic", "career", 9.4, 9.3, 8.3, 8.8, 9.0),
        ("北邮计算机和普通985：北京家长最容易漏算的一笔账", "学校标签 vs 专业确定性与城市机会", "decision", "evergreen", 9.0, 9.1, 9.0, 7.0, 9.5),
        ("高校新增专业越来越多，什么样的新专业值得第一届就报？", "新专业红利 vs 培养体系不成熟", "trust", "admissions", 8.3, 8.4, 8.7, 8.9, 9.2),
        ("孩子说没有喜欢的专业，家长不要急着做兴趣测试", "兴趣不明确 vs 真实经历不足", "trust", "question", 8.5, 7.8, 9.2, 7.5, 9.4),
        ("保研、考公、进大厂：同一个分数的志愿排序可以完全相反", "目标路径决定学校与专业权重", "professional", "evergreen", 8.2, 8.0, 9.0, 6.8, 9.6),
    ]
    topics = []
    for title, angle, purpose, signal, search, controversy, conversion, timely, fit in raw[:count]:
        topics.append(RadarTopicCandidate(
            title=title, angle=angle, target_audience="北京高二/高三学生及家长", purpose=purpose,
            search_demand=search, controversy=controversy, conversion_value=conversion,
            timeliness=timely, creator_fit=fit,
            rationale="优先体现真实取舍与咨询价值；演示模式不声称存在实时热点。",
            signal_type=signal,
            why_now="演示模式：请配置 OpenAI API 后联网扫描最新公开信息。",
            confidence=0.45, sources=[],
        ))
    return TopicRadarResponse(
        topics=topics, summary="当前为演示雷达：选题结构可用，但没有联网热点依据。", searched_web=False
    )


async def scan_topic_radar(
    focus: str, count: int, recent_topics: list[str], opinions: list[OpinionContext], max_web_runs: int = 2
) -> tuple[TopicRadarResponse, str]:
    try:
        data, allowed_urls, searched = await _call_openai_with_web(
            "topic_radar", _read_prompt("topic_radar.md"),
            json.dumps({
                "focus": focus, "count": count, "recent_topics": recent_topics,
                "creator_opinions": _opinion_payload(opinions),
                "current_date": date.today().isoformat(),
                "today_hint": "Prefer recent, still-relevant signals and state why they matter now.",
            }, ensure_ascii=False),
            TopicRadarResponse, max_tool_calls=max_web_runs,
        )
        result = TopicRadarResponse.model_validate(data)
        cleaned = []
        for item in result.topics[:count]:
            item.sources = [src for src in item.sources if src.url and src.url in allowed_urls]
            if item.signal_type != "evergreen" and not item.sources:
                item.confidence = min(item.confidence, 0.45)
                item.timeliness = min(item.timeliness, 6.0)
                if "未绑定可验证来源" not in item.why_now:
                    item.why_now = (item.why_now + "；未绑定可验证来源，建议人工确认后再按热点发布").strip("；")
            cleaned.append(item)
        result.topics = cleaned
        result.searched_web = searched
        return result, "openai"
    except Exception as exc:
        return _fallback_or_raise(exc, _mock_radar(count))



def _mock_trend_sweep(count: int) -> TrendSweepResponse:
    examples = [
        ("北京高考", "北京650分该不该出京", "xiaohongshu", "search", 6.5, 8.6, 7.0, 9.7, 9.1),
        ("金融专业", "普通家庭要不要本科读金融", "xiaohongshu", "search", 6.2, 8.8, 7.4, 9.0, 9.5),
        ("计算机专业", "AI时代计算机还值得报吗", "web", "career", 7.0, 8.9, 7.2, 9.1, 8.5),
        ("北京志愿填报", "院校专业组最容易误判的三个位置", "official", "policy", 7.5, 8.0, 5.5, 9.8, 8.8),
        ("大学专业选择", "孩子没有喜欢的专业怎么办", "xiaohongshu", "hot_topic", 6.8, 8.0, 7.8, 9.4, 9.2),
    ]
    signals=[]
    for q,title,platform,surface,fresh,intent,eng,fit,conv in examples[:count]:
        signals.append(TrendSignal(
            title=title, query=q, summary="演示信号：用于验证选题雷达结构，不代表当前小红书实时热度。",
            platform=platform, surface=surface, freshness=fresh, search_intent=intent, engagement_signal=eng,
            audience_fit=fit, conversion_fit=conv, confidence=0.35, observed_at=date.today().isoformat(), source=None
        ))
    return TrendSweepResponse(
        signals=signals, summary="当前为零 API / 演示信号。要获得实时站内热度，请使用 AI Bridge 联网扫描，或未来启用本地 XHS Research Collector。",
        searched_web=False, xhs_direct=False, limitations=[
            "小红书开放平台当前没有普通开发者可用的全站笔记搜索/热榜 API。",
            "演示数据不应被当作实时热点依据。"
        ]
    )


async def sweep_trend_signals(
    focus: str, watch_queries: list[str], competitor_queries: list[str], recent_topics: list[str], count: int, max_web_runs: int = 2
) -> tuple[TrendSweepResponse, str]:
    try:
        data, allowed_urls, searched = await _call_openai_with_web(
            "trend_sweep", _read_prompt("trend_sweep.md"),
            json.dumps({
                "focus": focus,
                "watch_queries": watch_queries,
                "competitor_queries": competitor_queries,
                "recent_topics": recent_topics,
                "count": count,
                "current_date": date.today().isoformat(),
                "constraint": "Only report signals supported by pages actually found in web search. Do not claim direct in-app XHS hot-list access."
            }, ensure_ascii=False),
            TrendSweepResponse, max_tool_calls=max_web_runs,
        )
        result=TrendSweepResponse.model_validate(data)
        cleaned=[]
        for sig in result.signals[:count]:
            if sig.source and sig.source.url:
                if sig.source.url not in allowed_urls:
                    sig.source=None
                    sig.confidence=min(sig.confidence,0.4)
            if sig.platform == "xiaohongshu" and not sig.source:
                sig.confidence=min(sig.confidence,0.4)
            cleaned.append(sig)
        result.signals=cleaned
        result.searched_web=searched
        result.xhs_direct=False
        if "当前未使用小红书站内直连采集器" not in result.limitations:
            result.limitations.append("当前未使用小红书站内直连采集器；XHS 信号仅来自可被联网检索验证的公开页面。")
        return result, "openai"
    except Exception as exc:
        return _fallback_or_raise(exc, _mock_trend_sweep(count))

def _mock_calendar(req: CalendarPlanRequest) -> CalendarPlanResponse:
    target = max(1, round(req.days / 7 * req.posts_per_week))
    base = [
        ("traffic", "北京650分到底值不值得出京？", "用一个高冲突问题拉新"),
        ("decision", "北邮计算机和普通985，到底怎么选？", "展示学校与专业的权衡框架"),
        ("trust", "一个孩子说‘我没喜欢的专业’时，我会先问什么", "用咨询过程建立信任"),
        ("professional", "保研、考公、进大厂：志愿排序为什么会完全不同", "展示专业判断"),
        ("traffic", "计算机还值得报吗？先别急着看就业榜", "承接热门专业搜索"),
        ("decision", "为了985接受冷门专业，什么情况下值得？", "高冲突决策"),
        ("trust", "我为什么不建议家长只问‘哪个专业最赚钱’", "建立价值观"),
        ("professional", "北京院校专业组，真正影响决策的是哪几步", "规则型专业内容"),
        ("conversion", "志愿最难的不是填表，而是家庭要先统一这4件事", "自然引出咨询价值"),
        ("decision", "普通家庭本科读金融，我会先看这4个条件", "体现创作者真实金融背景可讲的判断"),
    ]
    pool = [(t.purpose, t.title, "优先消化现有高价值选题") for t in req.topic_pool]
    existing = {x[1] for x in pool}
    pool.extend(x for x in base if x[1] not in existing)
    preferred = [0, 1, 3, 4, 6, 2, 5][:req.posts_per_week]
    day_offsets = []
    week_start = 0
    while week_start < req.days and len(day_offsets) < target:
        for dow in preferred:
            offset = week_start + dow
            if offset < req.days:
                day_offsets.append(offset)
            if len(day_offsets) >= target:
                break
        week_start += 7
    purpose_counts: dict[str, int] = {}
    entries = []
    for i, offset in enumerate(sorted(day_offsets[:target])):
        purpose, title, why = pool[i % len(pool)]
        planned = req.start_date + timedelta(days=offset)
        entries.append(CalendarPlanEntry(
            planned_date=planned, slot=1, title=title, purpose=purpose,
            angle="从北京家庭真实取舍切入，不做榜单式答案", rationale=why,
            source_topic_title=title if any(t.title == title for t in req.topic_pool) else "",
        ))
        purpose_counts[purpose] = purpose_counts.get(purpose, 0) + 1
    return CalendarPlanResponse(
        entries=entries,
        strategy_summary=f"按每周约 {req.posts_per_week} 篇安排，保留休息日；用决策/流量建立触达，再穿插信任、专业与少量转化内容。",
        mix_summary=purpose_counts,
    )


async def plan_content_calendar(req: CalendarPlanRequest) -> tuple[CalendarPlanResponse, str]:
    try:
        data = await _call_openai(
            "calendar", _read_prompt("calendar_planner.md"),
            json.dumps({
                "start_date": req.start_date.isoformat(), "days": req.days,
                "posts_per_week": req.posts_per_week, "content_mix": req.content_mix,
                "topic_pool": [x.model_dump() for x in req.topic_pool],
                "recent_titles": req.recent_titles,
                "creator_opinions": _opinion_payload(req.opinions),
            }, ensure_ascii=False, default=str),
            CalendarPlanResponse,
        )
        result = CalendarPlanResponse.model_validate(data)
        end = req.start_date + timedelta(days=req.days - 1)
        result.entries = [x for x in result.entries if req.start_date <= x.planned_date <= end]
        result.entries.sort(key=lambda x: (x.planned_date, x.slot))
        target = max(1, round(req.days / 7 * req.posts_per_week))
        if len(result.entries) < max(3, int(target * 0.6)):
            raise ValueError("calendar plan too sparse")
        counts: dict[str, int] = {}
        for item in result.entries:
            counts[item.purpose] = counts.get(item.purpose, 0) + 1
        result.mix_summary = counts
        return result, "openai"
    except Exception as exc:
        return _fallback_or_raise(exc, _mock_calendar(req))


def _mock_repurpose(title: str, body: str, channels: list[str]) -> RepurposeResponse:
    first = next((x.strip() for x in body.split("\n") if x.strip()), title)
    outputs = []
    for channel in channels:
        if channel == "video_script":
            text = f"很多家长会直接问：{title}。但我觉得第一步不是选边站，而是把你到底在用什么换什么算清楚。\n\n{first[:220]}\n\n如果学校层次、专业匹配和城市机会没有形成明显跃迁，就不要只为了一个标签做决定。真正需要先明确的是孩子未来更偏保研、就业、考公还是出国。"
            outputs.append(RepurposeOutput(channel=channel, title=title, body=text, notes="约60-90秒口播骨架"))
        elif channel == "wechat_moments":
            text = f"最近在整理一个问题：{title}。\n\n我越来越觉得，志愿最难的不是查到更多信息，而是把学校、专业、城市和未来路径放在同一张决策表里。很多看似纠结的选择，一旦把交换关系讲清楚，答案会清楚很多。"
            outputs.append(RepurposeOutput(channel=channel, title="", body=text, notes="朋友圈克制分享版"))
        elif channel == "wechat_group":
            text = f"今天想和大家讨论一个志愿决策题：{title}。我通常不会先看排行榜，而会先比较学校层次差距、专业匹配、城市机会和孩子未来路径。大家如果遇到类似选择，也可以先按这四项列出来再讨论。"
            outputs.append(RepurposeOutput(channel=channel, title="", body=text, notes="家长群讨论版"))
        else:
            outputs.append(RepurposeOutput(channel=channel, title=title, body=body[:900], notes="摘要复用版"))
    return RepurposeResponse(outputs=outputs)


async def repurpose_content(topic: str, title: str, body: str, channels: list[str]) -> tuple[RepurposeResponse, str]:
    try:
        data = await _call_openai(
            "repurpose", _read_prompt("repurpose.md"),
            json.dumps({"topic": topic, "title": title, "body": body, "channels": channels}, ensure_ascii=False),
            RepurposeResponse,
        )
        return RepurposeResponse.model_validate(data), "openai"
    except Exception as exc:
        return _fallback_or_raise(exc, _mock_repurpose(title, body, channels))

# --- v0.8 Editorial Director ---
def _mock_editorial_director(candidates: list[EditorialCandidate]) -> EditorialDirectorResponse:
    def score(x: EditorialCandidate) -> float:
        return (
            x.search_score * 0.16 + x.audience_fit * 0.24 + x.conversion_score * 0.28
            + x.timeliness * 0.12 + x.historical_value * 0.20
        )
    ranked=sorted(candidates,key=score,reverse=True)
    first=ranked[0]
    second=ranked[1] if len(ranked)>1 else ranked[0]
    def pick(x: EditorialCandidate, why: str) -> EditorialPick:
        return EditorialPick(
            title=x.title,purpose=x.purpose,angle=x.angle or '从家庭真实取舍切入',
            target_audience='北京高中生及家长',why_now='兼顾当前需求与长期搜索价值',
            why_this_over_others=why,predicted_lead_quality=min(10,round(score(x),1)),confidence=0.62,
        )
    return EditorialDirectorResponse(
        primary=pick(first,'综合北京家长匹配、转化潜力与历史价值后最优。'),
        backup=pick(second,'作为不同角度的备选，避免当天题目不想发时重新选题。'),
        rejected_patterns=['纯榜单式选题','只有热点、没有决策冲突的选题'],
        strategy_note='演示模式按本地权重排序；接 API 后由总编辑模型做语义判断。'
    )


async def run_editorial_director(candidates: list[EditorialCandidate], recent_titles: list[str], goal: str, editorial_style: str) -> tuple[EditorialDirectorResponse,str]:
    try:
        data=await _call_openai(
            'editorial_director',_read_prompt('editorial_director.md'),
            json.dumps({'candidates':[x.model_dump() for x in candidates],'recent_titles':recent_titles,'goal':goal,'editorial_style':editorial_style},ensure_ascii=False),
            EditorialDirectorResponse,
        )
        return EditorialDirectorResponse.model_validate(data),'openai'
    except Exception as exc:
        return _fallback_or_raise(exc, _mock_editorial_director(candidates))


def _mock_editorial_review(title: str, body: str) -> EditorialReviewResponse:
    tells=[]
    for word in ['首先','其次','最后','值得注意的是','在当今','不难发现']:
        if word in body: tells.append(f'出现模板化表达：{word}')
    score=max(55,88-len(tells)*5)
    return EditorialReviewResponse(
        publish_ready=score>=75,overall_score=score,human_voice_score=min(95,score+4),ai_tell_score=min(100,len(tells)*12),
        trust_score=86,conversion_score=78,strongest_point='有明确决策问题和条件化判断。',
        objections=['检查是否把个人经验泛化为所有家庭。'],ai_tells=tells,logic_gaps=[],
        rewrite_notes=['保留具体判断，删掉空泛过渡句。'] if tells else [],
        revised_title=title,revised_body=body,
    )


async def review_editorial(topic: str,title: str,body: str,target_audience: str,editorial_style: str) -> tuple[EditorialReviewResponse,str]:
    try:
        data=await _call_openai(
            'editorial_review',_read_prompt('editorial_review.md'),
            json.dumps({'topic':topic,'title':title,'body':body,'target_audience':target_audience,'editorial_style':editorial_style},ensure_ascii=False),
            EditorialReviewResponse,
        )
        return EditorialReviewResponse.model_validate(data),'openai'
    except Exception as exc:
        return _fallback_or_raise(exc, _mock_editorial_review(title,body))


def _mock_native_text_plan(title: str, body: str, preferred_style: str, max_pages_hint: int) -> XhsNativeTextPlanResponse:
    style = preferred_style if preferred_style != 'auto' else '简约'
    paras=[x.strip() for x in body.split('\n') if x.strip()]
    normalized='\n\n'.join(paras)
    chars=max(1,len(normalized))
    expected=max(3,min(max_pages_hint,round(chars/220)+1))
    return XhsNativeTextPlanResponse(
        title=title[:30],input_text=normalized,recommended_style=style,
        fallback_styles=['备忘','基础'] if style not in {'备忘','基础'} else ['简约','基础'],
        style_reason='升学决策内容优先使用文字可读性高、机构感较弱的原生模板。',
        expected_pages=expected,cover_hook=title[:24],
        paragraph_rules=['2-4句一段','避免Markdown表格','关键结论单独成段','保留自然口语停顿'],automation_ready=True,
    )


async def build_xhs_native_text_plan(topic: str,title: str,body: str,preferred_style: str,max_pages_hint: int) -> tuple[XhsNativeTextPlanResponse,str]:
    try:
        data=await _call_openai(
            'xhs_native_text',_read_prompt('xhs_native_text.md'),
            json.dumps({'topic':topic,'title':title,'body':body,'preferred_style':preferred_style,'max_pages_hint':max_pages_hint},ensure_ascii=False),
            XhsNativeTextPlanResponse,
        )
        return XhsNativeTextPlanResponse.model_validate(data),'openai'
    except Exception as exc:
        return _fallback_or_raise(exc, _mock_native_text_plan(title,body,preferred_style,max_pages_hint))
