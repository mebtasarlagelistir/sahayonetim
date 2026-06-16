#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Maç Takvimi Adalet (Fairness) Testleri
======================================

Resmi maç takvimi üreticisinin (routes/match_schedule.py → /match-schedule/generate)
adalet kriterlerini ölçer ve doğrular:

    1. Eşit maç sayısı   — her takım ~matches_per_team maç oynar
    2. Partner tekrarı   — aynı ittifakta tekrar eşleşme (mümkünse 0)
    3. Rakip tekrarı      — aynı rakiple tekrar karşılaşma (sınırlı)
    4. Dinlenme aralığı   — ardışık maç yok (gap >= 1; yeterli takımda gap >= 2)
    5. Kırmızı/Mavi denge — renk dağılımı dengeli

Bu test BAĞIMSIZDIR: çalışan sunucuya ihtiyaç duymaz. Geçici bir SQLite veritabanı
üzerinde Flask test client ile çalışır; gerçek data.db'ye dokunmaz.

Çalıştırma:
    python -m pytest tests/test_schedule_fairness.py -v
    python tests/test_schedule_fairness.py          # özet tablo basar
"""

from __future__ import annotations

import io
import itertools
import os
import random
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))


# ---------------------------------------------------------------------------
# Yardımcılar: geçici DB üzerinde app + veri kurulumu
# ---------------------------------------------------------------------------
def _build_app_on_temp_db():
    """create_app'i geçici bir DB dizinine yönlendirir; (app, datastore) döner."""
    import app_web
    from src.core.storage import DataStore

    tmp_dir = Path(tempfile.mkdtemp(prefix="memskor_fairness_"))

    # create_app içindeki DataStore(base_path=...) çağrısını geçici dizine zorla
    real_datastore_cls = app_web.DataStore
    app_web.DataStore = lambda base_path=None: real_datastore_cls(base_path=tmp_dir)
    try:
        app, _socketio = app_web.create_app()
    finally:
        app_web.DataStore = real_datastore_cls

    app.config["TESTING"] = True
    # Kurulum/okuma için aynı dosyaya bağlı ayrı bir datastore örneği
    datastore = DataStore(base_path=tmp_dir)
    return app, datastore


def _setup_event_and_teams(datastore, n_teams, teams_per_alliance, fields=1):
    """Aktif bir etkinlik ve n_teams takım oluşturur."""
    event_id = datastore.create_event(
        "Adalet Testi",
        {"format": {"fields": fields, "teams_per_alliance": teams_per_alliance}},
    )
    datastore.set_active_event(event_id)
    teams = [
        {
            "number": str(1000 + i),
            "name": f"Takım {i + 1}",
            "school": "Test Okulu",
            "city": "İstanbul",
        }
        for i in range(n_teams)
    ]
    datastore.save_teams(teams)
    return event_id


def _generate(app, teams_per_alliance, matches_per_team=None, num_matches=None, seed=42):
    """
    Takvimi üretir (test client ile). Yanıt JSON'unu döner.

    matches_per_team verilirse partner-balanced dalı, num_matches verilirse
    pick_balanced_teams (balanced) dalı çalışır.
    """
    random.seed(seed)  # üretici random kullanır; deterministik olsun
    client = app.test_client()
    with client.session_transaction() as sess:
        sess["user"] = "admin"  # require_login / require_event_manager için
    payload = {
        "start_date": "2026-06-10",
        "start_time": "09:00",
        "teams_per_alliance": teams_per_alliance,
        "algorithm": "balanced",
        "field_count": 2,
        "clear_existing": True,
    }
    if matches_per_team is not None:
        payload["matches_per_team"] = matches_per_team
    if num_matches is not None:
        payload["num_matches"] = num_matches
    resp = client.post("/api/match-schedule/generate", json=payload)
    return resp


