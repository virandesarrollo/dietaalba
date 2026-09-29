'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DailyStepsCard } from '@/components/DailyStepsCard';
import { getOfflineDietStore } from '@/lib/offline-diet.js';
import { normalizeDailyStepRow, parseDailySteps } from '@/lib/daily-steps.js';
import { isOutsideCorrectionWindow, madridDateString } from '@/lib/historical-date';
import { supabase } from '@/lib/supabase';

export function HealthStepsCard({ date }: { date: string }) {
  const [steps, setSteps] = useState(0);
  const [dailyGoal, setDailyGoal] = useState(10000);
  const [input, setInput] = useState('0');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const userRef = useRef<string | null>(null);
  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const flushingRef = useRef(false);
  const flushRequestedRef = useRef(false);
  const authInitializedRef = useRef(false);

  const load = useCallback(async (userId: string, revision: number) => {
    try {
      const result = await supabase.rpc('get_my_daily_steps', { p_date: date });
      if (revisionRef.current !== revision || userRef.current !== userId || savingRef.current) return;
      if (result.error) throw result.error;
      const summary = normalizeDailyStepRow(result.data);
      setSteps(summary.steps);
      setDailyGoal(summary.dailyGoal);
      setInput(String(summary.steps));
      setLoadError(false);
      setMessage(null);
    } catch {
      if (revisionRef.current === revision && userRef.current === userId && !savingRef.current) {
        setLoadError(true);
        setMessage('No se pudieron cargar los pasos. Recarga para intentarlo de nuevo.');
      }
    } finally {
      if (revisionRef.current === revision && userRef.current === userId && !savingRef.current) setLoading(false);
    }
  }, [date]);

  const flush = useCallback(async (userId: string, revision: number) => {
    if (flushingRef.current || savingRef.current || !navigator.onLine) return;
    flushingRef.current = true;
    const store = getOfflineDietStore();
    try {
      do {
        flushRequestedRef.current = false;
        while (navigator.onLine && userRef.current === userId) {
          const operation = (await store.list(userId))[0];
          if (!operation) break;
          const result = await supabase.rpc(operation.rpc, operation.params);
          if (result.error) break;
          await store.remove(userId, operation.id);
        }
      } while (flushRequestedRef.current && navigator.onLine && userRef.current === userId);
      if (revisionRef.current === revision && userRef.current === userId) {
        const pending = await store.list(userId);
        if (pending.length === 0) await load(userId, revision);
        else setMessage('Hay registros pendientes de sincronización.');
      }
    } catch {
      if (revisionRef.current === revision && userRef.current === userId) setMessage('Hay registros pendientes de sincronización.');
    } finally {
      flushingRef.current = false;
    }
  }, [load]);

  useEffect(() => {
    const revision = ++revisionRef.current;
    userRef.current = null;
    savingRef.current = false;
    flushRequestedRef.current = false;
    const start = async (activeRevision: number, userId: string | null) => {
      if (revisionRef.current !== activeRevision) return;
      userRef.current = userId;
      if (userId) {
        await load(userId, activeRevision);
        if (navigator.onLine) void flush(userId, activeRevision);
      } else {
        setLoadError(true);
        setLoading(false);
      }
    };
    const handleOnline = () => {
      const userId = userRef.current;
      if (userId) void flush(userId, revision);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user.id ?? null;
      if (authInitializedRef.current && userRef.current === nextUserId) return;
      authInitializedRef.current = true;
      const nextRevision = ++revisionRef.current;
      userRef.current = null;
      setLoading(true);
      setSteps(0);
      setDailyGoal(10000);
      setInput('0');
      setMessage(null);
      void start(nextRevision, nextUserId);
    });
    window.addEventListener('online', handleOnline);
    void supabase.auth.getSession().then(({ data: { session } }) => start(revision, session?.user.id ?? null));
    return () => {
      revisionRef.current += 1;
      userRef.current = null;
      subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
    };
  }, [load, flush]);

  async function save() {
    const userId = userRef.current;
    const revision = revisionRef.current;
    if (!userId || savingRef.current || loading || loadError) return;
    if (isOutsideCorrectionWindow(date) || date > madridDateString()) {
      setMessage('No puedes modificar los pasos de esta fecha.');
      return;
    }
    const parsed = parseDailySteps(input);
    if (parsed === null) {
      setMessage('Indica un número entero de pasos entre 0 y 200.000.');
      return;
    }
    const previous = { steps, input };
    savingRef.current = true;
    setSaving(true);
    setMessage(null);
    setSteps(parsed);
    setInput(String(parsed));
    const store = getOfflineDietStore();
    try {
      const pending = await store.list(userId);
      if (revisionRef.current !== revision || userRef.current !== userId) return;
      if (!navigator.onLine || flushingRef.current || pending.length > 0) {
        await store.enqueue(userId, { rpc: 'save_my_daily_steps', params: { p_date: date, p_steps: parsed } });
        if (flushingRef.current) flushRequestedRef.current = true;
        if (revisionRef.current === revision) setMessage(navigator.onLine ? 'Pasos pendientes de sincronización.' : 'Pasos guardados sin conexión. Se sincronizarán cuando vuelvas a estar online.');
        return;
      }
      const result = await supabase.rpc('save_my_daily_steps', { p_date: date, p_steps: parsed });
      if (result.error) throw result.error;
      if (revisionRef.current === revision) setMessage('Pasos guardados.');
    } catch {
      try {
        const result = await supabase.rpc('get_my_daily_steps', { p_date: date });
        if (revisionRef.current === revision && userRef.current === userId) {
          if (result.error) {
            setSteps(previous.steps);
            setInput(previous.input);
          } else {
            const confirmed = normalizeDailyStepRow(result.data);
            setSteps(confirmed.steps);
            setDailyGoal(confirmed.dailyGoal);
            setInput(String(confirmed.steps));
          }
          setMessage('No se pudieron guardar los pasos.');
        }
      } catch {
        if (revisionRef.current === revision) {
          setSteps(previous.steps);
          setInput(previous.input);
          setMessage('No se pudieron guardar los pasos.');
        }
      }
    } finally {
      if (revisionRef.current === revision && userRef.current === userId) {
        savingRef.current = false;
        setSaving(false);
        if (navigator.onLine) {
          void store.list(userId).then((operations: unknown[]) => {
            if (operations.length > 0 && revisionRef.current === revision) void flush(userId, revision);
          });
        }
      }
    }
  }

  return <DailyStepsCard
    steps={steps}
    dailyGoal={dailyGoal}
    input={input}
    readOnly={loading || loadError || isOutsideCorrectionWindow(date) || date > madridDateString()}
    saving={saving}
    message={message}
    onInputChange={setInput}
    onSave={() => void save()}
  />;
}
