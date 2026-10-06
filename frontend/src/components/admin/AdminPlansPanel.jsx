import { useState } from "react";
import { formatPlanPrice, isLifetimePlan, LIFETIME_PLAN_DAYS } from "../../config/billing.js";

const DURATION_PRESETS = [
  { days: 30, label: "1 месяц" },
  { days: 90, label: "3 месяца" },
  { days: 180, label: "6 месяцев" },
  { days: 365, label: "1 год" },
  { days: LIFETIME_PLAN_DAYS, label: "Навсегда" }
];

const EMPTY_FORM = { title: "", price: "", durationDays: "30" };

function planToForm(plan) {
  return {
    title: plan.customTitle || "",
    price: String(plan.amount ?? ""),
    durationDays: String(plan.periodDays ?? 30)
  };
}

function validateForm(form) {
  const price = Number(form.price);
  const durationDays = Number(form.durationDays);
  if (form.price === "" || !Number.isFinite(price) || price < 0) return "Укажите цену (0 или больше)";
  if (form.durationDays === "" || !Number.isInteger(durationDays) || durationDays < LIFETIME_PLAN_DAYS) {
    return "Укажите срок в днях (0 — навсегда)";
  }
  return "";
}

function formToPayload(form) {
  return {
    title: form.title.trim(),
    price: Number(form.price),
    durationDays: Number(form.durationDays)
  };
}

