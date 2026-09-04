import os
import unittest
from fastapi.testclient import TestClient

from app.main import app
from app.model_router import policy_for, estimate_cost_usd


class V07Tests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_lean_router_uses_luna_for_scans_and_terra_for_writing(self):
        self.assertEqual(policy_for('trend_sweep').tier, 'luna')
        self.assertEqual(policy_for('fact_check').tier, 'luna')
        self.assertEqual(policy_for('draft').tier, 'terra')
        self.assertEqual(policy_for('brief').tier, 'terra')
        self.assertEqual(policy_for('card_plan').tier, 'luna')
        self.assertEqual(policy_for('trend_sweep').max_tool_calls, 2)

    def test_policy_endpoint(self):
        r = self.client.get('/v1/ai/policy')
        self.assertEqual(r.status_code, 200)
        payload = r.json()
        self.assertEqual(payload['strategy'], 'lean')
        self.assertTrue(any(x['task']=='draft' and x['tier']=='terra' for x in payload['policies']))

    def test_cost_estimator_counts_web_runs(self):
        value = estimate_cost_usd('gpt-5.6-luna', {'input_tokens':10000,'output_tokens':2000}, web_runs=2)
        self.assertGreater(value, 0.02)
        self.assertLess(value, 0.03)


if __name__ == '__main__':
    unittest.main()
