const PAID_TYPES = new Set(["premium", "mentor", "basic"]);

export function hasFullAccess(profile) {
  if (!profile) return false;
  if (profile.hasFullAccess === true) return true;
  if (profile.hasFullAccess === false) return false;
  if (profile.subscriptionType === "admin") return true;
  if (!PAID_TYPES.has(profile.subscriptionType)) return false;
  if (!profile.subscriptionExpiresAt) return true;
  return new Date(profile.subscriptionExpiresAt) > new Date();
}

export function formatSubscriptionExpiry(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}
