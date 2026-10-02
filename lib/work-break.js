export function validCoffeeMinutes(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return false;
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440;
}

export function coffeeCreditSeconds(seconds, maximumMinutes, countsAsWork) {
  if (countsAsWork !== true || !Number.isFinite(seconds) || seconds <= 0 || !validCoffeeMinutes(maximumMinutes)) return 0;
  return Math.min(Math.floor(seconds), Number(maximumMinutes) * 60);
}

export function coffeeCountdownSeconds(time, now) {
  if (time.active || time.open || time.day_off || !time.coffee_started_at || !validCoffeeMinutes(time.coffee_minutes)) return null;
  const startedAt = Date.parse(time.coffee_started_at);
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) return null;
  const consumed = Number.isFinite(time.coffee_seconds) ? Math.max(0, Math.floor(time.coffee_seconds)) : 0;
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  return Math.max(0, Number(time.coffee_minutes) * 60 - consumed - elapsed);
}
