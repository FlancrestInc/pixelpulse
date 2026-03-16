from pathlib import Path

from fastapi.testclient import TestClient
import yaml

from backend import config_api
from backend.main import app


def _write_example_config(path: Path) -> None:
    path.write_text(
        """
server:
  host: "0.0.0.0"
  port: 8000

signals:
  - id: "cpu_load"
    adapter: "system"
    metric: "cpu_percent"
    interval: 2
  - id: "memory_used"
    adapter: "system"
    metric: "memory_used"
    interval: 5
""".strip()
        + "\n",
        encoding="utf-8",
    )


def _valid_layout_payload() -> dict:
    return {
        "layout": {
            "display": {"plots_per_row": 6},
            "plots": [
                {
                    "plot_id": "main_1",
                    "building": "windmill",
                    "style": "classic_wood",
                    "signal": "cpu_load",
                    "valve": {
                        "range_min": 0,
                        "range_max": 1,
                        "alert_threshold": 0.85,
                        "label": "CPU Load",
                    },
                }
            ],
        }
    }


def test_put_layout_persists_plots(monkeypatch, tmp_path: Path):
    layout_path = tmp_path / "layout.yaml"
    config_path = tmp_path / "config.yaml"
    events: list[dict] = []

    async def capture(payload):
        events.append(payload)

    _write_example_config(config_path)
    monkeypatch.setattr(config_api, "CONFIG_PATH", config_path)
    monkeypatch.setattr(config_api, "LAYOUT_PATH", layout_path)
    config_api.set_layout_event_publisher(capture)

    client = TestClient(app)
    payload = _valid_layout_payload()

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


def test_put_layout_rejects_unknown_plot_id(monkeypatch, tmp_path: Path):
    layout_path = tmp_path / "layout.yaml"
    config_path = tmp_path / "config.yaml"
    _write_example_config(config_path)
    monkeypatch.setattr(config_api, "CONFIG_PATH", config_path)
    monkeypatch.setattr(config_api, "LAYOUT_PATH", layout_path)

    client = TestClient(app)
    payload = _valid_layout_payload()
    payload["layout"]["plots"][0]["plot_id"] = "unknown_plot"

    response = client.put("/api/layout", json=payload)

    assert response.status_code == 400
    assert response.json()["detail"]["errors"][0]["code"] == "unknown_plot_id"
    assert not layout_path.exists()


def test_put_layout_rejects_unknown_building(monkeypatch, tmp_path: Path):
    layout_path = tmp_path / "layout.yaml"
    config_path = tmp_path / "config.yaml"
    _write_example_config(config_path)
    monkeypatch.setattr(config_api, "CONFIG_PATH", config_path)
    monkeypatch.setattr(config_api, "LAYOUT_PATH", layout_path)

    client = TestClient(app)
    payload = _valid_layout_payload()
    payload["layout"]["plots"][0]["building"] = "mystery_factory"

    response = client.put("/api/layout", json=payload)

    assert response.status_code == 400
    assert response.json()["detail"]["errors"][0]["code"] == "unknown_building"
    assert not layout_path.exists()


def test_put_layout_rejects_missing_style_for_building(monkeypatch, tmp_path: Path):
    layout_path = tmp_path / "layout.yaml"
    config_path = tmp_path / "config.yaml"
    _write_example_config(config_path)
    monkeypatch.setattr(config_api, "CONFIG_PATH", config_path)
    monkeypatch.setattr(config_api, "LAYOUT_PATH", layout_path)

    client = TestClient(app)
    payload = _valid_layout_payload()
    payload["layout"]["plots"][0].pop("style")

    response = client.put("/api/layout", json=payload)

    assert response.status_code == 400
    assert response.json()["detail"]["errors"][0]["code"] == "missing_style"
    assert not layout_path.exists()


