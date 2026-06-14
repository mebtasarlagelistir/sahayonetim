"""
MatchStateManager durum ilerleme birim testi (sunucusuz, deterministik).

Otomatik akışın gercekten su sirayi izledigini ve sureleri dogruladigini test eder:
  autonomous(30) -> prepare_teleop(10) -> driver_controlled(90) -> end_game(30) -> post_match(10)
"""

import sys
from datetime import datetime, timedelta
from src.core.match_state import MatchStateManager


class StubDatastore:
    def update_match(self, **kwargs):
        return None

    def update_practice_match(self, **kwargs):
        return None

    def get_match_schedule(self, **kwargs):
        return []

    def get_practice_matches(self, **kwargs):
        return []


EXPECTED_SEQUENCE = [
    ("autonomous", 30),
    ("prepare_teleop", 10),
    ("driver_controlled", 90),
    ("end_game", 30),
    ("post_match", 10),
]


def main():
    mgr = MatchStateManager(StubDatastore())
    event_id, match_id, src = 1, 101, "schedule"
    match_data = {"match_number": 1, "red_alliance": [1, 2], "blue_alliance": [3, 4]}

    mgr.set_match_active(event_id, match_id, src, match_data, initial_state="autonomous")
    match_key = mgr._build_match_key(event_id, match_id, src)

    failures = []
    print("Durum ilerleme simulasyonu (her fazin suresini doldurup sonraki faza geciyoruz):\n")

    # Baslangic durumu
    state = mgr._match_cache[event_id][match_key]
    cur, secs = state["state"], state["time_remaining"]
    print(f"  Baslangic: {cur} ({secs}s)")
    if (cur, secs) != EXPECTED_SEQUENCE[0]:
        failures.append(f"Baslangic {cur}/{secs}, beklenen {EXPECTED_SEQUENCE[0]}")

    # Her fazi 'bitmis' kabul edip (started_at'i geriye al) refresh ile sonraki faza gecir
    for i in range(1, len(EXPECTED_SEQUENCE)):
        # Mevcut fazin started_at'ini suresinden fazla geriye al -> time_remaining 0 -> ilerlesin
        cur_state = mgr._match_cache[event_id][match_key]["state"]
        cur_dur = dict(EXPECTED_SEQUENCE)[cur_state]
        backdated = (datetime.now() - timedelta(seconds=cur_dur + 2)).isoformat()
        mgr._match_cache[event_id][match_key]["started_at"] = backdated

        refreshed = mgr.refresh_match_state(event_id, match_key)
        got = (refreshed["state"], refreshed["time_remaining"])
        exp = EXPECTED_SEQUENCE[i]
        ok = got == exp
        print(f"  -> {got[0]} ({got[1]}s)   beklenen: {exp[0]} ({exp[1]}s)   {'OK' if ok else 'FAIL'}")
        if not ok:
            failures.append(f"Adim {i}: {got}, beklenen {exp}")

    print("\n" + "=" * 60)
    if failures:
        print(f"FAIL ({len(failures)} hata):")
        for f in failures:
            print("  - " + f)
        return 1
    print("PASS: Akis tam ve sureler dogru (end_game dahil).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
