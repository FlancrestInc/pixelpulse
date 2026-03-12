"""Defines the adapter contract and shared Signal data model."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Literal

SignalType = Literal["gauge", "rate", "text", "event", "state"]


@dataclass(slots=True)
class Signal:
    """Normalized signal emitted by adapters for downstream consumers."""

    id: str
    type: SignalType
    value: float | str
    label: str
    source: str
    timestamp: float
    metadata: dict[str, Any] = field(default_factory=dict)


class AdapterBase(ABC):
    """Abstract base class that all adapters must subclass."""

    adapter_type: str = "my_adapter"
    requirements: list[str] = []

    def __init__(self, config: dict[str, Any]) -> None:
        """Initialize adapter from the adapter-specific config block."""
        self.config = config

    @abstractmethod
    async def poll(self) -> list[Signal] | None:
        """Poll the source and return one or more signals, or None on failure."""

    @property
    @abstractmethod
    def interval(self) -> float:
        """Return the adapter polling interval in seconds."""

    @property
    @abstractmethod
    def signal_ids(self) -> list[str]:
        """Return possible signal IDs that may be emitted by the adapter."""
