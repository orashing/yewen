from datetime import date
from typing import Literal
from pydantic import BaseModel, Field

Purpose = Literal["traffic", "decision", "trust", "professional", "conversion"]


class OpinionContext(BaseModel):
    title: str
    viewpoint: str
    reasoning: str = ""
    exceptions: str = ""
    tone_note: str = ""


class BriefRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=200)
    opinions: list[OpinionContext] = Field(default_factory=list, max_length=12)


class ContentBrief(BaseModel):
    target_audience: str
    purpose: Purpose
    content_type: str
    core_conflict: str
    thesis: str
    reader_takeaway: str
    creator_angle: str
    outline: list[str]
    facts_to_verify: list[str]
    risk_flags: list[str]


class DraftRequest(BaseModel):
    topic: str
    brief: ContentBrief
    opinions: list[OpinionContext] = Field(default_factory=list, max_length=12)


class DraftResponse(BaseModel):
    titles: list[str] = Field(min_length=3, max_length=3)
    body: str
    tags: list[str]
    factual_claims: list[str]


class TopicCandidate(BaseModel):
    title: str
    angle: str
    target_audience: str
    purpose: Purpose
    search_demand: float = Field(ge=0, le=10)
    controversy: float = Field(ge=0, le=10)
    conversion_value: float = Field(ge=0, le=10)
    timeliness: float = Field(ge=0, le=10)
    creator_fit: float = Field(ge=0, le=10)
    rationale: str


class TopicSuggestRequest(BaseModel):
    seed: str = Field(default="", max_length=300)
    count: int = Field(default=8, ge=3, le=12)
    recent_topics: list[str] = Field(default_factory=list, max_length=30)
    opinions: list[OpinionContext] = Field(default_factory=list, max_length=12)


class TopicSuggestResponse(BaseModel):
    topics: list[TopicCandidate]


class RadarSource(BaseModel):
    title: str = ""
    url: str = ""
    publisher: str = ""
    source_type: Literal["official", "primary", "secondary", "unknown"] = "unknown"


class RadarTopicCandidate(TopicCandidate):
    signal_type: Literal["policy", "admissions", "career", "campus", "question", "evergreen"] = "evergreen"
    why_now: str = ""
    confidence: float = Field(default=0.5, ge=0, le=1)
    sources: list[RadarSource] = Field(default_factory=list, max_length=6)


class TopicRadarRequest(BaseModel):
    focus: str = Field(default="北京高考、大学与专业选择", max_length=300)
    count: int = Field(default=8, ge=3, le=12)
    max_web_runs: int = Field(default=2, ge=1, le=4)
    recent_topics: list[str] = Field(default_factory=list, max_length=40)
    opinions: list[OpinionContext] = Field(default_factory=list, max_length=12)


class TopicRadarResponse(BaseModel):
    topics: list[RadarTopicCandidate]
    summary: str = ""
    searched_web: bool = False


class CalendarTopicInput(BaseModel):
    title: str
    purpose: Purpose = "decision"
    target_audience: str = ""
    score: dict = Field(default_factory=dict)


class CalendarPlanEntry(BaseModel):
    planned_date: date
    slot: int = Field(default=1, ge=1, le=3)
    title: str
    purpose: Purpose
    angle: str = ""
    rationale: str = ""
    source_topic_title: str = ""


class CalendarPlanRequest(BaseModel):
    start_date: date
    days: int = Field(default=30, ge=7, le=60)
    posts_per_week: int = Field(default=5, ge=2, le=7)
    content_mix: dict[str, float] = Field(default_factory=lambda: {
        "traffic": 0.30, "decision": 0.30, "trust": 0.20, "professional": 0.15, "conversion": 0.05
    })
    topic_pool: list[CalendarTopicInput] = Field(default_factory=list, max_length=80)
    recent_titles: list[str] = Field(default_factory=list, max_length=40)
    opinions: list[OpinionContext] = Field(default_factory=list, max_length=12)


class CalendarPlanResponse(BaseModel):
    entries: list[CalendarPlanEntry]
    strategy_summary: str
    mix_summary: dict[str, int] = Field(default_factory=dict)


class FactSource(BaseModel):
    title: str = ""
    url: str = ""
    publisher: str = ""
    source_type: Literal["official", "primary", "secondary", "unknown"] = "unknown"


