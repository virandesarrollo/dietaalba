'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clipboard, Upload, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { MAX_MEAL_OPTIONS } from '@/lib/meal-options.js';
import { createMonotonicGuard, isValidCalendarDate, isValidDateRange } from '@/lib/diet-import-wizard-state.js';
import {
  WEEKDAYS,
  emptyWeeklyPlan,
  localDateString,
  stablePlanJson,
  validateWeeklyPlan,
  type MealType,
  type ImportedMealOption,
  type Weekday,
  type WeeklyPlan,
} from '@/lib/diet-import.js';
import {
  buildExternalAiPrompt,
  parseImportedJson,
  parseTabularText,
  type ImportWarning,
} from '@/lib/diet-import-parser.js';

type OptionKeys = Record<Weekday, Record<string, string[]>>;

type DietImportWizardProps = {
  open: boolean;
  patientId: string;
  patientName: string;
  onClose(): void;
  onImported(startDate: string): void;
};

type PreparedImport = {
  token: string;
  end_date: string;
  delete_count: number;
  create_count: number;
  expires_at: string;
  plan_hash: string;
  patientId: string;
  startDate: string;
  planJson: string;
  plan: WeeklyPlan;
};

const DAY_LABELS: Record<Weekday, string> = {
  monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles', thursday: 'Jueves',
  friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo',
};
const STEPS = ['Origen y fecha', 'Revisión', 'Confirmación'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const IMPORT_DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatImportDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return IMPORT_DATE_FORMATTER.format(new Date(year, month - 1, day));
}

