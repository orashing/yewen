from dataclasses import dataclass

from .settings import get_settings


@dataclass(frozen=True)
class ModelPolicy:
    task: str
    tier: str
    model: str
    reasoning_effort: str
    max_output_tokens: int
    max_tool_calls: int = 0


# Standard API prices, USD / 1M text tokens, current for this build.
PRICE_PER_M = {
    "gpt-5.6-luna": {"input": 0.20, "cached_input": 0.02, "output": 1.20},
    "gpt-5.6-terra": {"input": 2.00, "cached_input": 0.20, "output": 12.00},
    "gpt-5.6-sol": {"input": 4.00, "cached_input": 0.40, "output": 20.00},
}
WEB_SEARCH_PER_RUN_USD = 0.01


def _model_for(tier: str) -> str:
    s = get_settings()
    return {
        'luna': s.openai_model_luna,
        'terra': s.openai_model_terra,
        'sol': s.openai_model_sol,
    }[tier].strip()


def policy_for(task: str) -> ModelPolicy:
    """Cost-sensitive routing for a one-creator workflow."""
    settings = get_settings()
    if task in settings.premium_tasks:
        return ModelPolicy(task, "sol", _model_for("sol"), "medium", 6000, 3 if task in {"fact_check", "trend_sweep", "topic_radar"} else 0)

    terra_tasks = {"brief", "draft"}
    web_tasks = {"fact_check", "trend_sweep", "topic_radar"}
    if task in terra_tasks:
        return ModelPolicy(task, "terra", _model_for("terra"), "low", 5000, 0)
    if task in web_tasks:
        return ModelPolicy(task, "luna", _model_for("luna"), "low", 5000, 2)
    return ModelPolicy(task, "luna", _model_for("luna"), "low", 4500, 0)


def estimate_cost_usd(model: str, usage: dict | None, web_runs: int = 0) -> float:
    usage = usage or {}
    prices = PRICE_PER_M.get(model, PRICE_PER_M["gpt-5.6-terra"])
    input_tokens = int(usage.get("input_tokens") or 0)
    output_tokens = int(usage.get("output_tokens") or 0)
    details = usage.get("input_tokens_details") or {}
    cached = int(details.get("cached_tokens") or 0) if isinstance(details, dict) else 0
    uncached = max(0, input_tokens - cached)
    total = (
        uncached / 1_000_000 * prices["input"]
        + cached / 1_000_000 * prices["cached_input"]
        + output_tokens / 1_000_000 * prices["output"]
        + max(0, web_runs) * WEB_SEARCH_PER_RUN_USD
    )
    return round(total, 6)


def estimate_request_ceiling_usd(task: str, prompt_chars: int = 0, web_runs: int | None = None) -> float:
    """Conservative preflight estimate used only to avoid crossing a hard monthly cap."""
    p = policy_for(task)
    prices = PRICE_PER_M.get(p.model, PRICE_PER_M["gpt-5.6-terra"])
    # Chinese prompts often tokenize below 1 char/token, but 1 char/token is a safe budget estimate.
    est_input_tokens = max(800, int(prompt_chars * 1.15))
    tools = p.max_tool_calls if web_runs is None else max(0, web_runs)
    return round(
        est_input_tokens / 1_000_000 * prices['input']
        + p.max_output_tokens / 1_000_000 * prices['output']
        + tools * WEB_SEARCH_PER_RUN_USD,
        6,
    )
