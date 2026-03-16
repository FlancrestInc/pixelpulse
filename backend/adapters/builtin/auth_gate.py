"""
auth_gate.py — Auth failures adapter for PixelPulse.

Emits ``auth_failures`` as a *rate* signal (normalised 0.0–1.0).

Two modes, selected via ``mode`` in config.yaml:

  log_watcher (default)
    Tails a log file (e.g. /var/log/auth.log) and counts lines matching a
    configurable regex within a rolling time window.  Handles log rotation
    via inode tracking.

  webhook
    Counts failure events POSTed to ``/hooks/auth_failures`` by an external
    service.  Each POST increments the rolling-window counter.

config.yaml example
-------------------
  - id: auth_failures
    adapter: auth_gate
    mode: log_watcher               # log_watcher | webhook
    log_path: /var/log/auth.log     # log_watcher only
    pattern: "(Failed password|Invalid user|authentication failure)"
    window_seconds: 60              # rolling window length in seconds
    max_rate: 20                    # failures/window that maps to value 1.0
    interval: 5                     # poll frequency in seconds
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from collections import deque
from typing import Any

from backend.adapters.base import AdapterBase, Signal

logger = logging.getLogger(__name__)


class AuthGateAdapter(AdapterBase):
    """Emits auth_failures as a normalised rate signal (0.0–1.0)."""

    adapter_type = "auth_gate"
    requirements: list[str] = []   # stdlib only — no extra pip deps

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._signal_id      = config.get("id", "auth_failures")
        self._mode           = config.get("mode", "log_watcher")
        self._log_path       = config.get("log_path", "/var/log/auth.log")
        self._pattern        = re.compile(
            config.get("pattern", r"(Failed password|Invalid user|authentication failure)"),
            re.IGNORECASE,
        )
        self._window_seconds = float(config.get("window_seconds", 60))
        self._max_rate       = float(config.get("max_rate", 20))
        self._interval       = float(config.get("interval", 5))

        # Rolling deque of event timestamps (float Unix seconds)
        self._events: deque[float] = deque()

        # Log-tail state
        self._log_inode: int | None = None
        self._log_pos:   int = 0

        # Webhook mode thread safety
        self._lock = asyncio.Lock()

    # ── AdapterBase contract ───────────────────────────────────────────────────

    @property
    def interval(self) -> float:
        return self._interval

    @property
    def signal_ids(self) -> list[str]:
        return [self._signal_id]

    async def poll(self) -> list[Signal] | None:
        """Count auth failures in the rolling window and return a rate signal."""
        try:
            if self._mode == "log_watcher":
                await self._tail_log()
            self._prune_window()
            rate = min(1.0, len(self._events) / max(1.0, self._max_rate))
            return [Signal(
                id        = self._signal_id,
                type      = "rate",
                value     = round(rate, 4),
                label     = "Auth Failures",
                source    = "auth_gate",
                timestamp = time.time(),
            )]
        except Exception as exc:
            logger.error("auth_gate '%s' poll error: %s", self._signal_id, exc)
            return None

    # ── Webhook increment (called by main.py route handler) ────────────────────

    async def record_failure(self, count: int = 1) -> None:
        """Record one or more failure events into the rolling window."""
        async with self._lock:
            now = time.time()
            for _ in range(count):
                self._events.append(now)

    # ── Log tail ───────────────────────────────────────────────────────────────

    async def _tail_log(self) -> None:
        """Read new lines appended to the auth log since the last poll."""
        if not os.path.exists(self._log_path):
            return
        try:
            stat  = os.stat(self._log_path)
            inode = stat.st_ino
            size  = stat.st_size
        except OSError:
            return

        # Detect log rotation: inode changed or file shrank
        if inode != self._log_inode or size < self._log_pos:
            self._log_inode = inode
            self._log_pos   = 0

        if size <= self._log_pos:
            return  # nothing new to read

        try:
            with open(self._log_path, "r", errors="replace") as fh:
                fh.seek(self._log_pos)
                new_text      = fh.read()
                self._log_pos = fh.tell()
        except OSError as exc:
            logger.warning("auth_gate: cannot read %s: %s", self._log_path, exc)
            return

        now = time.time()
        for line in new_text.splitlines():
            if self._pattern.search(line):
                self._events.append(now)

    # ── Window maintenance ─────────────────────────────────────────────────────

    def _prune_window(self) -> None:
        """Discard events older than the rolling window."""
        cutoff = time.time() - self._window_seconds
        while self._events and self._events[0] < cutoff:
            self._events.popleft()