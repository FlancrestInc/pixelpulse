"""Discovers and registers adapter plugins from builtin and user paths."""

from __future__ import annotations

import importlib.util
import inspect
import logging
import re
from pathlib import Path
from types import ModuleType
from typing import Type

from backend.adapters.base import AdapterBase

logger = logging.getLogger(__name__)


def load_adapter_classes() -> dict[str, Type[AdapterBase]]:
    """Discover adapter classes and return them keyed by adapter_type."""
    root = Path(__file__).resolve().parent.parent
    builtin_dir = root / "backend" / "adapters" / "builtin"
    plugin_dir = root / "plugins"

    registry: dict[str, Type[AdapterBase]] = {}
    _load_from_directory(builtin_dir, registry, source_label="builtin")
    _load_from_directory(plugin_dir, registry, source_label="plugin")
    return registry


def _load_from_directory(
    directory: Path,
    registry: dict[str, Type[AdapterBase]],
    source_label: str,
) -> None:
    """Load AdapterBase subclasses from all Python files in a directory."""
    if not directory.exists():
        logger.info("Adapter directory does not exist, skipping: %s", directory)
        return

    for file_path in sorted(directory.glob("*.py")):
        if file_path.name.startswith("__"):
            continue

        module = _import_module(file_path)
        if module is None:
            continue

        for _, cls in inspect.getmembers(module, inspect.isclass):
            if cls is AdapterBase or not issubclass(cls, AdapterBase):
                continue
            if cls.__module__ != module.__name__:
                continue
            if not _requirements_available(cls):
                continue

            adapter_type = getattr(cls, "adapter_type", "").strip()
            if not adapter_type:
                logger.warning("Skipping adapter class without adapter_type: %s", cls.__name__)
                continue

            if adapter_type in registry:
                logger.info(
                    "Overriding adapter '%s' with %s implementation from %s",
                    adapter_type,
                    source_label,
                    file_path,
                )
            registry[adapter_type] = cls
            logger.info("Registered adapter '%s' from %s", adapter_type, file_path)


def _import_module(file_path: Path) -> ModuleType | None:
    """Import a Python module from a file path, returning None on failure."""
    module_name = f"pixelpulse_plugin_{file_path.stem}_{abs(hash(file_path))}"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    if spec is None or spec.loader is None:
        logger.warning("Could not create import spec for %s", file_path)
        return None

    try:
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    except Exception as exc:
        logger.warning("Failed to import adapter module %s: %s", file_path, exc)
        return None


def _requirements_available(adapter_cls: Type[AdapterBase]) -> bool:
    """Check package requirements declared on adapter and log missing ones."""
    missing: list[str] = []
    for requirement in getattr(adapter_cls, "requirements", []):
        package_name = _normalize_requirement_name(requirement)
        if importlib.util.find_spec(package_name) is None:
            missing.append(requirement)

    if missing:
        install_hint = " ".join(missing)
        logger.warning(
            "Skipping adapter '%s': missing dependencies %s. Install with: pip install %s",
            adapter_cls.adapter_type,
            ", ".join(missing),
            install_hint,
        )
        return False
    return True


def _normalize_requirement_name(requirement: str) -> str:
    """Extract importable package name from a pip requirement string."""
    base = re.split(r"[<>=!~]", requirement, maxsplit=1)[0]
    return base.strip().replace("-", "_")
