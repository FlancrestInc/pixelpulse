"""Core signal coordinator and rolling history buffer manager."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

from backend.adapters.base import AdapterBase, Signal
from backend.config_loader import load_backend_config, load_layout_config
from backend.plugin_loader import load_adapter_classes_with_report

logger = logging.getLogger(__name__)


class SignalEngine:
    """Loads adapters, polls them on schedule, and broadcasts signals to clients."""

    def __init__(self, config_path: str, layout_path: str) -> None:
        self.config_path = config_path
        self.layout_path = layout_path
        self.config: dict[str, Any] = {}
        self.layout: dict[str, Any] = {}

        self.current_signals: dict[str, dict[str, Any]] = {}
        self.clients: set[WebSocket] = set()
        self._tasks: list[asyncio.Task[None]] = []
        self._adapters: list[AdapterBase] = []
        self._lock = asyncio.Lock()
        self.adapter_statuses: dict[str, dict[str, str]] = {}

    async def start(self) -> None:
        self.config = await load_backend_config(self.config_path)
        self.layout = await load_layout_config(self.layout_path)

        load_report = load_adapter_classes_with_report()
        self._mark_missing_dependencies(load_report.missing_dependencies)
        self._adapters = self._build_adapters(load_report.registry)

        for adapter in self._adapters:
            task = asyncio.create_task(self._run_adapter_loop(adapter))
            self._tasks.append(task)

        logger.info("Signal engine started with %d adapters", len(self._adapters))

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

        for websocket in list(self.clients):
            try:
                await websocket.close()
            except Exception:
                logger.debug("WebSocket close failed", exc_info=True)
        self.clients.clear()

    async def register_client(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.clients.add(websocket)
        await websocket.send_json(self._handshake_payload())
        logger.info("WebSocket client connected (%d total)", len(self.clients))

    async def unregister_client(self, websocket: WebSocket) -> None:
        self.clients.discard(websocket)
        logger.info("WebSocket client disconnected (%d total)", len(self.clients))

    def _build_adapters(self, adapter_classes: dict[str, type[AdapterBase]]) -> list[AdapterBase]:
        adapters: list[AdapterBase] = []

        sky_config = self.config.get("sky_driver")
        if isinstance(sky_config, dict):
            sky_cls = adapter_classes.get("sky_driver")
            if sky_cls is None:
                logger.warning("sky_driver configured but adapter not found")
                self.adapter_statuses["sky_driver"] = {"status": "missing_deps", "message": "adapter not found"}
            else:
                adapters.append(sky_cls(sky_config))

        for entry in self.config.get("signals", []):
            if not isinstance(entry, dict):
                continue
            adapter_type = str(entry.get("adapter", "")).strip()
            adapter_cls = adapter_classes.get(adapter_type)
            if adapter_cls is None:
                logger.warning("Adapter '%s' not found for signal '%s'", adapter_type, entry.get("id"))
                self.adapter_statuses[self._adapter_key(adapter_type, entry)] = {
                    "status": "missing_deps",
                    "message": "adapter unavailable",
                }
                continue
            adapters.append(adapter_cls(entry))

        return adapters

    async def _run_adapter_loop(self, adapter: AdapterBase) -> None:
        backoff = 2.0
        adapter_key = self._adapter_key(adapter.adapter_type, getattr(adapter, "config", {}))
        await self._set_adapter_status(adapter_key, adapter.adapter_type, "ok")

        while True:
            try:
                result = await adapter.poll()
                previous = self.adapter_statuses.get(adapter_key, {}).get("status")
                if result is None:
                    await self._set_adapter_status(adapter_key, adapter.adapter_type, "error")
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2.0, 30.0)
                    continue

                if previous == "error":
                    await self._set_adapter_status(adapter_key, adapter.adapter_type, "recovering")
                elif previous == "recovering":
                    await self._set_adapter_status(adapter_key, adapter.adapter_type, "ok")

                if result:
                    await self._ingest_signals(result)
                backoff = 2.0
                await asyncio.sleep(max(adapter.interval, 0.1))
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.exception("Adapter loop error for '%s': %s", adapter.adapter_type, exc)
                await self._set_adapter_status(adapter_key, adapter.adapter_type, "error")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2.0, 30.0)

    async def _ingest_signals(self, signals: list[Signal]) -> None:
        async with self._lock:
            for signal in signals:
                self.current_signals[signal.id] = {
                    "id": signal.id,
                    "type": signal.type,
                    "value": signal.value,
                    "label": signal.label,
                    "source": signal.source,
                    "timestamp": signal.timestamp,
                    "metadata": signal.metadata,
                }

        for signal in signals:
            await self._broadcast({"type": "signal", "signal": self.current_signals[signal.id]})

    async def _set_adapter_status(self, adapter_key: str, adapter_type: str, status: str, message: str = "") -> None:
        current = self.adapter_statuses.get(adapter_key, {})
        if current.get("status") == status and current.get("message", "") == message:
            return
        payload = {
            "adapter_key": adapter_key,
            "adapter_type": adapter_type,
            "status": status,
            "message": message,
        }
        self.adapter_statuses[adapter_key] = {"status": status, "message": message, "adapter_type": adapter_type}
        await self._broadcast({"type": "adapter_status", **payload})

    async def _broadcast(self, payload: dict[str, Any]) -> None:
        stale: list[WebSocket] = []
        for websocket in self.clients:
            try:
                await websocket.send_json(payload)
            except Exception:
                stale.append(websocket)
        for websocket in stale:
            await self.unregister_client(websocket)

    def _handshake_payload(self) -> dict[str, Any]:
        return {
            "type": "handshake",
            "signals": self.current_signals,
            "config": self._safe_config(),
            "layout": self.layout,
            "adapter_statuses": self.adapter_statuses,
        }

    def _safe_config(self) -> dict[str, Any]:
        """Return a frontend-safe subset of backend config with sensitive fields stripped."""
        safe_signals: list[dict[str, Any]] = []
        for signal in self.config.get("signals", []):
            if not isinstance(signal, dict):
                continue
            safe_signals.append(
                {
                    "id": signal.get("id"),
                    "adapter": signal.get("adapter"),
                    "interval": signal.get("interval"),
                }
            )

        safe_sky_driver: dict[str, Any] | None = None
        sky_driver = self.config.get("sky_driver")
        if isinstance(sky_driver, dict):
            safe_sky_driver = {
                "id": sky_driver.get("id"),
                "adapter": sky_driver.get("adapter") or "sky_driver",
                "interval": sky_driver.get("interval"),
            }

        server = self.config.get("server")
        port = 8000
        if isinstance(server, dict):
            port = server.get("port", 8000)

        return {
            "sky_driver": safe_sky_driver,
            "signals": safe_signals,
            "server": {"port": port},
        }

    def _adapter_key(self, adapter_type: str, config: dict[str, Any]) -> str:
        signal_id = config.get("id") if isinstance(config, dict) else None
        return f"{adapter_type}:{signal_id}" if signal_id else adapter_type

    def _mark_missing_dependencies(self, missing: dict[str, list[str]]) -> None:
        for adapter_type, deps in missing.items():
            self.adapter_statuses[adapter_type] = {
                "status": "missing_deps",
                "message": f"missing dependencies: {', '.join(deps)}",
                "adapter_type": adapter_type,
            }
