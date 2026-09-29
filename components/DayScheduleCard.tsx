import { daySchedule, formatDuration, scheduleHours, type ScheduleSlot } from '@/lib/day-schedule.js';

export function DayScheduleCard({ date, slots, loading, error }: { date: string; slots: ScheduleSlot[]; loading: boolean; error: string | null }) {
  const today = daySchedule(slots, date);
  const totals = scheduleHours(today);
  return <section id="day-schedule" className="mt-4 rounded-3xl border border-indigo-100 bg-white p-4 shadow-sm" aria-label="Horario de Mi día">
    <h2 className="font-bold text-slate-800">Mi horario</h2>
    {loading ? <p className="mt-2 text-sm text-slate-500">Cargando horario…</p> : error ? <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p> : <>
      {today.length === 0 ? <p className="mt-2 text-sm text-slate-500">Sin gimnasio ni trabajo programados.</p> : <ul className="mt-3 space-y-2">{today.map((slot, index) => <li key={`${slot.kind}-${slot.start}-${index}`} className="flex justify-between gap-3 rounded-xl bg-indigo-50 px-3 py-2 text-sm"><span>{slot.kind === 'gym' ? 'Gimnasio' : 'Trabajo'}</span><strong>{slot.start}–{slot.end}</strong></li>)}</ul>}
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><p className="rounded-xl bg-rose-50 p-3">Entrenas <strong className="block">{formatDuration(totals.gym)}</strong></p><p className="rounded-xl bg-slate-50 p-3">Trabajas <strong className="block">{formatDuration(totals.work)}</strong></p></div>
    </>}
  </section>;
}
