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

export function formatPlanPrice(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  if (n <= 0) return "бесплатно";
  return Number.isInteger(n) ? `${n} сом` : `${n.toFixed(2)} сом`;
}
