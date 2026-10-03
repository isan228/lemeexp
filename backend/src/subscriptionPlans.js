import { z } from "zod";

/** Идентификатор тарифа из старых клиентов (сайт до появления тарифов, старые APK). */
export const LEGACY_PLAN_ID = "standard";

const planCreateSchema = z.object({
  title: z.string().trim().max(120).optional().default(""),
  price: z.coerce.number().min(0).max(1_000_000),
  durationDays: z.coerce.number().int().min(1).max(3650),
  active: z.boolean().optional().default(true)
});

const planUpdateSchema = z
  .object({
    title: z.string().trim().max(120).optional(),
    price: z.coerce.number().min(0).max(1_000_000).optional(),
    durationDays: z.coerce.number().int().min(1).max(3650).optional(),
    active: z.boolean().optional()
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "No fields to update"
  });

const planReorderSchema = z.object({
  ids: z.array(z.coerce.number().int()).min(1)
});

function pluralRu(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function formatPeriodLabel(days) {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return "";
  if (d % 365 === 0) {
    const n = d / 365;
    return `${n} ${pluralRu(n, "год", "года", "лет")}`;
  }
  if (d % 30 === 0) {
    const n = d / 30;
    return `${n} ${pluralRu(n, "месяц", "месяца", "месяцев")}`;
  }
  if (d % 7 === 0) {
    const n = d / 7;
    return `${n} ${pluralRu(n, "неделя", "недели", "недель")}`;
  }
  return `${d} ${pluralRu(d, "день", "дня", "дней")}`;
}

function toMoney(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatPlanRow(row) {
  const durationDays = Number(row.duration_days ?? row.durationDays);
  const periodLabel = formatPeriodLabel(durationDays);
  const title = String(row.title || "").trim();
  return {
    id: Number(row.id),
    title: title || periodLabel,
    customTitle: title,
    amount: toMoney(row.price) ?? 0,
    periodDays: durationDays,
    periodLabel,
    active: Boolean(row.active),
    order: Number(row.order) || 0,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null
  };
}

function toPublicPlan(plan) {
  return {
    id: plan.id,
    title: plan.title,
    amount: plan.amount,
    periodDays: plan.periodDays,
    periodLabel: plan.periodLabel
  };
}

/**
 * Создаёт таблицу тарифов. Если она пустая — добавляет тариф «1 месяц»
 * с ценой из прежней настройки `app_settings.subscription_amount`.
 */
export async function ensureSubscriptionPlansTable(pool, fallbackPrice) {
  if (!pool) return;
  await pool.query(`
    create table if not exists subscription_plans (
      id bigserial primary key,
      title text not null default '',
      price numeric(12, 2) not null,
      duration_days int not null,
      active boolean not null default true,
      "order" int not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await pool.query(`alter table payments add column if not exists duration_days int`);

  const count = await pool.query(`select count(*)::int as c from subscription_plans`);
  if (count.rows[0].c > 0) return;

  let price = fallbackPrice;
  const legacy = await pool.query(
    `select value from app_settings where key = 'subscription_amount' limit 1`
  );
  const legacyPrice = Number(legacy.rows[0]?.value);
  if (Number.isFinite(legacyPrice) && legacyPrice >= 0) price = legacyPrice;

  await pool.query(
    `insert into subscription_plans (title, price, duration_days, "order") values ('', $1, 30, 1)`,
    [price]
  );
}

export function createPlanStore({ pool, memState, isDbReady, fallbackPrice }) {
  let memNextId = 1;

  function memPlans() {
    if (!memState.subscriptionPlans) memState.subscriptionPlans = [];
    if (memState.subscriptionPlans.length === 0) {
      const now = new Date().toISOString();
      memState.subscriptionPlans.push({
        id: memNextId++,
        title: "",
        price: fallbackPrice,
        durationDays: 30,
        active: true,
        order: 1,
        createdAt: now,
        updatedAt: now
      });
    }
    return memState.subscriptionPlans;
  }

  async function listPlans({ activeOnly = false } = {}) {
    if (!isDbReady()) {
      return memPlans()
        .filter((p) => !activeOnly || p.active)
        .map(formatPlanRow)
        .sort((a, b) => a.order - b.order || a.id - b.id);
    }
    const r = await pool.query(
      `select * from subscription_plans
       ${activeOnly ? "where active = true" : ""}
       order by "order" asc, id asc`
    );
    return r.rows.map(formatPlanRow);
  }

  async function getPlanById(id) {
    const numId = Number(id);
    if (!Number.isInteger(numId) || numId <= 0) return null;
    if (!isDbReady()) {
      const found = memPlans().find((p) => p.id === numId);
      return found ? formatPlanRow(found) : null;
    }
    const r = await pool.query(`select * from subscription_plans where id = $1`, [numId]);
    return r.rows[0] ? formatPlanRow(r.rows[0]) : null;
  }

  /** Тариф, который можно купить: по id, а для старых клиентов — первый активный. */
  async function resolvePurchasablePlan(planKey) {
    if (planKey == null || planKey === "" || planKey === LEGACY_PLAN_ID) {
      const plans = await listPlans({ activeOnly: true });
      return plans[0] || null;
    }
    const plan = await getPlanById(planKey);
    return plan?.active ? plan : null;
  }

  async function createPlan(data) {
    if (!isDbReady()) {
      const plans = memPlans();
      const now = new Date().toISOString();
      const row = {
        id: memNextId++,
        title: data.title,
        price: data.price,
        durationDays: data.durationDays,
        active: data.active,
        order: plans.reduce((max, p) => Math.max(max, p.order), 0) + 1,
        createdAt: now,
        updatedAt: now
      };
      plans.push(row);
      return formatPlanRow(row);
    }
    const r = await pool.query(
      `insert into subscription_plans (title, price, duration_days, active, "order")
       values ($1, $2, $3, $4, (select coalesce(max("order"), 0) + 1 from subscription_plans))
       returning *`,
      [data.title, data.price, data.durationDays, data.active]
    );
    return formatPlanRow(r.rows[0]);
  }

  async function updatePlan(id, data) {
    const numId = Number(id);
    if (!isDbReady()) {
      const row = memPlans().find((p) => p.id === numId);
      if (!row) return null;
      if (data.title !== undefined) row.title = data.title;
      if (data.price !== undefined) row.price = data.price;
      if (data.durationDays !== undefined) row.durationDays = data.durationDays;
      if (data.active !== undefined) row.active = data.active;
      row.updatedAt = new Date().toISOString();
      return formatPlanRow(row);
    }
    const columns = {
      title: "title",
      price: "price",
      durationDays: "duration_days",
      active: "active"
    };
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries(columns)) {
      if (data[key] === undefined) continue;
      values.push(data[key]);
      sets.push(`${column} = $${values.length}`);
    }
    values.push(numId);
    const r = await pool.query(
      `update subscription_plans set ${sets.join(", ")}, updated_at = now()
       where id = $${values.length}
       returning *`,
      values
    );
    return r.rows[0] ? formatPlanRow(r.rows[0]) : null;
  }

  async function deletePlan(id) {
    const numId = Number(id);
    if (!isDbReady()) {
      const plans = memPlans();
      const idx = plans.findIndex((p) => p.id === numId);
      if (idx < 0) return false;
      plans.splice(idx, 1);
      return true;
    }
    const r = await pool.query(`delete from subscription_plans where id = $1 returning id`, [numId]);
    return Boolean(r.rows[0]);
  }

  async function reorderPlans(ids) {
    if (!isDbReady()) {
      const plans = memPlans();
      ids.forEach((id, index) => {
        const row = plans.find((p) => p.id === Number(id));
        if (row) row.order = index + 1;
      });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const [index, id] of ids.entries()) {
        await client.query(`update subscription_plans set "order" = $1, updated_at = now() where id = $2`, [
          index + 1,
          Number(id)
        ]);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    listPlans,
    getPlanById,
    resolvePurchasablePlan,
    createPlan,
    updatePlan,
    deletePlan,
    reorderPlans
  };
}

export function registerSubscriptionPlanRoutes(app, { auth, requireAdmin, planStore }) {
  app.get("/billing/plans", async (_req, res) => {
    try {
      const plans = await planStore.listPlans({ activeOnly: true });
      res.json({ plans: plans.map(toPublicPlan) });
    } catch (error) {
      res.status(500).json({ message: "Failed to load plans", error: error.message });
    }
  });

  /** Старый эндпоинт с одним тарифом — нужен уже установленным APK. */
  app.get("/billing/plan", async (_req, res) => {
    try {
      const plan = await planStore.resolvePurchasablePlan(LEGACY_PLAN_ID);
      if (!plan) return res.status(404).json({ message: "No active plans" });
      res.json(toPublicPlan(plan));
    } catch (error) {
      res.status(500).json({ message: "Failed to load plan", error: error.message });
    }
  });

  app.get("/admin/subscription-plans", auth, requireAdmin, async (_req, res) => {
    try {
      res.json(await planStore.listPlans());
    } catch (error) {
      res.status(500).json({ message: "Failed to load plans", error: error.message });
    }
  });

  app.post("/admin/subscription-plans", auth, requireAdmin, async (req, res) => {
    const parsed = planCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Проверьте цену и срок тарифа", issues: parsed.error.issues });
    }
    try {
      res.status(201).json(await planStore.createPlan(parsed.data));
    } catch (error) {
      res.status(500).json({ message: "Не удалось создать тариф", error: error.message });
    }
  });

  app.post("/admin/subscription-plans/reorder", auth, requireAdmin, async (req, res) => {
    const parsed = planReorderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
    }
    try {
      await planStore.reorderPlans(parsed.data.ids);
      res.json(await planStore.listPlans());
    } catch (error) {
      res.status(500).json({ message: "Не удалось изменить порядок", error: error.message });
    }
  });

  app.patch("/admin/subscription-plans/:planId", auth, requireAdmin, async (req, res) => {
    const parsed = planUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Проверьте цену и срок тарифа", issues: parsed.error.issues });
    }
    try {
      const plan = await planStore.updatePlan(req.params.planId, parsed.data);
      if (!plan) return res.status(404).json({ message: "Тариф не найден" });
      res.json(plan);
    } catch (error) {
      res.status(500).json({ message: "Не удалось обновить тариф", error: error.message });
    }
  });

  app.delete("/admin/subscription-plans/:planId", auth, requireAdmin, async (req, res) => {
    try {
      const deleted = await planStore.deletePlan(req.params.planId);
      if (!deleted) return res.status(404).json({ message: "Тариф не найден" });
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Не удалось удалить тариф", error: error.message });
    }
  });
}
