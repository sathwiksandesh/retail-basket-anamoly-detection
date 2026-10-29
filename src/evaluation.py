"""Evaluation helpers. Synthetic-label metrics validate the test harness, not real-world fraud."""
import numpy as np
from sklearn.metrics import average_precision_score, roc_auc_score, precision_score, recall_score, f1_score

def evaluate_scores(y_true, scores, predicted_labels, top_k=100):
    y = np.asarray(y_true, dtype=int)
    s = np.nan_to_num(np.asarray(scores, dtype=float))
    pred = np.asarray(predicted_labels)
    pred = (pred == -1).astype(int) if set(np.unique(pred)).issubset({-1, 0, 1}) and -1 in np.unique(pred) else pred.astype(int)
    out = {"precision": float(precision_score(y, pred, zero_division=0)),
           "recall": float(recall_score(y, pred, zero_division=0)),
           "f1": float(f1_score(y, pred, zero_division=0)),
           "average_precision": float(average_precision_score(y, s)) if len(np.unique(y)) > 1 else float("nan"),
           "roc_auc": float(roc_auc_score(y, s)) if len(np.unique(y)) > 1 else float("nan")}
    k = min(max(1, int(top_k)), len(y))
    top_idx = np.argsort(s)[-k:]
    out["precision_at_k"] = float(y[top_idx].mean()) if k else 0.0
    out["top_k"] = int(k)
    return out
