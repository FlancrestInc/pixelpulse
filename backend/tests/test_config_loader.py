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
