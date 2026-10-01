export function formatTodaySummary(date, slots, exercises, canViewSchedule = true, canViewTraining = true) {
  const [year, month, day] = date.split('-').map(Number);
  const label = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const schedule = [...slots].sort((a, b) => a.start.localeCompare(b.start))
    .map((slot) => `${slot.kind === 'gym' ? 'Gimnasio' : 'Trabajo'} de ${slot.start} a ${slot.end}.`);
  return [`Hoy, ${label}.`, ...(canViewSchedule ? schedule.length ? schedule : ['Sin horarios programados.'] : ['Horario no disponible.']),
    canViewTraining ? exercises.length ? `Entrenamiento previsto: ${exercises.join(', ')}.` : 'Sin entrenamiento previsto.' : 'Entrenamiento no disponible.'].join(' ');
}
