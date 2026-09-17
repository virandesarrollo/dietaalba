'use client';

import { useRouter } from 'next/navigation';
import { Dumbbell, Salad } from 'lucide-react';
import { deriveAppViews, type PersonalAppView } from '@/lib/authz.js';
import { useViewCapabilities } from '@/components/useViewCapabilities';

const APP_DESTINATIONS = {
  patient: { label: 'Comida', path: '/', icon: Salad },
  training: { label: 'Entrenamiento', path: '/training', icon: Dumbbell },
} as const;

type Props = {
  current: PersonalAppView;
  resolvedViews?: readonly PersonalAppView[];
};

function AppMobileNavigationContent({ current, views }: { current: PersonalAppView; views: readonly PersonalAppView[] }) {
  const router = useRouter();
  if (!views.includes('patient')) return null;
  const mobileViews = views.filter((view): view is 'patient' | 'training' => view === 'patient' || view === 'training');
  return (
    <nav aria-label="Navegación de la app" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/50 bg-white/80 px-3 pt-2 shadow-lg backdrop-blur-xl" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
      <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1">
        {mobileViews.map((view) => {
          const item = APP_DESTINATIONS[view];
          const Icon = item.icon;
          const selected = view === current;
          return <button key={view} type="button" onClick={() => router.push(item.path)} aria-current={selected ? 'page' : undefined} className={`min-h-12 min-w-12 flex-1 rounded-2xl px-2 py-1 text-xs font-semibold transition ${selected ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-white hover:text-rose-500'}`}>
            <Icon aria-hidden="true" className="mx-auto mb-0.5" size={19} /><span>{item.label}</span>
          </button>;
        })}
      </div>
    </nav>
  );
}

function AppMobileNavigationFallback({ current }: Pick<Props, 'current'>) {
  const availableViews = useViewCapabilities();
  if (!availableViews) return null;
  const views = deriveAppViews(availableViews);
  return <AppMobileNavigationContent current={current} views={views} />;
}

export function AppMobileNavigation({ current, resolvedViews }: Props) {
  if (resolvedViews !== undefined) return <AppMobileNavigationContent current={current} views={resolvedViews} />;
  return <AppMobileNavigationFallback current={current} />;
}
