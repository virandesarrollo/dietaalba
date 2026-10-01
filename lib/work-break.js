export function validCoffeeMinutes(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return false;
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440;
}

export function coffeeCreditSeconds(seconds, maximumMinutes, countsAsWork) {
  if (countsAsWork !== true || !Number.isFinite(seconds) || seconds <= 0 || !validCoffeeMinutes(maximumMinutes)) return 0;
  return Math.min(Math.floor(seconds), Number(maximumMinutes) * 60);
}
