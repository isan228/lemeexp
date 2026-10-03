import { formatPlanPrice } from "../config/billing.js";

/** Карточки тарифов. Без `onSelect` — только витрина (лендинг). */
export default function PlanPicker({ plans, selectedId, onSelect, disabled = false }) {
  return (
    <div className="plan-picker" role={onSelect ? "radiogroup" : undefined} aria-label="Тарифы подписки">
      {plans.map((plan) => {
        const selected = onSelect && String(plan.id) === String(selectedId);
        const content = (
          <>
            <span className="plan-picker-head">
              <strong className="plan-picker-title">{plan.title}</strong>
            </span>
            <span className="plan-picker-price">
              <span className="plan-picker-amount">{formatPlanPrice(plan.amount)}</span>
            </span>
            <span className="plan-picker-period">доступ на {plan.periodLabel}</span>
          </>
        );

        if (!onSelect) {
          return (
            <div key={plan.id} className="plan-picker-card">
              {content}
            </div>
          );
        }
        return (
          <button
            key={plan.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`plan-picker-card is-selectable${selected ? " is-selected" : ""}`}
            onClick={() => onSelect(plan)}
            disabled={disabled}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
