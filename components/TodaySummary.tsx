'use client';

import { useEffect, useState } from 'react';
import { daySchedule, normalizeSchedule, type ScheduleSlot } from '@/lib/day-schedule.js';
import { formatTodaySummary } from '@/lib/today-summary.js';
import { supabase } from '@/lib/supabase';

export function TodaySummary({ date, userId, canViewSchedule, canViewTraining }: { date: string; userId: string; canViewSchedule: boolean; canViewTraining: boolean }) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [exercises, setExercises] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      const [schedule, training] = await Promise.all([
        canViewSchedule ? supabase.rpc('get_my_day_schedule', { p_date: date }) : Promise.resolve(null),
        canViewTraining ? supabase.from('gym_workout_exercises').select('exercise_name_snapshot, position').eq('user_id', userId).eq('workout_date', date).order('position') : Promise.resolve(null),
      ]);
      if (!active) return;
      if (schedule?.error || training?.error) setError('No se pudo cargar todo el resumen de hoy.');
      setSlots(schedule?.error ? [] : daySchedule(normalizeSchedule(schedule?.data), date));
      setExercises(training?.error ? [] : (training?.data ?? []).map((item) => item.exercise_name_snapshot));
      setLoading(false);
    }
    void load().catch(() => { if (active) { setError('No se pudo cargar el resumen de hoy.'); setLoading(false); } });
    return () => { active = false; window.speechSynthesis?.cancel(); };
  }, [open, date, userId, canViewSchedule, canViewTraining]);

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }

  function speak() {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) { setAudioError(true); return; }
    if (speaking) { stopSpeaking(); return; }
    const utterance = new SpeechSynthesisUtterance(formatTodaySummary(date, slots, exercises, canViewSchedule, canViewTraining));
    utterance.lang = 'es-ES';
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  return <>
    <button type="button" aria-label="Ver resumen de hoy" aria-expanded={open} onClick={() => { if (open) stopSpeaking(); setOpen(!open); }} className="min-h-10 rounded-xl bg-white/70 px-3 text-sm font-bold text-pink-600">HOY</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { stopSpeaking(); setOpen(false); } }}>
      <section role="dialog" aria-modal="true" aria-label="Resumen de hoy" className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold text-slate-800">Hoy</h2><button type="button" aria-label="Cerrar resumen" onClick={() => { stopSpeaking(); setOpen(false); }} className="min-h-10 min-w-10 rounded-xl bg-slate-100 text-slate-700">✕</button></div>
        {loading ? <p className="mt-4 text-sm text-slate-500">Cargando resumen…</p> : <>
          {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
          <h3 className="mt-4 font-semibold text-slate-700">Horarios</h3>
          {!canViewSchedule ? <p className="mt-2 text-sm text-slate-500">Horario no disponible.</p> : slots.length ? <ul className="mt-2 space-y-2">{slots.map((slot, index) => <li key={`${slot.kind}-${slot.start}-${index}`} className="rounded-xl bg-indigo-50 p-3 text-sm">{slot.kind === 'gym' ? 'Gimnasio' : 'Trabajo'}: {slot.start}–{slot.end}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Sin horarios programados.</p>}
          <h3 className="mt-4 font-semibold text-slate-700">Entrenamiento previsto</h3>
          {!canViewTraining ? <p className="mt-2 text-sm text-slate-500">Entrenamiento no disponible.</p> : exercises.length ? <ol className="mt-2 list-inside list-decimal space-y-1 text-sm">{exercises.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ol> : <p className="mt-2 text-sm text-slate-500">Sin entrenamiento previsto.</p>}
          <button type="button" onClick={speak} disabled={!!error || (!canViewSchedule && !canViewTraining)} className="mt-5 min-h-11 rounded-xl bg-pink-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{speaking ? 'Detener audio' : 'Escuchar'}</button>
          {audioError && <p role="alert" className="mt-2 text-sm text-rose-700">Este navegador no permite reproducir el resumen en voz alta.</p>}
        </>}
      </section>
    </div>}
  </>;
}
