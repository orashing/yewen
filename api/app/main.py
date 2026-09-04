from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .errors import AIProviderError, BudgetExceededError
from .model_router import policy_for
from .settings import get_settings
from .usage_store import usage_summary
from .pipeline import produce_package, produce_autopilot
from .ai_provider import (
    fact_check, generate_brief, generate_card_plan, generate_draft, plan_content_calendar,
    scan_topic_radar, suggest_topics, repurpose_content, sweep_trend_signals,
    run_editorial_director, review_editorial, build_xhs_native_text_plan,
)
from .auth import require_user
from .schemas import (
    BriefRequest,
    CalendarPlanRequest,
    CalendarPlanResponse,
    CardPlanRequest,
    CardPlanResponse,
    ContentBrief,
    DraftRequest,
    DraftResponse,
    FactCheckRequest,
    FactCheckResponse,
    HealthResponse,
    TopicRadarRequest,
    TopicRadarResponse,
    TopicSuggestRequest,
    TopicSuggestResponse,
    RepurposeRequest,
    RepurposeResponse,
    TrendSweepRequest,
    TrendSweepResponse,
    EditorialDirectorRequest, EditorialDirectorResponse, EditorialReviewRequest, EditorialReviewResponse,
    XhsNativeTextPlanRequest, XhsNativeTextPlanResponse,
    ProductionPipelineRequest, ProductionPipelineResponse, AutopilotRequest, AutopilotResponse,
)

