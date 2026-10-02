'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { madridDateString } from '@/lib/historical-date.js';
import { buildMetricChart } from '@/lib/metric-chart.js';
import { copyWeightProgress, formatWeightProgressChange, formatWeightProgressShare, summarizeWeightProgress, weightProgressQueryRange, type WeightPeriod, type WeightRecord } from '@/lib/weight-progress.js';

const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const dateLabel = (date: string) => date.split('-').reverse().join('/');
const time = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });

export function WeightProgressCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [period, setPeriod] = useState<WeightPeriod>('week');
  const [rows, setRows] = useState<WeightRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const today = madridDateString();

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setRows([]); setError(''); setMessage('');
      try {
        const range = weightProgressQueryRange(today);
        const result = await supabase.rpc('get_my_health_records', { p_start: range.start, p_end: range.end });
        if (!active) return;
        if (result.error) setError('No se pudo cargar el progreso de peso.');
        else setRows((result.data ?? []) as WeightRecord[]);
      } catch {
        if (active) setError('No se pudo cargar el progreso de peso.');
      } finally {
        if (active) setLoading(false);
      }
    }
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [today, refreshKey]);

  const summary = summarizeWeightProgress(rows, period, today);
  const chart = buildMetricChart(summary.measurements);
  async function share() {
    setMessage('');
    try { await copyWeightProgress(formatWeightProgressShare(summary)); setMessage('Resumen copiado al portapapeles.'); }
    catch { setMessage('No se pudo copiar al portapapeles. Inténtalo de nuevo.'); }
  }

  return <section aria-label="Progreso de peso" className="my-4 rounded-3xl bg-white p-4 shadow-sm">
    <h2 className="font-bold text-slate-800">Progreso de peso</h2>
    <div className="my-3 flex gap-2">
      {(['week', 'month'] as const).map((value) => <button key={value} type="button" aria-pressed={period === value} onClick={() => { setPeriod(value); setMessage(''); }} className={`min-h-11 flex-1 rounded-2xl px-3 text-sm font-semibold ${period === value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-800'}`}>{value === 'week' ? 'Semana actual' : 'Mes actual'}</button>)}
    </div>
    <p className="text-xs text-slate-500">{dateLabel(summary.start)} – {dateLabel(summary.end)} · hasta hoy</p>
    {loading ? <p role="status" className="mt-3 text-sm text-slate-500">Cargando progreso…</p> : error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : summary.measurements.length === 0 ? <p className="mt-3 text-sm text-slate-500">Sin mediciones de peso en este período.</p> : <>
      <p className="mt-3 text-sm font-semibold text-slate-800">Cambio: {formatWeightProgressChange(summary.change)}</p>
      <svg viewBox="0 0 600 175" role="img" aria-label="Evolución de peso en kilogramos" className="mt-3 w-full">
        <text x="5" y="20" fontSize="12" fill="#64748b">{number.format(chart.maximum!)} kg máx.</text>
        <text x="5" y="170" fontSize="12" fill="#64748b">{number.format(chart.minimum!)} kg mín.</text>
        {chart.points.length > 1 && <polyline points={chart.points.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke="#e11d48" strokeWidth="3" />}
        {chart.points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="4" fill="#e11d48"><title>{`${dateLabel(point.date)}: ${number.format(point.value)} kg`}</title></circle>)}
      </svg>
      <ul className="mt-2 max-h-48 overflow-y-auto text-sm text-slate-700">
        {summary.measurements.map(({ date, recordedAt, value }, index) => <li key={index} className="flex justify-between gap-2 border-t border-slate-100 py-2"><span>{dateLabel(date)} {time.format(new Date(recordedAt))}</span><b>{number.format(value)} kg</b></li>)}
      </ul>
    </>}
    <button type="button" disabled={loading || !!error || summary.measurements.length === 0} onClick={() => void share()} className="mt-3 min-h-11 w-full rounded-2xl bg-slate-800 px-3 text-sm font-semibold text-white disabled:opacity-40">Compartir al portapapeles</button>
    {message && <p role="status" className="mt-2 text-sm text-slate-700">{message}</p>}
  </section>;
}
