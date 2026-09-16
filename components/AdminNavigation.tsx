'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, ClipboardList, Dumbbell, Users } from 'lucide-react';
import { deriveAdminViews, type AdminView } from '@/lib/authz.js';
import { useViewCapabilities } from '@/components/useViewCapabilities';

const ADMIN_DESTINATIONS = {
  admin: { label: 'Administrar dietas', path: '/admin', icon: ClipboardList },
  users: { label: 'Usuarios y permisos', path: '/users', icon: Users },
  gymAdmin: { label: 'Administrar gimnasio', path: '/gym-admin', icon: Dumbbell },
} as const;

type AdminNavigationProps = {
  current: AdminView;
  resolvedViews?: readonly AdminView[];
};

function AdminNavigationContent({ current, views }: { current: AdminView; views: readonly AdminView[] }) {
  const router = useRouter();
  return (
    <nav aria-label="Navegación de administración" className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-2">
        {views.map((view) => {
          const item = ADMIN_DESTINATIONS[view];
          const Icon = item.icon;
          const selected = view === current;
          return <button key={view} type="button" onClick={() => router.push(item.path)} aria-current={selected ? 'page' : undefined} className={`min-h-12 inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition ${selected ? 'bg-slate-800 text-white' : 'bg-white/70 text-slate-600 hover:bg-white hover:text-rose-500'}`}>
            <Icon aria-hidden="true" size={16} />{item.label}
          </button>;
        })}
      </div>
      <button type="button" onClick={() => router.push('/')} className="min-h-12 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-rose-500">
        <ArrowLeft aria-hidden="true" size={16} />Volver a app
      </button>
    </nav>
  );
}

function AdminNavigationFallback({ current }: { current: AdminView }) {
  const availableViews = useViewCapabilities();
  if (!availableViews) return null;
  return <AdminNavigationContent current={current} views={deriveAdminViews(availableViews)} />;
}

export function AdminNavigation({ current, resolvedViews }: AdminNavigationProps) {
  if (resolvedViews !== undefined) {
    return <AdminNavigationContent current={current} views={resolvedViews} />;
  }
  return <AdminNavigationFallback current={current} />;
}
