'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { daySchedule, normalizeSchedule, scheduleHours } from '@/lib/day-schedule.js';
import { isOutsideCorrectionWindow, madridDateString } from '@/lib/historical-date.js';
import { calculatedWorkExit, formatWorkSeconds, isWorkday, remainingWorkSeconds, workCorrectionReason, workPunchEditRequest } from '@/lib/work-time.js';
import { supabase } from '@/lib/supabase';
import { coffeeCreditSeconds } from '@/lib/work-break.js';

type WorkTime = { worked_seconds: number; active: boolean; open?: boolean; day_off: boolean; coffee_seconds?: number; coffee_minutes?: number; coffee_counts_as_work?: boolean; sampled_at?: number };
type WorkPunch = { id?: string; started_at: string; ended_at: string | null; break_kind_after?: 'normal' | 'coffee' };

function formatPunchTime(value: string) {
  return new Date(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
}

export function WorkTimeCard({ date, userId, onDayOffChange }: { date: string; userId: string; onDayOffChange: (date: string, dayOff: boolean) => void }) {
  const [goalMinutes, setGoalMinutes] = useState(0);
  const [time, setTime] = useState<WorkTime>({ worked_seconds: 0, active: false, day_off: false });
  const [showManual, setShowManual] = useState(false);
  const [manualKind, setManualKind] = useState<'entry' | 'exit'>('entry');
  const [manualBreakKind, setManualBreakKind] = useState<'normal' | 'coffee'>('normal');
  const [manualTime, setManualTime] = useState('');
  const [editingPunch, setEditingPunch] = useState<WorkPunch | null>(null);
  const [showPunches, setShowPunches] = useState(false);
  const [punches, setPunches] = useState<WorkPunch[] | null>(null);
  const [punchError, setPunchError] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [punchKind, setPunchKind] = useState<'entry' | 'exit' | null>(null);
  const punchDialog = useRef<HTMLDialogElement>(null);
  const registering = useRef(false);

  useEffect(() => {
    if (punchKind && !punchDialog.current?.open) punchDialog.current?.showModal();
    else if (!punchKind) punchDialog.current?.close();
  }, [punchKind]);

  const load = useCallback(async () => {
    const scheduleResult = await supabase.rpc('get_my_day_schedule', { p_date: date });
    if (scheduleResult.error) throw new Error('No se pudo cargar el horario de trabajo.');
    const goal = scheduleHours(daySchedule(normalizeSchedule(scheduleResult.data), date)).work;
    if (goal === 0) return { goal, time: { worked_seconds: 0, active: false, day_off: false } as WorkTime };
    const timeResult = await supabase.rpc('get_my_work_time', { p_date: date });
    if (timeResult.error) throw new Error('No se pudo cargar el tiempo de trabajo.');
    return {
      goal,
      time: { ...timeResult.data, sampled_at: Date.now() } as WorkTime,
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
  const coffeeCredit = coffeeCreditSeconds(time.coffee_seconds, time.coffee_minutes, time.coffee_counts_as_work);
  const remaining = time.day_off ? 0 : remainingWorkSeconds(goalMinutes, time.worked_seconds + coffeeCredit, false, 0);
  const calculatedExit = today && time.active && !time.day_off ? calculatedWorkExit(remaining, time.sampled_at) : null;

  if (loading || (!loadFailed && goalMinutes === 0)) return null;

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

  async function register(breakKind: 'normal' | 'coffee') {
    if (!punchKind || date !== madridDateString() || busy || registering.current) return;
    registering.current = true;
    setBusy(true);
    setError(null);
    let saved = false;
    try {
      const result = await supabase.rpc('register_my_work_punch', { p_date: date, p_kind: punchKind, p_break_kind: breakKind });
      if (result.error) throw result.error;
      saved = true;
      setPunchKind(null);
      const refreshed = await load();
      setGoalMinutes(refreshed.goal);
      setTime(refreshed.time);
      onDayOffChange(date, refreshed.time.day_off);
      if (showPunches) await refreshPunches();
    } catch { setError(saved ? 'Fichaje guardado. No se pudo actualizar el resumen; pulsa Reintentar.' : 'No se pudo registrar la entrada o salida. Inténtalo de nuevo.'); }
    finally { registering.current = false; setBusy(false); }
  }

  async function setDayOff(dayOff: boolean) {
    if (!canCorrect || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.rpc('correct_my_work_day_off', { p_date: date, p_day_off: dayOff, p_reason: workCorrectionReason(correctionReason, dayOff ? 'day_off' : 'work_day') });
      if (result.error) throw result.error;
      await retryLoad();
    } catch { setError('No se pudo cambiar el estado del día. Inténtalo de nuevo.'); }
    finally { setBusy(false); }
  }

  async function addManual() {
    if (!canCorrect || busy || !manualTime) return;
    setBusy(true);
    setError(null);
    try {
      const params = { p_date: date, p_kind: manualKind, p_time: manualTime, p_reason: workCorrectionReason(correctionReason, manualKind) };
      const result = today
        ? await supabase.rpc('correct_my_work_punch_with_break', { ...params, p_break_kind: manualBreakKind })
        : await supabase.rpc('correct_my_work_punch', params);
      if (result.error) throw result.error;
      setShowManual(false);
      setManualTime('');
      await retryLoad();
      if (showPunches) await refreshPunches();
    } catch { setError('No se pudo añadir el fichaje. Revisa la hora y el orden de entradas y salidas.'); }
    finally { setBusy(false); }
  }

  function editPunch(punch: WorkPunch, kind: 'entry' | 'exit') {
    const value = kind === 'entry' ? punch.started_at : punch.ended_at;
    if (!today || time.day_off || busy || !punch.id || !value) return;
    setEditingPunch(punch);
    setManualKind(kind);
    setManualTime(formatPunchTime(value));
    setShowManual(true);
    setError(null);
  }

  async function savePunchEdit() {
    const request = workPunchEditRequest(date, editingPunch, manualKind, manualTime, madridDateString());
    if (!request || busy || time.day_off) return;
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.rpc('update_my_work_punch', request);
      if (result.error) throw result.error;
      setEditingPunch(null);
      setShowManual(false);
      setManualTime('');
      const refreshed = await load();
      setGoalMinutes(refreshed.goal);
      setTime(refreshed.time);
      onDayOffChange(date, refreshed.time.day_off);
      await refreshPunches();
    } catch { setError('No se pudo actualizar el fichaje. Revisa la hora, los solapes y si ha cambiado desde que lo abriste.'); }
    finally { setBusy(false); }
  }

  async function refreshPunches() {
    setPunches(null);
    setPunchError(false);
    const result = await supabase.rpc('get_my_work_punches', { p_date: date });
    if (result.error || !Array.isArray(result.data)) { setPunchError(true); return; }
    setPunches(result.data as WorkPunch[]);
  }

  async function togglePunches() {
    if (showPunches) { setShowPunches(false); return; }
    setShowPunches(true);
    await refreshPunches();
  }

  return <section className="mt-3 rounded-2xl border border-indigo-100 bg-white/85 p-4 text-sm shadow-sm" aria-label="Fichajes">
    {loading ? <p className="mt-2 text-slate-500">Cargando tiempo…</p> : loadFailed ? null : <>
      <div className="grid grid-cols-4 gap-2">
        <button type="button" aria-label="Entrar" title="Entrar" disabled={!today || !isWorkday(date) || time.day_off || !(goalMinutes > 0 || time.active) || busy || time.active || goalMinutes === 0} onClick={() => { setError(null); setPunchKind('entry'); }} className="min-h-11 rounded-xl bg-indigo-600 font-semibold text-white disabled:opacity-40">E</button>
        <button type="button" aria-label="Salir" title="Salir" disabled={!today || !isWorkday(date) || time.day_off || busy || !time.active} onClick={() => { setError(null); setPunchKind('exit'); }} className="min-h-11 rounded-xl border border-indigo-200 font-semibold text-indigo-700 disabled:opacity-40">S</button>
        <button type="button" aria-label={time.day_off ? 'Volver a trabajar' : 'No se trabaja'} title={time.day_off ? 'Volver a trabajar' : 'No se trabaja'} aria-pressed={time.day_off} disabled={!canCorrect || busy} onClick={() => void setDayOff(!time.day_off)} className={`min-h-11 rounded-xl border font-semibold disabled:opacity-40 ${time.day_off ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-slate-200 text-slate-600'}`}>N</button>
        <button type="button" aria-label="Añadir fichaje manual" title="Añadir fichaje manual" aria-expanded={showManual && !editingPunch && !time.day_off} disabled={!canCorrect || time.day_off || busy} onClick={() => { setEditingPunch(null); setManualTime(''); setManualBreakKind('normal'); setManualKind((time.open ?? time.active) ? 'exit' : 'entry'); setShowManual(editingPunch ? true : !showManual); }} className="min-h-11 rounded-xl border border-indigo-200 font-semibold text-indigo-700 disabled:opacity-40">+</button>
      </div>
      <button type="button" aria-expanded={showPunches} aria-controls="work-punch-list" onClick={() => void togglePunches()} className="mt-2 w-full text-center text-base font-extrabold tabular-nums text-indigo-700 underline decoration-indigo-200 underline-offset-4">{time.day_off ? (today ? 'Hoy no se trabaja' : 'No se trabajó este día') : `Falta: ${formatWorkSeconds(remaining)}`}</button>
      {today && !time.day_off && <p className="mt-1 text-center text-base font-bold tabular-nums text-indigo-700">Salida calculada: {calculatedExit ?? '—'}</p>}
      {!time.day_off && coffeeCredit > 0 && <p className="mt-1 text-center text-xs text-slate-500">Café contabilizado: {formatWorkSeconds(coffeeCredit)}</p>}
      {showPunches && <div id="work-punch-list" className="mt-3 rounded-xl bg-indigo-50 p-3">
        {punchError ? <p role="alert" className="text-rose-700">No se pudieron cargar los fichajes.</p> : punches === null ? <p className="text-slate-500">Cargando fichajes…</p> : punches.length === 0 ? <p className="text-slate-600">No hay fichajes este día.</p> :
          <ul className="space-y-3">{punches.map((punch, index) => <li key={`${punch.started_at}-${index}`} className="grid grid-cols-2 gap-2 rounded-xl bg-white p-3">
            <button type="button" aria-label={`Editar entrada ${formatPunchTime(punch.started_at)}`} disabled={!today || time.day_off || busy || !punch.id} onClick={() => editPunch(punch, 'entry')} className="min-h-11 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 enabled:hover:bg-indigo-50"><span className="block text-sm text-slate-500">Entrada</span><strong className="text-2xl font-bold tabular-nums text-indigo-800">{formatPunchTime(punch.started_at)}</strong></button>
            <button type="button" aria-label={punch.ended_at ? `Editar salida ${formatPunchTime(punch.ended_at)}` : 'Salida pendiente'} disabled={!today || time.day_off || busy || !punch.id || !punch.ended_at} onClick={() => editPunch(punch, 'exit')} className="min-h-11 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 enabled:hover:bg-indigo-50"><span className="block text-sm text-slate-500">Salida</span><strong className="text-2xl font-bold tabular-nums text-indigo-800">{punch.ended_at ? formatPunchTime(punch.ended_at) : 'En curso'}</strong></button>
            {punch.ended_at && punch.break_kind_after === 'coffee' && <span className="col-span-2 text-xs font-semibold text-indigo-700">Pausa de café</span>}
          </li>)}</ul>}
      </div>}
      {canCorrect && historical && <label className="mt-3 block text-slate-600">Motivo de la corrección (opcional) <input type="text" maxLength={200} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3" /></label>}
      {canCorrect && !time.day_off && showManual && (!editingPunch || today) && <div className="mt-2 space-y-2 rounded-xl bg-indigo-50 p-3">
        {editingPunch ? <p className="font-semibold">Editar {manualKind === 'entry' ? 'entrada' : 'salida'}</p> : <fieldset className="flex gap-4"><legend className="mb-1 font-semibold">Tipo de fichaje</legend>
          <label className="flex min-h-11 items-center gap-2"><input type="radio" name="manual-work-kind" checked={manualKind === 'entry'} onChange={() => setManualKind('entry')} /> Entrada</label>
          <label className="flex min-h-11 items-center gap-2"><input type="radio" name="manual-work-kind" checked={manualKind === 'exit'} onChange={() => setManualKind('exit')} /> Salida</label>
        </fieldset>}
        {!editingPunch && today && <fieldset disabled={busy} className="flex gap-4"><legend className="mb-1 font-semibold">Tipo de pausa</legend>
          <label className="flex min-h-11 items-center gap-2"><input type="radio" name="manual-work-break" checked={manualBreakKind === 'normal'} onChange={() => setManualBreakKind('normal')} /> Normal</label>
          <label className="flex min-h-11 items-center gap-2"><input type="radio" name="manual-work-break" checked={manualBreakKind === 'coffee'} onChange={() => setManualBreakKind('coffee')} /> Café</label>
        </fieldset>}
        <label className="flex min-h-11 items-center gap-2">Hora <input key={`${editingPunch?.id ?? 'new'}-${manualKind}`} autoFocus={!!editingPunch} disabled={busy} type="time" value={manualTime} onChange={(event) => setManualTime(event.target.value)} className="rounded border border-indigo-200 p-2" /></label>
        <button type="button" disabled={busy || !manualTime} onClick={() => void (editingPunch ? savePunchEdit() : addManual())} className="min-h-11 w-full rounded-xl bg-indigo-600 px-4 font-semibold text-white disabled:opacity-40">{editingPunch ? 'Guardar cambios' : 'Guardar fichaje'}</button>
        <button type="button" disabled={busy} onClick={() => { setEditingPunch(null); setShowManual(false); setManualTime(''); }} className="min-h-11 w-full rounded-xl border border-indigo-200 px-4 font-semibold text-indigo-700 disabled:opacity-40">Cancelar</button>
      </div>}
    </>}
    {error && <p role="alert" className="mt-2 text-rose-700">{error}</p>}
    {error && <button type="button" disabled={busy} onClick={() => void retryLoad()} className="mt-2 text-xs font-semibold text-indigo-700 disabled:opacity-40">Reintentar</button>}
    <dialog ref={punchDialog} aria-label={punchKind === 'entry' ? 'Registrar entrada' : 'Registrar salida'} onCancel={(event) => { if (registering.current) event.preventDefault(); }} onClose={() => setPunchKind(null)} className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-2xl border border-slate-100 bg-white p-5 text-slate-800 shadow-xl backdrop:bg-slate-950/60">
      <h2 className="text-lg font-bold">{punchKind === 'entry' ? 'Registrar entrada' : 'Registrar salida'}</h2>
      <p className="mt-2 text-sm text-slate-500">{punchKind === 'entry' ? 'Elige Café si vuelves de esa pausa. La primera entrada del día no genera descanso.' : 'Elige Café si sales a tomar esa pausa.'}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" autoFocus disabled={busy} onClick={() => void register('normal')} className="min-h-12 rounded-xl border border-indigo-200 px-4 font-semibold text-indigo-700 disabled:opacity-40">Normal</button>
        <button type="button" disabled={busy} onClick={() => void register('coffee')} className="min-h-12 rounded-xl bg-indigo-600 px-4 font-semibold text-white disabled:opacity-40">Café</button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      <button type="button" disabled={busy} onClick={() => setPunchKind(null)} className="mt-3 min-h-11 w-full rounded-xl text-sm font-semibold text-slate-600 disabled:opacity-40">Cancelar</button>
    </dialog>
  </section>;
}
