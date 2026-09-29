'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChartNoAxesCombined, ClipboardList, Dumbbell, HeartPulse, Salad, Users, UserRoundCog, LoaderCircle } from 'lucide-react';
import { deriveAdminViews, deriveAppViews } from '@/lib/authz.js';
import { useViewCapabilities } from '@/components/useViewCapabilities';

const destinations = {
  patient: { label: 'Mi día', path: '/', icon: Salad },
  training: { label: 'Entrenamiento', path: '/training', icon: Dumbbell },
  health: { label: 'Salud', path: '/health', icon: HeartPulse },
  friends: { label: 'Amigos', path: '/friends', icon: Users },
  users: { label: 'Usuarios', path: '/users', icon: UserRoundCog },
  admin: { label: 'Dietas', path: '/admin', icon: ClipboardList },
  gymAdmin: { label: 'Gimnasio', path: '/gym-admin', icon: Dumbbell },
  patientControl: { label: 'Pacientes', path: '/patient-control', icon: ChartNoAxesCombined },
} as const;

export function UnifiedBottomNavigation() {
  const pathname = usePathname();
  const availableViews = useViewCapabilities();
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingPath) return;
    const timeout = window.setTimeout(() => setPendingPath(null), pathname === pendingPath ? 250 : 10000);
    return () => window.clearTimeout(timeout);
  }, [pathname, pendingPath]);

  if (!availableViews || pathname === '/patient-preview') return null;
  const views = [...deriveAppViews(availableViews), ...deriveAdminViews(availableViews)]
    .filter((view): view is keyof typeof destinations => view !== 'settings');

  return <>
    <nav aria-label="Navegación de la app" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/60 bg-white/90 px-2 pt-2 shadow-lg backdrop-blur-xl" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
      <div className="mx-auto flex max-w-2xl items-center justify-around gap-1 overflow-x-auto">
        {views.map((view) => {
          const item = destinations[view];
          const Icon = item.icon;
          const selected = pathname === item.path || (view === 'patient' && (pathname === '/schedule' || pathname === '/self-control'));
          return <Link key={view} href={item.path} aria-label={item.label} title={item.label} aria-current={selected ? 'page' : undefined} onClick={(event) => {
            if (pathname === item.path || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            setPendingPath(item.path);
          }} className={`flex min-h-12 min-w-12 flex-1 shrink-0 items-center justify-center rounded-2xl px-3 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 ${selected ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-rose-50 hover:text-rose-500'}`}>
            <Icon aria-hidden="true" size={22} />
          </Link>;
        })}
      </div>
    </nav>
    <div aria-hidden="true" style={{ height: 'calc(4rem + max(0.5rem, env(safe-area-inset-bottom)))' }} />
    {pendingPath && <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 backdrop-blur-[2px]">
      <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-slate-700 shadow-xl"><LoaderCircle aria-hidden="true" className="animate-spin text-rose-500" size={22} />Cargando…</div>
    </div>}
  </>;
}
