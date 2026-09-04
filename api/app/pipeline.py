from __future__ import annotations

from .ai_provider import (
    build_xhs_native_text_plan,
    fact_check,
    generate_brief,
    generate_card_plan,
    generate_draft,
    repurpose_content,
    review_editorial,
    run_editorial_director,
)
from .schemas import (
    AutopilotRequest,
    AutopilotResponse,
    DraftResponse,
    PipelineStep,
    ProductionPipelineRequest,
    ProductionPipelineResponse,
)


async def produce_package(req: ProductionPipelineRequest) -> ProductionPipelineResponse:
    steps: list[PipelineStep] = []

    brief, mode = await generate_brief(req.topic, req.opinions)
    steps.append(PipelineStep(name='brief', mode=mode))

    draft, mode = await generate_draft(req.topic, brief, req.opinions)
    steps.append(PipelineStep(name='draft', mode=mode))

    review, mode = await review_editorial(
        req.topic,
        draft.titles[0],
        draft.body,
        req.target_audience or brief.target_audience,
        req.editorial_style,
    )
    steps.append(PipelineStep(name='editorial_review', mode=mode))

    # The public draft is the independent editor's revised version. Keep the writer's factual
    # claim hints, but fact-check the final revised body rather than the pre-review text.
    titles = [review.revised_title] + [x for x in draft.titles if x != review.revised_title]
    titles = (titles + [review.revised_title] * 3)[:3]
    final_draft = DraftResponse(
        titles=titles,
        body=review.revised_body,
        tags=draft.tags,
        factual_claims=draft.factual_claims,
    )

    facts, mode = await fact_check(
        req.topic,
        final_draft.titles[0],
        final_draft.body,
        final_draft.factual_claims,
        req.max_web_runs,
    )
    steps.append(PipelineStep(name='fact_check', mode=mode))

    native, mode = await build_xhs_native_text_plan(
        req.topic,
        final_draft.titles[0],
        final_draft.body,
        req.preferred_xhs_style,
        req.max_pages_hint,
    )
    steps.append(PipelineStep(name='xhs_native_text', mode=mode))

    repurposed = []
    if req.include_repurpose:
        reuse, mode = await repurpose_content(
            req.topic,
            final_draft.titles[0],
            final_draft.body,
            ['video_script', 'wechat_moments', 'wechat_group'],
        )
        repurposed = reuse.outputs
        steps.append(PipelineStep(name='repurpose', mode=mode))

    cards = None
    if req.include_cards:
        cards, mode = await generate_card_plan(req.topic, final_draft.titles[0], final_draft.body, 6)
        steps.append(PipelineStep(name='card_plan', mode=mode))

    blockers: list[str] = []
    if not review.publish_ready:
        blockers.append('总编审稿认为当前版本仍需修改')
    unresolved = [x for x in facts.items if x.status != 'verified']
    if unresolved:
        blockers.append(f'{len(unresolved)} 项事实仍需人工确认或存在冲突')
    high_risk = [x for x in facts.compliance_flags if x.severity == 'high']
    if high_risk:
        blockers.append(f'{len(high_risk)} 项高风险合规表述未处理')
    if not native.automation_ready:
        blockers.append('原生文转图发布包尚未达到自动化条件')

    return ProductionPipelineResponse(
        topic=req.topic,
        brief=brief,
        draft=final_draft,
        editorial_review=review,
        fact_check=facts,
        native_text_plan=native,
        repurpose=repurposed,
        card_plan=cards,
        steps=steps,
        ready_for_human_review=not blockers,
        blockers=blockers,
    )


async def produce_autopilot(req: AutopilotRequest) -> AutopilotResponse:
    director, _mode = await run_editorial_director(
        req.candidates, req.recent_titles, req.goal, req.editorial_style
    )
    package = await produce_package(ProductionPipelineRequest(
        topic=director.primary.title,
        opinions=req.opinions,
        editorial_style=req.editorial_style,
        target_audience=req.target_audience,
        max_web_runs=req.max_web_runs,
        preferred_xhs_style=req.preferred_xhs_style,
        max_pages_hint=req.max_pages_hint,
        include_repurpose=req.include_repurpose,
        include_cards=req.include_cards,
    ))
    return AutopilotResponse(editorial_pick=director.primary, package=package)