function isPreparedResponse(value: unknown, startDate: string): value is Omit<PreparedImport, 'patientId' | 'startDate' | 'planJson' | 'plan'> {
  if (!value || typeof value !== 'object' || !isValidCalendarDate(startDate)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.token === 'string'
    && UUID_PATTERN.test(candidate.token)
    && typeof candidate.end_date === 'string'
    && DATE_PATTERN.test(candidate.end_date)
    && isValidCalendarDate(candidate.end_date)
    && candidate.end_date >= startDate
    && isValidDateRange(startDate, candidate.end_date)
    && Number.isInteger(candidate.delete_count)
    && (candidate.delete_count as number) >= 0
    && Number.isInteger(candidate.create_count)
    && (candidate.create_count as number) >= 0
    && typeof candidate.expires_at === 'string'
    && Number.isFinite(Date.parse(candidate.expires_at))
    && typeof candidate.plan_hash === 'string'
    && HASH_PATTERN.test(candidate.plan_hash);
}

function clonePlan(plan: WeeklyPlan): WeeklyPlan {
  return JSON.parse(stablePlanJson(plan)) as WeeklyPlan;
}

function createOptionKeys(plan: WeeklyPlan, nextKey: () => string): OptionKeys {
  return Object.fromEntries(WEEKDAYS.map((weekday) => [
    weekday,
    Object.fromEntries(plan[weekday].map((group) => [group.meal_type, group.options.map(() => nextKey())])),
  ])) as OptionKeys;
}

function createInitialOptionKeys(plan: WeeklyPlan): OptionKeys {
  return Object.fromEntries(WEEKDAYS.map((weekday) => [
    weekday,
    Object.fromEntries(plan[weekday].map((group) => [group.meal_type, group.options.map((_, index) => `initial-${weekday}-${group.meal_type}-${index}`)])),
  ])) as OptionKeys;
}

export function DietImportWizard({ open, patientId, patientName, onClose, onImported }: DietImportWizardProps) {
  const today = localDateString();
  const [step, setStep] = useState(0);
  const [sourceKind, setSourceKind] = useState<'file' | 'external'>('file');
  const [pastedJson, setPastedJson] = useState('');
  const [plan, setPlan] = useState<WeeklyPlan>(() => emptyWeeklyPlan());
  const optionKeyCounterRef = useRef(0);
  const nextOptionKey = () => `diet-option-${optionKeyCounterRef.current++}`;
  const [optionKeys, setOptionKeys] = useState<OptionKeys>(() => createInitialOptionKeys(plan));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);
  const [startDate, setStartDate] = useState(today);
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [promptCopyStatus, setPromptCopyStatus] = useState('');
  const [fileReadGuard] = useState(() => createMonotonicGuard());
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const rpcGuardRef = useRef(false);

  const planJson = useMemo(() => stablePlanJson(plan), [plan]);
  const externalPrompt = useMemo(() => buildExternalAiPrompt(), []);

  const activePrepared = prepared
    && prepared.patientId === patientId
    && prepared.startDate === startDate
    && prepared.planJson === planJson
    ? prepared
    : null;
  const visibleStep = step === 2 && !activePrepared ? 1 : step;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialFocusRef.current?.focus();
    return () => {
      fileReadGuard.invalidate();
      previousFocus?.focus();
    };
  }, [fileReadGuard]);

  useEffect(() => {
    if (!open) fileReadGuard.invalidate();
  }, [fileReadGuard, open]);

  if (!open) return null;

  function requestClose() {
    if (submitting || parsing || rpcGuardRef.current) return;
    fileReadGuard.invalidate();
    onClose();
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !submitting) {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ) ?? [])].filter((element) => !element.hasAttribute('hidden'));
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function acceptParsed(result: ReturnType<typeof parseImportedJson>, forceExternal = false) {
    setWarnings(result.warnings);
    setErrors(result.errors);
    if (!result.plan) {
      setSourceKind('external');
      setMessage('No se pudo interpretar automáticamente. Revisa los errores y pega un JSON corregido.');
    } else if (forceExternal) {
      setSourceKind('external');
      setMessage('El archivo no contiene texto suficiente. Usa el prompt externo y pega el JSON resultante.');
    } else {
      setPlan(result.plan);
      setOptionKeys(createOptionKeys(result.plan, nextOptionKey));
      setPrepared(null);
      setConfirmed(false);
      setMessage('Contenido leído. Revisa todas las comidas antes de confirmar.');
      setStep(1);
    }
  }

  async function readFile(file: File) {
    if (submitting || rpcGuardRef.current) return;
    const requestToken = fileReadGuard.begin();
    setParsing(true);
    setMessage('Leyendo y validando el archivo…');
    try {
      if (file.type.startsWith('image/')) {
        if (!fileReadGuard.isCurrent(requestToken)) return;
        setSourceKind('external');
        setWarnings([]);
        setMessage('Las imágenes no se procesan aquí. Usa el prompt y pega después el JSON.');
        return;
      }
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        const { extractPdf } = await import('@/lib/diet-import-pdf');
        if (!fileReadGuard.isCurrent(requestToken)) return;
        const extracted = await extractPdf(file);
        if (!fileReadGuard.isCurrent(requestToken)) return;
        const parsed = parseTabularText(extracted.text);
        const needsExternal = extracted.warnings.includes('pdf-needs-external-conversion');
        acceptParsed({
          ...parsed,
          warnings: [
            ...parsed.warnings,
            ...extracted.warnings.map((code) => ({ code, message: 'El PDF necesita conversión externa.' })),
          ],
        }, needsExternal);
        return;
      }
      const text = await file.text();
      if (!fileReadGuard.isCurrent(requestToken)) return;
      acceptParsed(/\.json$/i.test(file.name) || file.type === 'application/json'
        ? parseImportedJson(text)
        : parseTabularText(text));
    } catch {
      if (!fileReadGuard.isCurrent(requestToken)) return;
      setMessage('No se pudo leer el archivo localmente. Puedes usar el prompt externo.');
      setSourceKind('external');
    } finally {
      if (fileReadGuard.isCurrent(requestToken)) setParsing(false);
    }
  }

  function parsePastedJson() {
    if (parsing || submitting || rpcGuardRef.current) return;
    fileReadGuard.invalidate();
    if (!pastedJson.trim()) {
      setMessage('Pega primero el JSON que quieres validar.');
      return;
    }
    acceptParsed(parseImportedJson(pastedJson));
  }

  function changePastedJson(value: string) {
    if (parsing || submitting || rpcGuardRef.current) return;
    fileReadGuard.invalidate();
    setPastedJson(value);
  }

  function retryFileSource() {
    if (parsing || submitting || rpcGuardRef.current) return;
    fileReadGuard.invalidate();
    setSourceKind('file');
    setErrors({});
    setWarnings([]);
    setMessage('Puedes seleccionar otro archivo.');
  }

  function changeStartDate(value: string) {
    if (parsing || submitting || rpcGuardRef.current) return;
    setStartDate(value);
    setPrepared(null);
    setConfirmed(false);
  }

  async function copyExternalPrompt() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(externalPrompt);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = externalPrompt;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        try {
          textArea.select();
          if (!document.execCommand('copy')) throw new Error('Copy failed');
        } finally {
          textArea.remove();
        }
      }
      setPromptCopyStatus('Prompt copiado ✓');
      setMessage('Prompt copiado al portapapeles.');
    } catch {
      setPromptCopyStatus('No se pudo copiar. Selecciona el texto y cópialo manualmente.');
      setMessage('No se pudo copiar el prompt. Selecciona el texto y cópialo manualmente.');
    }
  }

  function focusFirstError() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const firstInvalid = dialogRef.current?.querySelector<HTMLElement>('[data-invalid="true"]');
        firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstInvalid?.querySelector<HTMLElement>('input, textarea')?.focus();
      });
    });
  }

  function updateOption(weekday: Weekday, mealType: MealType, index: number, field: keyof ImportedMealOption, value: string) {
    if (submitting || parsing || rpcGuardRef.current) return;
    setPrepared(null);
    setConfirmed(false);
    setErrors({});
    setPlan((current) => ({
      ...current,
      [weekday]: current[weekday].map((group) => (
        group.meal_type === mealType
          ? { ...group, options: group.options.map((option, optionIndex) => optionIndex === index ? { ...option, [field]: value } : option) }
          : group
      )),
    }));
  }

  function addOption(weekday: Weekday, mealType: MealType) {
    if (submitting || parsing || rpcGuardRef.current) return;
    const group = plan[weekday].find((candidate) => candidate.meal_type === mealType)!;
    if (group.options.length >= MAX_MEAL_OPTIONS) return;
    setPrepared(null);
    setConfirmed(false);
    setErrors({});
    setPlan((current) => ({
      ...current,
      [weekday]: current[weekday].map((candidate) => candidate.meal_type === mealType
        ? { ...candidate, options: [...candidate.options, { title: '', ingredients: '', recipe_url: '' }] }
        : candidate),
    }));
    setOptionKeys((current) => ({
      ...current,
      [weekday]: { ...current[weekday], [mealType]: [...current[weekday][mealType], nextOptionKey()] },
    }));
  }

  function removeOption(weekday: Weekday, mealType: MealType, index: number) {
    if (submitting || parsing || rpcGuardRef.current) return;
    const group = plan[weekday].find((candidate) => candidate.meal_type === mealType)!;
    if (group.options.length <= 1) return;
    setPrepared(null);
    setConfirmed(false);
    setErrors({});
    setPlan((current) => ({
      ...current,
      [weekday]: current[weekday].map((candidate) => candidate.meal_type === mealType
        ? { ...candidate, options: candidate.options.filter((_, optionIndex) => optionIndex !== index) }
        : candidate),
    }));
    setOptionKeys((current) => ({
      ...current,
      [weekday]: { ...current[weekday], [mealType]: current[weekday][mealType].filter((_, optionIndex) => optionIndex !== index) },
    }));
  }

  function moveOption(weekday: Weekday, mealType: MealType, index: number, direction: -1 | 1) {
    if (submitting || parsing || rpcGuardRef.current) return;
    const group = plan[weekday].find((candidate) => candidate.meal_type === mealType)!;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= group.options.length) return;
    setPrepared(null);
    setConfirmed(false);
    setErrors({});
    setPlan((current) => ({
      ...current,
      [weekday]: current[weekday].map((candidate) => {
        if (candidate.meal_type !== mealType) return candidate;
        const options = [...candidate.options];
        [options[index], options[targetIndex]] = [options[targetIndex], options[index]];
        return { ...candidate, options };
      }),
    }));
    setOptionKeys((current) => {
      const keys = [...current[weekday][mealType]];
      [keys[index], keys[targetIndex]] = [keys[targetIndex], keys[index]];
      return { ...current, [weekday]: { ...current[weekday], [mealType]: keys } };
    });
  }

  function addGroup(weekday: Weekday) {
    if (submitting || parsing || rpcGuardRef.current) return;
    const mealType = window.prompt('Nombre del grupo de comida')?.trim();
    if (!mealType || plan[weekday].some((group) => group.meal_type.localeCompare(mealType, 'es', { sensitivity: 'accent' }) === 0)) return;
    setPrepared(null); setConfirmed(false); setErrors({});
    setPlan((current) => ({ ...current, [weekday]: [...current[weekday], { meal_type: mealType, options: [{ title: '', ingredients: '', recipe_url: '' }] }] }));
    setOptionKeys((current) => ({ ...current, [weekday]: { ...current[weekday], [mealType]: [nextOptionKey()] } }));
  }

  function renameGroup(weekday: Weekday, mealType: string) {
    if (submitting || parsing || rpcGuardRef.current) return;
    const next = window.prompt('Nombre del grupo de comida', mealType)?.trim();
    if (!next || next === mealType || plan[weekday].some((group) => group.meal_type !== mealType && group.meal_type.localeCompare(next, 'es', { sensitivity: 'accent' }) === 0)) return;
    setPrepared(null); setConfirmed(false); setErrors({});
    setPlan((current) => ({ ...current, [weekday]: current[weekday].map((group) => group.meal_type === mealType ? { ...group, meal_type: next } : group) }));
    setOptionKeys((current) => { const { [mealType]: keys, ...rest } = current[weekday]; return { ...current, [weekday]: { ...rest, [next]: keys } }; });
  }

  function moveGroup(weekday: Weekday, index: number, direction: -1 | 1) {
    if (submitting || parsing || rpcGuardRef.current) return;
    const target = index + direction; if (target < 0 || target >= plan[weekday].length) return;
    setPrepared(null); setConfirmed(false); setErrors({});
    setPlan((current) => { const groups = [...current[weekday]]; [groups[index], groups[target]] = [groups[target], groups[index]]; return { ...current, [weekday]: groups }; });
  }

  function deleteGroup(weekday: Weekday, mealType: string) {
    if (submitting || parsing || rpcGuardRef.current || plan[weekday].length <= 1) return;
    setPrepared(null); setConfirmed(false); setErrors({});
    setPlan((current) => ({ ...current, [weekday]: current[weekday].filter((group) => group.meal_type !== mealType) }));
    setOptionKeys((current) => { const { [mealType]: _, ...rest } = current[weekday]; return { ...current, [weekday]: rest }; });
  }

  function validateReview() {
    const validation = validateWeeklyPlan(plan);
    setErrors(validation.errors);
    if (!validation.ok) {
      setMessage('Corrige los campos no válidos antes de continuar.');
      focusFirstError();
      return false;
    }
    setMessage('');
    return true;
  }

  async function prepareImport() {
    if (rpcGuardRef.current || parsing || submitting || !isValidCalendarDate(startDate) || !validateReview() || !patientId || startDate < today) return;
    rpcGuardRef.current = true;
    setSubmitting(true);
    setMessage('');
    const planSnapshot = clonePlan(plan);
    const snapshotJson = stablePlanJson(planSnapshot);
    try {
      const { data, error } = await supabase.rpc('prepare_diet_import', {
        target_user: patientId,
        start_date: startDate,
        weekly_plan: planSnapshot,
      });
      if (error) {
        setPrepared(null);
        setMessage('No se pudo preparar la importación. Revisa permisos, fecha y contenido.');
        return;
      }
      if (!isPreparedResponse(data?.[0], startDate)) {
        setPrepared(null);
        setMessage('El servidor devolvió una confirmación no válida. No se aplicó ningún cambio.');
        return;
      }
      setPrepared({ ...data[0], patientId, startDate, planJson: snapshotJson, plan: planSnapshot });
      setConfirmed(false);
      setMessage('Importación preparada. Revisa el resumen y confirma para aplicarla.');
      setStep(2);
    } catch {
      setPrepared(null);
      setMessage('No se pudo conectar para preparar la importación. Inténtalo de nuevo.');
    } finally {
      rpcGuardRef.current = false;
      setSubmitting(false);
    }
  }

  async function applyImport() {
    if (rpcGuardRef.current) return;
    if (!activePrepared || !confirmed) return;
    rpcGuardRef.current = true;
    setSubmitting(true);
    setMessage('');
    let importedStartDate: string | null = null;
    try {
      const { error } = await supabase.rpc('apply_diet_import', {
        confirmation_token: activePrepared.token,
        plan_hash: activePrepared.plan_hash,
        weekly_plan: activePrepared.plan,
        confirmed: true,
      });
      if (error) {
        setPrepared(null);
        setConfirmed(false);
        setMessage('No se pudo aplicar la importación. Debes revisar y preparar de nuevo.');
        return;
      }
      importedStartDate = activePrepared.startDate;
    } catch {
      setPrepared(null);
      setConfirmed(false);
      setMessage('No se pudo conectar para aplicar la importación. Debes preparar de nuevo.');
    } finally {
      rpcGuardRef.current = false;
      setSubmitting(false);
    }
    if (importedStartDate) {
      onImported(importedStartDate);
      onClose();
    }
  }

  return (
    <div ref={dialogRef} tabIndex={-1} onKeyDown={handleDialogKeyDown} className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="diet-import-title" aria-describedby="diet-import-description">
      <div className="mx-auto my-4 max-w-6xl rounded-3xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-100 p-5 sm:p-7">
          <div>
            <p className="text-sm font-semibold text-rose-500">Importar dieta</p>
            <h2 id="diet-import-title" className="mt-1 text-2xl font-bold text-slate-800">Asistente de importación</h2>
            <p id="diet-import-description" className="mt-1 text-sm text-slate-500">Importa, revisa y confirma la sustitución de la dieta futura.</p>
            <ol className="mt-4 flex flex-wrap gap-2 text-xs">
              {STEPS.map((label, index) => <li key={label} className={`rounded-full px-3 py-1.5 ${index === visibleStep ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>{index + 1}. {label}</li>)}
            </ol>
          </div>
          <button ref={initialFocusRef} type="button" onClick={requestClose} disabled={submitting || parsing} aria-label="Cerrar" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X /></button>
        </header>

        <div className="p-5 sm:p-7">
          {message && <p role="status" className="mb-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</p>}

          {visibleStep === 0 && <section>
            <h3 className="text-lg font-bold text-slate-800">Origen y fecha</h3>
            <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
              <p className="text-sm text-slate-600">Paciente<br /><strong>{patientName}</strong></p>
              <label className="text-sm font-semibold">Fecha inicial
                <input type="date" value={startDate} min={today} disabled={submitting || parsing} onChange={(event) => changeStartDate(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-4 py-2" />
              </label>
            </div>
            <label className="mt-4 flex cursor-pointer items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-rose-200 bg-rose-50/50 p-8 text-sm font-semibold text-rose-600">
              <Upload size={20} /> {parsing ? 'Procesando archivo…' : 'Seleccionar PDF, TXT, JSON o imagen'}
              <input className="sr-only" type="file" accept=".pdf,.txt,.json,image/*" disabled={parsing || submitting || !patientId || startDate < today} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void readFile(file); }} />
            </label>
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="mr-2 inline" size={17} /> Si usas una IA externa, elimina antes nombre, correo, teléfono, diagnósticos y cualquier dato personal.
            </div>
            {Object.keys(errors).length > 0 && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-800">Corrige estos problemas antes de continuar:</p>
              <ul className="mt-2 space-y-1 text-xs text-red-700">
                {Object.entries(errors).map(([errorKey, error]) => {
                  const isStructuralError = errorKey.startsWith('_');
                  return <li key={errorKey}>
                    <strong>{isStructuralError ? 'Formato del archivo' : errorKey}</strong>:{' '}
                    {errorKey === '_table.structure'
                      ? 'No se reconoció la tabla del PDF o archivo. Usa “Copiar prompt y esquema” y pega después el JSON generado.'
                      : `${error}. ${errorKey.includes('.') ? 'Corrige este campo en el JSON.' : 'Revisa el formato del contenido.'}`}
                  </li>;
                })}
              </ul>
            </div>}
            {sourceKind === 'external' && <div className="mt-5 space-y-3">
              <p className="text-sm text-slate-600">Adjunta el archivo a la herramienta externa elegida y usa este prompt:</p>
              <textarea readOnly rows={7} value={externalPrompt} className="w-full rounded-2xl border border-slate-200 p-3 text-xs" />
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={parsing || submitting} onClick={() => void copyExternalPrompt()} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm"><Clipboard size={16} /> Copiar prompt y esquema</button>
                <span aria-live="polite" role="status" className="text-sm font-semibold text-slate-600">{promptCopyStatus}</span>
              </div>
              <label className="block text-sm font-semibold">Pegar JSON
                <textarea value={pastedJson} disabled={parsing || submitting} onChange={(event) => changePastedJson(event.target.value)} rows={8} className="mt-2 w-full rounded-2xl border border-slate-200 p-3 font-mono text-xs" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={parsing || submitting} onClick={parsePastedJson} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Validar JSON</button>
                <button type="button" disabled={parsing || submitting} onClick={retryFileSource} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">Volver a intentar</button>
              </div>
            </div>}
          </section>}

          {visibleStep === 1 && <section>
            <h3 className="text-lg font-bold text-slate-800">Revisión</h3>
            <p className="mt-1 text-sm text-slate-500">Los vacíos se resaltan para revisión, pero se permiten. Los errores de longitud o URL deben corregirse.</p>
            {warnings.length > 0 && <ul className="mt-3 text-xs text-amber-700">{warnings.map((warning, index) => <li key={`${warning.code}-${index}`}>• {warning.message}</li>)}</ul>}
            <div className="mt-5 space-y-3">
              {WEEKDAYS.map((weekday, dayIndex) => {
                const dayInvalid = Object.keys(errors).some((key) => key.startsWith(`${weekday}.`));
                const totalOptions = plan[weekday].reduce((total, group) => total + group.options.length, 0);
                return <details key={weekday} open={dayInvalid || dayIndex === 0 ? true : undefined} className={`rounded-2xl border ${dayInvalid ? 'border-red-300 bg-red-50/40' : 'border-slate-200'}`}>
                <summary className="cursor-pointer list-none px-4 py-3 font-bold text-slate-800">
                  <span className="flex items-center justify-between gap-3">
                    {DAY_LABELS[weekday]}
                    <span className={`text-xs font-medium ${dayInvalid ? 'text-red-600' : 'text-slate-400'}`}>{dayInvalid ? 'Revisar errores' : `${plan[weekday].length} comidas · ${totalOptions} opciones`}</span>
                  </span>
                </summary>
                <div className="grid gap-3 border-t border-slate-100 p-4 lg:grid-cols-2">
                  {plan[weekday].map((group, groupIndex) => {
                    const mealType = group.meal_type;
                    const groupPrefix = `${weekday}.${mealType}`;
                    const groupInvalid = Object.keys(errors).some((key) => key === groupPrefix || key.startsWith(`${groupPrefix}.`));
                    const groupStructuralInvalid = Object.keys(errors).some((key) => key === groupPrefix || key === `${groupPrefix}.options` || key === `${groupPrefix}.meal_type`);
                    const empty = group.options.every((option) => !option.title.trim() && !option.ingredients.trim());
                    return <fieldset key={mealType} data-invalid={groupStructuralInvalid ? 'true' : undefined} disabled={submitting || parsing} className={`rounded-2xl border p-3 ${groupInvalid ? 'border-red-300 bg-red-50' : empty ? 'border-amber-200 bg-amber-50/60' : 'border-slate-100 bg-slate-50'}`}>
                      <legend className="px-1 text-xs font-bold text-slate-600">{mealType}</legend>
                      <div className="mb-2 flex flex-wrap justify-end gap-1">
                        <button type="button" aria-label={`Mover grupo ${mealType} arriba`} disabled={submitting || parsing || groupIndex === 0} onClick={() => moveGroup(weekday, groupIndex, -1)} className="min-h-11 rounded-lg bg-slate-100 px-3 text-sm disabled:opacity-40">↑</button>
                        <button type="button" aria-label={`Mover grupo ${mealType} abajo`} disabled={submitting || parsing || groupIndex === plan[weekday].length - 1} onClick={() => moveGroup(weekday, groupIndex, 1)} className="min-h-11 rounded-lg bg-slate-100 px-3 text-sm disabled:opacity-40">↓</button>
                        <button type="button" aria-label={`Renombrar grupo ${mealType}`} disabled={submitting || parsing} onClick={() => renameGroup(weekday, mealType)} className="min-h-11 rounded-lg bg-slate-100 px-3 text-sm disabled:opacity-40">Renombrar</button>
                        <button type="button" aria-label={`Eliminar grupo ${mealType}`} disabled={submitting || parsing || plan[weekday].length <= 1} onClick={() => deleteGroup(weekday, mealType)} className="min-h-11 rounded-lg bg-red-50 px-3 text-sm text-red-700 disabled:opacity-40">Eliminar grupo</button>
                      </div>
                      <div className="space-y-3">
                        {group.options.map((option, optionIndex) => {
                          const prefix = `${weekday}.${mealType}.options.${optionIndex}`;
                          const invalid = Object.keys(errors).some((key) => key === prefix || key.startsWith(`${prefix}.`));
                          const optionNumber = optionIndex + 1;
                          return <div key={optionKeys[weekday][mealType][optionIndex]} className={`rounded-xl border bg-white p-3 ${invalid ? 'border-red-300' : 'border-slate-200'}`}>
                            {group.options.length > 1 && <p className="mb-2 text-xs font-bold text-slate-600">Opción {optionNumber}</p>}
                            {(['title', 'ingredients', 'recipe_url'] as const).map((field) => {
                              const fieldError = errors[`${prefix}.${field}`];
                              const errorId = `diet-import-error-${weekday}-${mealType.replaceAll(' ', '-')}-${optionIndex}-${field}`;
                              const label = field === 'title' ? 'título' : field === 'ingredients' ? 'ingredientes' : 'URL';
                              const placeholder = field === 'title' ? 'Plato' : field === 'ingredients' ? 'Ingredientes e indicaciones' : 'https://…';
                              return <div key={field} data-invalid={fieldError ? 'true' : undefined} className={field === 'title' ? undefined : 'mt-2'}>
                                {field === 'ingredients'
                                  ? <textarea aria-label={`${DAY_LABELS[weekday]} ${mealType} opción ${optionNumber} ${label}`} aria-invalid={fieldError ? true : undefined} aria-describedby={fieldError ? errorId : undefined} value={option[field]} maxLength={5001} onChange={(event) => updateOption(weekday, mealType, optionIndex, field, event.target.value)} placeholder={placeholder} rows={2} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                                  : <input aria-label={`${DAY_LABELS[weekday]} ${mealType} opción ${optionNumber} ${label}`} aria-invalid={fieldError ? true : undefined} aria-describedby={fieldError ? errorId : undefined} value={option[field]} maxLength={field === 'title' ? 201 : 2049} onChange={(event) => updateOption(weekday, mealType, optionIndex, field, event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />}
                                {fieldError && <p id={errorId} className="mt-1 text-xs text-red-600">{fieldError}</p>}
                              </div>;
                            })}
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button type="button" aria-label={`Mover opción ${optionNumber} arriba en ${mealType}`} disabled={submitting || parsing || optionIndex === 0} onClick={() => moveOption(weekday, mealType, optionIndex, -1)} className="min-h-11 min-w-11 rounded-lg bg-slate-100 px-3 text-sm disabled:opacity-40">↑</button>
                              <button type="button" aria-label={`Mover opción ${optionNumber} abajo en ${mealType}`} disabled={submitting || parsing || optionIndex === group.options.length - 1} onClick={() => moveOption(weekday, mealType, optionIndex, 1)} className="min-h-11 min-w-11 rounded-lg bg-slate-100 px-3 text-sm disabled:opacity-40">↓</button>
                              <button type="button" aria-label={`Eliminar opción ${optionNumber} de ${mealType}`} disabled={submitting || parsing || group.options.length <= 1} onClick={() => removeOption(weekday, mealType, optionIndex)} className="min-h-11 rounded-lg bg-red-50 px-3 text-sm text-red-700 disabled:opacity-40">Eliminar</button>
                            </div>
                          </div>;
                        })}
                      </div>
                      {Object.entries(errors).filter(([key]) => key === groupPrefix || key === `${groupPrefix}.options` || key === `${groupPrefix}.meal_type`).map(([key, error]) => <p key={key} className="mt-1 text-xs text-red-600">{error}</p>)}
                      <button type="button" aria-label={`Añadir opción a ${mealType}`} disabled={submitting || parsing || group.options.length >= MAX_MEAL_OPTIONS} onClick={() => addOption(weekday, mealType)} className="mt-3 min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-semibold disabled:opacity-40">Añadir opción</button>
                    </fieldset>;
                  })}
                </div>
                <button type="button" aria-label={`Añadir grupo a ${DAY_LABELS[weekday]}`} disabled={submitting || parsing} onClick={() => addGroup(weekday)} className="mx-4 mb-4 min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-semibold disabled:opacity-40">Añadir grupo</button>
              </details>})}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" disabled={submitting || parsing} onClick={() => { if (parsing || submitting || rpcGuardRef.current) return; fileReadGuard.invalidate(); setMessage('Puedes seleccionar otro archivo o cambiar la fecha.'); setStep(0); }} className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700">Volver</button>
              <button type="button" disabled={submitting || parsing} onClick={() => void prepareImport()} className="rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Preparar confirmación</button>
            </div>
          </section>}

          {visibleStep === 2 && activePrepared && <section className="mx-auto max-w-xl">
            <h3 className="text-lg font-bold text-slate-800">Confirmación</h3>
            <dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-5 text-sm">
              <dt>Paciente</dt><dd className="font-semibold">{patientName}</dd>
              <dt>Fechas</dt><dd className="font-semibold">{formatImportDate(activePrepared.startDate)} — {formatImportDate(activePrepared.end_date)}</dd>
            </dl>
            <label className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
              <input type="checkbox" checked={confirmed} disabled={submitting} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5" />
              Entiendo que reemplazará toda la dieta futura
            </label>
            <div className="mt-6 flex gap-3">
              <button type="button" disabled={submitting} onClick={() => { setPrepared(null); setConfirmed(false); setMessage('Puedes revisar y corregir la plantilla.'); setStep(1); }} className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold">Volver</button>
              <button type="button" disabled={submitting || !confirmed} onClick={() => void applyImport()} className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{submitting ? 'Aplicando…' : 'Reemplazar dieta futura'}</button>
            </div>
          </section>}
        </div>
      </div>
    </div>
  );
}
