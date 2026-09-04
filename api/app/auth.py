import httpx
from fastapi import Header, HTTPException

from .settings import get_settings


async def require_user(authorization: str | None = Header(default=None)) -> dict:
    """Validate Supabase auth; only local/development may fail open into a demo operator."""
    settings = get_settings()
    if not settings.supabase_configured:
        if settings.demo_auth_enabled:
            return {"id": "demo-user", "mode": "demo"}
        raise HTTPException(status_code=503, detail="Supabase auth is required but not configured")

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Supabase access token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                headers={"apikey": settings.supabase_anon_key, "Authorization": f"Bearer {token}"},
            )
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired Supabase access token")
        return response.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Auth validation temporarily unavailable") from exc
