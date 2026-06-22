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
