class AIProviderError(RuntimeError):
    """The upstream AI provider failed and a production request must not silently mock."""


class BudgetExceededError(AIProviderError):
    """The configured monthly AI budget has been reached."""
