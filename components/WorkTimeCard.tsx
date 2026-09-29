'use client';

import { useCallback, useEffect, useState } from 'react';
import { daySchedule, normalizeSchedule, scheduleHours } from '@/lib/day-schedule.js';
import { madridDateString } from '@/lib/historical-date.js';
import { formatWorkSeconds, isWorkday, remainingWorkSeconds } from '@/lib/work-time.js';
import { supabase } from '@/lib/supabase';

type WorkTime = { worked_seconds: number; active: boolean };

export function WorkTimeCard({ date, userId }: { date: string; userId: string }) {
  const [goalMinutes, setGoalMinutes] = useState(0);
  const [time, setTime] = useState<WorkTime>({ worked_seconds: 0, active: false });
  const [loadedAt, setLoadedAt] = useState(0);
  const [now, setNow] = useState(0);
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
      setLoadedAt(Date.now());
      setNow(Date.now());
      setError(null);
      setLoadFailed(false);
    }).catch(() => { if (active) { setError('No se pudo cargar el tiempo de trabajo.'); setLoadFailed(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date, load, userId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!isWorkday(date)) return null;
  const today = date === madridDateString(new Date(now));
  const elapsed = time.active && today ? Math.max(0, Math.floor((now - loadedAt) / 1000)) : 0;
  const remaining = remainingWorkSeconds(goalMinutes, time.worked_seconds, time.active && today, elapsed);

  async function retryLoad() {
    setBusy(true);
    try {
      const refreshed = await load();
      setGoalMinutes(refreshed.goal);
      setTime(refreshed.time);
      setLoadedAt(Date.now());
      setNow(Date.now());
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
      setLoadedAt(Date.now());
      setNow(Date.now());
    } catch { setError('No se pudo registrar la entrada o salida. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }

  return <section className="mt-3 rounded-2xl border border-indigo-100 bg-white/85 p-4 text-sm shadow-sm" aria-label="Tiempo de trabajo restante">
    {loading ? <p className="mt-2 text-slate-500">Cargando tiempo…</p> : loadFailed ? null : <>
      <p className="text-center text-3xl font-bold tabular-nums text-indigo-700 sm:text-4xl">{formatWorkSeconds(remaining)}</p>
      {today && (goalMinutes > 0 || time.active) && <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy || time.active || goalMinutes === 0} onClick={() => void register('start_my_work_time')} className="min-h-11 flex-1 rounded-xl bg-indigo-600 px-4 font-semibold text-white disabled:opacity-40">Entrar</button>
        <button type="button" disabled={busy || !time.active} onClick={() => void register('stop_my_work_time')} className="min-h-11 flex-1 rounded-xl border border-indigo-200 px-4 font-semibold text-indigo-700 disabled:opacity-40">Salir</button>
      </div>}
    </>}
    {error && <p role="alert" className="mt-2 text-rose-700">{error}</p>}
    {error && <button type="button" disabled={busy} onClick={() => void retryLoad()} className="mt-2 text-xs font-semibold text-indigo-700 disabled:opacity-40">Reintentar</button>}
  </section>;
}
