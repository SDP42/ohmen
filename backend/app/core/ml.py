"""Supervised compromise-likelihood model, trained on synthetic labelled incident histories.

The blueprint's advice: start with a transparent risk model, then train and evaluate an ML
model on labelled examples. Real labelled OT incident data is scarce, so this module
generates histories from a hidden process with interactions and noise, trains a gradient
boosted classifier and reports held-out metrics. The metrics show the pipeline works on
synthetic data; they are not evidence that the model predicts real attacks. The transparent
engine stays authoritative and the ML estimate is shown next to it as a second opinion.
"""

from __future__ import annotations

import math

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import train_test_split

from .model import AUTH_WEAKNESS, Twin, exploit_score

FEATURES = [
    ("cvss", "Max CVSS (0–10)"),
    ("exploit", "Exploit maturity"),
    ("kev", "Known exploited"),
    ("epss", "Exploit prediction score"),
    ("exposure", "Network exposure"),
    ("reachability", "Attack-path reachability"),
    ("activity", "Suspicious activity"),
    ("auth_weakness", "Authentication weakness"),
    ("monitoring", "Monitoring coverage"),
    ("internet_facing", "Internet-facing"),
    ("remote_access", "Remote access enabled"),
    ("criticality", "Asset criticality"),
]


def _hidden_logit(x: np.ndarray) -> np.ndarray:
    cvss, exploit, kev, epss, exposure, reach, activity, auth, monitoring, internet, remote, crit = x.T
    return (-4.4 + 1.9 * (cvss / 10) * (0.4 + exploit) + 1.3 * kev + 1.1 * epss + 1.6 * exposure + 1.5 * reach
            + 2.3 * activity + 0.9 * auth - 1.6 * monitoring + 0.7 * internet + 0.35 * remote
            + 1.2 * exposure * kev + 0.8 * reach * activity + 0.05 * crit)


def synthetic_histories(n: int = 6000, seed: int = 42) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    has_vuln = rng.random(n) < 0.62
    cvss = np.where(has_vuln, np.clip(rng.normal(7.2, 1.6, n), 2, 10), 0)
    exploit = np.where(has_vuln, rng.choice([0.2, 0.5, 0.8, 1.0], n, p=[0.35, 0.35, 0.2, 0.1]), 0)
    kev = (has_vuln & (rng.random(n) < 0.15 + 0.3 * (exploit > 0.7))).astype(float)
    epss = np.where(has_vuln, np.clip(rng.beta(1.2, 5, n) + 0.35 * kev, 0, 1), 0)
    exposure = rng.choice([0.05, 0.3, 0.55, 0.9], n, p=[0.1, 0.5, 0.25, 0.15])
    internet = (exposure > 0.85) & (rng.random(n) < 0.6)
    reach = np.clip(exposure * rng.uniform(0.3, 1.1, n) + 0.1 * rng.random(n), 0, 1)
    activity = rng.choice([0.0, 0.5, 0.8, 1.0], n, p=[0.78, 0.13, 0.07, 0.02])
    auth = rng.choice([0.1, 0.4, 0.75, 1.0], n, p=[0.3, 0.4, 0.22, 0.08])
    monitoring = np.clip(rng.beta(2.4, 2.2, n), 0, 1)
    remote = (rng.random(n) < 0.12 + 0.3 * internet).astype(float)
    crit = rng.integers(1, 6, n).astype(float)
    x = np.column_stack([cvss, exploit, kev, epss, exposure, reach, activity, auth, monitoring, internet.astype(float), remote, crit])
    logits = _hidden_logit(x) + rng.normal(0, 0.55, n)
    y = (rng.random(n) < 1 / (1 + np.exp(-logits))).astype(int)
    return x, y


