import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import SiteBrand from "../components/SiteBrand.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { SUBSCRIPTION_PLAN } from "../config/billing.js";
import { routes } from "../config/site.js";

export default function PaymentPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { apiRequest, updateProfile } = useAuth();
  const planId = searchParams.get("plan") || SUBSCRIPTION_PLAN.id;
  const isValidPlan = planId === SUBSCRIPTION_PLAN.id;
  const [pending, setPending] = useState(false);
  const [promoPending, setPromoPending] = useState(false);
  const [error, setError] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState(null);

  const baseAmount = SUBSCRIPTION_PLAN.amount;
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
        navigate(routes.paymentSuccess(data.paymentId), { replace: true });
        return;
      }

      if (!data.paymentUrl) {
        throw new Error("Finik не вернул ссылку на оплату");
      }
      window.location.href = data.paymentUrl;
    } catch (err) {
      setError(err.message || "Ошибка оплаты");
      setPending(false);
    }
  }

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
            <span className="flow-step">1. Анкета</span>
            <span className="flow-step active">2. Оплата</span>
          </div>
          <h1>Оплата подписки</h1>
        </div>
        <p className="muted">
          {SUBSCRIPTION_PLAN.name} —{" "}
          <strong>{finalAmount <= 0 ? "бесплатно" : `${finalAmount} сом`}</strong>
          {appliedPromo?.discount > 0 ? (
            <>
              {" "}
              <span className="small">(скидка {appliedPromo.discount} сом)</span>
            </>
          ) : null}
        </p>
        <p className="muted">
          {finalAmount <= 0
            ? "Промокод покрывает стоимость — оплата через Finik не нужна."
            : "Оплата через Finik QR — любым банковским приложением Кыргызстана."}
        </p>

        <div className="adm-form" style={{ marginTop: 16, marginBottom: 16 }}>
          <div className="adm-field">
            <label htmlFor="promo-code">Промокод</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                id="promo-code"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                placeholder="Например: WELCOME"
                disabled={promoPending || pending}
                style={{ flex: "1 1 160px" }}
              />
              {appliedPromo ? (
                <button type="button" className="btn-secondary inline" onClick={clearPromo} disabled={pending}>
                  Сбросить
                </button>
              ) : (
                <button type="button" className="btn-secondary inline" onClick={() => void onApplyPromo()} disabled={promoPending || pending || !promoInput.trim()}>
                  {promoPending ? "Проверка…" : "Применить"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="payment-methods">
          <div className="payment-method active">
            <span className="payment-method-icon" aria-hidden>
              📱
            </span>
            <span>{finalAmount <= 0 ? "Промокод" : "Finik QR"}</span>
          </div>
        </div>
        {location.state?.form?.fullName && (
          <p className="muted small">Анкета получена для: {location.state.form.fullName}</p>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="payment-stub-actions">
          {!isValidPlan ? (
            <Link to={routes.register} className="btn-secondary">
              К регистрации
            </Link>
          ) : null}
          <Link to={routes.login} className="btn-link">
            Войти
          </Link>
          <button type="button" className="btn-primary inline" onClick={() => void onPay()} disabled={pending || !isValidPlan}>
            {pending ? "Обработка…" : finalAmount <= 0 ? "Активировать доступ" : "Оплатить через Finik"}
          </button>
        </div>
      </div>
    </div>
  );
}
