import unittest
from datetime import date

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import CalendarPlanResponse, TopicRadarResponse


class ApiV04Tests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_radar_returns_scored_topics(self):
        response = self.client.post('/v1/topics/radar', json={
            'focus':'北京高考、大学与专业选择',
            'count':5,
            'recent_topics':['北京650分到底该不该出京'],
            'opinions':[],
        })
        self.assertEqual(response.status_code, 200)
        data = TopicRadarResponse.model_validate(response.json()['data'])
        self.assertEqual(len(data.topics), 5)
        self.assertTrue(all(0 <= x.confidence <= 1 for x in data.topics))
        if response.json()['mode'] == 'mock':
            self.assertFalse(data.searched_web)

    def test_calendar_plan_stays_inside_window(self):
        response = self.client.post('/v1/calendar/plan', json={
            'start_date':'2026-09-01',
            'days':30,
            'posts_per_week':5,
            'topic_pool':[{'title':'北邮计算机和普通985，到底怎么选？','purpose':'decision','score':{}}],
            'recent_titles':[],
            'opinions':[],
        })
        self.assertEqual(response.status_code, 200)
        data = CalendarPlanResponse.model_validate(response.json()['data'])
        self.assertGreaterEqual(len(data.entries), 15)
        self.assertTrue(all(date(2026,9,1) <= x.planned_date <= date(2026,9,30) for x in data.entries))
        self.assertIn('decision', data.mix_summary)


if __name__ == '__main__':
    unittest.main()
