'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';

type Craving = { id: string; text: string; kcal: number | null };
const fieldClass = 'min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-800 disabled:opacity-50';
const buttonClass = 'min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold disabled:opacity-40';

export function AdminPersonalCravings({ patientId }: { patientId: string }) {
  const [items, setItems] = useState<Craving[]>([]);
  const [loadedPatientId, setLoadedPatientId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [kcal, setKcal] = useState('');
  const [deleting, setDeleting] = useState<Craving | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const mountedRef = useRef(true);
  const patientRef = useRef(patientId);
  const busyRef = useRef(false);
  const ready = loadedPatientId === patientId && !loading;
  const disabled = !ready || saving;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    patientRef.current = patientId;
    async function load() {
      setLoading(true);
      setLoadedPatientId('');
      setError('');
      try {
        const { data, error: loadError } = await supabase.rpc('get_patient_personal_cravings', { p_patient_id: patientId });
        if (!active) return;
        if (loadError || !Array.isArray(data)) throw new Error('load');
        setItems(data as Craving[]);
        setLoadedPatientId(patientId);
      } catch {
        if (active) { setItems([]); setError('No se pudieron cargar los picoteos habituales.'); }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; patientRef.current = ''; };
  }, [patientId, retryKey]);

  function cancelEditing() { setEditingId(null); setText(''); setKcal(''); }

  async function mutate(rpc: string, params: Record<string, unknown>, success: string) {
    if (disabled || busyRef.current || patientRef.current !== patientId) return;
    busyRef.current = true;
    setSaving(true); setError(''); setMessage('');
    try {
      const { error: mutationError } = await supabase.rpc(rpc, { p_patient_id: patientId, ...params });
      if (!mountedRef.current || patientRef.current !== patientId) return;
      if (mutationError) {
        setError(mutationError.code === '23505' ? 'Ya existe un picoteo habitual con ese nombre.' : 'No se pudo guardar el cambio. Inténtalo de nuevo.');
        return;
      }
      cancelEditing(); setDeleting(null); setMessage(success);
      setLoading(true); setRetryKey(key => key + 1);
    } catch {
      if (mountedRef.current && patientRef.current === patientId) setError('No se pudo guardar el cambio. Inténtalo de nuevo.');
    } finally {
      busyRef.current = false;
      if (mountedRef.current && patientRef.current === patientId) setSaving(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const value = kcal.trim() === '' ? null : Number(kcal);
    if (!text.trim() || text.trim().length > 500) { setError('Introduce un nombre de hasta 500 caracteres.'); return; }
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > 10000)) {
      setError('Las kcal deben estar entre 0 y 10.000 y ser un número entero.'); return;
    }
    await mutate('save_patient_personal_craving', { p_id: editingId, p_text: text.trim(), p_kcal: value }, 'Picoteo habitual guardado.');
  }

  async function remove() {
    if (deleting) await mutate('delete_patient_personal_craving', { p_id: deleting.id }, 'Picoteo retirado del catálogo. Su historial se conserva.');
  }

  function renderForm() {
    return <form onSubmit={save} aria-label={editingId ? 'Editar picoteo habitual' : 'Añadir picoteo habitual'} className="mt-4 grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]">
      <label className="grid gap-1 text-xs font-semibold text-slate-500">Nombre del picoteo<input aria-label="Nombre del picoteo" value={text} onChange={event => setText(event.target.value)} maxLength={500} required disabled={disabled} className={fieldClass} /></label>
      <label className="grid gap-1 text-xs font-semibold text-slate-500">Kcal (opcional)<input aria-label="Kcal del picoteo habitual" type="number" value={kcal} onChange={event => setKcal(event.target.value)} min="0" max="10000" step="1" disabled={disabled} className={fieldClass} /></label>
      <div className="flex items-end gap-2">
        {editingId && <button type="button" disabled={disabled} onClick={cancelEditing} className={buttonClass}>Cancelar edición</button>}
        <button type="submit" disabled={disabled || !text.trim()} className={`${buttonClass} bg-slate-800 text-white`}>{saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Añadir picoteo'}</button>
      </div>
    </form>;
  }

  return <details className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <summary className="min-h-11 cursor-pointer text-lg font-bold text-slate-800">Picoteos habituales</summary>
    <p className="mt-2 text-sm text-slate-500">Gestiona el catálogo personal de este usuario. Los picoteos registrados se conservan en el historial de comidas aunque cambies o borres entradas del catálogo.</p>
    {loading && <p role="status" className="mt-3 text-sm text-slate-500">Cargando picoteos…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {!loading && !ready && <button type="button" onClick={() => setRetryKey(key => key + 1)} className={`${buttonClass} mt-3`}>Reintentar</button>}
    {message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
    {ready && <ul className="mt-4 space-y-2">
      {[...items].sort((a, b) => a.text.localeCompare(b.text, 'es', { sensitivity: 'base' })).map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
        <span className="min-w-0 break-words text-sm font-semibold text-slate-700">{item.text}{item.kcal !== null && <span className="ml-2 text-xs font-normal text-slate-500">{item.kcal} kcal</span>}</span>
        <span className="flex gap-2">
          <button type="button" disabled={disabled} aria-label={`Editar ${item.text}`} onClick={() => { setEditingId(item.id); setText(item.text); setKcal(item.kcal === null ? '' : String(item.kcal)); setDeleting(null); setError(''); setMessage(''); }} className={buttonClass}>Editar</button>
          <button type="button" disabled={disabled} aria-label={`Borrar ${item.text} del catálogo`} onClick={() => { setDeleting(item); setError(''); setMessage(''); }} className={`${buttonClass} text-red-700`}>Borrar</button>
        </span>
        {editingId === item.id && renderForm()}
      </li>)}
      {items.length === 0 && <li className="text-sm text-slate-500">Este usuario aún no tiene picoteos habituales.</li>}
    </ul>}
    {ready && deleting && <div className="mt-4 rounded-2xl border border-red-200 p-4" role="alertdialog" aria-label="Confirmar borrado del catálogo">
      <p className="text-sm text-slate-700">¿Retirar «{deleting.text}» del catálogo? Los registros del historial se conservarán.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={saving} onClick={() => setDeleting(null)} className={buttonClass}>Cancelar borrado</button>
        <button type="button" disabled={saving} onClick={remove} className={`${buttonClass} text-red-700`}>Confirmar borrado</button>
      </div>
    </div>}
    {!editingId && renderForm()}
  </details>;
}
