/** Метаданные тарифа (цена — с API `/billing/plan`). */
export const SUBSCRIPTION_PLAN = {
  id: "standard",
  name: "Подписка Lemexplain",
  bullets: [
    "Все предметы, главы и видеоуроки",
    "Личный кабинет и прогресс",
    "Чат с поддержкой"
  ]
};

export function formatPlanPrice(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  if (n <= 0) return "бесплатно";
  return Number.isInteger(n) ? `${n} сом` : `${n.toFixed(2)} сом`;
}

export function formatPlanPeriodLabel(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "бесплатно / доступ ко всем урокам";
  return `${formatPlanPrice(amount)} / доступ ко всем урокам`;
}
