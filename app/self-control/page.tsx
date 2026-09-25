'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Flame, UtensilsCrossed } from 'lucide-react';
import { AppMobileNavigation } from '@/components/AppMobileNavigation';
import { supabase } from '@/lib/supabase';
import { getChartBackground, getDayBarMetrics, normalizeWeeklyDay, summarizeWeeklyDays, type WeeklyDay } from '@/lib/weekly-self-control';

const dayLabel = (date: string) => new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(new Date(`${date}T12:00:00`)).replace('.', '');

export default function SelfControlPage() {
  const router = useRouter();
  const [days, setDays] = useState<WeeklyDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { router.replace('/'); return; }
      const { data, error: weeklyError } = await supabase.rpc('get_my_weekly_self_control');
      if (weeklyError) setError('No se pudo cargar tu autocontrol semanal.');
      else setDays(Array.isArray(data) ? data.map(normalizeWeeklyDay) : []);
      setLoading(false);
    }
    void load();
  }, [router]);

  const { totals, goodDays, chartSegments, maxDayValue } = useMemo(() => summarizeWeeklyDays(days), [days]);
  const chartBackground = getChartBackground(chartSegments);

  return (
    <main className="theme-page min-h-screen max-w-md mx-auto pb-28">
      <header className="rounded-b-[2.5rem] bg-gradient-to-br from-violet-700 via-fuchsia-600 to-rose-500 px-6 pb-9 pt-7 text-white shadow-lg">
        <button type="button" onClick={() => router.push('/')} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-white/15 px-3 text-sm font-semibold backdrop-blur hover:bg-white/25"><ArrowLeft size={18} /> Volver</button>
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">Tu semana</p><h1 className="mt-2 text-3xl font-black">Autocontrol</h1><p className="mt-2 text-sm text-white/80">De lunes a hoy</p></div>
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/15 text-4xl shadow-inner">🔥</div>
        </div>
      </header>

      <section className="space-y-5 px-5 pt-6">
        {loading && <p className="rounded-3xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm">Calculando tu semana…</p>}
        {error && <p role="alert" className="rounded-3xl bg-rose-50 p-5 text-sm font-semibold text-rose-700">{error}</p>}
        {!loading && !error && <>
          <section className="overflow-hidden rounded-[2rem] bg-slate-900 p-5 text-white shadow-xl">
            <div className="flex items-center justify-between"><p className="text-sm font-bold text-white/75">Días buenos esta semana</p><Flame className="text-amber-300" size={22} fill="currentColor" /></div>
            <div className="mt-3 flex items-end gap-2"><strong className="text-5xl font-black">{goodDays}</strong><span className="mb-1 text-base font-semibold text-white/70">días haciéndolo bien</span></div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-rose-400" style={{ width: `${days.length ? (goodDays / days.length) * 100 : 0}%` }} /></div>
          </section>

          <section className="rounded-[2rem] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-slate-800">Balance semanal</h2><p className="mt-1 text-xs text-slate-500">Todo lo que has registrado</p></div><UtensilsCrossed className="text-fuchsia-500" size={23} /></div>
            <div className="mt-5 flex items-center gap-5">
              <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: chartBackground }}><div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-white text-center"><strong className="text-2xl font-black text-slate-800">{totals.completed}</strong><span className="text-xs font-bold uppercase text-slate-600">bien</span></div></div>
              <div className="min-w-0 space-y-2 text-xs font-semibold text-slate-600">
                <p><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-green-500" />Comidas bien: {totals.completed}</p>
                <p><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-slate-400" />Comidas saltadas: {totals.skipped}</p>
                <p><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />Sin registrar: {totals.pending}</p>
                <p><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-rose-400" />Picoteos: {totals.snacks}</p>
                <p><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-purple-500" />Nocturnos: {totals.nightBinges}</p>
                <p><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-sky-400" />Libres: {totals.freeMeals}</p>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><CheckCircle2 className="text-emerald-500" size={20} /><div><h2 className="font-black text-slate-800">Evolución diaria</h2><p className="text-xs text-slate-500">Comidas bien frente a incidencias</p></div></div>
            <div className="mt-6 flex h-44 items-end justify-between gap-2">
              {days.map((day) => { const { incidents, height, completedHeight, skippedHeight } = getDayBarMetrics(day, maxDayValue); return <div key={day.report_date} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><div role="img" aria-label={`${dayLabel(day.report_date)}: ${day.completed} realizadas, ${day.skipped} saltadas, ${day.pending} pendientes y ${incidents - day.pending} incidencias`} className="flex w-full max-w-8 flex-col overflow-hidden rounded-t-xl bg-rose-200" style={{ height: `${height > 0 ? Math.max(height, 4) : 0}%` }}><div className="w-full bg-emerald-400" style={{ height: `${completedHeight}%` }} /><div className="w-full bg-slate-400" style={{ height: `${skippedHeight}%` }} /></div><span className="text-xs font-bold uppercase text-slate-500">{dayLabel(day.report_date)}</span></div>; })}
            </div>
            <div className="mt-4 flex gap-4 text-[11px] font-semibold text-slate-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />Bien</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-400" />Saltada</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-200" />Pendiente o incidencia</span></div>
          </section>
        </>}
      </section>
      <AppMobileNavigation current="patient" />
    </main>
  );
}
