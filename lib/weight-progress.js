import { madridDateString } from './historical-date.js';

const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const time = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const formatDate = (date) => date.split('-').reverse().join('/');
const shiftDate = (date, days) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export function weightProgressDates(period, today = madridDateString()) {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return { start: period === 'month' ? `${today.slice(0, 7)}-01` : shiftDate(today, -((weekday + 6) % 7)), end: today };
}

function madridMidnight(date) {
  const utc = new Date(`${date}T00:00:00Z`);
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: 'numeric', hourCycle: 'h23' }).format(utc);
  return new Date(utc.getTime() - Number(hour) * 3600000).toISOString();
}

export function weightProgressQueryRange(today = madridDateString()) {
  const week = weightProgressDates('week', today).start;
  const month = weightProgressDates('month', today).start;
  return { start: madridMidnight(week < month ? week : month), end: madridMidnight(shiftDate(today, 1)) };
}

export function summarizeWeightProgress(rows, period, today = madridDateString()) {
  const { start, end } = weightProgressDates(period, today);
  const measurements = rows
    .filter((row) => Number.isFinite(row.weight_kg) && row.weight_kg > 0 && Number.isFinite(Date.parse(row.recorded_at)))
    .map((row) => ({ date: madridDateString(new Date(row.recorded_at)), recordedAt: row.recorded_at, value: row.weight_kg }))
    .filter(({ date }) => date >= start && date <= end)
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  const change = measurements.length < 2 ? null : Number((measurements.at(-1).value - measurements[0].value).toFixed(2));
  return { period, start, end, measurements, change };
}

export function formatWeightProgressChange(change) {
  return change === null ? 'Se necesitan dos mediciones para calcular el cambio.' : `${change > 0 ? '+' : ''}${number.format(change)} kg`;
}

export function formatWeightProgressShare(summary) {
  return [
    `Progreso de peso · ${summary.period === 'week' ? 'Semana actual' : 'Mes actual'}`,
    `${formatDate(summary.start)} – ${formatDate(summary.end)}`,
    ...summary.measurements.map(({ date, recordedAt, value }) => `${formatDate(date)} ${time.format(new Date(recordedAt))}: ${number.format(value)} kg`),
    summary.measurements.length ? `Cambio: ${formatWeightProgressChange(summary.change)}` : 'Sin mediciones de peso en este período.',
  ].join('\n');
}

export async function copyWeightProgress(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const field = document.createElement('textarea');
  const previousFocus = document.activeElement;
  field.value = text;
  field.style.position = 'fixed';
  field.style.left = '-9999px';
  document.body.appendChild(field);
  try {
    field.focus();
    field.select();
    if (!document.execCommand('copy')) throw new Error('No se pudo copiar');
  } finally {
    field.remove();
    previousFocus?.focus?.();
  }
}
