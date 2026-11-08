"""API smoke tests. They use the bundled sample outputs, so run the pipeline once first."""
import io
import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.service import ROOT

pytestmark = pytest.mark.skipif(
    not (ROOT / "data/processed/anomaly_results.csv").exists(), reason="run the pipeline first"
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_summary_counts_are_consistent(client):
    s = client.get("/api/summary").json()
    assert s["baskets"] > 0
    assert 0 < s["flagged"] < s["baskets"]
    assert s["flag_rate"] == pytest.approx(s["flagged"] / s["baskets"])


def test_basket_list_filters_and_paginates(client):
    page = client.get("/api/baskets", params={"limit": 5, "offset": 0}).json()
    assert len(page["items"]) == 5 and page["total"] >= 5
    scores = [i["score"] for i in page["items"]]
    assert scores == sorted(scores, reverse=True)
    assert all(i["flagged"] for i in page["items"])


def test_basket_detail_and_missing(client):
    first = client.get("/api/baskets", params={"limit": 1}).json()["items"][0]
    detail = client.get(f"/api/baskets/{first['order_id']}").json()
    assert detail["order_id"] == first["order_id"] and detail["deviations"]
    assert client.get("/api/baskets/1").status_code == 404


def test_invalid_parameters_are_rejected(client):
    assert client.post("/api/analyze", json={"dbscan_eps": 0}).status_code == 422
    assert client.get("/api/baskets", params={"sort": "nope"}).status_code == 422


def test_upload_reports_missing_columns(client):
    body = client.post("/api/datasets", files={"file": ("bad.csv", io.BytesIO(b"order_id,item_count\n1,3\n"), "text/csv")}).json()
    assert body["ok"] is False and "item_count" not in body["missing_columns"]


@pytest.fixture()
def isolated_reviews(monkeypatch, tmp_path):
    from api import service
    monkeypatch.setattr(service, "REVIEW_PATH", tmp_path / "decisions.json")
    monkeypatch.setattr(service.REVIEWS, "items", {})


def test_review_decision_roundtrip(client, isolated_reviews):
    first = client.get("/api/baskets", params={"limit": 1}).json()["items"][0]["order_id"]
    r = client.put(f"/api/baskets/{first}/review", json={"decision": "confirmed", "note": "checked basket"})
    assert r.status_code == 200 and r.json()["decision"] == "confirmed"
    assert client.get(f"/api/baskets/{first}").json()["note"] == "checked basket"
    confirmed = client.get("/api/baskets", params={"decision": "confirmed"}).json()
    assert [i["order_id"] for i in confirmed["items"]] == [first]
    assert client.get("/api/summary").json()["decisions"]["confirmed"] == 1
    client.put(f"/api/baskets/{first}/review", json={"decision": "pending", "note": ""})
    assert client.get("/api/baskets", params={"decision": "confirmed"}).json()["total"] == 0
    assert client.put(f"/api/baskets/{first}/review", json={"decision": "maybe"}).status_code == 422


def test_recommendation_ignores_unusable_detectors(client):
    m = client.get("/api/metrics").json()
    if m["recommended"]:
        row = next(r for r in m["models"] if r["key"] == m["recommended"])
        assert row["flag_rate"] <= 0.30
        assert m["recommended"] in m["recommendation"].lower().replace(" ", "_") or row["model"] in m["recommendation"]