function PlanFormFields({ form, onChange, idPrefix }) {
  const set = (key) => (e) => onChange({ ...form, [key]: e.target.value });
  return (
    <>
      <div className="adm-plan-form-grid">
        <div className="adm-field">
          <label htmlFor={`${idPrefix}-price`}>Цена, сом</label>
          <input id={`${idPrefix}-price`} type="number" min={0} step="any" value={form.price} onChange={set("price")} required />
        </div>
        <div className="adm-field">
          <label htmlFor={`${idPrefix}-days`}>Срок, дней (0 — навсегда)</label>
          <input
            id={`${idPrefix}-days`}
            type="number"
            min={LIFETIME_PLAN_DAYS}
            step={1}
            value={form.durationDays}
            onChange={set("durationDays")}
            required
          />
        </div>
      </div>
      <div className="adm-plan-presets">
        {DURATION_PRESETS.map((p) => (
          <button
            key={p.days}
            type="button"
            className={`adm-btn adm-btn-sm ${Number(form.durationDays) === p.days ? "adm-btn-primary" : "adm-btn-secondary"}`}
            onClick={() => onChange({ ...form, durationDays: String(p.days) })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="adm-field">
        <label htmlFor={`${idPrefix}-title`}>Название (необязательно)</label>
        <input
          id={`${idPrefix}-title`}
          value={form.title}
          onChange={set("title")}
          maxLength={120}
          placeholder="По умолчанию — срок, например «3 месяца»"
        />
      </div>
    </>
  );
}

export default function AdminPlansPanel({ plans, loading, apiRequest, onPlansChange, showToast }) {
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function request(path, options, fallbackMessage) {
    const res = await apiRequest(path, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || fallbackMessage);
    }
    return res.status === 204 ? null : res.json();
  }

  async function run(action) {
    setSaving(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err.message);
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  function submitCreate(e) {
    e.preventDefault();
    const problem = validateForm(createForm);
    if (problem) return setError(problem);
    void run(async () => {
      const created = await request(
        "/admin/subscription-plans",
        { method: "POST", body: JSON.stringify(formToPayload(createForm)) },
        "Не удалось создать тариф"
      );
      onPlansChange([...plans, created]);
      setCreateForm(EMPTY_FORM);
      showToast(`Тариф «${created.title}» добавлен`);
    });
  }

  function submitEdit(e) {
    e.preventDefault();
    const problem = validateForm(editForm);
    if (problem) return setError(problem);
    void run(async () => {
      const updated = await request(
        `/admin/subscription-plans/${editingId}`,
        { method: "PATCH", body: JSON.stringify(formToPayload(editForm)) },
        "Не удалось сохранить тариф"
      );
      onPlansChange(plans.map((p) => (p.id === updated.id ? updated : p)));
      setEditingId(null);
      showToast(`Тариф «${updated.title}» сохранён`);
    });
  }

  function toggleActive(plan) {
    const activeCount = plans.filter((p) => p.active).length;
    if (plan.active && activeCount === 1 && !window.confirm("Это последний включённый тариф — ученики не смогут оплатить подписку. Выключить?")) {
      return;
    }
    void run(async () => {
      const updated = await request(
        `/admin/subscription-plans/${plan.id}`,
        { method: "PATCH", body: JSON.stringify({ active: !plan.active }) },
        "Не удалось изменить тариф"
      );
      onPlansChange(plans.map((p) => (p.id === updated.id ? updated : p)));
    });
  }

  function movePlan(plan, dir) {
    const ids = plans.map((p) => p.id);
    const idx = ids.indexOf(plan.id);
    const next = idx + dir;
    if (next < 0 || next >= ids.length) return;
    [ids[idx], ids[next]] = [ids[next], ids[idx]];
    void run(async () => {
      const list = await request(
        "/admin/subscription-plans/reorder",
        { method: "POST", body: JSON.stringify({ ids }) },
        "Не удалось изменить порядок"
      );
      onPlansChange(list);
    });
  }

  function deletePlan(plan) {
    if (!window.confirm(`Удалить тариф «${plan.title}»? Уже оплаченные подписки не изменятся.`)) return;
    void run(async () => {
      await request(`/admin/subscription-plans/${plan.id}`, { method: "DELETE" }, "Не удалось удалить тариф");
      onPlansChange(plans.filter((p) => p.id !== plan.id));
      if (editingId === plan.id) setEditingId(null);
      showToast(`Тариф «${plan.title}» удалён`);
    });
  }

  return (
    <div className="adm-news-layout" style={{ marginBottom: 16 }}>
      <section className="adm-card" style={{ padding: 20 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Новый тариф</h2>
        <p className="adm-page-desc" style={{ margin: "0 0 16px" }}>
          Ученик выбирает тариф при оплате. Подписка продлевается на срок тарифа, промокоды считаются от его цены.
        </p>
        {error && <div className="adm-alert warn">{error}</div>}
        <form className="adm-form" onSubmit={submitCreate}>
          <PlanFormFields form={createForm} onChange={setCreateForm} idPrefix="plan-new" />
          <button type="submit" className="adm-btn adm-btn-primary" disabled={saving}>
            {saving ? "Сохранение…" : "Добавить тариф"}
          </button>
        </form>
      </section>

      <section className="adm-card" style={{ padding: 20 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: "1rem" }}>Тарифы на сайте</h2>
        {loading ? (
          <div className="adm-loading-block">
            <span className="adm-spinner" />
            Загрузка…
          </div>
        ) : plans.length === 0 ? (
          <div className="adm-empty">Тарифов нет — ученики не смогут оплатить подписку</div>
        ) : (
          <ul className="adm-list" style={{ maxHeight: "none" }}>
            {plans.map((plan, index) => (
              <li key={plan.id} className="adm-list-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
                {editingId === plan.id ? (
                  <form className="adm-form adm-plan-edit" onSubmit={submitEdit}>
                    <PlanFormFields form={editForm} onChange={setEditForm} idPrefix={`plan-${plan.id}`} />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="submit" className="adm-btn adm-btn-primary adm-btn-sm" disabled={saving}>
                        {saving ? "Сохранение…" : "Сохранить"}
                      </button>
                      <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" onClick={() => setEditingId(null)}>
                        Отмена
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="adm-lesson" style={{ flexWrap: "wrap" }}>
                    <div>
                      <strong>{plan.title}</strong>
                      <div className="adm-plan-price">
                        <span>{formatPlanPrice(plan.amount)}</span>
                        <span className="muted"> / {isLifetimePlan(plan) ? "навсегда" : plan.periodLabel}</span>
                      </div>
                      <div className="adm-lesson-meta">
                        {plan.active ? <span className="adm-badge ok">На сайте</span> : <span className="adm-badge pending">Скрыт</span>}
                        {" · "}
                        {isLifetimePlan(plan) ? "бессрочно" : `${plan.periodDays} дн.`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="adm-btn adm-btn-ghost adm-btn-sm"
                        aria-label="Выше"
                        disabled={saving || index === 0}
                        onClick={() => movePlan(plan, -1)}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="adm-btn adm-btn-ghost adm-btn-sm"
                        aria-label="Ниже"
                        disabled={saving || index === plans.length - 1}
                        onClick={() => movePlan(plan, 1)}
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        className="adm-btn adm-btn-secondary adm-btn-sm"
                        onClick={() => {
                          setEditingId(plan.id);
                          setEditForm(planToForm(plan));
                          setError("");
                        }}
                      >
                        Изменить
                      </button>
                      <button type="button" className="adm-btn adm-btn-secondary adm-btn-sm" disabled={saving} onClick={() => toggleActive(plan)}>
                        {plan.active ? "Скрыть" : "Показать"}
                      </button>
                      <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" disabled={saving} onClick={() => deletePlan(plan)}>
                        Удалить
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
