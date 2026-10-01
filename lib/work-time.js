export function isWorkday(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

export function remainingWorkSeconds(goalMinutes, workedSeconds, active, elapsedSeconds) {
  return Math.max(0, goalMinutes * 60 - workedSeconds - (active ? elapsedSeconds : 0));
}

export function formatWorkSeconds(seconds) {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  return `${hours} h ${String(minutes).padStart(2, '0')} min ${String(wholeSeconds % 60).padStart(2, '0')} s`;
}

export function calculatedWorkExit(remainingSeconds, sampledAt) {
  if (!Number.isFinite(remainingSeconds) || !Number.isFinite(sampledAt)) return null;
  return new Date(sampledAt + Math.max(0, remainingSeconds) * 1000).toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Madrid',
  });
}

export function workPunchEditRequest(date, punch, kind, time, today) {
  if (date !== today || !punch?.id || !['entry', 'exit'].includes(kind) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const previous = kind === 'entry' ? punch.started_at : punch.ended_at;
  if (!previous) return null;
  return { p_date: date, p_session_id: punch.id, p_kind: kind, p_time: time, p_expected_at: previous };
}

export function workCorrectionReason(reason, action) {
  const written = typeof reason === 'string' ? reason.trim() : '';
  if (written.length >= 3) return written;
  if (written) return `Corrección: ${written}`;
  return {
    day_off: 'Se corrigió el día como no laborable',
    work_day: 'Se corrigió el día como laborable',
    entry: 'Se añadió una entrada manual',
    exit: 'Se añadió una salida manual',
  }[action];
}