def test_put_layout_rejects_unknown_signal(monkeypatch, tmp_path: Path):
    layout_path = tmp_path / "layout.yaml"
    config_path = tmp_path / "config.yaml"
    _write_example_config(config_path)
    monkeypatch.setattr(config_api, "CONFIG_PATH", config_path)
    monkeypatch.setattr(config_api, "LAYOUT_PATH", layout_path)

    client = TestClient(app)
    payload = _valid_layout_payload()
    payload["layout"]["plots"][0]["signal"] = "not_a_real_signal"

    response = client.put("/api/layout", json=payload)

    assert response.status_code == 400
    assert response.json()["detail"]["errors"][0]["code"] == "unknown_signal"
    assert not layout_path.exists()


def test_put_layout_rejects_malformed_valve(monkeypatch, tmp_path: Path):
    layout_path = tmp_path / "layout.yaml"
    config_path = tmp_path / "config.yaml"
    _write_example_config(config_path)
    monkeypatch.setattr(config_api, "CONFIG_PATH", config_path)
    monkeypatch.setattr(config_api, "LAYOUT_PATH", layout_path)

    client = TestClient(app)
    payload = _valid_layout_payload()
    payload["layout"]["plots"][0]["valve"] = "wide_open"

    response = client.put("/api/layout", json=payload)

    assert response.status_code == 400
    assert response.json()["detail"]["errors"][0]["code"] == "invalid_valve"
    assert not layout_path.exists()


def test_put_layout_rejects_invalid_valve_range(monkeypatch, tmp_path: Path):
    layout_path = tmp_path / "layout.yaml"
    config_path = tmp_path / "config.yaml"
    _write_example_config(config_path)
    monkeypatch.setattr(config_api, "CONFIG_PATH", config_path)
    monkeypatch.setattr(config_api, "LAYOUT_PATH", layout_path)

    client = TestClient(app)
    payload = _valid_layout_payload()
    payload["layout"]["plots"][0]["valve"]["range_max"] = 0

    response = client.put("/api/layout", json=payload)

    assert response.status_code == 400
    assert response.json()["detail"]["errors"][0]["code"] == "invalid_valve_range"
    assert not layout_path.exists()


def test_put_layout_rejects_duplicate_plot_ids(monkeypatch, tmp_path: Path):
    layout_path = tmp_path / "layout.yaml"
    config_path = tmp_path / "config.yaml"
    _write_example_config(config_path)
    monkeypatch.setattr(config_api, "CONFIG_PATH", config_path)
    monkeypatch.setattr(config_api, "LAYOUT_PATH", layout_path)

    client = TestClient(app)
    payload = _valid_layout_payload()
    payload["layout"]["plots"].append(
        {
            "plot_id": "main_1",
            "building": "power_station",
            "style": "coal_classic",
            "signal": "memory_used",
            "valve": {
                "range_min": 0,
                "range_max": 1,
                "alert_threshold": 0.8,
                "label": "Memory Used",
            },
        }
    )

    response = client.put("/api/layout", json=payload)

    assert response.status_code == 400
    assert response.json()["detail"]["errors"][0]["code"] == "duplicate_plot_id"
    assert not layout_path.exists()


def test_put_layout_rejected_save_keeps_last_good_layout(monkeypatch, tmp_path: Path):
    layout_path = tmp_path / "layout.yaml"
    config_path = tmp_path / "config.yaml"
    _write_example_config(config_path)
    monkeypatch.setattr(config_api, "CONFIG_PATH", config_path)
    monkeypatch.setattr(config_api, "LAYOUT_PATH", layout_path)
    initial_layout = {
        "display": {"plots_per_row": 6},
        "plots": [{"plot_id": "main_1", "building": "windmill", "style": "classic_wood"}],
    }
    layout_path.write_text(yaml.safe_dump(initial_layout, sort_keys=False), encoding="utf-8")

    client = TestClient(app)
    payload = _valid_layout_payload()
    payload["layout"]["plots"][0]["signal"] = "broken_signal"

    response = client.put("/api/layout", json=payload)

    assert response.status_code == 400
    assert yaml.safe_load(layout_path.read_text(encoding="utf-8")) == initial_layout
