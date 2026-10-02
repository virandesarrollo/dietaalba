'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

type Craving = { id: string; text: string; kcal: number | null };
type Props = { cravings: readonly Craving[]; value: string; showCalories: boolean; onSelect: (craving: Craving) => void };

function searchable(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es');
}

export function PersonalCravingPicker({ cravings, value, showCalories, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dialogId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = cravings.find(craving => craving.text.trim().toLocaleLowerCase('es') === value.trim().toLocaleLowerCase('es'));
  const visible = [...cravings].sort((a, b) => a.text.localeCompare(b.text, 'es', { sensitivity: 'base' }))
    .filter(craving => searchable(craving.text).includes(searchable(query)));

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  return <div className="snack-dialog-cravings snack-dialog-field">
    <span>Antojos habituales</span>
    <button ref={triggerRef} type="button" className="snack-dialog-select" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined} onClick={() => { setQuery(''); setOpen(true); }}>
      <span>{selected?.text ?? 'Elegir picoteo habitual'}</span><ChevronDown size={22} aria-hidden="true" />
    </button>
    {open && <dialog ref={dialogRef} id={dialogId} className="snack-picker" aria-modal={true} aria-labelledby={`${dialogId}-title`} onCancel={event => { event.preventDefault(); setOpen(false); }} onClose={() => setOpen(false)}>
      <div className="snack-picker-header">
        <h2 id={`${dialogId}-title`}>Elige un picoteo</h2>
        <button type="button" aria-label="Cerrar selector de picoteos" onClick={() => setOpen(false)}><X size={24} aria-hidden="true" /></button>
      </div>
      <input type="search" aria-label="Buscar picoteo habitual" className="snack-picker-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar picoteo…" maxLength={500} />
      <div className="snack-picker-list">
        {visible.map(craving => <button key={craving.id} type="button" className="snack-picker-option" aria-label={`Elegir ${craving.text}`} aria-pressed={selected?.id === craving.id} onClick={() => { onSelect(craving); setOpen(false); }}>
          <span>{craving.text}</span>{showCalories && craving.kcal !== null && <span className="snack-picker-kcal">{craving.kcal} kcal</span>}
        </button>)}
        {visible.length === 0 && <p role="status" className="theme-muted">No hay picoteos que coincidan con la búsqueda.</p>}
      </div>
    </dialog>}
  </div>;
}
