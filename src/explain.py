"""Simple, transparent review reasons for basket-level findings."""
def explain_row(row, feature_columns=None):
    reasons = []
    if float(row.get("item_count", 0)) >= 25: reasons.append("unusually large basket")
    if float(row.get("unique_departments", 0)) >= 8: reasons.append("wide department spread")
    if float(row.get("unique_aisles", 0)) >= 18: reasons.append("wide aisle spread")
    if float(row.get("reorder_ratio", 0)) <= 0.05 and float(row.get("item_count", 0)) >= 5: reasons.append("very low reorder share")
    if float(row.get("days_since_prior_order", 0) or 0) >= 25: reasons.append("long gap since previous order")
    if not reasons: reasons.append("density-based score is high; inspect basket profile")
    return reasons
