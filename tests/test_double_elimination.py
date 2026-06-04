#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
6 İttifak Çift Eleme Bracket Testleri
=====================================

generate_double_elimination_6 üretecinin yapısını ve sonuç-ilerletme
yönlendirmesini (win_to/lose_to + M10/M11 reset) doğrular.

İlerletme mantığı (routes/match_control.py _advance_playoff_match) Flask
closure'ı içinde olduğundan, burada aynı yönlendirme kuralını taklit eden
bağımsız bir simülatörle bracket'in tutarlılığı (şampiyona ulaşılabilirlik,
M11 reset senaryosu) test edilir.

Çalıştırma:
    python -m pytest tests/test_double_elimination.py -v
    python tests/test_double_elimination.py
"""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.tournament.bracket_generator import BracketGenerator  # noqa: E402

# 6 ittifak (seed sırası): A1..A6, her biri 2 takım
ALLIANCES = [
    ["101", "102"],  # seed 1
    ["201", "202"],  # seed 2
    ["301", "302"],  # seed 3
    ["401", "402"],  # seed 4
    ["501", "502"],  # seed 5
    ["601", "602"],  # seed 6
]


def _flatten(rounds):
    """Round listesini {label: match} sözlüğüne çevirir."""
    out = {}
    for r in rounds:
        for m in r["matches"]:
            out[m["label"]] = m
    return out


def test_structure():
    """M1–M11 maçları, kaynak ittifaklar ve yönlendirmeler doğru mu."""
    gen = BracketGenerator()
    rounds = gen.generate_double_elimination_6(ALLIANCES)
    matches = _flatten(rounds)

    # 11 maç ve doğru round grupları
    assert set(matches.keys()) == {f"M{i}" for i in range(1, 12)}
    names = [r["name"] for r in rounds]
    assert names == ["Üst Kademe", "Alt Kademe", "Büyük Final"]

    # İlk tur kaynakları (seed eşleşmeleri)
    assert matches["M1"]["red_alliance"] == ALLIANCES[2]   # A3
    assert matches["M1"]["blue_alliance"] == ALLIANCES[5]  # A6
    assert matches["M2"]["red_alliance"] == ALLIANCES[3]   # A4
    assert matches["M2"]["blue_alliance"] == ALLIANCES[4]  # A5
    assert matches["M3"]["red_alliance"] == ALLIANCES[0]   # A1 (bye)
    assert matches["M4"]["red_alliance"] == ALLIANCES[1]   # A2 (bye)
    # Placeholder slotlar boş
    assert matches["M3"]["blue_alliance"] == []
    assert matches["M7"]["red_alliance"] == [] and matches["M7"]["blue_alliance"] == []

    # Yönlendirmeler
    assert matches["M1"]["win_to"] == "M3:blue" and matches["M1"]["lose_to"] == "M6:blue"
    assert matches["M2"]["win_to"] == "M4:blue" and matches["M2"]["lose_to"] == "M5:blue"
    assert matches["M3"]["win_to"] == "M7:red" and matches["M3"]["lose_to"] == "M5:red"
    assert matches["M4"]["win_to"] == "M7:blue" and matches["M4"]["lose_to"] == "M6:red"
    assert matches["M7"]["win_to"] == "M10:red" and matches["M7"]["lose_to"] == "M9:red"
    assert matches["M5"]["win_to"] == "M8:red" and "lose_to" not in matches["M5"]
    assert matches["M6"]["win_to"] == "M8:blue"
    assert matches["M8"]["win_to"] == "M9:blue"
    assert matches["M9"]["win_to"] == "M10:blue"
    assert matches["M10"].get("gf") == "1" and matches["M10"].get("reset_to") == "M11"

    # Oynanış sırası (match_number) = M numarası
    for label, m in matches.items():
        assert m["match_number"] == int(label[1:])


def _simulate(matches, decide):
    """
    Bracket'i M1..M11 sırasıyla simüle eder.

    decide(label, red, blue) -> 'red' | 'blue' (kazanan taraf)
    Yönlendirme: win_to/lose_to ile placeholder slotlar doldurulur.
    M10 (gf): mavi (alt şampiyonu) kazanırsa M11 iki ittifakla doldurulur.

    Returns: (champion_alliance, m11_used: bool)
    """
    def place(teams, target):
        label, slot = target.split(":")
        key = "red_alliance" if slot == "red" else "blue_alliance"
        matches[label][key] = list(teams)

    champion = None
    m11_used = False
    for i in range(1, 12):
        m = matches[f"M{i}"]
        red, blue = m["red_alliance"], m["blue_alliance"]
        if not red or not blue:
            continue  # oynanmadı (örn. M11 gerekmedi)
        side = decide(m["label"], red, blue)
        winner = red if side == "red" else blue
        loser = blue if side == "red" else red
        if m.get("win_to"):
            place(winner, m["win_to"])
        if m.get("lose_to"):
            place(loser, m["lose_to"])
        if m.get("gf") == "1":  # M10
            if side == "blue":  # alt şampiyonu üst şampiyonu yendi -> reset
                matches["M11"]["red_alliance"] = list(red)
                matches["M11"]["blue_alliance"] = list(blue)
            else:
                champion = winner  # üst şampiyonu kazandı -> turnuva bitti
        if m["label"] == "M11":
            m11_used = True
            champion = winner
    return champion, m11_used


def _seed_of(alliance):
    return ALLIANCES.index(alliance)


def test_simulation_higher_seed_wins():
    """Her zaman üst seed kazanırsa şampiyon 1. seed olur, M11 gerekmez."""
    gen = BracketGenerator()
    matches = _flatten(gen.generate_double_elimination_6(ALLIANCES))

    def decide(label, red, blue):
        return "red" if _seed_of(red) < _seed_of(blue) else "blue"

    champion, m11_used = _simulate(matches, decide)
    assert champion == ALLIANCES[0], f"Şampiyon 1. seed olmalı, bulundu {champion}"
    assert m11_used is False, "Üst şampiyonu kazandığında M11 oynanmamalı"


def test_simulation_bracket_reset():
    """Alt şampiyonu M10'u kazanırsa M11 (reset) oynanır."""
    gen = BracketGenerator()
    matches = _flatten(gen.generate_double_elimination_6(ALLIANCES))

    def decide(label, red, blue):
        if label == "M10":
            return "blue"  # alt şampiyonu üst şampiyonu yener -> reset
        if label == "M11":
            return "blue"  # alt şampiyonu rövanşı da kazanır -> şampiyon
        return "red" if _seed_of(red) < _seed_of(blue) else "blue"

    champion, m11_used = _simulate(matches, decide)
    assert m11_used is True, "Alt şampiyonu M10'u kazanınca M11 oynanmalı"
    # M11 red = M10 red (üst şampiyonu), blue = M10 blue (alt şampiyonu); blue kazandı
    assert champion == matches["M11"]["blue_alliance"]


