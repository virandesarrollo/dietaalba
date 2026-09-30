export function rankSourceDays(days, selectedDate, mode, today) {
  const target = Date.parse(`${selectedDate}T00:00:00Z`);
  return days
    .filter((day) => mode !== 'swap' || day.date >= today)
    .sort((left, right) => {
      const leftDistance = Math.abs(Date.parse(`${left.date}T00:00:00Z`) - target);
      const rightDistance = Math.abs(Date.parse(`${right.date}T00:00:00Z`) - target);
      return leftDistance - rightDistance || left.date.localeCompare(right.date);
    });
}
