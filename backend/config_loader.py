"""Parses and validates backend and layout configuration files."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import yaml


class ConfigValidationError(ValueError):
    """Raised when configuration files have invalid structure or values."""


async def load_backend_config(config_path: str) -> dict[str, Any]:
    """Load and validate backend config.yaml file."""
    data = await _load_yaml_file(config_path)
    if not isinstance(data, dict):
        raise ConfigValidationError("config.yaml must contain a top-level mapping.")

    server = data.get("server", {})
    if not isinstance(server, dict):
        raise ConfigValidationError("config.yaml 'server' must be a mapping.")
    host = server.get("host", "0.0.0.0")
    port = server.get("port", 8000)
    if not isinstance(host, str) or not host:
        raise ConfigValidationError("config.yaml 'server.host' must be a non-empty string.")
    if not isinstance(port, int) or port <= 0:
        raise ConfigValidationError("config.yaml 'server.port' must be a positive integer.")

    sky_driver = data.get("sky_driver", {})
    if sky_driver is not None and not isinstance(sky_driver, dict):
        raise ConfigValidationError("config.yaml 'sky_driver' must be a mapping when provided.")
    if isinstance(sky_driver, dict):
        mode = sky_driver.get("mode", "clock")
        if mode not in {"clock", "cycle", "signal"}:
            raise ConfigValidationError("config.yaml 'sky_driver.mode' must be one of: clock, cycle, signal.")

    signals = data.get("signals", [])
    if not isinstance(signals, list):
        raise ConfigValidationError("config.yaml 'signals' must be a list.")

    for index, signal in enumerate(signals):
        if not isinstance(signal, dict):
            raise ConfigValidationError(f"config.yaml signals[{index}] must be a mapping.")
        signal_id = signal.get("id")
        adapter = signal.get("adapter")
        interval = signal.get("interval")
        if not isinstance(signal_id, str) or not signal_id:
            raise ConfigValidationError(f"config.yaml signals[{index}].id must be a non-empty string.")
        if not isinstance(adapter, str) or not adapter:
            raise ConfigValidationError(f"config.yaml signals[{index}].adapter must be a non-empty string.")
        if interval is not None and not isinstance(interval, (int, float)):
            raise ConfigValidationError(f"config.yaml signals[{index}].interval must be numeric when provided.")

    return data


async def load_layout_config(layout_path: str) -> dict[str, Any]:
    """Load and validate backend layout.yaml file."""
    data = await _load_yaml_file(layout_path)
    if data is None:
        return {"plots": []}
    if not isinstance(data, dict):
        raise ConfigValidationError("layout.yaml must contain a top-level mapping.")

    plots = data.get("plots", [])
    if not isinstance(plots, list):
        raise ConfigValidationError("layout.yaml 'plots' must be a list.")

    for index, plot in enumerate(plots):
        if not isinstance(plot, dict):
            raise ConfigValidationError(f"layout.yaml plots[{index}] must be a mapping.")

        plot_id = plot.get("plot_id")
        if not isinstance(plot_id, str) or not plot_id:
            raise ConfigValidationError(f"layout.yaml plots[{index}].plot_id must be a non-empty string.")

        building = plot.get("building")
        style = plot.get("style")
        has_building = building is not None
        has_style = style is not None

        if has_building and (not isinstance(building, str) or not building):
            raise ConfigValidationError(f"layout.yaml plots[{index}].building must be a non-empty string.")
        if has_style and (not isinstance(style, str) or not style):
            raise ConfigValidationError(f"layout.yaml plots[{index}].style must be a non-empty string.")

        if has_building != has_style:
            missing_field = "style" if has_building else "building"
            raise ConfigValidationError(f"layout.yaml plots[{index}]: {missing_field} is required when the other is set.")

        signal = plot.get("signal")
        if signal is not None and (not isinstance(signal, str) or not signal):
            raise ConfigValidationError(f"layout.yaml plots[{index}].signal must be a non-empty string when provided.")

        valve = plot.get("valve")
        if valve is not None and not isinstance(valve, dict):
            raise ConfigValidationError(f"layout.yaml plots[{index}].valve must be a mapping when provided.")

    return data


async def _load_yaml_file(path: str) -> Any:
    """Read and parse YAML content from disk using an executor."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _read_yaml_sync, path)


def _read_yaml_sync(path: str) -> Any:
    """Synchronously read and parse a YAML file from disk."""
    file_path = Path(path)
    if not file_path.exists():
        if file_path.name == "layout.yaml":
            return None
        raise ConfigValidationError(f"Required configuration file does not exist: {path}")

    try:
        with file_path.open("r", encoding="utf-8") as handle:
            return yaml.safe_load(handle)
    except yaml.YAMLError as exc:
        raise ConfigValidationError(f"Invalid YAML in {path}: {exc}") from exc
