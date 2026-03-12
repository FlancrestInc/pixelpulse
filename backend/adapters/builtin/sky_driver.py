"""Builtin adapter that emits sky cycle values for environment rendering."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime
from typing import Any

from backend.adapters.base import AdapterBase, Signal

logger = logging.getLogger(__name__)


class SkyDriverAdapter(AdapterBase):
    """Adapter that emits the sky_time gauge for day/night transitions."""

    adapter_type = "sky_driver"

    def __init__(self, config: dict[str, Any]) -> None:
        """Initialize the sky driver mode and behavior settings."""
        super().__init__(config)
        self._mode = str(config.get("mode", "clock")).lower()
        self._cycle_minutes = float(config.get("cycle_minutes", 10.0))
        self._interval = float(config.get("interval", 1.0))
        self._signal_value = float(config.get("signal_value", 0.0))
        self._start_time = time.monotonic()

    @property
    def interval(self) -> float:
        """Return polling interval in seconds."""
        return self._interval

    @property
    def signal_ids(self) -> list[str]:
        """Return signal IDs this adapter may emit."""
        return ["sky_time"]

    async def poll(self) -> list[Signal] | None:
        """Emit a single sky_time signal based on the configured mode."""
        try:
            value = await self._compute_value()
            return [
                Signal(
                    id="sky_time",
                    type="gauge",
                    value=value,
                    label="Sky Time",
                    source=self.adapter_type,
                    timestamp=time.time(),
                    metadata={"mode": self._mode},
                )
            ]
        except Exception as exc:
            logger.exception("sky_driver adapter poll failed: %s", exc)
            return None

    async def _compute_value(self) -> float:
        """Compute the normalized sky position in the 0.0 to 1.0 range."""
        if self._mode == "clock":
            return self._clock_value()
        if self._mode == "cycle":
            return self._cycle_value()
        if self._mode == "signal":
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, self._signal_mode_value)

        logger.warning("Unknown sky_driver mode '%s'; defaulting to clock", self._mode)
        return self._clock_value()

    def _clock_value(self) -> float:
        """Map local wall-clock time across a 24-hour cycle."""
        now = datetime.now()
        seconds = now.hour * 3600 + now.minute * 60 + now.second
        return seconds / 86400.0

    def _cycle_value(self) -> float:
        """Map monotonic elapsed time across a fixed demo cycle duration."""
        cycle_seconds = max(self._cycle_minutes * 60.0, 1.0)
        elapsed = time.monotonic() - self._start_time
        return (elapsed % cycle_seconds) / cycle_seconds

    def _signal_mode_value(self) -> float:
        """Return configured signal-mode value normalized to 0.0-1.0."""
        return min(max(float(self.config.get("signal_value", self._signal_value)), 0.0), 1.0)
