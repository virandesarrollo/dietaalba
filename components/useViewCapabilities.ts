'use client';

import { useEffect, useRef, useState } from 'react';
import { deriveAvailableViews, deriveCapabilities, type AppView, type RoleCode } from '@/lib/authz.js';
import { deriveFeatureCapabilities, normalizeFeatureRows } from '@/lib/feature-permissions.js';
import { supabase } from '@/lib/supabase';
import { advanceAuthIdentity, canCommitCapabilityLoad } from '@/lib/view-capabilities-guard.js';

export function useViewCapabilities() {
  const [availableViews, setAvailableViews] = useState<AppView[] | null>(null);
  const authGenerationRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);
  const authInitializedRef = useRef(false);

  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;
    const isAuthCurrent = (generation: number, userId: string, hasError = false) => canCommitCapabilityLoad({
      active,
      generation: authGenerationRef.current,
      userId: currentUserIdRef.current,
    }, { generation, userId, hasError });
    const clearCapabilities = () => setAvailableViews(null);

    async function loadCapabilities(userId: string, generation: number) {
      try {
        const [profileResult, membershipResult] = await Promise.all([
          supabase.from('profiles').select('is_sudo').eq('id', userId).maybeSingle(),
          supabase.from('group_memberships').select('id').eq('user_id', userId).eq('status', 'active').maybeSingle(),
        ]);
        if (!isAuthCurrent(generation, userId, Boolean(profileResult.error || membershipResult.error))) return;
        const membership = membershipResult.data as { id: string } | null;
        const [rolesResult, featuresResult] = await Promise.all([
          membership
            ? supabase.from('user_roles').select('role_code').eq('membership_id', membership.id)
            : Promise.resolve({ data: [] as { role_code: RoleCode }[], error: null }),
          supabase.rpc('get_my_features'),
        ]);
        if (!isAuthCurrent(generation, userId, Boolean(rolesResult.error || featuresResult.error))) return;
        const roles = (rolesResult.data ?? []).map((row) => (row as { role_code: RoleCode }).role_code);
        const profile = profileResult.data as { is_sudo?: boolean } | null;
        const { canAccessSettings, canTrackGymWorkouts, canManageGymWorkouts } = deriveFeatureCapabilities(
          normalizeFeatureRows(featuresResult.data),
        );
        setAvailableViews(deriveAvailableViews(deriveCapabilities(Boolean(profile?.is_sudo), roles), {
          canAccessSettings,
          canTrackGymWorkouts,
          canManageGymWorkouts,
        }));
      } catch {
        if (isAuthCurrent(generation, userId)) clearCapabilities();
      }
    }

    const applySession = (userId: string | null) => {
      const transition = advanceAuthIdentity({
        initialized: authInitializedRef.current,
        generation: authGenerationRef.current,
        userId: currentUserIdRef.current,
      }, userId);
      if (!transition.changed) return;
      authInitializedRef.current = transition.state.initialized;
      authGenerationRef.current = transition.state.generation;
      currentUserIdRef.current = transition.state.userId;
      clearCapabilities();
      if (userId) void loadCapabilities(userId, transition.state.generation);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true;
      applySession(session?.user.id ?? null);
    });
    supabase.auth.getSession()
      .then(({ data }) => { if (active && !receivedAuthEvent) applySession(data.session?.user.id ?? null); })
      .catch(() => { if (active && !receivedAuthEvent) applySession(null); });
    return () => {
      active = false;
      authGenerationRef.current += 1;
      currentUserIdRef.current = null;
      subscription.unsubscribe();
    };
  }, []);

  return availableViews;
}
