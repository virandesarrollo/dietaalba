'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Salad, Users } from 'lucide-react';
import {
  deriveAvailableViews,
  deriveCapabilities,
  type AppView,
  type Capabilities,
  type RoleCode,
} from '@/lib/authz.js';
import { supabase } from '@/lib/supabase';

const VIEW_DATA = {
  patient: { label: 'Mi dieta', path: '/', icon: Salad },
  admin: { label: 'Administrar dietas', path: '/admin', icon: ClipboardList },
  users: { label: 'Usuarios y permisos', path: '/users', icon: Users },
} as const;

type Props = {
  current: AppView;
  vertical?: boolean;
};

export function ViewNavigation({ current, vertical = false }: Props) {
  const router = useRouter();
  const [resolvedCapabilities, setResolvedCapabilities] = useState<Capabilities | null>(null);

  useEffect(() => {
    let active = true;
    async function loadCapabilities() {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) return;

      const [profileResult, membershipResult] = await Promise.all([
        supabase.from('profiles').select('is_sudo').eq('id', session.user.id).maybeSingle(),
        supabase.from('group_memberships').select('id').eq('user_id', session.user.id).eq('status', 'active').maybeSingle(),
      ]);
      if (!active || profileResult.error || membershipResult.error) return;

      const membership = membershipResult.data as { id: string } | null;
      const rolesResult = membership
        ? await supabase.from('user_roles').select('role_code').eq('membership_id', membership.id)
        : { data: [] as { role_code: RoleCode }[], error: null };
      if (!active || rolesResult.error) return;

      const roles = (rolesResult.data ?? []).map((row) => (row as { role_code: RoleCode }).role_code);
      const profile = profileResult.data as { is_sudo?: boolean } | null;
      setResolvedCapabilities(deriveCapabilities(Boolean(profile?.is_sudo), roles));
    }

    void loadCapabilities();
    return () => { active = false; };
  }, []);

  if (!resolvedCapabilities) return null;
  const views = deriveAvailableViews(resolvedCapabilities);
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
            className={`${vertical ? 'w-full' : ''} flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition ${
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
