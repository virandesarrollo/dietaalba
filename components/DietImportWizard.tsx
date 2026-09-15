'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clipboard, Upload, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  MEAL_TYPES,
  WEEKDAYS,
  emptyWeeklyPlan,
  localDateString,
  stablePlanJson,
  validateWeeklyPlan,
  type MealType,
  type Weekday,
  type WeeklyPlan,
} from '@/lib/diet-import.js';
import {
  buildExternalAiPrompt,
  parseImportedJson,
  parseTabularText,
  type ImportWarning,
} from '@/lib/diet-import-parser.js';

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

function isPreparedResponse(value: unknown): value is Omit<PreparedImport, 'patientId' | 'startDate' | 'planJson' | 'plan'> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.token === 'string'
    && UUID_PATTERN.test(candidate.token)
    && typeof candidate.end_date === 'string'
    && DATE_PATTERN.test(candidate.end_date)
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

export function DietImportWizard({ open, patientId, patientName, onClose, onImported }: DietImportWizardProps) {
  const today = localDateString();
  const [step, setStep] = useState(0);
  const [sourceKind, setSourceKind] = useState<'file' | 'external'>('file');
  const [sourceText, setSourceText] = useState('');
  const [pastedJson, setPastedJson] = useState('');
  const [plan, setPlan] = useState<WeeklyPlan>(() => emptyWeeklyPlan());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);
  const [startDate, setStartDate] = useState(today);
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const rpcGuardRef = useRef(false);

  const planJson = useMemo(() => stablePlanJson(plan), [plan]);
  const externalPrompt = useMemo(() => buildExternalAiPrompt(sourceText), [sourceText]);

  const activePrepared = prepared
    && prepared.patientId === patientId
    && prepared.startDate === startDate
    && prepared.planJson === planJson
    ? prepared
    : null;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    initialFocusRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  if (!open) return null;

  function requestClose() {
    if (submitting || rpcGuardRef.current) return;
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
      setMessage('Contenido leído. Revisa todas las comidas antes de confirmar.');
      setStep(1);
    }
  }

  async function readFile(file: File) {
    setParsing(true);
    setMessage('Leyendo y validando el archivo…');
    try {
      if (file.type.startsWith('image/')) {
        setSourceKind('external');
        setWarnings([]);
        setMessage('Las imágenes no se procesan aquí. Usa el prompt y pega después el JSON.');
        return;
      }
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        const { extractPdf } = await import('@/lib/diet-import-pdf');
        const extracted = await extractPdf(file);
        setSourceText(extracted.text);
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
      setSourceText(text);
      acceptParsed(/\.json$/i.test(file.name) || file.type === 'application/json'
        ? parseImportedJson(text)
        : parseTabularText(text));
    } catch {
      setMessage('No se pudo leer el archivo localmente. Puedes usar el prompt externo.');
      setSourceKind('external');
    } finally {
      setParsing(false);
    }
  }

  function parsePastedJson() {
    if (!pastedJson.trim()) {
      setMessage('Pega primero el JSON que quieres validar.');
      return;
    }
    acceptParsed(parseImportedJson(pastedJson));
  }

  async function copyExternalPrompt() {
    try {
      await navigator.clipboard.writeText(externalPrompt);
      setMessage('Prompt copiado al portapapeles.');
    } catch {
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

  function updateMeal(weekday: Weekday, mealType: MealType, field: 'title' | 'ingredients' | 'recipe_url', value: string) {
    setPrepared(null);
    setConfirmed(false);
    setPlan((current) => ({
      ...current,
      [weekday]: current[weekday].map((meal) => (
        meal.meal_type === mealType ? { ...meal, [field]: value } : meal
      )),
    }));
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
    if (rpcGuardRef.current || !validateReview() || !patientId || startDate < today) return;
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
      if (!isPreparedResponse(data?.[0])) {
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
              {STEPS.map((label, index) => <li key={label} className={`rounded-full px-3 py-1.5 ${index === step ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>{index + 1}. {label}</li>)}
            </ol>
          </div>
          <button ref={initialFocusRef} type="button" onClick={requestClose} disabled={submitting} aria-label="Cerrar" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40"><X /></button>
        </header>

        <div className="p-5 sm:p-7">
          {message && <p role="status" className="mb-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</p>}

          {step === 0 && <section>
            <h3 className="text-lg font-bold text-slate-800">Origen y fecha</h3>
            <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
              <p className="text-sm text-slate-600">Paciente<br /><strong>{patientName}</strong></p>
              <label className="text-sm font-semibold">Fecha inicial
                <input type="date" value={startDate} min={today} disabled={submitting || parsing} onChange={(event) => { setStartDate(event.target.value); setPrepared(null); setConfirmed(false); }} className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-4 py-2" />
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
                {Object.entries(errors).map(([errorKey, error]) => <li key={errorKey}>
                  <strong>{errorKey}</strong>: {error}. {errorKey.includes('.') ? 'Corrige este campo en el JSON.' : 'Revisa el formato del contenido.'}
                </li>)}
              </ul>
            </div>}
            {sourceKind === 'external' && <div className="mt-5 space-y-3">
              <p className="text-sm text-slate-600">Adjunta el archivo a la herramienta externa elegida y usa este prompt:</p>
              <textarea readOnly rows={7} value={externalPrompt} className="w-full rounded-2xl border border-slate-200 p-3 text-xs" />
              <button type="button" onClick={() => void copyExternalPrompt()} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm"><Clipboard size={16} /> Copiar prompt y esquema</button>
              <label className="block text-sm font-semibold">Pegar JSON
                <textarea value={pastedJson} onChange={(event) => setPastedJson(event.target.value)} rows={8} className="mt-2 w-full rounded-2xl border border-slate-200 p-3 font-mono text-xs" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={parsePastedJson} className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Validar JSON</button>
                <button type="button" onClick={() => { setSourceKind('file'); setErrors({}); setWarnings([]); setMessage('Puedes seleccionar otro archivo.'); }} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">Volver a intentar</button>
              </div>
            </div>}
          </section>}

          {step === 1 && <section>
            <h3 className="text-lg font-bold text-slate-800">Revisión</h3>
            <p className="mt-1 text-sm text-slate-500">Los vacíos se resaltan para revisión, pero se permiten. Los errores de longitud o URL deben corregirse.</p>
            {warnings.length > 0 && <ul className="mt-3 text-xs text-amber-700">{warnings.map((warning, index) => <li key={`${warning.code}-${index}`}>• {warning.message}</li>)}</ul>}
            <div className="mt-5 space-y-3">
              {WEEKDAYS.map((weekday, dayIndex) => {
                const dayInvalid = Object.keys(errors).some((key) => key.startsWith(`${weekday}.`));
                const completedMeals = plan[weekday].filter((meal) => meal.title.trim() || meal.ingredients.trim()).length;
                return <details key={weekday} open={dayInvalid || dayIndex === 0 ? true : undefined} className={`rounded-2xl border ${dayInvalid ? 'border-red-300 bg-red-50/40' : 'border-slate-200'}`}>
                <summary className="cursor-pointer list-none px-4 py-3 font-bold text-slate-800">
                  <span className="flex items-center justify-between gap-3">
                    {DAY_LABELS[weekday]}
                    <span className={`text-xs font-medium ${dayInvalid ? 'text-red-600' : 'text-slate-400'}`}>{dayInvalid ? 'Revisar errores' : `${completedMeals}/${MEAL_TYPES.length} comidas`}</span>
                  </span>
                </summary>
                <div className="grid gap-3 border-t border-slate-100 p-4 lg:grid-cols-2">
                  {MEAL_TYPES.map((mealType) => {
                    const meal = plan[weekday].find((candidate) => candidate.meal_type === mealType)!;
                    const prefix = `${weekday}.${mealType}`;
                    const invalid = Object.keys(errors).some((key) => key.startsWith(prefix));
                    const empty = !meal.title.trim() && !meal.ingredients.trim();
                    return <fieldset key={mealType} data-invalid={invalid ? 'true' : undefined} disabled={submitting} className={`rounded-2xl border p-3 ${invalid ? 'border-red-300 bg-red-50' : empty ? 'border-amber-200 bg-amber-50/60' : 'border-slate-100 bg-slate-50'}`}>
                      <legend className="px-1 text-xs font-bold text-slate-600">{mealType}</legend>
                      <input aria-label={`${DAY_LABELS[weekday]} ${mealType} título`} value={meal.title} maxLength={201} onChange={(event) => updateMeal(weekday, mealType, 'title', event.target.value)} placeholder="Plato" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                      <textarea aria-label={`${DAY_LABELS[weekday]} ${mealType} ingredientes`} value={meal.ingredients} maxLength={5001} onChange={(event) => updateMeal(weekday, mealType, 'ingredients', event.target.value)} placeholder="Ingredientes e indicaciones" rows={2} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                      <input aria-label={`${DAY_LABELS[weekday]} ${mealType} URL`} value={meal.recipe_url} onChange={(event) => updateMeal(weekday, mealType, 'recipe_url', event.target.value)} placeholder="https://…" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                      {Object.entries(errors).filter(([key]) => key.startsWith(prefix)).map(([key, error]) => <p key={key} className="mt-1 text-xs text-red-600">{error}</p>)}
                    </fieldset>;
                  })}
                </div>
              </details>})}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" disabled={submitting} onClick={() => { setMessage('Puedes seleccionar otro archivo o cambiar la fecha.'); setStep(0); }} className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700">Volver</button>
              <button type="button" disabled={submitting} onClick={() => void prepareImport()} className="rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Preparar confirmación</button>
            </div>
          </section>}

          {step === 2 && activePrepared && <section className="mx-auto max-w-xl">
            <h3 className="text-lg font-bold text-slate-800">Confirmación</h3>
            <dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-5 text-sm">
              <dt>Paciente</dt><dd className="font-semibold">{patientName}</dd>
              <dt>Fechas</dt><dd className="font-semibold">{activePrepared.startDate} — {activePrepared.end_date}</dd>
              <dt>Filas que se eliminarán</dt><dd className="font-semibold">{activePrepared.delete_count}</dd>
              <dt>Filas que se crearán</dt><dd className="font-semibold">{activePrepared.create_count}</dd>
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