# ---------------------------------------------------------------------------
# Metrik hesaplama
# ---------------------------------------------------------------------------
def compute_metrics(matches):
    """Sıralı maç listesinden adalet metriklerini hesaplar."""
    import math
    match_count = defaultdict(int)
    red_count = defaultdict(int)
    blue_count = defaultdict(int)
    partner_pairs = defaultdict(int)   # (a,b) -> kaç kez partner
    opponent_pairs = defaultdict(int)  # (a,b) -> kaç kez rakip
    appearances = defaultdict(list)    # team -> [match_index,...]
    field_per_team = defaultdict(lambda: defaultdict(int))  # team -> {field: count}

    ordered = sorted(matches, key=lambda m: m["match_number"])
    all_fields = set()
    for idx, m in enumerate(ordered):
        red = [str(t) for t in m["red_alliance"]]
        blue = [str(t) for t in m["blue_alliance"]]
        fld = m.get("field_number")
        all_fields.add(fld)
        for t in red:
            match_count[t] += 1
            red_count[t] += 1
            appearances[t].append(idx)
            field_per_team[t][fld] += 1
        for t in blue:
            match_count[t] += 1
            blue_count[t] += 1
            appearances[t].append(idx)
            field_per_team[t][fld] += 1
        for a, b in itertools.combinations(sorted(red), 2):
            partner_pairs[(a, b)] += 1
        for a, b in itertools.combinations(sorted(blue), 2):
            partner_pairs[(a, b)] += 1
        for a in red:
            for b in blue:
                opponent_pairs[tuple(sorted((a, b)))] += 1

    # Dinlenme aralığı: ardışık görünüşler arası boşluk (gap = idx2 - idx1 - 1)
    min_gap = None
    back_to_back = 0  # gap == 0 (ardışık) sayısı
    for team, idxs in appearances.items():
        for prev, cur in zip(idxs, idxs[1:]):
            gap = cur - prev - 1
            min_gap = gap if min_gap is None else min(min_gap, gap)
            if gap == 0:
                back_to_back += 1

    partner_repeats = sum(c - 1 for c in partner_pairs.values() if c > 1)
    opponent_repeats = sum(c - 1 for c in opponent_pairs.values() if c > 1)

    # Saha dengesi (bilgi): her takımın tek bir sahada yığılması.
    nfields = max(len(all_fields), 1)
    max_field_imbalance = 0
    for t, fmap in field_per_team.items():
        total = sum(fmap.values())
        ideal = math.ceil(total / nfields)
        worst = max(fmap.values()) if fmap else 0
        max_field_imbalance = max(max_field_imbalance, worst - ideal)

    # Saha ALTERNASYONU: ardışık maçlar farklı sahada olmalı (paralel iki saha için).
    consecutive_same_field = 0
    prev_field = None
    for m in ordered:
        f = m.get("field_number")
        if prev_field is not None and f == prev_field:
            consecutive_same_field += 1
        prev_field = f

    counts = list(match_count.values())
    return {
        "num_matches": len(ordered),
        "min_count": min(counts) if counts else 0,
        "max_count": max(counts) if counts else 0,
        "partner_repeats": partner_repeats,
        "opponent_repeats": opponent_repeats,
        "min_gap": min_gap if min_gap is not None else 999,
        "back_to_back": back_to_back,
        "max_color_imbalance": max(
            (abs(red_count[t] - blue_count[t]) for t in match_count), default=0
        ),
        "max_field_imbalance": max_field_imbalance,
        "consecutive_same_field": consecutive_same_field,
        "num_fields": nfields,
        "match_count": dict(match_count),
    }


# ---------------------------------------------------------------------------
# Senaryolar
# ---------------------------------------------------------------------------
# Her senaryo: (etiket, takım, ittifak/tk, matches_per_team, num_matches)
# matches_per_team dolu → partner-balanced dalı; num_matches dolu → balanced dalı.
SCENARIOS = [
    ("PB-08", 8, 2, 4, None),
    ("PB-16", 16, 2, 5, None),
    ("PB-24", 24, 2, 6, None),
    ("PB-27", 27, 2, 6, None),
    ("PB-32", 32, 2, 6, None),
    # pick_balanced_teams (num_matches) dalı — ~5-6 maç/takım gerçekçi yoğunluk:
    ("BAL-16", 16, 2, None, 20),
    ("BAL-24", 24, 2, None, 36),
]


def run_scenario(n_teams, teams_per_alliance, matches_per_team=None, num_matches=None):
    app, datastore = _build_app_on_temp_db()
    _setup_event_and_teams(datastore, n_teams, teams_per_alliance, fields=2)
    resp = _generate(
        app, teams_per_alliance,
        matches_per_team=matches_per_team, num_matches=num_matches,
    )
    assert resp.status_code == 200, (
        f"Takvim üretilemedi (n={n_teams}, mpt={matches_per_team}, nm={num_matches}): "
        f"{resp.status_code} {resp.get_data(as_text=True)}"
    )
    matches = datastore.get_match_schedule(match_type="qualification")
    metrics = compute_metrics(matches)
    metrics["_enough_for_gap2"] = n_teams >= teams_per_alliance * 2 * 3
    # Beklenen maç sayısı/takım (kapsam kontrolü için)
    if matches_per_team is not None:
        metrics["_target"] = matches_per_team
    else:
        required = teams_per_alliance * 2
        metrics["_target"] = round((num_matches * required) / n_teams)
    return metrics


