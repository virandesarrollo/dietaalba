'use client';

import { Footprints } from 'lucide-react';
import { dailyStepProgress } from '@/lib/daily-steps.js';

type DailyStepsCardProps = {
  steps: number;
  dailyGoal: number;
  input: string;
  readOnly: boolean;
  saving: boolean;
  message: string | null;
  onInputChange: (value: string) => void;
  onSave: () => void;
};

export function DailyStepsCard({
  steps,
  dailyGoal,
  input,
  readOnly,
  saving,
  message,
  onInputChange,
  onSave,
}: DailyStepsCardProps) {
  const progress = dailyStepProgress(steps, dailyGoal);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  return (
    <section className="theme-surface mt-3 rounded-3xl border theme-border p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="relative grid size-24 shrink-0 place-items-center">
          <svg
            viewBox="0 0 100 100"
            className="size-24 -rotate-90"
            role="progressbar"
            aria-label="Progreso del objetivo diario de pasos"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--app-surface-soft)" strokeWidth="9" />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="var(--app-accent)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress.percent / 100)}
            />
          </svg>
          <span className="absolute grid place-items-center text-center text-xs font-extrabold" style={{ color: 'var(--app-heading)' }}>
            <Footprints size={20} aria-hidden="true" />
            {progress.percent}%
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold" style={{ color: 'var(--app-heading)' }}>Pasos diarios</h2>
          <p className="mt-1 text-sm theme-muted">
            <strong style={{ color: 'var(--app-heading)' }}>{steps.toLocaleString('es-ES')}</strong>
            {' de '}{dailyGoal.toLocaleString('es-ES')} pasos
          </p>
          {progress.achieved && <p className="mt-1 text-sm font-bold" style={{ color: 'var(--app-heading)' }}>¡Objetivo conseguido!</p>}
        </div>
      </div>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <input
          aria-label="Pasos del día"
          type="number"
          min={0}
          max={200000}
          step={1}
          inputMode="numeric"
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          disabled={readOnly || saving}
          className="min-h-12 min-w-0 flex-1 rounded-2xl border theme-border px-3 text-sm"
        />
        <button
          type="submit"
          disabled={readOnly || saving}
          className="min-h-12 rounded-2xl px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: 'var(--app-heading)', color: 'var(--app-surface)' }}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
      {readOnly && <p className="mt-2 text-xs theme-muted">Solo puedes editar los pasos de hoy y de los dos días anteriores.</p>}
      {message && <p role="status" className="mt-2 text-sm theme-muted">{message}</p>}
    </section>
  );
}
