from pathlib import Path

from fastapi.testclient import TestClient
import yaml

from backend import config_api
from backend.main import app


def test_put_layout_persists_plots(monkeypatch, tmp_path: Path):
    layout_path = tmp_path / "layout.yaml"
    events: list[dict] = []

    async def capture(payload):
        events.append(payload)

    monkeypatch.setattr(config_api, "LAYOUT_PATH", layout_path)
    config_api.set_layout_event_publisher(capture)

    client = TestClient(app)
    payload = {
        "layout": {
            "display": {"plots_per_row": 6},
            "plots": [{"plot_id": "main_1", "signal": "cpu_load"}],
        }
    }

    response = client.put("/api/layout", json=payload)

    assert response.status_code == 200
    assert yaml.safe_load(layout_path.read_text(encoding="utf-8")) == payload["layout"]
    assert events == [{"type": "layout_saved", "layout": payload["layout"]}]


def test_get_layout_returns_empty_payload_when_layout_file_is_missing(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(config_api, "LAYOUT_PATH", tmp_path / "missing-layout.yaml")

    client = TestClient(app)
    response = client.get("/api/layout")

    assert response.status_code == 200
    assert response.json() == {"layout": {"plots": []}}