def assert_fairness(label, n_teams, teams_per_alliance, metrics):
    target = metrics["_target"]
    num_matches = metrics["num_matches"]
    enough = metrics["_enough_for_gap2"]
    is_pb = label.startswith("PB")  # partner-balanced dalı mı?

    # 1. Kapsam: hiçbir takım hedeften belirgin sapma göstermemeli (±1)
    assert metrics["max_count"] <= target + 1, (
        f"[{label}] Bir takım çok fazla maç oynadı: {metrics['max_count']} > {target}+1"
    )
    assert metrics["min_count"] >= target - 1, (
        f"[{label}] Bir takım çok az maç oynadı: {metrics['min_count']} < {target}-1"
    )

    # 2. Dinlenme: yeterli takım varsa (>=12, gap>=2 mümkün) hiçbir takım arka arkaya
    #    oynamamalı. Çok küçük havuzda (ör. 8 takım) partner çeşitliliği + rakip
    #    çeşitliliği ağırlıkları ile dinlenme arasında kaçınılmaz bir denge vardır;
    #    burada az sayıda (<=2) ardışıklık tolere edilir (deadlock önleme).
    bb_limit = 0 if enough else max(2, round(num_matches * 0.15))
    assert metrics["back_to_back"] <= bb_limit, (
        f"[{label}] Çok fazla ardışık maç: {metrics['back_to_back']} > {bb_limit}"
    )

    # 3. Partner tekrarı:
    #    - PB (partner-balanced) dalı tasarım gereği tekrarı neredeyse sıfırlar → katı eşik.
    #    - BAL (balanced/num_matches) dalı, gap≥2 dinlenme kuralıyla az takımda
    #      kaçınılmaz tekrar üretir; burada yalnızca gross regresyon yakalanır.
    if is_pb:
        pr_limit = max(2, round(num_matches * 0.25))
    else:
        pr_limit = round(num_matches * 1.0)
    assert metrics["partner_repeats"] <= pr_limit, (
        f"[{label}] Çok fazla partner tekrarı: {metrics['partner_repeats']} > {pr_limit}"
    )

    # 4. Renk (kırmızı/mavi) dengesi: hiçbir takım hep aynı tarafta kalmamalı.
    #    Build-time taraf cezası + son-geçiş ile her takımın |kırmızı-mavi| farkı <= 2
    #    olmalı (çoğu senaryoda <= 1). Eskiden sınırsızdı (4-0 "hep kırmızı" görülürdü).
    assert metrics["max_color_imbalance"] <= 2, (
        f"[{label}] Kırmızı/mavi dengesiz: max|kırmızı-mavi|={metrics['max_color_imbalance']} > 2"
    )

    # 5. Saha ALTERNASYONU: ardışık maçlar farklı sahada olmalı (1,2,1,2...) ki iki
    #    saha paralel çalıştırılabilsin. Strict alternasyon → ardışık-aynı-saha = 0.
    assert metrics["consecutive_same_field"] == 0, (
        f"[{label}] Sahalar alternatif değil: ardışık aynı saha={metrics['consecutive_same_field']}"
    )


# ---------------------------------------------------------------------------
# pytest giriş noktaları
# ---------------------------------------------------------------------------
def test_fairness_scenarios():
    for label, n_teams, tpa, mpt, nm in SCENARIOS:
        metrics = run_scenario(n_teams, tpa, matches_per_team=mpt, num_matches=nm)
        assert_fairness(label, n_teams, tpa, metrics)


# ---------------------------------------------------------------------------
# Doğrudan çalıştırma: özet tablo
# ---------------------------------------------------------------------------
def main():
    header = (
        f"{'Senaryo':>8} {'Takım':>6} {'Maç':>5} {'MinC':>5} {'MaxC':>5} "
        f"{'PartnerTk':>10} {'RakipTk':>8} {'MinGap':>7} {'Ardışık':>8} {'RenkDng':>8} {'ArdSaha':>8}"
    )
    print("=" * (len(header) + 14))
    print(" MAÇ TAKVİMİ ADALET RAPORU  (PB=partner-balanced, BAL=balanced)")
    print("=" * (len(header) + 14))
    print(header)
    print("-" * (len(header) + 14))
    all_ok = True
    for label, n_teams, tpa, mpt, nm in SCENARIOS:
        m = {}
        try:
            m = run_scenario(n_teams, tpa, matches_per_team=mpt, num_matches=nm)
            assert_fairness(label, n_teams, tpa, m)
            status = "OK"
        except AssertionError as exc:
            status = f"HATA: {exc}"
            all_ok = False
        print(
            f"{label:>8} {n_teams:>6} {m.get('num_matches', '?'):>5} "
            f"{m.get('min_count', '?'):>5} {m.get('max_count', '?'):>5} "
            f"{m.get('partner_repeats', '?'):>10} {m.get('opponent_repeats', '?'):>8} "
            f"{m.get('min_gap', '?'):>7} {m.get('back_to_back', '?'):>8} "
            f"{m.get('max_color_imbalance', '?'):>8} {m.get('consecutive_same_field', '?'):>8}   [{status}]"
        )
    print("-" * (len(header) + 14))
    print("PartnerTk/RakipTk = tekrar sayısı (0 ideal) · MinGap = en az dinlenme aralığı")
    print("Ardışık = arka arkaya maç sayısı (0 olmalı) · RenkDng = max |kırmızı-mavi|")
    print("=" * (len(header) + 14))
    return 0 if all_ok else 1


if __name__ == "__main__":
    # Windows konsolunda Türkçe karakter/çıktı için UTF-8 (yalnızca doğrudan çalıştırmada)
    if sys.platform == "win32":
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
    raise SystemExit(main())
