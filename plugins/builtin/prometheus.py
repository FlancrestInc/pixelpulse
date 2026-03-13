"""First-party Prometheus plugin adapter."""

from __future__ import annotations

import logging
import re
import time
from typing import Any

import httpx

from backend.adapters.base import AdapterBase, Signal

logger = logging.getLogger(__name__)


class PrometheusAdapter(AdapterBase):
    """Query one Prometheus server for multiple configured PromQL signals."""

    adapter_type = "prometheus"
    requirements = ["httpx"]

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._url = str(config.get("url", "")).rstrip("/")
        self._interval = float(config.get("interval", 5.0))
        self._queries = config.get("queries", []) if isinstance(config.get("queries"), list) else []
        self._auth = config.get("auth", {}) if isinstance(config.get("auth"), dict) else {}

    @property
    def interval(self) -> float:
        return self._interval

    @property
    def signal_ids(self) -> list[str]:
        ids: list[str] = []
        for entry in self._queries:
            signal_id = str(entry.get("signal_id", "")).strip()
            if signal_id:
                ids.append(signal_id)
        return ids

    async def poll(self) -> list[Signal] | None:
        try:
            if not self._url:
                logger.error("prometheus adapter missing url")
                return None
            signals: list[Signal] = []
            async with httpx.AsyncClient(timeout=10.0, headers=self._headers(), auth=self._basic_auth()) as client:
                for query_cfg in self._queries:
                    built = await self._query_one(client, query_cfg)
                    signals.extend(built)
            return signals
        except Exception as exc:
            logger.exception("prometheus adapter failed: %s", exc)
            return None

    async def _query_one(self, client: httpx.AsyncClient, query_cfg: dict[str, Any]) -> list[Signal]:
        query = str(query_cfg.get("query", "")).strip()
        if not query:
            return []
        signal_id = str(query_cfg.get("signal_id", "")).strip()
        signal_type = str(query_cfg.get("type", "gauge"))
        label = str(query_cfg.get("label", signal_id.replace("_", " ").title()))
        max_value = query_cfg.get("max_value")
        suffix_label = query_cfg.get("label_as_suffix")

        response = await client.get(f"{self._url}/api/v1/query", params={"query": query})
        response.raise_for_status()
        payload = response.json()
        if payload.get("status") != "success":
            return []
        data = payload.get("data", {})
        result = data.get("result", []) if isinstance(data, dict) else []

        built: list[Signal] = []
        for series in result:
            metric = series.get("metric", {})
            sample = series.get("value", [None, None])
            raw_value = float(sample[1])
            normalized = self._normalize(raw_value, max_value)

            final_signal_id = signal_id
            host_label = None
            if suffix_label:
                host_label = str(metric.get(str(suffix_label), "")).strip()
                if host_label:
                    final_signal_id = f"{signal_id}_{self._sanitize_suffix(host_label)}"

            built.append(
                Signal(
                    id=final_signal_id,
                    type=signal_type,  # type: ignore[arg-type]
                    value=normalized,
                    label=label if not host_label else f"{label} ({host_label})",
                    source=self.adapter_type,
                    timestamp=time.time(),
                    metadata={
                        "promql": query,
                        "prometheus_url": self._url,
                        "host_label": host_label,
                    },
                )
            )
        return built

    def _headers(self) -> dict[str, str]:
        auth_type = str(self._auth.get("type", "")).lower()
        if auth_type == "bearer" and self._auth.get("token"):
            return {"Authorization": f"Bearer {self._auth['token']}"}
        return {}

    def _basic_auth(self) -> httpx.BasicAuth | None:
        auth_type = str(self._auth.get("type", "")).lower()
        if auth_type != "basic":
            return None
        username = self._auth.get("username")
        password = self._auth.get("password")
        if username is None or password is None:
            return None
        return httpx.BasicAuth(str(username), str(password))

    def _normalize(self, value: float, max_value: Any) -> float:
        if max_value is None:
            return value
        ceiling = float(max_value)
        if ceiling <= 0:
            return 0.0
        return min(max(value / ceiling, 0.0), 1.0)

    def _sanitize_suffix(self, value: str) -> str:
        sanitized = re.sub(r"[^a-z0-9_]+", "_", value.lower())
        sanitized = sanitized.strip("_")
        return sanitized or "unknown"
