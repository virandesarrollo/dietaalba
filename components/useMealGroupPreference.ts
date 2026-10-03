'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Preference = {
  userId: string | null;
  expanded: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

export function useMealGroupPreference(userId: string | null) {
  const [preference, setPreference] = useState<Preference>({ userId, expanded: true, loading: Boolean(userId), saving: false, error: null });
  const generationRef = useRef(0);
  if (preference.userId !== userId) {
    setPreference({ userId, expanded: true, loading: Boolean(userId), saving: false, error: null });
  }

  useEffect(() => {
    let active = true;
    generationRef.current += 1;
    if (userId) {
      void (async () => {
        try {
          const { data, error } = await supabase.rpc('get_my_meal_groups_expanded');
          if (active) setPreference(previous => previous.userId === userId ? {
            ...previous, expanded: error ? true : data !== false, loading: false,
            error: error ? 'No se pudo cargar la preferencia de comidas.' : null,
          } : previous);
        } catch {
          if (active) setPreference(previous => previous.userId === userId ? { ...previous, loading: false, error: 'No se pudo cargar la preferencia de comidas.' } : previous);
        }
      })();
    }
    return () => { active = false; generationRef.current += 1; };
  }, [userId]);

  async function setExpanded(expanded: boolean) {
    if (!userId || preference.loading || preference.saving) return;
    const generation = generationRef.current;
    setPreference(previous => ({ ...previous, saving: true, error: null }));
    try {
      const { error } = await supabase.rpc('set_my_meal_groups_expanded', { p_expanded: expanded });
      if (generation !== generationRef.current) return;
      setPreference(previous => previous.userId === userId ? {
        ...previous, expanded: error ? previous.expanded : expanded, saving: false,
        error: error ? 'No se pudo guardar la preferencia de comidas.' : null,
      } : previous);
    } catch {
      if (generation !== generationRef.current) return;
      setPreference(previous => previous.userId === userId ? { ...previous, saving: false, error: 'No se pudo guardar la preferencia de comidas.' } : previous);
    }
  }

  return { ...preference, setExpanded };
}
