'use client';

import { useEffect, useState } from 'react';
import { normalizeSchedule, validSchedule, type ScheduleSlot } from '@/lib/day-schedule.js';
import { supabase } from '@/lib/supabase';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function DayScheduleEditor({ membershipId }: { membershipId: string }) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    supabase.rpc('get_member_schedule', { p_membership_id: membershipId }).then(({ data, error }) => {
      if (!active) return;
      if (error) { setLoadFailed(true); setMessage('No se pudo cargar el horario.'); }
      else { setSlots(normalizeSchedule(data)); setLoadFailed(false); setMessage(null); }
      setLoading(false);
    }).catch(() => { if (active) { setLoadFailed(true); setMessage('No se pudo cargar el horario.'); setLoading(false); } });
    return () => { active = false; };
  }, [membershipId, open]);

  function change(index: number, patch: Partial<ScheduleSlot>) {
    setSlots((current) => current.map((slot, position) => position === index ? { ...slot, ...patch } : slot));
    setMessage(null);
  }

  async function save() {
    if (!validSchedule(slots)) { setMessage('Revisa las horas y evita franjas solapadas del mismo tipo.'); return; }
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.rpc('save_member_schedule', { p_membership_id: membershipId, p_slots: slots });
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
      <div className="mt-3 flex gap-2"><button type="button" disabled={saving || slots.length >= 70} onClick={() => setSlots((current) => [...current, { day: 1, kind: 'gym', start: '09:00', end: '10:00' }])} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold disabled:opacity-50">Añadir franja</button><button type="button" disabled={saving || !validSchedule(slots)} onClick={() => void save()} className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar horario'}</button></div>
    </>}
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
    </>}
  </section>;
}