# ---------------------------------------------------------------------------
# Entegrasyon: gerçek endpoint + _advance_playoff_match (Flask test client)
# ---------------------------------------------------------------------------
import re
import tempfile


def _build_app_on_temp_db():
    import app_web
    from src.core.storage import DataStore

    tmp = Path(tempfile.mkdtemp(prefix="memskor_de_"))
    real = app_web.DataStore
    app_web.DataStore = lambda base_path=None: real(base_path=tmp)
    try:
        app, _socketio = app_web.create_app()
    finally:
        app_web.DataStore = real
    app.config["TESTING"] = True
    return app, DataStore(base_path=tmp)


def _label_of(match):
    m = re.search(r"label=(M\d+)", match.get("notes") or "")
    return m.group(1) if m else None


def test_advancement_integration_higher_seed_wins():
    """generate-finals + complete endpoint'leri ile gerçek ilerletmeyi doğrula."""
    app, ds = _build_app_on_temp_db()
    event_id = ds.create_event("DE Test", {"format": {"teams_per_alliance": 2}})
    ds.set_active_event(event_id)
    ds.save_teams([
        {"number": str(100 + i), "name": f"T{i}", "school": "X", "city": "Y"}
        for i in range(12)
    ])
    # 6 ittifak (seed sırası): A1=[100,101], A2=[102,103], ...
    alliances = [[str(100 + 2 * i), str(100 + 2 * i + 1)] for i in range(6)]

    client = app.test_client()
    with client.session_transaction() as s:
        s["user"] = "admin"

    resp = client.post("/api/match-schedule/generate-finals", json={
        "start_date": "2026-06-10", "start_time": "14:00",
        "format": "double_elimination_6", "alliances": alliances,
        "clear_existing": True,
    })
    assert resp.status_code == 200, resp.get_data(as_text=True)
    assert resp.get_json()["created_count"] == 11

    seed_of = {}
    for i, pair in enumerate(alliances):
        for tn in pair:
            seed_of[tn] = i

    # M1..M11 sırasıyla tamamla; her zaman üst seed (küçük indeks) kazanır
    for i in range(1, 12):
        finals = ds.get_match_schedule(event_id=event_id, match_type="final")
        m = next((x for x in finals if _label_of(x) == f"M{i}"), None)
        assert m is not None, f"M{i} bulunamadı"
        red, blue = m["red_alliance"], m["blue_alliance"]
        if not red or not blue:
            continue  # örn. M11 gerekmedi
        red_seed = min(seed_of.get(t, 99) for t in red)
        blue_seed = min(seed_of.get(t, 99) for t in blue)
        rs, bs = (100, 50) if red_seed < blue_seed else (50, 100)
        cr = client.post("/api/match-control/complete", json={
            "match_id": m["id"], "red_score": rs, "blue_score": bs,
            "match_source": "schedule",
        })
        assert cr.status_code == 200, cr.get_data(as_text=True)

    finals = ds.get_match_schedule(event_id=event_id, match_type="final")
    m10 = next(x for x in finals if _label_of(x) == "M10")
    # Üst kademe şampiyonu (A1) M10 kırmızıdır ve kazanmalı
    assert m10["red_alliance"] == alliances[0], f"M10 kırmızı A1 olmalı: {m10['red_alliance']}"
    assert (m10["red_score"] or 0) > (m10["blue_score"] or 0)
    m11 = next(x for x in finals if _label_of(x) == "M11")
    assert not m11["red_alliance"] and not m11["blue_alliance"], "Üst şampiyonu kazandı; M11 olmamalı"


