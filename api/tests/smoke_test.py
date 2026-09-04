from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

health = client.get("/health")
assert health.status_code == 200
assert health.json()["version"] == "0.9.0"

topics = client.post("/v1/topics/suggest", json={"seed": "北京高考", "count": 3})
assert topics.status_code == 200
assert len(topics.json()["data"]["topics"]) == 3

brief = client.post("/v1/brief", json={"topic": "北邮和985怎么选", "opinions": []})
assert brief.status_code == 200
brief_data = brief.json()["data"]
assert brief_data["purpose"] in {"traffic", "decision", "trust", "professional", "conversion"}

draft = client.post("/v1/draft", json={"topic": "北邮和985怎么选", "brief": brief_data, "opinions": []})
assert draft.status_code == 200
assert len(draft.json()["data"]["titles"]) == 3
print("v0.9 core smoke test passed")

radar = client.post('/v1/topics/radar', json={'focus':'北京高考','count':3})
assert radar.status_code == 200
assert len(radar.json()['data']['topics']) == 3

calendar = client.post('/v1/calendar/plan', json={'start_date':'2026-09-01','days':30,'posts_per_week':5,'topic_pool':[]})
assert calendar.status_code == 200
assert len(calendar.json()['data']['entries']) >= 15
print('v0.4 radar/calendar smoke passed')
