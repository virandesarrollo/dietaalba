const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function minutes(time) {
  if (!TIME.test(time)) return NaN;
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function validSchedule(slots) {
  if (!Array.isArray(slots) || slots.length > 70) return false;
  const groups = new Map();
  for (const slot of slots) {
    if (!slot || !Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6 || !['gym', 'work'].includes(slot.kind)
      || typeof slot.start !== 'string' || typeof slot.end !== 'string' || !(minutes(slot.start) < minutes(slot.end))) return false;
    const key = `${slot.day}:${slot.kind}`;
    const ranges = groups.get(key) ?? [];
    ranges.push([minutes(slot.start), minutes(slot.end)]);
    groups.set(key, ranges);
  }
  return [...groups.values()].every((ranges) => {
    ranges.sort((a, b) => a[0] - b[0]);
    return ranges.every((range, index) => index === 0 || ranges[index - 1][1] <= range[0]);
  });
}

export function normalizeSchedule(value) {
  const slots = Array.isArray(value) ? value : Array.isArray(value?.slots) ? value.slots : null;
  return validSchedule(slots) ? slots : [];
}

export function daySchedule(slots, date) {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return normalizeSchedule(slots).filter((slot) => slot.day === weekday).sort((a, b) => a.start.localeCompare(b.start));
}

export function scheduleHours(slots) {
  return slots.reduce((total, slot) => ({ ...total, [slot.kind]: total[slot.kind] + minutes(slot.end) - minutes(slot.start) }), { gym: 0, work: 0 });
}

export function formatDuration(totalMinutes) {
  return `${Math.floor(totalMinutes / 60)} h ${String(totalMinutes % 60).padStart(2, '0')} min`;
}