class FactCheckItem(BaseModel):
    claim: str
    status: Literal["verified", "needs_review", "contradicted"]
    verdict: str
    confidence: float = Field(ge=0, le=1)
    sources: list[FactSource] = Field(default_factory=list)


class ComplianceFlag(BaseModel):
    severity: Literal["low", "medium", "high"]
    text: str
    suggestion: str = ""


class FactCheckRequest(BaseModel):
    topic: str
    title: str = ""
    body: str
    claims: list[str] = Field(default_factory=list, max_length=30)
    max_web_runs: int = Field(default=2, ge=1, le=4)


class FactCheckResponse(BaseModel):
    items: list[FactCheckItem]
    compliance_flags: list[ComplianceFlag] = Field(default_factory=list)
    summary: str
    searched_web: bool = False


class CardSpec(BaseModel):
    eyebrow: str = ""
    headline: str
    body: list[str] = Field(default_factory=list, max_length=6)
    footer: str = "O师 · 大学与专业选择"
    layout: Literal["cover", "points", "quote", "summary"] = "points"


class CardPlanRequest(BaseModel):
    topic: str
    title: str
    body: str
    card_count: int = Field(default=6, ge=4, le=9)


class CardPlanResponse(BaseModel):
    cards: list[CardSpec]


class TrendSignalSource(BaseModel):
    platform: Literal["xiaohongshu", "official", "university", "web", "manual"] = "web"
    surface: Literal["hot_list", "hot_topic", "search", "competitor", "policy", "career", "manual"] = "search"
    title: str = ""
    url: str = ""
    publisher: str = ""


class TrendSignal(BaseModel):
    title: str
    query: str = ""
    summary: str = ""
    platform: Literal["xiaohongshu", "official", "university", "web", "manual"] = "web"
    surface: Literal["hot_list", "hot_topic", "search", "competitor", "policy", "career", "manual"] = "search"
    freshness: float = Field(default=5, ge=0, le=10)
    search_intent: float = Field(default=5, ge=0, le=10)
    engagement_signal: float = Field(default=5, ge=0, le=10)
    audience_fit: float = Field(default=5, ge=0, le=10)
    conversion_fit: float = Field(default=5, ge=0, le=10)
    confidence: float = Field(default=0.5, ge=0, le=1)
    observed_at: str = ""
    metrics: dict = Field(default_factory=dict)
    source: TrendSignalSource | None = None


class TrendSweepRequest(BaseModel):
    focus: str = Field(default="北京高考、大学与专业选择", max_length=300)
    max_web_runs: int = Field(default=2, ge=1, le=4)
    watch_queries: list[str] = Field(default_factory=list, max_length=40)
    competitor_queries: list[str] = Field(default_factory=list, max_length=20)
    recent_topics: list[str] = Field(default_factory=list, max_length=40)
    count: int = Field(default=20, ge=5, le=40)


class TrendSweepResponse(BaseModel):
    signals: list[TrendSignal]
    summary: str = ""
    searched_web: bool = False
    xhs_direct: bool = False
    limitations: list[str] = Field(default_factory=list)


class HealthResponse(BaseModel):
    ok: bool = True
    mode: str
    version: str = "0.8.0"


class RepurposeRequest(BaseModel):
    topic: str
    title: str
    body: str
    channels: list[Literal["xiaohongshu_text", "video_script", "wechat_moments", "wechat_group"]] = Field(
        default_factory=lambda: ["video_script", "wechat_moments", "wechat_group"], min_length=1, max_length=4
    )


class RepurposeOutput(BaseModel):
    channel: Literal["xiaohongshu_text", "video_script", "wechat_moments", "wechat_group"]
    title: str = ""
    body: str
    notes: str = ""


class RepurposeResponse(BaseModel):
    outputs: list[RepurposeOutput]

# --- v0.8 Editorial Director ---
class EditorialCandidate(BaseModel):
    title: str
    purpose: Purpose = "decision"
    angle: str = ""
    source: str = "topic_pool"
    search_score: float = Field(default=5, ge=0, le=10)
    audience_fit: float = Field(default=5, ge=0, le=10)
    conversion_score: float = Field(default=5, ge=0, le=10)
    timeliness: float = Field(default=5, ge=0, le=10)
    historical_value: float = Field(default=5, ge=0, le=10)


