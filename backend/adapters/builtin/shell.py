"""Builtin adapter for executing shell commands and mapping output to signals."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from backend.adapters.base import AdapterBase, Signal

logger = logging.getLogger(__name__)


class ShellAdapter(AdapterBase):
    """Run shell commands on an interval and emit parsed stdout as a signal."""

    adapter_type = "shell"
    requirements: list[str] = []

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._signal_id = str(config.get("id", "shell_value"))
        self._label = str(config.get("label", self._signal_id.replace("_", " ").title()))
        self._command = str(config.get("command", ""))
        self._interval = float(config.get("interval", 30.0))
        self._type = str(config.get("type", "gauge"))
        self._timeout = float(config.get("timeout", 10.0))
        self._max_value = config.get("max_value")

    @property
    def interval(self) -> float:
        return self._interval

    @property
    def signal_ids(self) -> list[str]:
        return [self._signal_id]

    async def poll(self) -> list[Signal] | None:
        try:
            if not self._command:
                logger.error("shell '%s' missing command", self._signal_id)
                return None
            process = await asyncio.create_subprocess_shell(
                self._command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=self._timeout)
            if process.returncode != 0:
                logger.warning("shell adapter '%s' command failed: %s", self._signal_id, stderr.decode().strip())
                return None

            raw = stdout.decode().strip()
            value = self._parse_value(raw)
            return [
                Signal(
                    id=self._signal_id,
                    type=self._type,  # type: ignore[arg-type]
                    value=value,
                    label=self._label,
                    source=self.adapter_type,
                    timestamp=time.time(),
                    metadata={"command": self._command},
                )
            ]
        except Exception as exc:
            logger.exception("shell adapter '%s' failed: %s", self._signal_id, exc)
            return None

    def _parse_value(self, raw: str) -> float | str:
        if self._type in {"text", "event", "state"}:
            return raw
        value = float(raw)
        if self._max_value is None:
            return value
        max_value = float(self._max_value)
        if max_value <= 0:
            return 0.0
        return min(max(value / max_value, 0.0), 1.0)
