/** Общее описание подписки. Тарифы (цена и срок) задаются в админке — `/billing/plans`. */
export const SUBSCRIPTION_PLAN = {
  id: "standard",
  name: "Подписка Lemexplain",
  bullets: [
    "Все предметы, главы и видеоуроки на весь срок подписки",
    "Личный кабинет и прогресс",
    "Чат с поддержкой"
  ]
};

/** Срок тарифа «навсегда» — подписка без даты окончания. */
export const LIFETIME_PLAN_DAYS = 0;

export function isLifetimePlan(plan) {
  return plan?.periodDays === LIFETIME_PLAN_DAYS;
}

export function formatPlanPrice(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  if (n <= 0) return "бесплатно";
  return Number.isInteger(n) ? `${n} сом` : `${n.toFixed(2)} сом`;
}
