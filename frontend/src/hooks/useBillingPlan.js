import { useEffect, useState } from "react";
import { apiBase } from "../config.js";
import { SUBSCRIPTION_PLAN, formatPlanPrice, formatPlanPeriodLabel } from "../config/billing.js";

function fallbackPlan() {
  return {
    id: SUBSCRIPTION_PLAN.id,
    title: SUBSCRIPTION_PLAN.name,
    amount: 1
  };
}

export function useBillingPlan(apiRequest) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = apiRequest
          ? await apiRequest("/billing/plan", {}, false)
          : await fetch(`${apiBase}/billing/plan`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setPlan(fallbackPlan());
          return;
        }
        setPlan(data);
      } catch {
        if (!cancelled) setPlan(fallbackPlan());
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [apiRequest]);

  const amount = plan?.amount ?? 1;
  const periodLabel = plan?.periodLabel || "1 месяц";
  return {
    plan,
    loading,
    amount,
    periodLabel,
    priceLabel: formatPlanPrice(amount),
    periodPriceLabel: formatPlanPeriodLabel(amount, periodLabel)
  };
}
