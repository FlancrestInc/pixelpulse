from backend.signal_engine import SignalEngine


def test_safe_config_strips_sensitive_fields():
    engine = SignalEngine("backend/config.example.yaml", "backend/layout.yaml")
    engine.config = {
        "signals": [
            {
                "id": "weather_text",
                "adapter": "weather",
                "api_key": "secret",
                "interval": 60,
                "token": "hidden",
            }
        ],
        "server": {"port": 8000},
    }

    safe = engine._safe_config()

    assert "secret" not in str(safe)
    assert "hidden" not in str(safe)
    assert safe["signals"] == [{"id": "weather_text", "adapter": "weather", "interval": 60}]
    assert safe["server"] == {"port": 8000}


def test_handshake_payload_uses_safe_config_and_current_layout():
    engine = SignalEngine("backend/config.example.yaml", "backend/layout.yaml")
    engine.config = {
        "signals": [{"id": "cpu_load", "adapter": "system", "interval": 2, "command": "leak"}],
        "server": {"port": 9000},
    }
    engine.layout = {"plots": [{"plot_id": "main_1", "signal": "cpu_load"}]}
    engine.current_signals = {"cpu_load": {"id": "cpu_load", "value": 0.5}}

    payload = engine._handshake_payload()

    assert payload["type"] == "handshake"
    assert payload["layout"] == engine.layout
    assert payload["signals"] == engine.current_signals
    assert payload["config"]["signals"] == [{"id": "cpu_load", "adapter": "system", "interval": 2}]
