export function normalizePromoCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function computeFinalAmount(baseAmount, promo) {
  const base = Number(baseAmount);
  if (!Number.isFinite(base) || base < 0) return base;
  if (promo.discount_type === "full") return 0;
  if (promo.discount_type === "percent") {
    const pct = Math.min(100, Math.max(0, Number(promo.discount_value)));
    return Math.max(0, Math.round(base * (100 - pct)) / 100);
  }
  if (promo.discount_type === "fixed") {
    return Math.max(0, Math.round((base - Number(promo.discount_value)) * 100) / 100);
  }
  return base;
}

export function formatPromoRow(row) {
  return {
    id: row.id,
    code: row.code,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    maxUses: row.max_uses == null ? null : Number(row.max_uses),
    usesCount: Number(row.uses_count || 0),
    expiresAt: row.expires_at,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
