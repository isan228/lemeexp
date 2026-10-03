import { useEffect, useState } from "react";
import { apiBase } from "../config.js";

/** Активные тарифы подписки в порядке, заданном в админке. */
export function useBillingPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${apiBase}/billing/plans`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(data.message || "Не удалось загрузить тарифы");
        setPlans(Array.isArray(data.plans) ? data.plans : []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Не удалось загрузить тарифы");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { plans, loading, error };
}

/** Тариф из `?plan=` — или первый, если параметр старый (`standard`) или тариф скрыт. */
export function pickInitialPlan(plans, planParam) {
  return plans.find((p) => String(p.id) === String(planParam)) || plans[0] || null;
}
