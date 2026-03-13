"""Builtin adapter for accepting webhook-driven signal updates."""

from __future__ import annotations

import asyncio
import logging
import re
import time
from collections import defaultdict
from typing import Any

from backend.adapters.base import AdapterBase, Signal

logger = logging.getLogger(__name__)


class WebhookAdapter(AdapterBase):
    """Emit signal values pushed by external HTTP POST webhook calls."""

    adapter_type = "webhook"
    requirements: list[str] = []

    _instances_by_path: dict[str, set["WebhookAdapter"]] = defaultdict(set)

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._signal_id = str(config.get("id", "webhook_event"))
        self._label = str(config.get("label", self._signal_id.replace("_", " ").title()))
        self._type = str(config.get("type", "event"))
        self._path = self._normalize_path(str(config.get("path", "/hooks/default")))
        self._interval = float(config.get("interval", 1.0))
        self._event_name = str(config.get("event_name", self._signal_id))
        self._value_key = config.get("value_key")
        self._queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        WebhookAdapter._instances_by_path[self._path].add(self)

    @property
    def interval(self) -> float:
        return self._interval

    @property
    def signal_ids(self) -> list[str]:
        return [self._signal_id]

    async def poll(self) -> list[Signal] | None:
        try:
            if self._queue.empty():
                return []
            payload = await self._queue.get()
            value = self._extract_value(payload)
            return [
                Signal(
                    id=self._signal_id,
                    type=self._type,  # type: ignore[arg-type]
                    value=value,
                    label=self._label,
                    source=self.adapter_type,
                    timestamp=time.time(),
                    metadata={"path": self._path},
                )
            ]
        except Exception as exc:
            logger.exception("webhook adapter '%s' failed: %s", self._signal_id, exc)
            return None

    @classmethod
    async def dispatch_payload(cls, path: str, payload: dict[str, Any]) -> bool:
        """Dispatch incoming payload to all webhook adapters registered for path."""
        normalized = cls._normalize_path(path)
        instances = cls._instances_by_path.get(normalized, set())
        if not instances:
            return False
        for instance in instances:
            await instance._queue.put(payload)
        return True

    def _extract_value(self, payload: dict[str, Any]) -> float | str:
        if self._value_key and self._value_key in payload:
            raw = payload[self._value_key]
        elif self._type == "event":
            raw = payload.get("event", self._event_name)
        else:
            raw = payload.get("value", 0)

        if self._type in {"text", "event", "state"}:
            return str(raw)
        return float(raw)

    @staticmethod
    def _normalize_path(path: str) -> str:
        clean = re.sub(r"/+", "/", path.strip())
        if not clean.startswith("/"):
            clean = f"/{clean}"
        return clean.rstrip("/") or "/"
