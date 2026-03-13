"""Builtin adapter for collecting local system metrics."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import psutil

from backend.adapters.base import AdapterBase, Signal

logger = logging.getLogger(__name__)


class SystemAdapter(AdapterBase):
    """Adapter that emits normalized local system and network metrics."""

    adapter_type = "system"
    requirements = ["psutil"]

    _SUPPORTED_METRICS = [
        "cpu_percent",
        "memory_used",
        "disk_used",
        "net_bytes_sent",
        "net_bytes_recv",
        "cpu_temp",
    ]

    def __init__(self, config: dict[str, Any]) -> None:
        """Initialize the system adapter and internal rate tracking state."""
        super().__init__(config)
        self._interval = float(config.get("interval", 2.0))
        self._mount_point = str(config.get("mount_point", "/"))
        self._enabled_metrics = config.get("metrics", self._SUPPORTED_METRICS)
        self._last_net_sample: tuple[float, int, int] | None = None

    @property
    def interval(self) -> float:
        """Return polling interval in seconds."""
        return self._interval

    @property
    def signal_ids(self) -> list[str]:
        """Return all metric IDs this adapter can emit."""
        return [m for m in self._SUPPORTED_METRICS if m in self._enabled_metrics]

    async def poll(self) -> list[Signal] | None:
        """Collect current system metrics and emit them as Signal objects."""
        try:
            loop = asyncio.get_running_loop()
            sample = await loop.run_in_executor(None, self._collect_metrics)
            now = time.time()
            signals: list[Signal] = []

            if "cpu_percent" in self.signal_ids:
                signals.append(
                    Signal(
                        id="cpu_percent",
                        type="gauge",
                        value=sample["cpu_percent"],
                        label="CPU Percent",
                        source=self.adapter_type,
                        timestamp=now,
                    )
                )

            if "memory_used" in self.signal_ids:
                signals.append(
                    Signal(
                        id="memory_used",
                        type="gauge",
                        value=sample["memory_used"],
                        label="Memory Used",
                        source=self.adapter_type,
                        timestamp=now,
                    )
                )

            if "disk_used" in self.signal_ids:
                signals.append(
                    Signal(
                        id="disk_used",
                        type="gauge",
                        value=sample["disk_used"],
                        label="Disk Used",
                        source=self.adapter_type,
                        timestamp=now,
                        metadata={"mount_point": self._mount_point},
                    )
                )

            sent_rate, recv_rate = self._compute_net_rates(
                now,
                sample["net_bytes_sent_total"],
                sample["net_bytes_recv_total"],
            )
            if "net_bytes_sent" in self.signal_ids:
                signals.append(
                    Signal(
                        id="net_bytes_sent",
                        type="rate",
                        value=sent_rate,
                        label="Network Bytes Sent",
                        source=self.adapter_type,
                        timestamp=now,
                    )
                )
            if "net_bytes_recv" in self.signal_ids:
                signals.append(
                    Signal(
                        id="net_bytes_recv",
                        type="rate",
                        value=recv_rate,
                        label="Network Bytes Received",
                        source=self.adapter_type,
                        timestamp=now,
                    )
                )

            if "cpu_temp" in self.signal_ids:
                signals.append(
                    Signal(
                        id="cpu_temp",
                        type="gauge",
                        value=sample["cpu_temp"],
                        label="CPU Temperature",
                        source=self.adapter_type,
                        timestamp=now,
                    )
                )

            return signals
        except Exception as exc:
            logger.exception("system adapter poll failed: %s", exc)
            return None

    def _compute_net_rates(self, now: float, sent_total: int, recv_total: int) -> tuple[float, float]:
        """Compute network byte rates from cumulative counters."""
        if self._last_net_sample is None:
            self._last_net_sample = (now, sent_total, recv_total)
            return 0.0, 0.0

        prev_time, prev_sent, prev_recv = self._last_net_sample
        elapsed = max(now - prev_time, 1e-6)
        sent_rate = max((sent_total - prev_sent) / elapsed, 0.0)
        recv_rate = max((recv_total - prev_recv) / elapsed, 0.0)
        self._last_net_sample = (now, sent_total, recv_total)
        return sent_rate, recv_rate

    def _collect_metrics(self) -> dict[str, float | int]:
        """Collect blocking psutil metrics synchronously for executor use."""
        cpu_percent = psutil.cpu_percent(interval=None) / 100.0
        memory_used = psutil.virtual_memory().percent / 100.0
        disk_used = psutil.disk_usage(self._mount_point).percent / 100.0
        net_io = psutil.net_io_counters()
        cpu_temp = self._read_cpu_temp()
        return {
            "cpu_percent": min(max(cpu_percent, 0.0), 1.0),
            "memory_used": min(max(memory_used, 0.0), 1.0),
            "disk_used": min(max(disk_used, 0.0), 1.0),
            "net_bytes_sent_total": int(net_io.bytes_sent),
            "net_bytes_recv_total": int(net_io.bytes_recv),
            "cpu_temp": cpu_temp,
        }

    def _read_cpu_temp(self) -> float:
        """Read and normalize CPU temperature against 0-100C."""
        try:
            temps = psutil.sensors_temperatures()
            for entries in temps.values():
                if entries:
                    return min(max(float(entries[0].current) / 100.0, 0.0), 1.0)
        except Exception:
            logger.debug("CPU temperature unavailable")
        return 0.0
