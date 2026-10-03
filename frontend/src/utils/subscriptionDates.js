const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Конец выбранного дня в `<input type="date">` — до этого момента действует доступ. */
export function dateInputEndMs(value) {
  if (!value) return 0;
  const ms = new Date(`${value}T23:59:59`).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/** ISO-дата с сервера → значение для `<input type="date">` в локальном времени. */
export function isoToDateInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : toDateInputValue(date);
}

/** Значение `<input type="date">` → ISO для API. */
export function dateInputToIso(value) {
  const ms = dateInputEndMs(value);
  return ms ? new Date(ms).toISOString() : null;
}

/** Продление на `days` от текущей даты окончания или от `nowMs`, если подписка уже истекла. */
export function extendDateInput(currentValue, days, nowMs) {
  return toDateInputValue(new Date(Math.max(nowMs, dateInputEndMs(currentValue)) + days * DAY_MS));
}
