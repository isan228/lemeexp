export function formatWatchDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (sec < 60) return `${sec} сек`;
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins} мин`;
  const hours = Math.floor(sec / 3600);
  const remMins = Math.round((sec % 3600) / 60);
  if (remMins === 0) return `${hours} ч`;
  return `${hours} ч ${remMins} мин`;
}

export function watchHoursLabel(totalSeconds) {
  const sec = Math.max(0, Number(totalSeconds) || 0);
  const hours = sec / 3600;
  if (hours < 1) {
    return `${Math.round(sec / 60)} мин`;
  }
  return `${hours.toFixed(1).replace(".", ",")} ч`;
}

const WEEKDAY_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export function emptyLast7Days() {
  const today = new Date().toISOString().slice(0, 10);
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    days.push({
      date,
      label: date === today ? "Сег" : WEEKDAY_LABELS[d.getUTCDay()],
      seconds: 0
    });
  }
  return days;
}

export function normalizeLast7Days(watchStats) {
  if (Array.isArray(watchStats?.last7Days) && watchStats.last7Days.length === 7) {
    return watchStats.last7Days;
  }
  return emptyLast7Days();
}
