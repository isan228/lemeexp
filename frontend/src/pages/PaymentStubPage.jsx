import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const planTitles = {
  basic: "Базовая",
  pro: "Продвинутая",
  mentor: "Ментор"
};

export default function PaymentStubPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { apiRequest, updateProfile } = useAuth();
  const planId = searchParams.get("plan") || "";
  const planTitle = planTitles[planId] || "Не выбрано";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onConfirmPayment() {
    if (!planTitles[planId]) {
      setError("Выберите подписку перед оплатой.");
      return;
    }
    setError("");
    setPending(true);
    try {
      const res = await apiRequest("/billing/activate-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Не удалось подтвердить оплату");
      }
      if (data.profile) {
        updateProfile(data.profile);
      }
      navigate("/learning/home", { replace: true });
    } catch (err) {
      setError(err.message || "Ошибка оплаты");
    } finally {
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
          Вы выбрали подписку: <strong>{planTitle}</strong>.
        </p>
        <p className="muted">Здесь позже будет подключена реальная оплата. Пока это временная заглушка.</p>
        <div className="payment-methods">
          <div className="payment-method active">
            <span className="payment-method-icon" aria-hidden>
              💳
            </span>
            <span>Банковская карта (скоро)</span>
          </div>
          <div className="payment-method">
            <span className="payment-method-icon" aria-hidden>
              🟨
            </span>
            <span>Kaspi Pay (скоро)</span>
          </div>
          <div className="payment-method">
            <span className="payment-method-icon" aria-hidden>
              🧾
            </span>
            <span>Счет для юр. лица (скоро)</span>
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
          <button type="button" className="btn-primary inline" onClick={onConfirmPayment} disabled={pending}>
            {pending ? "Проверяем платеж..." : "Оплатил"}
          </button>
        </div>
      </div>
    </div>
  );
}