def test_advancement_integration_bracket_reset():
    """Alt kademe şampiyonu M10'u kazanınca gerçek endpoint M11'i (rövanş) doldurmalı."""
    app, ds = _build_app_on_temp_db()
    event_id = ds.create_event("DE Reset", {"format": {"teams_per_alliance": 2}})
    ds.set_active_event(event_id)
    ds.save_teams([
        {"number": str(100 + i), "name": f"T{i}", "school": "X", "city": "Y"}
        for i in range(12)
    ])
    alliances = [[str(100 + 2 * i), str(100 + 2 * i + 1)] for i in range(6)]
    client = app.test_client()
    with client.session_transaction() as s:
        s["user"] = "admin"
    resp = client.post("/api/match-schedule/generate-finals", json={
        "start_date": "2026-06-10", "start_time": "14:00",
        "format": "double_elimination_6", "alliances": alliances, "clear_existing": True,
    })
    assert resp.status_code == 200, resp.get_data(as_text=True)

    seed_of = {}
    for i, pair in enumerate(alliances):
        for tn in pair:
            seed_of[tn] = i

    def complete(label, red_wins):
        finals = ds.get_match_schedule(event_id=event_id, match_type="final")
        m = next(x for x in finals if _label_of(x) == label)
        if not m["red_alliance"] or not m["blue_alliance"]:
            return m
        rs, bs = (100, 50) if red_wins else (50, 100)
        cr = client.post("/api/match-control/complete", json={
            "match_id": m["id"], "red_score": rs, "blue_score": bs, "match_source": "schedule",
        })
        assert cr.status_code == 200, cr.get_data(as_text=True)
        return m

    # M1–M9: üst seed kazanır
    for i in range(1, 10):
        finals = ds.get_match_schedule(event_id=event_id, match_type="final")
        m = next(x for x in finals if _label_of(x) == f"M{i}")
        red, blue = m["red_alliance"], m["blue_alliance"]
        if not red or not blue:
            continue
        red_wins = min(seed_of.get(t, 99) for t in red) < min(seed_of.get(t, 99) for t in blue)
        complete(f"M{i}", red_wins)

    # M10: mavi (alt kademe şampiyonu) kazanır -> reset
    complete("M10", red_wins=False)

    finals = ds.get_match_schedule(event_id=event_id, match_type="final")
    m11 = next(x for x in finals if _label_of(x) == "M11")
    assert m11["red_alliance"] and m11["blue_alliance"], "Reset sonrası M11 iki ittifakla dolmalı"


if __name__ == "__main__":
    test_structure()
    test_simulation_higher_seed_wins()
    test_simulation_bracket_reset()
    print("[OK] Tüm çift-eleme birim testleri geçti.")
