"""Core signal coordinator and rolling history buffer manager."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

from backend.adapters.base import AdapterBase, Signal
from backend.config_loader import load_backend_config, load_layout_config
from backend.plugin_loader import load_adapter_classes

logger = logging.getLogger(__name__)


class SignalEngine:
    """Loads adapters, polls them on schedule, and broadcasts signals to clients."""

    def __init__(self, config_path: str, layout_path: str) -> None:
        """Initialize the signal engine and in-memory runtime state."""
        self.config_path = config_path
        self.layout_path = layout_path
        self.config: dict[str, Any] = {}
        self.layout: dict[str, Any] = {}

        self.current_signals: dict[str, dict[str, Any]] = {}
        self.clients: set[WebSocket] = set()
        self._tasks: list[asyncio.Task[None]] = []
        self._adapters: list[AdapterBase] = []
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        """Load configuration and start polling tasks for all configured adapters."""
        self.config = await load_backend_config(self.config_path)
        self.layout = await load_layout_config(self.layout_path)

        adapter_classes = load_adapter_classes()
        self._adapters = self._build_adapters(adapter_classes)

        for adapter in self._adapters:
            task = asyncio.create_task(self._run_adapter_loop(adapter))
            self._tasks.append(task)

        logger.info("Signal engine started with %d adapters", len(self._adapters))

    async def stop(self) -> None:
        """Stop adapter tasks and close active websocket clients."""
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
        """Accept websocket client and send the initial handshake payload."""
        await websocket.accept()
        self.clients.add(websocket)
        await websocket.send_json(self._handshake_payload())
        logger.info("WebSocket client connected (%d total)", len(self.clients))

    async def unregister_client(self, websocket: WebSocket) -> None:
        """Remove websocket client from active connection set."""
        self.clients.discard(websocket)
        logger.info("WebSocket client disconnected (%d total)", len(self.clients))

    def _build_adapters(self, adapter_classes: dict[str, type[AdapterBase]]) -> list[AdapterBase]:
        """Instantiate configured adapters from config.yaml."""
        adapters: list[AdapterBase] = []

        sky_config = self.config.get("sky_driver")
        if isinstance(sky_config, dict):
            sky_cls = adapter_classes.get("sky_driver")
            if sky_cls is None:
                logger.warning("sky_driver configured but adapter not found")
            else:
                adapters.append(sky_cls(sky_config))

        for entry in self.config.get("signals", []):
            if not isinstance(entry, dict):
                continue
            adapter_type = str(entry.get("adapter", "")).strip()
            adapter_cls = adapter_classes.get(adapter_type)
            if adapter_cls is None:
                logger.warning("Adapter '%s' not found for signal '%s'", adapter_type, entry.get("id"))
                continue
            adapters.append(adapter_cls(entry))

        return adapters

    async def _run_adapter_loop(self, adapter: AdapterBase) -> None:
        """Poll an adapter on interval with exponential backoff on failures."""
        backoff = 2.0
        while True:
            try:
                result = await adapter.poll()
                if result:
                    await self._ingest_signals(result)
                    backoff = 2.0
                else:
                    logger.warning("Adapter '%s' returned no signals", adapter.adapter_type)
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2.0, 30.0)
                    continue

                await asyncio.sleep(max(adapter.interval, 0.1))
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.exception("Adapter loop error for '%s': %s", adapter.adapter_type, exc)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2.0, 30.0)

    async def _ingest_signals(self, signals: list[Signal]) -> None:
        """Update latest signal state and broadcast updates to websocket clients."""
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

        await self._broadcast({"type": "signal_update", "signals": [self.current_signals[s.id] for s in signals]})

    async def _broadcast(self, payload: dict[str, Any]) -> None:
        """Broadcast a JSON payload to all active websocket clients."""
        stale: list[WebSocket] = []
        for websocket in self.clients:
            try:
                await websocket.send_json(payload)
            except Exception:
                stale.append(websocket)
        for websocket in stale:
            await self.unregister_client(websocket)

    def _handshake_payload(self) -> dict[str, Any]:
        """Build initial handshake payload for newly connected websocket clients."""
        return {
            "type": "handshake",
            "signals": self.current_signals,
            "config": self.config,
            "layout": self.layout,
        }
