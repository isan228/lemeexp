import { useState } from "react";
import { isLifetimePlan } from "../../config/billing.js";
import { dateInputEndMs, extendDateInput } from "../../utils/subscriptionDates.js";

const SELECT_STYLE = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--adm-border)" };

export default function SubscriptionExpiryField({ idPrefix, subscriptionType, expiresDate, plans, onChange }) {
  const [nowMs] = useState(() => Date.now());
  const isPaid = subscriptionType !== "free";
  const isExpired = isPaid && Boolean(expiresDate) && dateInputEndMs(expiresDate) < nowMs;

  return (
    <>
      <div className="adm-field">
        <label htmlFor={`${idPrefix}-subscription`}>Тариф</label>
        <select
          id={`${idPrefix}-subscription`}
          value={subscriptionType}
          onChange={(e) => onChange({ subscriptionType: e.target.value })}
          style={SELECT_STYLE}
        >
          <option value="free">Free</option>
          <option value="basic">Basic</option>
          <option value="premium">Pro</option>
          <option value="mentor">Mentor</option>
        </select>
      </div>
      {plans.length > 0 ? (
        <div className="adm-field">
          <label>Выдать подписку</label>
          <div className="adm-plan-presets">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                className="adm-btn adm-btn-secondary adm-btn-sm"
                title={
                  isLifetimePlan(plan)
                    ? "Выдать бессрочный доступ"
                    : `Продлить на ${plan.periodDays} дн. от текущей даты окончания или от сегодня`
                }
                onClick={() =>
                  onChange({
                    subscriptionType: isPaid ? subscriptionType : "premium",
                    expiresDate: isLifetimePlan(plan)
                      ? ""
                      : extendDateInput(isPaid ? expiresDate : "", plan.periodDays, Date.now())
                  })
                }
              >
                + {plan.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {isPaid ? (
        <div className="adm-field">
          <label htmlFor={`${idPrefix}-expires`}>Доступ до</label>
          <input
            id={`${idPrefix}-expires`}
            type="date"
            value={expiresDate}
            onChange={(e) => onChange({ expiresDate: e.target.value })}
          />
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            {isExpired ? "Подписка истекла — доступ к платным урокам закрыт. " : ""}
            Пусто — бессрочный доступ.
          </p>
        </div>
      ) : null}
    </>
  );
}
