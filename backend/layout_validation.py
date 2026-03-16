"""Validation for layout save payloads before persistence."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


VALID_PLOT_IDS = {
    "main_1",
    "main_2",
    "main_3",
    "main_4",
    "main_5",
    "main_6",
    "mid_1",
    "mid_2",
    "mid_3",
}

VALID_BUILDINGS = {
    "windmill",
    "water_tower",
    "bus_stop",
    "server_tower",
    "warehouse",
    "power_station",
    "bank_ticker",
    "cafe",
    "drive_in",
    "data_vault",
    "auth_gate",
    "city_park",
    "billboard",
}

REQUIRED_VALVE_FIELDS = ("range_min", "range_max", "alert_threshold")


class LayoutValidationError(ValueError):
    """Raised when a proposed layout save payload is invalid."""

    def __init__(self, errors: list[dict[str, Any]]):
        super().__init__("layout validation failed")
        self.errors = errors


async def validate_layout_payload(layout: dict[str, Any], *, config_path: Path) -> None:
    errors: list[dict[str, Any]] = []

    if not isinstance(layout, dict):
        raise LayoutValidationError([_error("invalid_layout", "Layout payload must be a mapping.", field="layout")])

    plots = layout.get("plots", [])
    if not isinstance(plots, list):
        raise LayoutValidationError([_error("invalid_plots", "Layout payload must contain a plots list.", field="plots")])

    display = layout.get("display")
    if display is not None and not isinstance(display, dict):
        errors.append(_error("invalid_display", "display must be a mapping when provided.", field="display"))

    signal_ids = _load_signal_ids(config_path)
    seen_plot_ids: set[str] = set()

    for index, plot in enumerate(plots):
        location = f"plots[{index}]"
        if not isinstance(plot, dict):
            errors.append(_error("invalid_plot", "Each plot entry must be a mapping.", field=location))
            continue

        plot_id = plot.get("plot_id")
        if not isinstance(plot_id, str) or not plot_id:
            errors.append(_error("missing_plot_id", "plot_id is required and must be a non-empty string.", field=f"{location}.plot_id"))
            continue
        if plot_id not in VALID_PLOT_IDS:
            errors.append(_error("unknown_plot_id", f"Unknown plot_id '{plot_id}'.", field=f"{location}.plot_id", plot_id=plot_id))
        if plot_id in seen_plot_ids:
            errors.append(_error("duplicate_plot_id", f"plot_id '{plot_id}' appears more than once.", field=f"{location}.plot_id", plot_id=plot_id))
        seen_plot_ids.add(plot_id)

        building = plot.get("building")
        style = plot.get("style")
        has_building = building is not None
        has_style = style is not None

        if has_building and (not isinstance(building, str) or not building):
            errors.append(_error("invalid_building", "building must be a non-empty string when provided.", field=f"{location}.building", plot_id=plot_id))
        elif isinstance(building, str) and building not in VALID_BUILDINGS:
            errors.append(_error("unknown_building", f"Unknown building '{building}'.", field=f"{location}.building", plot_id=plot_id))

        if has_style and (not isinstance(style, str) or not style):
            errors.append(_error("invalid_style", "style must be a non-empty string when provided.", field=f"{location}.style", plot_id=plot_id))
        elif has_building and not has_style:
            errors.append(_error("missing_style", "style is required when building is set.", field=f"{location}.style", plot_id=plot_id))
        elif has_style and not has_building:
            errors.append(_error("missing_building", "building is required when style is set.", field=f"{location}.building", plot_id=plot_id))

        signal = plot.get("signal")
        if signal is not None and (not isinstance(signal, str) or not signal):
            errors.append(_error("invalid_signal", "signal must be a non-empty string when provided.", field=f"{location}.signal", plot_id=plot_id))
        elif isinstance(signal, str) and signal not in signal_ids:
            errors.append(_error("unknown_signal", f"Unknown signal '{signal}'.", field=f"{location}.signal", plot_id=plot_id))

        valve = plot.get("valve")
        if valve is not None and signal is None:
            errors.append(_error("valve_requires_signal", "valve requires a signal on the same plot.", field=f"{location}.valve", plot_id=plot_id))
            continue
        if valve is None:
            continue
        if not isinstance(valve, dict):
            errors.append(_error("invalid_valve", "valve must be a mapping when provided.", field=f"{location}.valve", plot_id=plot_id))
            continue

        missing_fields = [field for field in REQUIRED_VALVE_FIELDS if field not in valve]
        if missing_fields:
            errors.append(
                _error(
                    "missing_valve_fields",
                    f"valve is missing required fields: {', '.join(missing_fields)}.",
                    field=f"{location}.valve",
                    plot_id=plot_id,
                )
            )
            continue

        numeric_values: dict[str, float] = {}
        for field in REQUIRED_VALVE_FIELDS:
            value = valve.get(field)
            if not isinstance(value, (int, float)):
                errors.append(
                    _error(
                        "invalid_valve_number",
                        f"valve.{field} must be numeric.",
                        field=f"{location}.valve.{field}",
                        plot_id=plot_id,
                    )
                )
                continue
            numeric_values[field] = float(value)

        if len(numeric_values) != len(REQUIRED_VALVE_FIELDS):
            continue

        if numeric_values["range_max"] <= numeric_values["range_min"]:
            errors.append(
                _error(
                    "invalid_valve_range",
                    "valve.range_max must be greater than valve.range_min.",
                    field=f"{location}.valve.range_max",
                    plot_id=plot_id,
                )
            )

        alert_threshold = numeric_values["alert_threshold"]
        if not (numeric_values["range_min"] <= alert_threshold <= numeric_values["range_max"]):
            errors.append(
                _error(
                    "invalid_alert_threshold",
                    "valve.alert_threshold must be between range_min and range_max.",
                    field=f"{location}.valve.alert_threshold",
                    plot_id=plot_id,
                )
            )

        label = valve.get("label")
        if label is not None and (not isinstance(label, str) or not label.strip()):
            errors.append(
                _error(
                    "invalid_valve_label",
                    "valve.label must be a non-empty string when provided.",
                    field=f"{location}.valve.label",
                    plot_id=plot_id,
                )
            )

    if errors:
        raise LayoutValidationError(errors)


def _load_signal_ids(config_path: Path) -> set[str]:
    if not config_path.exists():
        raise LayoutValidationError([
            _error("missing_config", f"Config file does not exist: {config_path}", field="config")
        ])

    with config_path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)

    if not isinstance(data, dict):
        raise LayoutValidationError([_error("invalid_config", "config.yaml must contain a mapping.", field="config")])

    signals = data.get("signals", [])
    if not isinstance(signals, list):
        raise LayoutValidationError([_error("invalid_config_signals", "config.yaml signals must be a list.", field="config.signals")])

    signal_ids: set[str] = set()
    for index, signal in enumerate(signals):
        if not isinstance(signal, dict):
            raise LayoutValidationError([
                _error("invalid_config_signal", f"config.yaml signals[{index}] must be a mapping.", field=f"config.signals[{index}]")
            ])
        signal_id = signal.get("id")
        if not isinstance(signal_id, str) or not signal_id:
            raise LayoutValidationError([
                _error(
                    "invalid_config_signal_id",
                    f"config.yaml signals[{index}].id must be a non-empty string.",
                    field=f"config.signals[{index}].id",
                )
            ])
        signal_ids.add(signal_id)

    return signal_ids


def _error(code: str, message: str, *, field: str, plot_id: str | None = None) -> dict[str, Any]:
    error = {"code": code, "message": message, "field": field}
    if plot_id is not None:
        error["plot_id"] = plot_id
    return error
