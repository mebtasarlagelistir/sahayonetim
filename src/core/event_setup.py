from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List


@dataclass
class Team:
    number: str
    name: str
    school: str = ""
    city: str = ""
    category: str = ""


@dataclass
class CustomField:
    key: str
    value: str


@dataclass
class EventSetup:
    name: str = ""
    code: str = ""
    season: str = ""
    venue: str = ""
    city: str = ""
    country: str = "TR"
    start_date: str = ""
    end_date: str = ""
    timezone: str = "Europe/Istanbul"
    organizer: str = ""
    contact_name: str = ""
    contact_email: str = ""
    contact_phone: str = ""
    divisions: List[str] = field(default_factory=lambda: ["Genel"])
    fields: int = 1
    teams_per_alliance: int = 2
    alliances: int = 2
    auto_seconds: int = 0
    teleop_seconds: int = 120
    endgame_seconds: int = 30
    match_cycle_seconds: int = 150
    allow_remote_scoring: bool = False
    notes: str = ""
    teams: List[Team] = field(default_factory=list)
    custom_fields: List[CustomField] = field(default_factory=list)


def default_config_dict() -> Dict:
    return {
        "event": {
            "name": "",
            "code": "",
            "season": "2025-2026",
            "location": {
                "venue": "",
                "city": "",
                "country": "TR",
            },
            "dates": {
                "start": "",
                "end": "",
                "timezone": "Europe/Istanbul",
            },
            "organizer": {
                "organization": "",
                "contact_name": "",
                "email": "",
                "phone": "",
            },
            "format": {
                "divisions": ["Genel"],
                "fields": 1,
                "teams_per_alliance": 2,
                "alliances": 2,
            },
            "schedule": {
                "auto_seconds": 30,
                "teleop_seconds": 120,
                "endgame_seconds": 30,
                "match_cycle_seconds": 150,
            },
            "scoring": {
                "allow_remote_scoring": False,
                "notes": "",
            },
            "custom_fields": [],
        },
        "teams": [],
        "ui": {
            "font_family": "",
            "font_size": 10,
        },
    }
