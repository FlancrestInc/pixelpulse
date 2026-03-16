import pytest

from backend.config_loader import ConfigValidationError, load_backend_config, load_layout_config


@pytest.mark.asyncio
async def test_load_backend_config_accepts_showcase_config(temp_yaml):
    path = temp_yaml(
        "config.yaml",
        """
server: {host: "0.0.0.0", port: 8000}
signals:
  - id: cpu_load
    adapter: system
""",
    )
    data = await load_backend_config(str(path))
    assert data["signals"][0]["id"] == "cpu_load"


@pytest.mark.asyncio
async def test_load_layout_config_requires_plot_ids(temp_yaml):
    path = temp_yaml("layout.yaml", "plots:\n  - building: windmill\n")
    with pytest.raises(ConfigValidationError):
        await load_layout_config(str(path))


@pytest.mark.asyncio
async def test_repo_showcase_layout_matches_polished_demo_mapping():
    data = await load_layout_config("backend/layout.yaml")
    by_plot = {plot["plot_id"]: plot for plot in data["plots"]}

    assert by_plot["main_1"]["building"] == "windmill"
    assert by_plot["main_1"]["signal"] == "cpu_load"
    assert by_plot["main_3"]["building"] == "server_tower"
    assert by_plot["main_4"]["signal"] == "disk_used"
    assert by_plot["main_5"]["signal"] == "news_ticker"
    assert by_plot["mid_2"]["signal"] == "deploy_event"
    assert by_plot["mid_3"]["building"] == "drive_in"


@pytest.mark.asyncio
async def test_repo_example_config_contains_showcase_signal_ids():
    data = await load_backend_config("backend/config.example.yaml")
    signal_ids = {signal["id"] for signal in data["signals"]}

    assert {
        "cpu_load",
        "memory_used",
        "disk_used",
        "weather_text",
        "news_ticker",
        "http_requests",
        "active_streams",
        "deploy_event",
    } <= signal_ids
