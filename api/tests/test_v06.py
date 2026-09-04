import asyncio
import unittest

from fastapi.testclient import TestClient

from app.ai_provider import sweep_trend_signals
from app.main import app
from app.schemas import TrendSweepResponse


class V06Tests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_trend_sweep_endpoint_returns_signals(self):
        response = self.client.post('/v1/trends/sweep', json={
            'focus':'北京高考、大学与专业选择',
            'watch_queries':['北京650分','金融专业','北邮计算机'],
            'competitor_queries':['北京高考志愿'],
            'recent_topics':[],
            'count':10,
        })
        self.assertEqual(response.status_code, 200)
        data=TrendSweepResponse.model_validate(response.json()['data'])
        self.assertGreaterEqual(len(data.signals), 1)
        self.assertTrue(all(0 <= x.confidence <= 1 for x in data.signals))
        self.assertFalse(data.xhs_direct)

    def test_mock_sweep_never_claims_direct_xhs(self):
        result, mode=asyncio.run(sweep_trend_signals('北京高考',['北京650分'],[],[],5))
        self.assertIn(mode, {'mock','openai'})
        self.assertFalse(result.xhs_direct)
        self.assertGreaterEqual(len(result.signals), 1)


if __name__ == '__main__':
    unittest.main()
