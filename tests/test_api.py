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
