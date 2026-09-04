from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from .settings import get_settings

_LOCK = Lock()


def _db_path() -> Path:
    path = Path(get_settings().openai_usage_db).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path(), timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        create table if not exists ai_usage_events (
          id integer primary key autoincrement,
          created_at text not null,
          task text not null,
          model text not null,
          input_tokens integer not null default 0,
          cached_tokens integer not null default 0,
          output_tokens integer not null default 0,
          web_runs integer not null default 0,
          cost_usd real not null default 0,
          success integer not null default 1,
          request_id text not null default '',
          error_code text not null default ''
        )
        """
    )
    conn.execute("create index if not exists idx_ai_usage_created on ai_usage_events(created_at)")
    return conn


def log_usage(*, task: str, model: str, usage: dict | None, web_runs: int, cost_usd: float,
              success: bool, request_id: str = '', error_code: str = '') -> None:
    usage = usage or {}
    details = usage.get('input_tokens_details') or {}
    with _LOCK:
        with _conn() as conn:
            conn.execute(
                """insert into ai_usage_events
                (created_at,task,model,input_tokens,cached_tokens,output_tokens,web_runs,cost_usd,success,request_id,error_code)
                values (?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    datetime.now(timezone.utc).isoformat(), task, model,
                    int(usage.get('input_tokens') or 0), int(details.get('cached_tokens') or 0),
                    int(usage.get('output_tokens') or 0), int(web_runs or 0), float(cost_usd or 0),
                    1 if success else 0, request_id or '', error_code or '',
                ),
            )


def month_spend_usd(now: datetime | None = None) -> float:
    now = now or datetime.now(timezone.utc)
    prefix = f"{now.year:04d}-{now.month:02d}-%"
    with _LOCK:
        with _conn() as conn:
            row = conn.execute(
                "select coalesce(sum(cost_usd),0) as total from ai_usage_events where success=1 and created_at like ?",
                (prefix,),
            ).fetchone()
    return round(float(row['total'] if row else 0), 6)


def usage_summary(limit: int = 30) -> dict:
    settings = get_settings()
    with _LOCK:
        with _conn() as conn:
            rows = conn.execute(
                """select created_at,task,model,input_tokens,cached_tokens,output_tokens,web_runs,cost_usd,success,request_id,error_code
                   from ai_usage_events order by id desc limit ?""",
                (max(1, min(200, int(limit))),),
            ).fetchall()
    spend = month_spend_usd()
    cap = settings.openai_monthly_budget_usd
    return {
        'month_spend_usd': spend,
        'monthly_budget_usd': cap,
        'remaining_usd': round(max(0.0, cap - spend), 6) if cap > 0 else None,
        'budget_enabled': cap > 0,
        'events': [dict(r) for r in rows],
    }
