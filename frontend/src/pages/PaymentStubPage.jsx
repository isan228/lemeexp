import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PlanPicker from "../components/PlanPicker.jsx";
import SiteBrand from "../components/SiteBrand.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { formatPlanPrice } from "../config/billing.js";
import { pickInitialPlan, useBillingPlans } from "../hooks/useBillingPlans.js";
import { routes, GET_ACCESS_LABEL } from "../config/site.js";

export default function PaymentPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { apiRequest, updateProfile, loadCatalog } = useAuth();
  const { plans, loading: plansLoading, error: plansError } = useBillingPlans();
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [pending, setPending] = useState(false);
  const [promoPending, setPromoPending] = useState(false);
  const [error, setError] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState(null);

  const selectedPlan =
    plans.find((p) => p.id === selectedPlanId) || pickInitialPlan(plans, searchParams.get("plan"));
  const baseAmount = selectedPlan?.amount ?? 0;
  const finalAmount = appliedPromo ? appliedPromo.finalAmount : baseAmount;

  async function validatePromo(code, plan) {
    setError("");
    setPromoPending(true);
    try {
      const res = await apiRequest("/billing/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoCode: code, plan: plan.id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Промокод недействителен");
      }
      setAppliedPromo(data);
      setPromoInput(data.code);
    } catch (err) {
      setAppliedPromo(null);
      setError(err.message || "Промокод недействителен");
    } finally {
      setPromoPending(false);
    }
  }

  function onApplyPromo() {
    const code = promoInput.trim();
    if (!code || !selectedPlan) return;
    void validatePromo(code, selectedPlan);
  }

  function onSelectPlan(plan) {
    setSelectedPlanId(plan.id);
    if (appliedPromo) void validatePromo(appliedPromo.code, plan);
  }

  function clearPromo() {
    setAppliedPromo(null);
    setPromoInput("");
    setError("");
  }

  async function onPay() {
    if (!selectedPlan) {
      setError("Выберите тариф.");
      return;
    }

    setError("");
    setPending(true);
    try {
      const payload = { plan: selectedPlan.id };
      if (appliedPromo?.code) payload.promoCode = appliedPromo.code;

      const res = await apiRequest("/billing/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Не удалось создать платёж");
      }

      if (data.free) {
        if (data.profile) updateProfile(data.profile);
        void loadCatalog();
        navigate(routes.paymentSuccess(data.paymentId), { replace: true });
        return;
      }

      if (!data.paymentUrl) {
        throw new Error("Не удалось получить ссылку на оплату");
      }
      window.location.assign(data.paymentUrl);
    } catch (err) {
      setError(err.message || "Ошибка оплаты");
      setPending(false);
    }
  }

  const strikePrice = appliedPromo?.discount > 0 ? baseAmount : selectedPlan?.oldAmount;
  const displayPrice = finalAmount <= 0 ? "бесплатно" : formatPlanPrice(finalAmount);

  return (
    <div className="payment-stub-page payment-page">
      <header className="auth-flow-header">
        <SiteBrand />
        <Link to={routes.home} className="nav-muted">
          На главную
        </Link>
      </header>

      <div className="payment-stub-card card payment-card">
        <div className="flow-hero">
          <p className="landing-kicker">Шаг оплаты</p>
          <div className="flow-steps" aria-label="Этапы оформления">
            <span className="flow-step">1. Аккаунт</span>
            <span className="flow-step active">2. Оплата</span>
          </div>
          <h1>{GET_ACCESS_LABEL}</h1>
          <p className="muted">Выберите срок подписки, чтобы открыть все уроки.</p>
        </div>

        {plansLoading ? (
          <p className="muted">Загрузка тарифов…</p>
        ) : plans.length === 0 ? (
          <p className="form-error">{plansError || "Сейчас нет доступных тарифов. Напишите в поддержку."}</p>
        ) : (
          <>
            {plans.length > 1 ? (
              <PlanPicker
                plans={plans}
                selectedId={selectedPlan?.id}
                onSelect={onSelectPlan}
                disabled={pending || promoPending}
              />
            ) : null}

            <div className="payment-summary">
              <div className="payment-summary-top">
                <span className="plan-badge">Подписка</span>
                {appliedPromo?.discount > 0 ? <span className="payment-summary-tag">Скидка</span> : null}
              </div>
              <div className="payment-summary-row">
                <div>
                  <strong className="payment-summary-name">{selectedPlan.title}</strong>
                  <p className="payment-summary-period">доступ на {selectedPlan.periodLabel}</p>
                </div>
                <div className="payment-summary-price-block">
                  {strikePrice != null && strikePrice > finalAmount ? (
                    <span className="payment-summary-old">{formatPlanPrice(strikePrice)}</span>
                  ) : null}
                  <span className="payment-summary-price">{displayPrice}</span>
                </div>
              </div>
              {finalAmount <= 0 ? (
                <p className="payment-summary-note">Промокод покрывает стоимость — оплата не нужна.</p>
              ) : null}
            </div>
          </>
        )}

        <div className="payment-promo">
          <label htmlFor="promo-code">Промокод</label>
          <div className="payment-promo-row">
            <input
              id="promo-code"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
              placeholder="Например: WELCOME"
              disabled={promoPending || pending || !selectedPlan}
              autoComplete="off"
            />
            {appliedPromo ? (
              <button type="button" className="btn-secondary inline" onClick={clearPromo} disabled={pending}>
                Сбросить
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary inline"
                onClick={onApplyPromo}
                disabled={promoPending || pending || !promoInput.trim() || !selectedPlan}
              >
                {promoPending ? "Проверка…" : "Применить"}
              </button>
            )}
          </div>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="payment-stub-actions">
          <Link to={routes.login} className="btn-link">
            Войти
          </Link>
          <button
            type="button"
            className="btn-primary payment-pay-btn"
            onClick={() => void onPay()}
            disabled={pending || promoPending || !selectedPlan}
          >
            {pending ? "Обработка…" : finalAmount <= 0 ? "Активировать доступ" : "Оплатить"}
          </button>
        </div>
      </div>
    </div>
  );
}
