import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import SiteBrand from "../components/SiteBrand.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { SUBSCRIPTION_PLAN, formatPlanPrice } from "../config/billing.js";
import { useBillingPlan } from "../hooks/useBillingPlan.js";
import { routes, GET_ACCESS_LABEL } from "../config/site.js";

export default function PaymentPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { apiRequest, updateProfile, loadCatalog } = useAuth();
  const { amount: baseAmount, loading: planLoading, priceLabel, periodLabel } = useBillingPlan(apiRequest);
  const planId = searchParams.get("plan") || SUBSCRIPTION_PLAN.id;
  const isValidPlan = planId === SUBSCRIPTION_PLAN.id;
  const [pending, setPending] = useState(false);
  const [promoPending, setPromoPending] = useState(false);
  const [error, setError] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState(null);

  const finalAmount = appliedPromo ? appliedPromo.finalAmount : baseAmount;

  async function onApplyPromo() {
    const code = promoInput.trim();
    if (!code) return;
    setError("");
    setPromoPending(true);
    try {
      const res = await apiRequest("/billing/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoCode: code })
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

  function clearPromo() {
    setAppliedPromo(null);
    setPromoInput("");
    setError("");
  }

  async function onPay() {
    if (!isValidPlan) {
      setError("Некорректный тариф.");
      return;
    }

    setError("");
    setPending(true);
    try {
      const payload = { plan: SUBSCRIPTION_PLAN.id };
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
      window.location.href = data.paymentUrl;
    } catch (err) {
      setError(err.message || "Ошибка оплаты");
      setPending(false);
    }
  }

  const displayPrice =
    finalAmount <= 0 ? "бесплатно" : planLoading && !appliedPromo ? "…" : formatPlanPrice(finalAmount);

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
          <p className="muted">Оформите подписку, чтобы открыть все уроки.</p>
        </div>

        <div className="payment-summary">
          <div className="payment-summary-top">
            <span className="plan-badge">Подписка</span>
            {appliedPromo?.discount > 0 ? <span className="payment-summary-tag">Скидка</span> : null}
          </div>
          <div className="payment-summary-row">
            <div>
              <strong className="payment-summary-name">{SUBSCRIPTION_PLAN.name}</strong>
              <p className="payment-summary-period">на {periodLabel}</p>
            </div>
            <div className="payment-summary-price-block">
              {appliedPromo?.discount > 0 ? (
                <span className="payment-summary-old">{priceLabel}</span>
              ) : null}
              <span className="payment-summary-price">{displayPrice}</span>
            </div>
          </div>
          {finalAmount <= 0 ? (
            <p className="payment-summary-note">Промокод покрывает стоимость — оплата не нужна.</p>
          ) : null}
        </div>

        <div className="payment-promo">
          <label htmlFor="promo-code">Промокод</label>
          <div className="payment-promo-row">
            <input
              id="promo-code"
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
              placeholder="Например: WELCOME"
              disabled={promoPending || pending}
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
                onClick={() => void onApplyPromo()}
                disabled={promoPending || pending || !promoInput.trim()}
              >
                {promoPending ? "Проверка…" : "Применить"}
              </button>
            )}
          </div>
        </div>

        {location.state?.form?.fullName ? (
          <p className="muted small payment-applicant">Анкета получена для: {location.state.form.fullName}</p>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}

        <div className="payment-stub-actions">
          {!isValidPlan ? (
            <Link to={routes.register} className="btn-secondary">
              К регистрации
            </Link>
          ) : null}
          <Link to={routes.login} className="btn-link">
            Войти
          </Link>
          <button
            type="button"
            className="btn-primary payment-pay-btn"
            onClick={() => void onPay()}
            disabled={pending || !isValidPlan || planLoading}
          >
            {pending ? "Обработка…" : finalAmount <= 0 ? "Активировать доступ" : "Оплатить"}
          </button>
        </div>
      </div>
    </div>
  );
}