class EditorialPick(BaseModel):
    title: str
    purpose: Purpose
    angle: str
    target_audience: str
    why_now: str
    why_this_over_others: str
    predicted_lead_quality: float = Field(ge=0, le=10)
    confidence: float = Field(ge=0, le=1)


class EditorialDirectorRequest(BaseModel):
    candidates: list[EditorialCandidate] = Field(default_factory=list, min_length=1, max_length=80)
    recent_titles: list[str] = Field(default_factory=list, max_length=40)
    goal: Literal["qualified_leads", "trust", "growth"] = "qualified_leads"
    editorial_style: str = ""


class EditorialDirectorResponse(BaseModel):
    primary: EditorialPick
    backup: EditorialPick
    rejected_patterns: list[str] = Field(default_factory=list, max_length=8)
    strategy_note: str = ""


class EditorialReviewRequest(BaseModel):
    topic: str
    title: str
    body: str
    target_audience: str = "北京高中生及家长"
    editorial_style: str = ""


class EditorialReviewResponse(BaseModel):
    publish_ready: bool
    overall_score: float = Field(ge=0, le=100)
    human_voice_score: float = Field(ge=0, le=100)
    ai_tell_score: float = Field(ge=0, le=100)
    trust_score: float = Field(ge=0, le=100)
    conversion_score: float = Field(ge=0, le=100)
    strongest_point: str = ""
    objections: list[str] = Field(default_factory=list, max_length=6)
    ai_tells: list[str] = Field(default_factory=list, max_length=8)
    logic_gaps: list[str] = Field(default_factory=list, max_length=8)
    rewrite_notes: list[str] = Field(default_factory=list, max_length=8)
    revised_title: str
    revised_body: str


NativeXhsStyle = Literal["auto", "基础", "插图", "备忘", "边框", "便签", "简约", "涂写", "弥散", "光影", "科技"]


class XhsNativeTextPlanRequest(BaseModel):
    topic: str
    title: str
    body: str
    preferred_style: NativeXhsStyle = "auto"
    max_pages_hint: int = Field(default=7, ge=3, le=12)


class XhsNativeTextPlanResponse(BaseModel):
    title: str
    input_text: str
    recommended_style: NativeXhsStyle
    fallback_styles: list[NativeXhsStyle] = Field(default_factory=list, max_length=4)
    style_reason: str = ""
    expected_pages: int = Field(default=6, ge=1, le=20)
    cover_hook: str = ""
    paragraph_rules: list[str] = Field(default_factory=list, max_length=8)
    automation_ready: bool = True

# --- v0.9 production pipeline ---
class ProductionPipelineRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=240)
    opinions: list[OpinionContext] = Field(default_factory=list, max_length=12)
    editorial_style: str = ""
    target_audience: str = "北京高中生及家长"
    max_web_runs: int = Field(default=2, ge=1, le=4)
    preferred_xhs_style: NativeXhsStyle = "简约"
    max_pages_hint: int = Field(default=7, ge=3, le=12)
    include_repurpose: bool = True
    include_cards: bool = False


class PipelineStep(BaseModel):
    name: str
    mode: str
    ok: bool = True


class ProductionPipelineResponse(BaseModel):
    topic: str
    brief: ContentBrief
    draft: DraftResponse
    editorial_review: EditorialReviewResponse
    fact_check: FactCheckResponse
    native_text_plan: XhsNativeTextPlanResponse
    repurpose: list[RepurposeOutput] = Field(default_factory=list)
    card_plan: CardPlanResponse | None = None
    steps: list[PipelineStep] = Field(default_factory=list)
    ready_for_human_review: bool = False
    blockers: list[str] = Field(default_factory=list)


class AutopilotRequest(BaseModel):
    candidates: list[EditorialCandidate] = Field(min_length=1, max_length=80)
    recent_titles: list[str] = Field(default_factory=list, max_length=40)
    goal: Literal["qualified_leads", "trust", "growth"] = "qualified_leads"
    editorial_style: str = ""
    opinions: list[OpinionContext] = Field(default_factory=list, max_length=12)
    target_audience: str = "北京高中生及家长"
    max_web_runs: int = Field(default=2, ge=1, le=4)
    preferred_xhs_style: NativeXhsStyle = "简约"
    max_pages_hint: int = Field(default=7, ge=3, le=12)
    include_repurpose: bool = True
    include_cards: bool = False


class AutopilotResponse(BaseModel):
    editorial_pick: EditorialPick
    package: ProductionPipelineResponse
