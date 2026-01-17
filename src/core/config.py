import json
from pathlib import Path
from typing import Any, Dict, Iterable

from .event_setup import default_config_dict


class Config:
    def __init__(self, base_path: Path | None = None) -> None:
        self.base_path = base_path or Path(__file__).resolve().parents[2]
        self.config_path = self.base_path / "src" / "resources" / "config.json"
        self.data: Dict[str, Any] = {}
        self.load()

    def load(self) -> None:
        if self.config_path.exists():
            self.data = json.loads(self.config_path.read_text(encoding="utf-8"))
        else:
            self.data = default_config_dict()
            self.save()

    def save(self) -> None:
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        self.config_path.write_text(
            json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def get(self, key_path: Iterable[str], default: Any = None) -> Any:
        current: Any = self.data
        for key in key_path:
            if not isinstance(current, dict) or key not in current:
                return default
            current = current[key]
        return current

    def set(self, key_path: Iterable[str], value: Any) -> None:
        current: Dict[str, Any] = self.data
        *parents, last = list(key_path)
        for key in parents:
            if key not in current or not isinstance(current[key], dict):
                current[key] = {}
            current = current[key]
        current[last] = value
        self.save()
