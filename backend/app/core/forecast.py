"""14-day cyber-risk forecast: which assets will need urgent attention if nothing changes.

Exploit maturity tends to rise after disclosure, faster for advisories with a high exploit
prediction score, and known-exploited listings follow for the most likely ones. Activity
evidence ages if it is not reinforced. Remediation scheduled in the plan lands on its day.
The forecast replays those dynamics through the same risk engine, day by day.
"""

from __future__ import annotations

import math
from copy import deepcopy

from . import mitigation
from .model import EXPLOIT_SCORE, Twin
from .risk import NOW_THRESHOLD, compute

ACTIVITY_DECAY = ["confirmed", "repeated", "unusual", None]


def _day_twin(twin: Twin, day: int, actions: list[tuple[int, str]]) -> Twin:
    t = twin.clone()
    t.advisories = deepcopy(twin.advisories)
    for adv in t.advisories.values():
        base = EXPLOIT_SCORE[adv["exploit_maturity"]]
        rate = 0.02 + 0.12 * adv["epss"]
        adv["exploit_score"] = round(base + (1 - base) * (1 - math.exp(-rate * day)), 4)
        if not adv["kev"] and adv["epss"] >= 0.3 and day >= round(20 * (1 - adv["epss"])):
            adv["kev"] = True
    steps = day // 4  # evidence fades one level every four days without reinforcement
    for rec in t.activity.values():
        level = rec.get("level")
        if level in ACTIVITY_DECAY:
            rec["level"] = ACTIVITY_DECAY[min(len(ACTIVITY_DECAY) - 1, ACTIVITY_DECAY.index(level) + steps)]
    for due, mid in actions:
        if due <= day:
            mitigation.apply(t, mid)
    t.touch()
    return t


def forecast(twin: Twin, days: int = 14, plan: list[tuple[int, str]] | None = None, recommended: int = 5) -> dict:
    base = compute(twin)
    top = [aid for aid in base["ranking"] if base["assets"][aid]["priority"] in {"NOW", "NEXT"}][:recommended]
    rec_plan: list[tuple[int, str]] = []
    for i, aid in enumerate(top):
        options = [c for c in mitigation.counterfactuals(twin, aid) if c["type"] not in {"isolate", "segment", "redundancy"}]
        if options:
            rec_plan.append(([1, 2, 3, 5, 7, 9, 11][i % 7], options[0]["id"]))
    series = {"no_action": [], "planned": [], "recommended": []}
    trajectories: dict[str, list[float]] = {aid: [] for aid in base["ranking"][:12]}
    crossings: dict[str, int] = {}
    for day in range(days + 1):
        for name, actions in (("no_action", []), ("planned", plan or []), ("recommended", rec_plan)):
            r = compute(_day_twin(twin, day, actions))
            series[name].append({"day": day, "sri": r["systemic_risk_index"], "now": r["counts"]["NOW"]})
            if name == "no_action":
                for aid in trajectories:
                    trajectories[aid].append(r["assets"][aid]["score"])
                for aid, row in r["assets"].items():
                    if row["score"] >= NOW_THRESHOLD and base["assets"][aid]["score"] < NOW_THRESHOLD and aid not in crossings:
                        crossings[aid] = day
    return {
        "days": days,
        "series": series,
        "trajectories": [{"id": aid, "name": twin.assets[aid]["name"], "scores": s} for aid, s in trajectories.items()],
        "predicted_escalations": [{"id": aid, "name": twin.assets[aid]["name"], "day": d, "score_today": base["assets"][aid]["score"],
                                   "reason": "exploit maturity rising on an open advisory"} for aid, d in sorted(crossings.items(), key=lambda kv: kv[1])],
        "recommended_plan": [{"day": d, **mitigation.describe(twin, mid)} for d, mid in rec_plan],
        "assumptions": [
            "Exploit maturity rises toward weaponised at a rate set by each advisory's exploit prediction score.",
            "Advisories with a prediction score ≥ 0.3 are assumed to reach the known-exploited catalogue within the window.",
            "Activity evidence fades one level every four days unless new events reinforce it.",
        ],
    }
