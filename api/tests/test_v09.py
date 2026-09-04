import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.ai_provider import _post_responses
from app.errors import BudgetExceededError
from app.main import app
from app.settings import Settings
from app.usage_store import log_usage, usage_summary


class V09ProductionHardeningTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_ready_reports_v09(self):
        r = self.client.get('/ready')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['version'], '0.9.0')

    def test_production_settings_fail_closed(self):
        s = Settings(app_env='production', openai_api_key='', supabase_url='', supabase_anon_key='')
        self.assertFalse(s.mock_fallback_enabled)
        self.assertFalse(s.demo_auth_enabled)
        self.assertFalse(s.supabase_configured)

    def test_pipeline_produces_single_review_package_in_local_mock_mode(self):
        r = self.client.post('/v1/pipeline/produce', json={
            'topic': '北京650分到底要不要出京',
            'opinions': [],
            'editorial_style': '克制、具体、有边界',
            'target_audience': '北京高中生及家长',
            'max_web_runs': 1,
            'preferred_xhs_style': '简约',
            'max_pages_hint': 7,
            'include_repurpose': True,
            'include_cards': False,
        })
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn('draft', data)
        self.assertIn('editorial_review', data)
        self.assertIn('fact_check', data)
        self.assertIn('native_text_plan', data)
        self.assertTrue(data['native_text_plan']['input_text'])
        # Mock fact checking is intentionally conservative, so the package should not pretend
        # that it can be approved without human confirmation.
        self.assertFalse(data['ready_for_human_review'])
        self.assertTrue(data['blockers'])

    def test_budget_preflight_is_a_hard_stop(self):
        s = Settings(
            app_env='production', openai_api_key='test-key', openai_monthly_budget_usd=0.000001,
            allow_mock_fallback=False, allow_demo_auth=False,
        )
        body = {'input': [{'role':'user','content':'hello'}], 'max_tool_calls': 0}
        with patch('app.ai_provider.get_settings', return_value=s), patch('app.ai_provider.month_spend_usd', return_value=0.0):
            with self.assertRaises(BudgetExceededError):
                asyncio.run(_post_responses('draft', body))

    def test_usage_ledger_records_real_estimate_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            s = Settings(openai_usage_db=str(Path(tmp)/'usage.sqlite3'), openai_monthly_budget_usd=5)
            with patch('app.usage_store.get_settings', return_value=s):
                log_usage(task='draft', model='gpt-5.6-terra', usage={'input_tokens':100,'output_tokens':50}, web_runs=0, cost_usd=0.001, success=True, request_id='req_test')
                summary = usage_summary(10)
            self.assertGreaterEqual(summary['month_spend_usd'], 0.001)
            self.assertEqual(summary['events'][0]['request_id'], 'req_test')


if __name__ == '__main__':
    unittest.main()