settings = get_settings()
app = FastAPI(title="Content OS API", version=settings.app_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BriefEnvelope(BaseModel):
    data: ContentBrief
    mode: str


class DraftEnvelope(BaseModel):
    data: DraftResponse
    mode: str


class TopicsEnvelope(BaseModel):
    data: TopicSuggestResponse
    mode: str


@app.exception_handler(BudgetExceededError)
async def budget_error_handler(_request: Request, exc: BudgetExceededError):
    return JSONResponse(status_code=402, content={"error":"AI_BUDGET_EXCEEDED","detail":str(exc)})


@app.exception_handler(AIProviderError)
async def ai_error_handler(_request: Request, exc: AIProviderError):
    return JSONResponse(status_code=502, content={"error":"AI_PROVIDER_FAILED","detail":str(exc)})


@app.get("/health", response_model=HealthResponse)
async def health():
    if settings.openai_configured:
        mode = "openai"
    elif settings.mock_fallback_enabled:
        mode = "mock"
    else:
        mode = "manual_only"
    return HealthResponse(mode=mode, version=settings.app_version)


@app.get("/ready")
async def ready():
    warnings=[]
    if settings.app_env == 'production' and not settings.supabase_configured:
        warnings.append('production requires Supabase auth')
    if not settings.openai_configured:
        warnings.append('OpenAI API not configured; manual AI bridge only')
    if settings.mock_fallback_enabled:
        warnings.append('mock fallback enabled')
    return {
        "ok": not (settings.app_env == 'production' and not settings.supabase_configured),
        "version": settings.app_version,
        "app_env": settings.app_env,
        "auth": "supabase" if settings.supabase_configured else ("demo" if settings.demo_auth_enabled else "missing"),
        "ai": "openai" if settings.openai_configured else "manual_only",
        "mock_fallback": settings.mock_fallback_enabled,
        "warnings": warnings,
    }


@app.get("/v1/ai/policy")
async def ai_policy(_user: dict = Depends(require_user)):
    tasks = ["trend_sweep", "topic_radar", "topic_suggest", "calendar", "editorial_director", "brief", "draft", "editorial_review", "fact_check", "xhs_native_text", "card_plan", "repurpose"]
    policies = []
    for task in tasks:
        p = policy_for(task)
        policies.append({
            "task": task, "tier": p.tier, "model": p.model,
            "reasoning_effort": p.reasoning_effort, "max_output_tokens": p.max_output_tokens,
            "max_tool_calls": p.max_tool_calls,
        })
    return {
        "strategy": "lean",
        "note": "Luna 负责扫描/排序/总编复核/原生文转图整理；Terra 只负责 Brief 和正式写稿；Sol 默认不启用。",
        "policies": policies,
    }


@app.post("/v1/brief", response_model=BriefEnvelope)
async def brief(req: BriefRequest, _user: dict = Depends(require_user)):
    data, mode = await generate_brief(req.topic, req.opinions)
    return BriefEnvelope(data=data, mode=mode)


@app.post("/v1/draft", response_model=DraftEnvelope)
async def draft(req: DraftRequest, _user: dict = Depends(require_user)):
    data, mode = await generate_draft(req.topic, req.brief, req.opinions)
    return DraftEnvelope(data=data, mode=mode)


@app.post("/v1/topics/suggest", response_model=TopicsEnvelope)
async def topics_suggest(req: TopicSuggestRequest, _user: dict = Depends(require_user)):
    data, mode = await suggest_topics(req.seed, req.count, req.recent_topics, req.opinions)
    return TopicsEnvelope(data=data, mode=mode)


class FactCheckEnvelope(BaseModel):
    data: FactCheckResponse
    mode: str


class CardPlanEnvelope(BaseModel):
    data: CardPlanResponse
    mode: str


@app.post("/v1/fact-check", response_model=FactCheckEnvelope)
async def check_facts(req: FactCheckRequest, _user: dict = Depends(require_user)):
    data, mode = await fact_check(req.topic, req.title, req.body, req.claims, req.max_web_runs)
    return FactCheckEnvelope(data=data, mode=mode)


@app.post("/v1/cards/plan", response_model=CardPlanEnvelope)
async def cards_plan(req: CardPlanRequest, _user: dict = Depends(require_user)):
    data, mode = await generate_card_plan(req.topic, req.title, req.body, req.card_count)
    return CardPlanEnvelope(data=data, mode=mode)


class RadarEnvelope(BaseModel):
    data: TopicRadarResponse
    mode: str


class CalendarEnvelope(BaseModel):
    data: CalendarPlanResponse
    mode: str


@app.post("/v1/topics/radar", response_model=RadarEnvelope)
async def topics_radar(req: TopicRadarRequest, _user: dict = Depends(require_user)):
    data, mode = await scan_topic_radar(req.focus, req.count, req.recent_topics, req.opinions, req.max_web_runs)
    return RadarEnvelope(data=data, mode=mode)


@app.post("/v1/calendar/plan", response_model=CalendarEnvelope)
async def calendar_plan(req: CalendarPlanRequest, _user: dict = Depends(require_user)):
    data, mode = await plan_content_calendar(req)
    return CalendarEnvelope(data=data, mode=mode)


class RepurposeEnvelope(BaseModel):
    data: RepurposeResponse
    mode: str


@app.post("/v1/repurpose", response_model=RepurposeEnvelope)
async def repurpose(req: RepurposeRequest, _user: dict = Depends(require_user)):
    data, mode = await repurpose_content(req.topic, req.title, req.body, req.channels)
    return RepurposeEnvelope(data=data, mode=mode)


class TrendSweepEnvelope(BaseModel):
    data: TrendSweepResponse
    mode: str


@app.post("/v1/trends/sweep", response_model=TrendSweepEnvelope)
async def trends_sweep(req: TrendSweepRequest, _user: dict = Depends(require_user)):
    data, mode = await sweep_trend_signals(
        req.focus, req.watch_queries, req.competitor_queries, req.recent_topics, req.count, req.max_web_runs
    )
    return TrendSweepEnvelope(data=data, mode=mode)


class EditorialDirectorEnvelope(BaseModel):
    data: EditorialDirectorResponse
    mode: str

@app.post("/v1/editorial/director", response_model=EditorialDirectorEnvelope)
async def editorial_director(req: EditorialDirectorRequest, _user: dict = Depends(require_user)):
    data, mode = await run_editorial_director(req.candidates, req.recent_titles, req.goal, req.editorial_style)
    return EditorialDirectorEnvelope(data=data, mode=mode)


class EditorialReviewEnvelope(BaseModel):
    data: EditorialReviewResponse
    mode: str

@app.post("/v1/editorial/review", response_model=EditorialReviewEnvelope)
async def editorial_review(req: EditorialReviewRequest, _user: dict = Depends(require_user)):
    data, mode = await review_editorial(req.topic, req.title, req.body, req.target_audience, req.editorial_style)
    return EditorialReviewEnvelope(data=data, mode=mode)


class XhsNativeTextEnvelope(BaseModel):
    data: XhsNativeTextPlanResponse
    mode: str

@app.post("/v1/xhs/native-text-plan", response_model=XhsNativeTextEnvelope)
async def xhs_native_text_plan(req: XhsNativeTextPlanRequest, _user: dict = Depends(require_user)):
    data, mode = await build_xhs_native_text_plan(req.topic, req.title, req.body, req.preferred_style, req.max_pages_hint)
    return XhsNativeTextEnvelope(data=data, mode=mode)


@app.get("/v1/ai/usage")
async def ai_usage(limit: int = 30, _user: dict = Depends(require_user)):
    return usage_summary(limit)


@app.post("/v1/pipeline/produce", response_model=ProductionPipelineResponse)
async def pipeline_produce(req: ProductionPipelineRequest, _user: dict = Depends(require_user)):
    return await produce_package(req)


@app.post("/v1/pipeline/autopilot", response_model=AutopilotResponse)
async def pipeline_autopilot(req: AutopilotRequest, _user: dict = Depends(require_user)):
    return await produce_autopilot(req)
