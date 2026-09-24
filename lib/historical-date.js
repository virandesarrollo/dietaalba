const MADRID_TIME_ZONE = 'Europe/Madrid';

export function madridDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MADRID_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isHistoricalDate(value, today = madridDateString()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value < today;
}

export function isOutsideCorrectionWindow(value, today = madridDateString()) {
  const limit = new Date(`${today}T00:00:00`);
  limit.setDate(limit.getDate() - 2);
  return value < `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, '0')}-${String(limit.getDate()).padStart(2, '0')}`;
}
