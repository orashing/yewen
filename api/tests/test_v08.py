import unittest
from fastapi.testclient import TestClient

from app.main import app
from app.model_router import policy_for


class V08Tests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(app)

    def test_editorial_tasks_are_lean(self):
        self.assertEqual(policy_for('editorial_director').tier,'luna')
        self.assertEqual(policy_for('editorial_review').tier,'luna')
        self.assertEqual(policy_for('xhs_native_text').tier,'luna')
        self.assertEqual(policy_for('draft').tier,'terra')

    def test_editorial_director_mock(self):
        r=self.client.post('/v1/editorial/director',json={
            'candidates':[
                {'title':'北京650分该不该出京','purpose':'decision','search_score':8,'audience_fit':9,'conversion_score':9,'timeliness':7,'historical_value':7},
                {'title':'十大热门专业','purpose':'traffic','search_score':9,'audience_fit':6,'conversion_score':3,'timeliness':8,'historical_value':4},
            ],
            'recent_titles':[],'goal':'qualified_leads','editorial_style':'克制、具体、有边界'
        })
        self.assertEqual(r.status_code,200)
        data=r.json()['data']
        self.assertIn('primary',data)
        self.assertIn('backup',data)

    def test_editorial_review_mock(self):
        r=self.client.post('/v1/editorial/review',json={
            'topic':'金融专业','title':'普通家庭要不要学金融','body':'很多家长会问这个问题。我的判断是先看学校、家庭资源和未来路径。','editorial_style':'克制、具体、有边界'
        })
        self.assertEqual(r.status_code,200)
        data=r.json()['data']
        self.assertIn('revised_body',data)
        self.assertGreaterEqual(data['overall_score'],0)

    def test_native_text_plan_mock(self):
        r=self.client.post('/v1/xhs/native-text-plan',json={
            'topic':'北邮和985','title':'北邮计算机和普通985怎么选','body':'第一段。\n\n第二段。\n\n第三段。','preferred_style':'简约','max_pages_hint':7
        })
        self.assertEqual(r.status_code,200)
        data=r.json()['data']
        self.assertEqual(data['recommended_style'],'简约')
        self.assertTrue(data['automation_ready'])
        self.assertTrue(data['input_text'])


if __name__=='__main__':
    unittest.main()
