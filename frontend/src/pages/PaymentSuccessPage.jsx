import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { apiRequest, updateProfile } = useAuth();
  const paymentId = searchParams.get("paymentId") || "";
  const [status, setStatus] = useState("pending");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!paymentId) {
      setError("Не указан идентификатор платежа.");
      setStatus("failed");
      return;
    }

    let cancelled = false;
    let attempts = 0;

    async function poll() {
      try {
        const res = await apiRequest(`/billing/payment-status/${paymentId}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || "Не удалось проверить оплату");
        }

        if (cancelled) return;

        if (data.status === "succeeded") {
          if (data.profile) {
            updateProfile(data.profile);
          }
          setStatus("succeeded");
          return;
        }

        if (data.status === "failed") {
          setStatus("failed");
          setError("Платёж не прошёл. Попробуйте снова.");
          return;
        }

        attempts += 1;
        if (attempts < 30) {
          setTimeout(poll, 2000);
        } else {
          setStatus("pending");
          setError("Оплата ещё обрабатывается. Обновите страницу через минуту.");
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("failed");
          setError(err.message || "Ошибка проверки оплаты");
        }
      }
    }

    poll();

    return () => {
      cancelled = true;
    };
  }, [paymentId, apiRequest, updateProfile]);

  useEffect(() => {
    if (status === "succeeded") {
      const timer = setTimeout(() => navigate("/learning/home", { replace: true }), 1500);
      return () => clearTimeout(timer);
    }
  }, [status, navigate]);

  return (
    <div className="payment-stub-page payment-page">
      <div className="payment-stub-card card payment-card">
        <div className="flow-hero">
          <p className="landing-kicker">Оплата</p>
          <h1>
            {status === "succeeded"
              ? "Оплата прошла успешно"
              : status === "failed"
                ? "Оплата не завершена"
                : "Проверяем оплату..."}
          </h1>
        </div>

        {status === "pending" && !error && (
          <p className="muted">Finik подтверждает платёж. Обычно это занимает несколько секунд.</p>
        )}

        {status === "succeeded" && (
          <p className="muted">Подписка активирована. Перенаправляем в личный кабинет...</p>
        )}

        {error && <p className="form-error">{error}</p>}

        <div className="payment-stub-actions">
          {status !== "succeeded" && (
            <Link to="/payment" className="btn-secondary">
              К оплате
            </Link>
          )}
          <Link to="/" className="btn-primary inline">
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}
