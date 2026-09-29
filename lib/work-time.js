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
