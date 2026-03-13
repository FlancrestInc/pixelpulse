"""Builtin adapter for polling HTTP endpoints for signal values."""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

import httpx
from jsonpath_ng.ext import parse as parse_jsonpath

from backend.adapters.base import AdapterBase, Signal

logger = logging.getLogger(__name__)


class HttpPollAdapter(AdapterBase):
    """Fetch an HTTP endpoint and extract a value as a signal."""

    adapter_type = "http_poll"
    requirements = ["httpx", "jsonpath-ng"]

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._signal_id = str(config.get("id", "http_poll_value"))
        self._label = str(config.get("label", self._signal_id.replace("_", " ").title()))
        self._interval = float(config.get("interval", 30.0))
        self._url = str(config.get("url", ""))
        self._method = str(config.get("method", "GET")).upper()
        self._headers = config.get("headers", {}) if isinstance(config.get("headers"), dict) else {}
        self._body = config.get("body")
        self._json_path = config.get("json_path")
        self._regex = config.get("regex")
        self._transform = config.get("transform")
        self._timeout = float(config.get("timeout", 10.0))
        self._type = str(config.get("type", "gauge"))
        self._max_value = config.get("max_value")
        self._jsonpath_expr = parse_jsonpath(self._json_path) if self._json_path else None

    @property
    def interval(self) -> float:
        return self._interval

    @property
    def signal_ids(self) -> list[str]:
        return [self._signal_id]

    async def poll(self) -> list[Signal] | None:
        try:
            if not self._url:
                logger.error("http_poll '%s' missing url", self._signal_id)
                return None

            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.request(
                    self._method,
                    self._url,
                    headers=self._headers,
                    json=self._body if isinstance(self._body, (dict, list)) else None,
                    content=self._body if isinstance(self._body, str) else None,
                )
                response.raise_for_status()

            extracted = self._extract_value(response)
            transformed = self._apply_transform(extracted)
            normalized = self._normalize(transformed)
            value: float | str = self._coerce_output(normalized)
            return [
                Signal(
                    id=self._signal_id,
                    type=self._type,  # type: ignore[arg-type]
                    value=value,
                    label=self._label,
                    source=self.adapter_type,
                    timestamp=time.time(),
                    metadata={"url": self._url, "method": self._method},
                )
            ]
        except Exception as exc:
            logger.exception("http_poll adapter '%s' failed: %s", self._signal_id, exc)
            return None

    def _extract_value(self, response: httpx.Response) -> Any:
        if self._jsonpath_expr is not None:
            payload = response.json()
            matches = self._jsonpath_expr.find(payload)
            return matches[0].value if matches else None
        if self._regex:
            match = re.search(str(self._regex), response.text)
            return match.group(1) if match and match.groups() else (match.group(0) if match else None)
        try:
            data = response.json()
            if isinstance(data, dict) and "value" in data:
                return data["value"]
            return data
        except json.JSONDecodeError:
            return response.text.strip()

    def _apply_transform(self, value: Any) -> Any:
        if not self._transform:
            return value
        safe_globals = {"__builtins__": {"min": min, "max": max, "abs": abs, "round": round}}
        return eval(str(self._transform), safe_globals, {"value": value})

    def _normalize(self, value: Any) -> Any:
        if self._max_value is None:
            return value
        numeric = float(value)
        max_value = float(self._max_value)
        if max_value <= 0:
            return 0.0
        return min(max(numeric / max_value, 0.0), 1.0)

    def _coerce_output(self, value: Any) -> float | str:
        if self._type in {"text", "event", "state"}:
            return str(value)
        return float(value)
