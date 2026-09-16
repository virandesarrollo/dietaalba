'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Dumbbell, Salad, Settings, Users } from 'lucide-react';
import {
  deriveAvailableViews,
  deriveCapabilities,
  type AppView,
  type Capabilities,
  type RoleCode,
} from '@/lib/authz.js';
import { deriveFeatureCapabilities, normalizeFeatureRows } from '@/lib/feature-permissions.js';
import { supabase } from '@/lib/supabase';

const VIEW_DATA = {
  patient: { label: 'Mi dieta', path: '/', icon: Salad },
  admin: { label: 'Administrar dietas', path: '/admin', icon: ClipboardList },
  users: { label: 'Usuarios y permisos', path: '/users', icon: Users },
  settings: { label: 'Ajustes', path: '/settings', icon: Settings },
  training: { label: 'Entrenamiento', path: '/training', icon: Dumbbell },
  gymAdmin: { label: 'Administrar gimnasio', path: '/gym-admin', icon: Dumbbell },
} as const;

type Props = {
  current: AppView;
  vertical?: boolean;
  showSettings?: boolean;
};

export function ViewNavigation({ current, vertical = false, showSettings = true }: Props) {
  const router = useRouter();
  const [resolvedCapabilities, setResolvedCapabilities] = useState<Capabilities | null>(null);
  const [canAccessSettings, setCanAccessSettings] = useState(false);
  const [canTrackGymWorkouts, setCanTrackGymWorkouts] = useState(false);
  const [canManageGymWorkouts, setCanManageGymWorkouts] = useState(false);
  const authGenerationRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;
    const isAuthCurrent = (generation: number, userId: string) => active
      && generation === authGenerationRef.current
      && userId === currentUserIdRef.current;
    const clearCapabilities = () => {
      setResolvedCapabilities(null);
      setCanAccessSettings(false);
      setCanTrackGymWorkouts(false);
      setCanManageGymWorkouts(false);
    };
    async function loadCapabilities(userId: string, generation: number) {
      try {
        const [profileResult, membershipResult] = await Promise.all([
          supabase.from('profiles').select('is_sudo').eq('id', userId).maybeSingle(),
          supabase.from('group_memberships').select('id').eq('user_id', userId).eq('status', 'active').maybeSingle(),
        ]);
        if (!isAuthCurrent(generation, userId) || profileResult.error || membershipResult.error) return;
        const membership = membershipResult.data as { id: string } | null;
        const [rolesResult, featuresResult] = await Promise.all([
          membership
            ? supabase.from('user_roles').select('role_code').eq('membership_id', membership.id)
            : Promise.resolve({ data: [] as { role_code: RoleCode }[], error: null }),
          supabase.rpc('get_my_features'),
        ]);
        if (!isAuthCurrent(generation, userId) || rolesResult.error || featuresResult.error) return;
        const roles = (rolesResult.data ?? []).map((row) => (row as { role_code: RoleCode }).role_code);
        const profile = profileResult.data as { is_sudo?: boolean } | null;
        const featureCapabilities = deriveFeatureCapabilities(normalizeFeatureRows(featuresResult.data));
        setResolvedCapabilities(deriveCapabilities(Boolean(profile?.is_sudo), roles));
        setCanAccessSettings(featureCapabilities.canAccessSettings);
        setCanTrackGymWorkouts(featureCapabilities.canTrackGymWorkouts);
        setCanManageGymWorkouts(featureCapabilities.canManageGymWorkouts);
      } catch {
        if (isAuthCurrent(generation, userId)) clearCapabilities();
      }
    }
    const applySession = (userId: string | null) => {
      const generation = ++authGenerationRef.current;
      currentUserIdRef.current = userId;
      clearCapabilities();
      if (userId) void loadCapabilities(userId, generation);
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

  if (!resolvedCapabilities) return null;
  const views = deriveAvailableViews(resolvedCapabilities, {
    canAccessSettings,
    canTrackGymWorkouts,
    canManageGymWorkouts,
  })
    .filter((view) => showSettings || view !== 'settings');
  if (views.length < 2) return null;

  return (
    <nav aria-label="Cambiar vista" className={vertical ? 'space-y-2' : 'flex flex-wrap gap-2'}>
      {views.map((view) => {
        const item = VIEW_DATA[view];
        const Icon = item.icon;
        const selected = view === current;
        return (
          <button
            key={view}
            type="button"
            onClick={() => router.push(item.path)}
            disabled={selected}
            aria-current={selected ? 'page' : undefined}
            className={`${vertical ? 'w-full' : ''} min-h-12 flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition ${
              selected
                ? 'bg-slate-800 text-white'
                : 'bg-white/70 text-slate-600 hover:bg-white hover:text-rose-500'
            }`}
          >
            <Icon size={15} /> {item.label}
          </button>
        );
      })}
    </nav>
  );
}
