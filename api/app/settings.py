from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore', case_sensitive=False)

    app_env: Literal['local', 'development', 'production'] = 'local'
    app_version: str = '0.9.0'

    openai_api_key: str = ''
    openai_model_luna: str = 'gpt-5.6-luna'
    openai_model_terra: str = 'gpt-5.6-terra'
    openai_model_sol: str = 'gpt-5.6-sol'
    openai_premium_tasks: str = ''
    openai_monthly_budget_usd: float = Field(default=5.0, ge=0)
    openai_max_retries: int = Field(default=2, ge=0, le=5)
    openai_usage_db: str = str(Path(__file__).resolve().parents[1] / 'data' / 'usage.sqlite3')

    supabase_url: str = ''
    supabase_anon_key: str = ''
    cors_origins: str = 'http://localhost:5173'

    # Fail-safe defaults. Production never silently fabricates a mock AI result.
    allow_mock_fallback: bool | None = None
    allow_demo_auth: bool | None = None

    @property
    def mock_fallback_enabled(self) -> bool:
        if self.allow_mock_fallback is not None:
            return self.allow_mock_fallback
        return self.app_env != 'production'

    @property
    def demo_auth_enabled(self) -> bool:
        if self.allow_demo_auth is not None:
            return self.allow_demo_auth
        return self.app_env != 'production'

    @property
    def supabase_configured(self) -> bool:
        return bool(self.supabase_url.strip() and self.supabase_anon_key.strip())

    @property
    def openai_configured(self) -> bool:
        return bool(self.openai_api_key.strip())

    @property
    def premium_tasks(self) -> set[str]:
        return {x.strip() for x in self.openai_premium_tasks.split(',') if x.strip()}

    @property
    def origins(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(',') if x.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
