import unittest

from fastapi.testclient import TestClient

from app.main import app
from app.schemas import TopicCandidate
from app.state_machine import can_transition


class ApiV02Tests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_version(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["version"], "0.9.0")

    def test_topic_suggestions_have_scores(self):
        response = self.client.post("/v1/topics/suggest", json={"seed": "北京高考", "count": 5})
        self.assertEqual(response.status_code, 200)
        topics = response.json()["data"]["topics"]
        self.assertEqual(len(topics), 5)
        TopicCandidate.model_validate(topics[0])

    def test_opinion_context_accepted(self):
        payload = {
            "topic": "金融专业适不适合普通家庭",
            "opinions": [
                {
                    "title": "普通家庭读金融",
                    "viewpoint": "需要慎重评估学校平台与家庭资源",
                    "reasoning": "优质金融岗位对学历和实习要求较高",
                }
            ],
        }
        response = self.client.post("/v1/brief", json=payload)
        self.assertEqual(response.status_code, 200)
        self.assertIn(
            response.json()["data"]["purpose"],
            {"traffic", "decision", "trust", "professional", "conversion"},
        )

    def test_state_transitions(self):
        self.assertTrue(can_transition("IDEA", "SELECTED"))
        self.assertTrue(can_transition("DRAFT_READY", "REVIEW"))
        self.assertTrue(can_transition("REVIEW", "APPROVED"))
        self.assertFalse(can_transition("IDEA", "PUBLISHED"))
        self.assertFalse(can_transition("APPROVED", "PUBLISHED"))


if __name__ == "__main__":
    unittest.main()
