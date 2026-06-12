import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const planTitles = {
  basic: "Базовая",
  pro: "Продвинутая",
  mentor: "Ментор"
};

const planAmounts = {
  basic: "990 сом",
  pro: "1990 сом",
  mentor: "3490 сом"
};

export default function PaymentPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { apiRequest } = useAuth();
  const planId = searchParams.get("plan") || "";
  const planTitle = planTitles[planId] || "Не выбрано";
  const planAmount = planAmounts[planId] || "";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onPayWithFinik() {
    if (!planTitles[planId]) {
      setError("Выберите подписку перед оплатой.");
      return;
    }

    setError("");
    setPending(true);
    try {
      const res = await apiRequest("/billing/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Не удалось создать платёж");
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
      <div className="payment-stub-card card payment-card">
        <div className="flow-hero">
          <p className="landing-kicker">Шаг оплаты</p>
          <div className="flow-steps" aria-label="Этапы оформления">
            <span className="flow-step">1. Подписка</span>
            <span className="flow-step">2. Анкета</span>
            <span className="flow-step active">3. Оплата</span>
          </div>
          <h1>Оплата подписки</h1>
        </div>
        <p className="muted">
          Вы выбрали подписку: <strong>{planTitle}</strong>
          {planAmount ? (
            <>
              {" "}
              — <strong>{planAmount}</strong>
            </>
          ) : null}
          .
        </p>
        <p className="muted">Оплата через Finik QR — любым банковским приложением Кыргызстана.</p>
        <div className="payment-methods">
          <div className="payment-method active">
            <span className="payment-method-icon" aria-hidden>
              📱
            </span>
            <span>Finik QR</span>
          </div>
        </div>
        {location.state?.form?.fullName && (
          <p className="muted small">Анкета получена для: {location.state.form.fullName}</p>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="payment-stub-actions">
          <Link to="/" className="btn-secondary">
            На главную
          </Link>
          <button type="button" className="btn-primary inline" onClick={onPayWithFinik} disabled={pending}>
            {pending ? "Создаём платёж..." : "Оплатить через Finik"}
          </button>
        </div>
      </div>
    </div>
  );
}
