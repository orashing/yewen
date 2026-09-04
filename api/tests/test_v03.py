import unittest

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import CardPlanResponse, FactCheckResponse


class ApiV03Tests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_version(self):
        response = self.client.get('/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['version'], '0.9.0')

    def test_fact_check_mock_is_conservative(self):
        response = self.client.post('/v1/fact-check', json={
            'topic': '北京高考',
            'title': '北京高考测试',
            'body': '北京某年特控线为某分。',
            'claims': ['北京某年特控线为某分'],
        })
        self.assertEqual(response.status_code, 200)
        data = FactCheckResponse.model_validate(response.json()['data'])
        self.assertEqual(len(data.items), 1)
        self.assertIn(data.items[0].status, {'verified','needs_review','contradicted'})
        if response.json()['mode'] == 'mock':
            self.assertEqual(data.items[0].status, 'needs_review')

    def test_card_plan(self):
        response = self.client.post('/v1/cards/plan', json={
            'topic':'北邮和985怎么选',
            'title':'北邮计算机和普通985，到底怎么选？',
            'body':'先看学校层次。\n再看专业差距。\n最后看未来路径。',
            'card_count':6,
        })
        self.assertEqual(response.status_code, 200)
        data = CardPlanResponse.model_validate(response.json()['data'])
        self.assertGreaterEqual(len(data.cards), 4)
        self.assertLessEqual(len(data.cards), 6)
        self.assertEqual(data.cards[0].layout, 'cover')

    def test_compliance_flag_in_mock(self):
        response = self.client.post('/v1/fact-check', json={
            'topic':'志愿咨询',
            'body':'我们百分百保录，并提供内部渠道。',
            'claims':['某录取规则'],
        })
        data = response.json()['data']
        if response.json()['mode'] == 'mock':
            self.assertGreaterEqual(len(data['compliance_flags']), 1)


if __name__ == '__main__':
    unittest.main()
