'use client';

import { useCallback, useEffect, useState } from 'react';
import { daySchedule, normalizeSchedule, scheduleHours } from '@/lib/day-schedule.js';
import { isOutsideCorrectionWindow, madridDateString } from '@/lib/historical-date.js';
import { formatWorkSeconds, isWorkday, remainingWorkSeconds } from '@/lib/work-time.js';
import { supabase } from '@/lib/supabase';

type WorkTime = { worked_seconds: number; active: boolean; open?: boolean; day_off: boolean };

export function WorkTimeCard({ date, userId, onDayOffChange }: { date: string; userId: string; onDayOffChange: (date: string, dayOff: boolean) => void }) {
  const [goalMinutes, setGoalMinutes] = useState(0);
  const [time, setTime] = useState<WorkTime>({ worked_seconds: 0, active: false, day_off: false });
  const [showManual, setShowManual] = useState(false);
  const [manualKind, setManualKind] = useState<'entry' | 'exit'>('entry');
  const [manualTime, setManualTime] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
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

  const today = date === madridDateString();
  const historical = date < madridDateString();
  const canCorrect = date <= madridDateString() && !isOutsideCorrectionWindow(date);
  const reasonMissing = historical && correctionReason.trim().length < 3;
  const remaining = time.day_off ? 0 : remainingWorkSeconds(goalMinutes, time.worked_seconds, false, 0);

  if (!isWorkday(date) && !loading && !canCorrect && goalMinutes === 0 && time.worked_seconds === 0 && !time.day_off && !time.open) return null;

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
    if (!canCorrect || reasonMissing || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.rpc('correct_my_work_day_off', { p_date: date, p_day_off: dayOff, p_reason: correctionReason.trim() });
      if (result.error) throw result.error;
      await retryLoad();
    } catch { setError('No se pudo cambiar el estado del día. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }

  async function addManual() {
    if (!canCorrect || reasonMissing || busy || !manualTime) return;
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.rpc('correct_my_work_punch', { p_date: date, p_kind: manualKind, p_time: manualTime, p_reason: correctionReason.trim() });
      if (result.error) throw result.error;
      setShowManual(false);
      setManualTime('');
      await retryLoad();
    } catch { setError('No se pudo añadir el fichaje. Revisa la hora y el orden de entradas y salidas.'); }
    finally { setBusy(false); }
  }

  return <section className="mt-3 rounded-2xl border border-indigo-100 bg-white/85 p-4 text-sm shadow-sm" aria-label="Tiempo de trabajo restante">
    {loading ? <p className="mt-2 text-slate-500">Cargando tiempo…</p> : loadFailed ? null : <>
      <p className="text-center text-3xl font-bold tabular-nums text-indigo-700 sm:text-4xl">{time.day_off ? (today ? 'Hoy no se trabaja' : 'No se trabajó este día') : formatWorkSeconds(remaining)}</p>
      {today && isWorkday(date) && !time.day_off && (goalMinutes > 0 || time.active) && <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy || time.active || goalMinutes === 0} onClick={() => void register('start_my_work_time')} className="min-h-11 flex-1 rounded-xl bg-indigo-600 px-4 font-semibold text-white disabled:opacity-40">Entrar</button>
        <button type="button" disabled={busy || !time.active} onClick={() => void register('stop_my_work_time')} className="min-h-11 flex-1 rounded-xl border border-indigo-200 px-4 font-semibold text-indigo-700 disabled:opacity-40">Salir</button>
      </div>}
      {canCorrect && historical && <label className="mt-3 block text-slate-600">Motivo de la corrección <input type="text" maxLength={200} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3" /></label>}
      {canCorrect && <button type="button" disabled={busy || reasonMissing} onClick={() => void setDayOff(!time.day_off)} className="mt-3 min-h-11 w-full rounded-xl border border-slate-200 px-4 font-semibold text-slate-600 disabled:opacity-40">{time.day_off ? 'Volver a trabajar este día' : historical ? 'Este día no se trabajó' : 'Hoy no se trabaja'}</button>}
      {canCorrect && !time.day_off && <button type="button" disabled={busy} onClick={() => { setManualKind((time.open ?? time.active) ? 'exit' : 'entry'); setShowManual(!showManual); }} className="mt-2 min-h-11 w-full rounded-xl border border-indigo-200 px-4 font-semibold text-indigo-700 disabled:opacity-40">Añadir fichaje manual</button>}
      {canCorrect && !time.day_off && showManual && <div className="mt-2 space-y-2 rounded-xl bg-indigo-50 p-3">
        <fieldset className="flex gap-4"><legend className="mb-1 font-semibold">Tipo de fichaje</legend>
          <label className="flex min-h-11 items-center gap-2"><input type="radio" name="manual-work-kind" checked={manualKind === 'entry'} onChange={() => setManualKind('entry')} /> Entrada</label>
          <label className="flex min-h-11 items-center gap-2"><input type="radio" name="manual-work-kind" checked={manualKind === 'exit'} onChange={() => setManualKind('exit')} /> Salida</label>
        </fieldset>
        <label className="flex min-h-11 items-center gap-2">Hora <input type="time" value={manualTime} onChange={(event) => setManualTime(event.target.value)} className="rounded border border-indigo-200 p-2" /></label>
        <button type="button" disabled={busy || !manualTime || reasonMissing} onClick={() => void addManual()} className="min-h-11 w-full rounded-xl bg-indigo-600 px-4 font-semibold text-white disabled:opacity-40">Guardar fichaje</button>
      </div>}
    </>}
    {error && <p role="alert" className="mt-2 text-rose-700">{error}</p>}
    {error && <button type="button" disabled={busy} onClick={() => void retryLoad()} className="mt-2 text-xs font-semibold text-indigo-700 disabled:opacity-40">Reintentar</button>}
  </section>;
}
