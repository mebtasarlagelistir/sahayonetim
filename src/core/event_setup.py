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
    # NOT: Maç timer'ı otonom süresini MatchConstants.AUTONOMOUS_DURATION'dan (30 sn) alır
    # (tek kaynak). Bu alan default_config_dict ve constants ile tutarlı olsun diye 30'dur;
    # 0 değeri default_config_dict (30) ile çelişiyordu.
    auto_seconds: int = 30
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
            "playoff": {
                "max_teams": 16,
                "teams_per_alliance": 2,
            },
            "scoring": {
                "allow_remote_scoring": False,
                "notes": "",
            },
            "inspection_settings": {
                # Phase 1: FRC Enhancement - 10 inspection types
                "type_durations": {
                    # FRC Core Inspections
                    "weight": 5,
                    "size": 10,
                    "general_hardware": 20,
                    "electrical": 15,
                    "pneumatics": 10,  # Optional
                    "radio": 10,
                    "software": 15,
                    "bumpers": 5,
                    "game_specific": 10,
                    "safety": 15,
                    # Legacy types (backward compatibility)
                    "hardware": 20,
                    "custom": 15,
                },
                "selected_types": [
                    "weight",
                    "size",
                    "general_hardware",
                    "electrical",
                    "radio",
                    "software",
                    "bumpers",
                    "game_specific",
                    "safety"
                    # pneumatics is optional, not selected by default
                ],
                "print_note": (
                    "İnceleme İstanyonu Ekipleri programda bir sakma olmama durumunda belirtilen saatte "
                    "Pit Alanınıza inceleme için ziyaret gerçekleştirecektir. Bu saatte robotunuz ve ilgili "
                    "kişiler mutlaka Pit Alanınızda yer bulunmalıdır. Oyun kılavuzunda izin verilen kurallara "
                    "göre robotunuzun yarışmaya hazır olduğunuzdan emin olacaklardır. Bir itirazınız olduğun "
                    "Baş Robot Müfettişine danışınız."
                ),
            },
            "awards": [],
            "wifi": {
                "supported_channels": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
                "allowed_channels": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
                "assignments": {},
                "scan_notes": "",
                "assignment_mode": "unique",
                "last_assigned_at": "",
            },
            "screens": {
                "active_view": "match",
                "overlay_enabled": False,
                "overlay_text": "",
                "overlay_chroma_enabled": False,
                "overlay_chroma_color": "#00ff00",
            },
            "custom_fields": [],
        },
        "teams": [],
        "ui": {
            "font_family": "",
            "font_size": 10,
        },
    }
