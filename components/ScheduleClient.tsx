'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DayScheduleCard } from '@/components/DayScheduleCard';
import { normalizeSchedule, type ScheduleSlot } from '@/lib/day-schedule.js';
import { deriveFeatureCapabilities, normalizeFeatureRows } from '@/lib/feature-permissions.js';
import { supabase } from '@/lib/supabase';

export function ScheduleClient({ initialDate }: { initialDate: string }) {
  const router = useRouter();
  const currentUserIdRef = useRef<string | null>(null);
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (currentUserIdRef.current && session?.user.id !== currentUserIdRef.current) {
        currentUserIdRef.current = null;
        setAllowed(false);
        setSlots([]);
        router.replace('/');
      }
    });
    return () => { subscription.unsubscribe(); currentUserIdRef.current = null; };
  }, [router]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (!active) return;
        if (userError || !userData.user) { router.replace('/'); return; }
        currentUserIdRef.current = userData.user.id;
        const featureResult = await supabase.rpc('get_my_features');
        if (!active || currentUserIdRef.current !== userData.user.id) return;
        const canViewDaySchedule = !featureResult.error && deriveFeatureCapabilities(normalizeFeatureRows(featureResult.data)).canViewDaySchedule;
        if (!canViewDaySchedule) { router.replace('/'); return; }
        setAllowed(true);
        const result = await supabase.rpc('get_my_day_schedule', { p_date: date });
        if (!active || currentUserIdRef.current !== userData.user.id) return;
        if (result.error) setError('No se pudo cargar el horario.');
        else setSlots(normalizeSchedule(result.data));
      } catch {
        if (active) setError('No se pudo cargar el horario.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [date, router]);

  function changeDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    setLoading(true);
    setError(null);
    setSlots([]);
    setDate(value);
  }

  return <main className="theme-page min-h-screen px-5 py-7 text-slate-700">
    <div className="mx-auto max-w-xl">
      <button type="button" onClick={() => router.push('/')} className="min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-indigo-700 shadow-sm">← Mi día</button>
      <header className="mt-6"><p className="text-xs font-semibold uppercase tracking-widest text-rose-500">Mi día</p><h1 className="mt-1 text-2xl font-bold text-slate-800">Horarios</h1><p className="mt-2 text-sm text-slate-500">Gimnasio y trabajo programados para cada día.</p></header>
      {allowed && <>
        <label className="mt-6 block text-sm font-semibold text-slate-700">Fecha<input type="date" value={date} onChange={(event) => changeDate(event.target.value)} className="mt-2 block min-h-12 w-full rounded-xl border border-indigo-100 bg-white px-3 text-sm" /></label>
        <DayScheduleCard date={date} slots={slots} loading={loading} error={error} />
      </>}
      {!allowed && loading && <p className="mt-6 text-sm text-slate-500">Comprobando acceso…</p>}
      {!allowed && !loading && error && <p role="alert" className="mt-6 text-sm text-rose-700">{error}</p>}
    </div>
  </main>;
}