class LikelihoodModel:
    def __init__(self, seed: int = 42):
        x, y = synthetic_histories(seed=seed)
        x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.25, random_state=seed, stratify=y)
        self.model = GradientBoostingClassifier(n_estimators=180, max_depth=3, learning_rate=0.07, subsample=0.9, random_state=seed)
        self.model.fit(x_train, y_train)
        proba = self.model.predict_proba(x_test)[:, 1]
        self.baseline = np.median(x_train, axis=0)
        bins = np.linspace(0, 1, 11)
        idx = np.clip(np.digitize(proba, bins) - 1, 0, 9)
        calibration = []
        for b in range(10):
            mask = idx == b
            if mask.sum() >= 15:
                calibration.append({"bin": f"{bins[b]:.1f}–{bins[b + 1]:.1f}", "predicted": round(float(proba[mask].mean()), 3),
                                    "observed": round(float(y_test[mask].mean()), 3), "count": int(mask.sum())})
        self.card = {
            "name": "OHMEN likelihood model",
            "algorithm": "Gradient boosted decision trees (scikit-learn), 180 estimators, depth 3",
            "training": {"samples": int(len(x_train)), "test_samples": int(len(x_test)), "positive_rate": round(float(y.mean()), 3),
                         "source": "Synthetic labelled incident histories (hidden process with interactions and noise)"},
            "metrics": {"roc_auc": round(float(roc_auc_score(y_test, proba)), 3),
                        "average_precision": round(float(average_precision_score(y_test, proba)), 3),
                        "brier": round(float(brier_score_loss(y_test, proba)), 4)},
            "calibration": calibration,
            "feature_importance": sorted(({"feature": key, "label": label, "importance": round(float(v), 4)}
                                          for (key, label), v in zip(FEATURES, self.model.feature_importances_)),
                                         key=lambda r: -r["importance"]),
            "limitations": [
                "Trained on synthetic histories: metrics demonstrate the pipeline, not real-world predictive accuracy.",
                "Needs real labelled incidents (with consistent asset inventories) before operational use.",
                "The transparent risk engine stays authoritative; this model is a second opinion.",
            ],
        }

    @staticmethod
    def features(twin: Twin, row: dict) -> np.ndarray:
        a = twin.assets[row["id"]]
        top = row.get("_top")
        adv = top["advisory"] if top else None
        f = row["factors"]
        return np.array([
            adv["cvss"] if adv else 0.0,
            exploit_score(adv) if adv else 0.0,
            1.0 if adv and adv["kev"] else 0.0,
            adv["epss"] if adv else 0.0,
            f["E"], f["A"], f["S_act"],
            AUTH_WEAKNESS.get(a.get("auth", "n/a"), 0.0),
            f["M"],
            1.0 if a.get("internet_facing") else 0.0,
            1.0 if a.get("remote_access") else 0.0,
            float(a["criticality"]),
        ])

    def predict(self, twin: Twin, risk: dict) -> dict[str, float]:
        ids = list(risk["assets"])
        if not ids:
            return {}
        x = np.vstack([self.features(twin, risk["assets"][i]) for i in ids])
        return {i: round(float(p), 4) for i, p in zip(ids, self.model.predict_proba(x)[:, 1])}

    def attribution(self, twin: Twin, row: dict) -> list[dict]:
        """Occlusion attribution: how much the prediction moves when one feature is reset to the training median."""
        x = self.features(twin, row)
        base = float(self.model.predict_proba(x.reshape(1, -1))[0, 1])
        rows = []
        for i, (key, label) in enumerate(FEATURES):
            probe = x.copy()
            probe[i] = self.baseline[i]
            delta = base - float(self.model.predict_proba(probe.reshape(1, -1))[0, 1])
            rows.append({"feature": key, "label": label, "value": round(float(x[i]), 3), "contribution": round(delta, 4)})
        return sorted(rows, key=lambda r: -abs(r["contribution"]))

    def agreement(self, risk: dict, predictions: dict[str, float]) -> dict:
        pairs = [(risk["assets"][i]["likelihood"], predictions[i]) for i in predictions]
        if len(pairs) < 3:
            return {"pearson": None, "mean_abs_diff": None}
        a, b = np.array(pairs).T
        corr = float(np.corrcoef(a, b)[0, 1]) if a.std() and b.std() else math.nan
        return {"pearson": round(corr, 3), "mean_abs_diff": round(float(np.abs(a - b).mean()), 3)}
