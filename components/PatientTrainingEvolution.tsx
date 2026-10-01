'use client';

import { useMemo, useState } from 'react';
import { buildPatientTrainingEvolution, type PatientWorkout } from '@/lib/patient-training-evolution.js';
import { compareProgressSets } from '@/lib/gym-progress.js';

const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(`${date}T12:00:00`));
}

function shortDate(date: string) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year.slice(2)}`;
}

export function PatientTrainingEvolution({ workouts }: { workouts: PatientWorkout[] }) {
  const evolution = useMemo(() => buildPatientTrainingEvolution(workouts), [workouts]);
  const [requestedExercise, setRequestedExercise] = useState('');
  const selected = evolution.exercises.find(({ name }) => name === requestedExercise) ?? evolution.exercises[0];

  if (workouts.length === 0) {
    return <div className="rounded-3xl bg-white p-5 text-sm text-slate-500 shadow-sm">No hay entrenamientos registrados.</div>;
  }

  const visibleSessions = selected?.sessions.slice(-8) ?? [];
  const maximumWeight = Math.max(1, ...visibleSessions.map(({ bestSet }) => bestSet.weightKg));
  const comparison = compareProgressSets(
    selected?.sessions.length > 1 ? selected.sessions[0].bestSet : null,
    selected?.summary.latest ?? null,
  );

  return <div className="space-y-5 rounded-3xl bg-white p-5 shadow-sm">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Días de entrenamiento</p><p className="mt-1 text-2xl font-bold text-slate-800">{evolution.sessionCount}</p></div>
      <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Series registradas</p><p className="mt-1 text-2xl font-bold text-slate-800">{evolution.setCount}</p></div>
      <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Último entrenamiento</p><p className="mt-1 text-lg font-bold text-slate-800">{evolution.lastSessionDate ? formatDate(evolution.lastSessionDate) : '—'}</p></div>
    </div>

    {!selected ? <p className="text-sm text-slate-500">Hay series registradas, pero faltan datos de carga o repeticiones para comparar la evolución.</p> : <>
      <label className="block text-sm font-semibold text-slate-700">Ver evolución de un ejercicio
        <select value={selected.name} onChange={(event) => setRequestedExercise(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-indigo-400">
          {evolution.exercises.map(({ name, sessions }) => <option key={name} value={name}>{name} · {sessions.length} {sessions.length === 1 ? 'sesión' : 'sesiones'}</option>)}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 p-4"><p className="text-xs text-slate-500">Última serie de mayor peso</p><p className="mt-1 text-lg font-bold text-slate-800">{number.format(selected.summary.latest?.weightKg ?? 0)} kg × {selected.summary.latest?.reps ?? 0} rep.</p></div>
        <div className="rounded-2xl border border-slate-100 p-4"><p className="text-xs text-slate-500">Evolución desde la primera sesión</p><p className="mt-1 text-lg font-bold text-slate-800">{comparison.label}</p><p className="mt-1 text-xs text-slate-500">{comparison.status === 'insufficient' ? 'Hace falta otra sesión para comparar.' : `Primera: ${number.format(selected.sessions[0].bestSet.weightKg)} kg × ${selected.sessions[0].bestSet.reps} rep. · ${formatDate(selected.sessions[0].date)}`}</p></div>
        <div className="rounded-2xl border border-slate-100 p-4"><p className="text-xs text-slate-500">Máxima carga registrada</p><p className="mt-1 text-lg font-bold text-slate-800">{number.format(selected.summary.maximum?.weightKg ?? 0)} kg × {selected.summary.maximum?.reps ?? 0} rep.</p></div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800">Serie de mayor peso de cada sesión</h3>
        <p className="mt-1 text-xs text-slate-500">Últimas {visibleSessions.length} sesiones · a igual peso, se destaca la serie de más repeticiones. Lee ambas medidas conjuntamente.</p>
        <div role="img" aria-label={`Evolución de ${selected.name}: ${visibleSessions.map(({ date, bestSet }) => `${formatDate(date)}, ${number.format(bestSet.weightKg)} kg y ${bestSet.reps} repeticiones`).join('; ')}`} className="mt-4 flex h-52 items-end gap-3 overflow-x-auto rounded-2xl bg-slate-50 px-4 pb-3 pt-5">
          {visibleSessions.map(({ date, bestSet }) => <div key={date} className="flex h-full min-w-16 flex-1 flex-col items-center justify-end gap-1 text-center">
            <span className="text-xs font-bold text-slate-700">{number.format(bestSet.weightKg)} kg</span>
            <span className="text-xs text-slate-500">{bestSet.reps} rep.</span>
            <div className="w-full rounded-t-lg bg-indigo-500" style={{ height: `${Math.max(7, (bestSet.weightKg / maximumWeight) * 100)}%` }} />
            <span className="whitespace-nowrap text-[11px] text-slate-500">{shortDate(date)}</span>
          </div>)}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800">Sesiones recientes</h3>
        <div className="mt-2 divide-y divide-slate-100">{selected.sessions.slice(-6).reverse().map((session) => <details key={session.date} className="py-3 text-sm">
          <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 font-semibold text-slate-700"><span>{formatDate(session.date)} · {session.sets.length} {session.sets.length === 1 ? 'serie' : 'series'}</span><span>{number.format(session.bestSet.weightKg)} kg × {session.bestSet.reps} rep.</span></summary>
          <ul className="mt-2 space-y-1 pl-4 text-slate-500">{session.sets.map((set, index) => <li key={index}>Serie {index + 1}: {number.format(set.weightKg)} kg × {set.reps} rep.</li>)}</ul>
        </details>)}</div>
      </div>
    </>}
  </div>;
}
