'use client';

import { useCallback, useEffect, useState } from 'react';
import { daySchedule, normalizeSchedule, scheduleHours } from '@/lib/day-schedule.js';
import { madridDateString } from '@/lib/historical-date.js';
import { formatWorkSeconds, isWorkday, remainingWorkSeconds } from '@/lib/work-time.js';
import { supabase } from '@/lib/supabase';

type WorkTime = { worked_seconds: number; active: boolean; day_off: boolean };

export function WorkTimeCard({ date, userId, onDayOffChange }: { date: string; userId: string; onDayOffChange: (date: string, dayOff: boolean) => void }) {
  const [goalMinutes, setGoalMinutes] = useState(0);
  const [time, setTime] = useState<WorkTime>({ worked_seconds: 0, active: false, day_off: false });
  const [showManual, setShowManual] = useState(false);
  const [manualStart, setManualStart] = useState('');
  const [manualEnd, setManualEnd] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [scheduleResult, timeResult] = await Promise.all([
      supabase.rpc('get_my_day_schedule', { p_date: date }),
      supabase.rpc('get_my_work_time', { p_date: date }),
    ]);
    if (scheduleResult.error || timeResult.error) throw new Error('No se pudo cargar el tiempo de trabajo.');
    return {
      goal: scheduleHours(daySchedule(normalizeSchedule(scheduleResult.data), date)).work,
      time: timeResult.data as WorkTime,
    };
  }, [date]);

  useEffect(() => {
    if (!isWorkday(date)) return;
    let active = true;
    void load().then((result) => {
      if (!active) return;
      setGoalMinutes(result.goal);
      setTime(result.time);
      onDayOffChange(date, result.time.day_off);
      setError(null);
      setLoadFailed(false);
    }).catch(() => { if (active) { setError('No se pudo cargar el tiempo de trabajo.'); setLoadFailed(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date, load, userId, onDayOffChange]);

  if (!isWorkday(date)) return null;
  const today = date === madridDateString();
  const remaining = time.day_off ? 0 : remainingWorkSeconds(goalMinutes, time.worked_seconds, false, 0);

  async function retryLoad() {
    setBusy(true);
    try {
      const refreshed = await load();
      setGoalMinutes(refreshed.goal);
      setTime(refreshed.time);
      onDayOffChange(date, refreshed.time.day_off);
      setLoadFailed(false);
      setError(null);
    } catch { setError('No se pudo cargar el tiempo de trabajo.'); }
    finally { setBusy(false); }
  }

  async function register(action: 'start_my_work_time' | 'stop_my_work_time') {
    if (!today || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.rpc(action);
      if (result.error) throw result.error;
      const refreshed = await load();
      setGoalMinutes(refreshed.goal);
      setTime(refreshed.time);
      onDayOffChange(date, refreshed.time.day_off);
    } catch { setError('No se pudo registrar la entrada o salida. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }

  async function setDayOff(dayOff: boolean) {
    if (!today || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.rpc('set_my_work_day_off', { p_date: date, p_day_off: dayOff });
      if (result.error) throw result.error;
      await retryLoad();
    } catch { setError('No se pudo cambiar el estado del día. Comprueba que no haya fichajes.'); }
    finally { setBusy(false); }
  }

  async function addManual() {
    if (!today || busy || !manualStart || !manualEnd || manualEnd <= manualStart) return;
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.rpc('add_my_work_session', { p_start: manualStart, p_end: manualEnd });
      if (result.error) throw result.error;
      setShowManual(false);
      setManualStart('');
      setManualEnd('');
      await retryLoad();
    } catch { setError('No se pudo añadir el fichaje. Revisa las horas y que no se solape con otro.'); }
    finally { setBusy(false); }
  }

  return <section className="mt-3 rounded-2xl border border-indigo-100 bg-white/85 p-4 text-sm shadow-sm" aria-label="Tiempo de trabajo restante">
    {loading ? <p className="mt-2 text-slate-500">Cargando tiempo…</p> : loadFailed ? null : <>
      <p className="text-center text-3xl font-bold tabular-nums text-indigo-700 sm:text-4xl">{time.day_off ? (today ? 'Hoy no se trabaja' : 'No se trabajó este día') : formatWorkSeconds(remaining)}</p>
      {today && !time.day_off && (goalMinutes > 0 || time.active) && <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy || time.active || goalMinutes === 0} onClick={() => void register('start_my_work_time')} className="min-h-11 flex-1 rounded-xl bg-indigo-600 px-4 font-semibold text-white disabled:opacity-40">Entrar</button>
        <button type="button" disabled={busy || !time.active} onClick={() => void register('stop_my_work_time')} className="min-h-11 flex-1 rounded-xl border border-indigo-200 px-4 font-semibold text-indigo-700 disabled:opacity-40">Salir</button>
      </div>}
      {today && <button type="button" disabled={busy} onClick={() => void setDayOff(!time.day_off)} className="mt-3 min-h-11 w-full rounded-xl border border-slate-200 px-4 font-semibold text-slate-600 disabled:opacity-40">{time.day_off ? 'Volver a trabajar hoy' : 'Hoy no se trabaja'}</button>}
      {today && !time.day_off && <button type="button" disabled={busy} onClick={() => setShowManual(!showManual)} className="mt-2 min-h-11 w-full rounded-xl border border-indigo-200 px-4 font-semibold text-indigo-700 disabled:opacity-40">Añadir fichaje manual</button>}
      {today && !time.day_off && showManual && <div className="mt-2 space-y-2 rounded-xl bg-indigo-50 p-3">
        <label className="block">Entrada <input type="time" value={manualStart} onChange={(event) => setManualStart(event.target.value)} className="ml-2 rounded border border-indigo-200 p-2" /></label>
        <label className="block">Salida <input type="time" value={manualEnd} onChange={(event) => setManualEnd(event.target.value)} className="ml-2 rounded border border-indigo-200 p-2" /></label>
        <button type="button" disabled={busy || !manualStart || !manualEnd || manualEnd <= manualStart} onClick={() => void addManual()} className="min-h-11 w-full rounded-xl bg-indigo-600 px-4 font-semibold text-white disabled:opacity-40">Guardar fichaje</button>
      </div>}
    </>}
    {error && <p role="alert" className="mt-2 text-rose-700">{error}</p>}
    {error && <button type="button" disabled={busy} onClick={() => void retryLoad()} className="mt-2 text-xs font-semibold text-indigo-700 disabled:opacity-40">Reintentar</button>}
  </section>;
}
