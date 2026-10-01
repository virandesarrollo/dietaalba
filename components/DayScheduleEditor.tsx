'use client';

import { useEffect, useState } from 'react';
import { normalizeSchedule, validSchedule, type ScheduleSlot } from '@/lib/day-schedule.js';
import { supabase } from '@/lib/supabase';
import { validCoffeeMinutes } from '@/lib/work-break.js';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function DayScheduleEditor({ membershipId }: { membershipId: string }) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [coffeeMinutes, setCoffeeMinutes] = useState('20');
  const [coffeeCountsAsWork, setCoffeeCountsAsWork] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    async function load() {
      try {
        const [schedule, coffee] = await Promise.all([
          supabase.rpc('get_member_schedule', { p_membership_id: membershipId }),
          supabase.rpc('get_member_work_break_settings', { p_membership_id: membershipId }),
        ]);
        if (!active) return;
        if (schedule.error || coffee.error || !validCoffeeMinutes(coffee.data?.minutes) || typeof coffee.data?.counts_as_work !== 'boolean') { setLoadFailed(true); setMessage('No se pudo cargar el horario y la configuración de café.'); }
        else {
          setSlots(normalizeSchedule(schedule.data));
          setCoffeeMinutes(String(coffee.data.minutes));
          setCoffeeCountsAsWork(coffee.data.counts_as_work);
          setLoadFailed(false); setMessage(null);
        }
      } catch {
        if (active) { setLoadFailed(true); setMessage('No se pudo cargar el horario.'); }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [membershipId, open]);

  function change(index: number, patch: Partial<ScheduleSlot>) {
    setSlots((current) => current.map((slot, position) => position === index ? { ...slot, ...patch } : slot));
    setMessage(null);
  }

  async function save() {
    if (saving || loadFailed || loading) return;
    if (!validSchedule(slots)) { setMessage('Revisa las horas y evita franjas solapadas del mismo tipo.'); return; }
    if (!validCoffeeMinutes(coffeeMinutes)) { setMessage('Indica minutos enteros entre 0 y 1440.'); return; }
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.rpc('save_member_schedule_with_break', {
        p_membership_id: membershipId, p_slots: slots,
        p_break_minutes: Number(coffeeMinutes), p_break_counts_as_work: coffeeCountsAsWork,
      });
      setMessage(error ? 'No se pudo guardar el horario.' : 'Horario guardado desde hoy.');
    } catch { setMessage('No se pudo guardar el horario.'); }
    finally { setSaving(false); }
  }

  return <section className="mt-4 border-t border-slate-100 pt-4" aria-label="Horario semanal">
    <button type="button" onClick={() => { if (!open) setLoading(true); setOpen(!open); }} aria-expanded={open} className="text-sm font-semibold text-indigo-700">{open ? 'Ocultar horario semanal' : 'Editar horario semanal'}</button>
    {open && <>
    <p className="mt-1 text-xs text-slate-500">Los cambios se aplican desde hoy. Las franjas deben acabar el mismo día.</p>
    {loading ? <p className="mt-2 text-xs">Cargando horario…</p> : loadFailed ? null : <>
      <div className="mt-3 space-y-2">{slots.map((slot, index) => <div key={index} className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <select aria-label={`Día de franja ${index + 1}`} disabled={saving} value={slot.day} onChange={(event) => change(index, { day: Number(event.target.value) })} className="min-h-10 rounded-lg bg-white px-2 text-xs">{DAYS.map((day, value) => <option key={day} value={value}>{day}</option>)}</select>
        <select aria-label={`Tipo de franja ${index + 1}`} disabled={saving} value={slot.kind} onChange={(event) => change(index, { kind: event.target.value as ScheduleSlot['kind'] })} className="min-h-10 rounded-lg bg-white px-2 text-xs"><option value="gym">Gimnasio</option><option value="work">Trabajo</option></select>
        <input aria-label={`Inicio de franja ${index + 1}`} disabled={saving} type="time" value={slot.start} onChange={(event) => change(index, { start: event.target.value })} className="min-h-10 rounded-lg bg-white px-2 text-xs" />
        <input aria-label={`Fin de franja ${index + 1}`} disabled={saving} type="time" value={slot.end} onChange={(event) => change(index, { end: event.target.value })} className="min-h-10 rounded-lg bg-white px-2 text-xs" />
        <button type="button" disabled={saving} onClick={() => setSlots((current) => current.filter((_, position) => position !== index))} className="min-h-10 rounded-lg bg-white px-2 text-xs text-rose-700">Quitar</button>
      </div>)}</div>
      <fieldset className="mt-4 space-y-3 rounded-xl border border-slate-100 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-800">Pausa de café</legend>
        <label className="flex flex-wrap items-center gap-3 text-sm text-slate-700">Límite diario (minutos)<input type="number" min="0" max="1440" step="1" value={coffeeMinutes} disabled={saving} onChange={(event) => { setCoffeeMinutes(event.target.value); setMessage(null); }} className="min-h-11 w-24 rounded-lg border border-slate-200 bg-white px-3" /></label>
        <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={coffeeCountsAsWork} disabled={saving} onChange={(event) => { setCoffeeCountsAsWork(event.target.checked); setMessage(null); }} />Cuenta como tiempo trabajado</label>
        <p className="text-xs text-slate-500">Solo se abona el tiempo realmente usado en pausas de café, hasta el límite diario. Lo que no uses no permite salir antes. Desactivado, las pausas se recuperan completas.</p>
      </fieldset>
      <div className="mt-3 flex gap-2"><button type="button" disabled={saving || slots.length >= 70} onClick={() => setSlots((current) => [...current, { day: 1, kind: 'gym', start: '09:00', end: '10:00' }])} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold disabled:opacity-50">Añadir franja</button><button type="button" disabled={saving || !validSchedule(slots) || !validCoffeeMinutes(coffeeMinutes)} onClick={() => void save()} className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar horario'}</button></div>
    </>}
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
    </>}
  </section>;
}
