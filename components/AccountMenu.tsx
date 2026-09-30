'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChartNoAxesCombined, ClipboardList, Dumbbell, LogOut, Settings, UserRoundCog } from 'lucide-react';
import { deriveAdminViews } from '@/lib/authz.js';
import { useViewCapabilities } from '@/components/useViewCapabilities';
import { supabase } from '@/lib/supabase';
import { deriveFeatureCapabilities, normalizeFeatureRows } from '@/lib/feature-permissions.js';
import { PatientPreviewReturn } from '@/components/PatientPreviewReturn';
import { madridDateString } from '@/lib/historical-date.js';

type AccountMenuProps = {
  email?: string;
  canAccessSettings?: boolean;
  canViewDaySchedule?: boolean;
  scheduleDate?: string;
};

const adminDestinations = {
  users: { label: 'Usuarios', path: '/users', icon: UserRoundCog },
  admin: { label: 'Dietas', path: '/admin', icon: ClipboardList },
  gymAdmin: { label: 'Gimnasio', path: '/gym-admin', icon: Dumbbell },
  patientControl: { label: 'Pacientes', path: '/patient-control', icon: ChartNoAxesCombined },
} as const;

export function AccountMenu({ email = '', canAccessSettings, canViewDaySchedule, scheduleDate }: AccountMenuProps) {
  const router = useRouter();
  const availableViews = useViewCapabilities();
  const adminViews = deriveAdminViews(availableViews ?? []);
  const [open, setOpen] = useState(false);
  const [fetchedCanAccessSettings, setFetchedCanAccessSettings] = useState(false);
  const [fetchedCanViewDaySchedule, setFetchedCanViewDaySchedule] = useState(false);
  const resolvedCanAccessSettings = canAccessSettings ?? fetchedCanAccessSettings;
  const resolvedCanViewDaySchedule = canViewDaySchedule ?? fetchedCanViewDaySchedule;
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;

    function closeOutside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [open]);

  useEffect(() => {
    if (canAccessSettings !== undefined && canViewDaySchedule !== undefined) return;
    void supabase.rpc('get_my_features').then((result) => {
      const capabilities = deriveFeatureCapabilities(normalizeFeatureRows(result.data));
      setFetchedCanAccessSettings(capabilities.canAccessSettings);
      setFetchedCanViewDaySchedule(capabilities.canViewDaySchedule);
    });
  }, [canAccessSettings, canViewDaySchedule]);

  function openSettings() {
    setOpen(false);
    router.push('/settings');
  }

  async function logout() {
    setOpen(false);
    await supabase.auth.signOut();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Abrir menú de cuenta"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-pink-200 bg-white/70 text-xs font-bold text-pink-500 shadow-sm transition hover:bg-white"
      >
        {email.charAt(0).toUpperCase() || 'U'}
      </button>

      {open && (
        <div role="menu" className="theme-surface absolute right-0 top-12 z-50 max-h-[75vh] min-w-64 overflow-y-auto rounded-2xl border theme-border p-2 shadow-xl">
          <PatientPreviewReturn />
          {adminViews.length > 0 && <p className="px-4 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-slate-500">Administración</p>}
          {adminViews.map((view) => {
            const item = adminDestinations[view];
            const Icon = item.icon;
            return <button key={view} type="button" role="menuitem" onClick={() => { setOpen(false); router.push(item.path); }} className="flex min-h-14 w-full items-center gap-4 rounded-xl px-4 py-3 text-left text-base font-semibold text-slate-700 hover:bg-rose-50">
              <Icon size={22} className="text-rose-400" /> {item.label}
            </button>;
          })}
          {resolvedCanViewDaySchedule && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); router.push(`/schedule?date=${scheduleDate ?? madridDateString()}`); }} className="flex min-h-14 w-full items-center gap-4 rounded-xl px-4 py-3 text-left text-base font-semibold text-slate-700 hover:bg-rose-50">
              <CalendarDays size={22} className="text-rose-400" /> Horarios
            </button>
          )}
          {resolvedCanAccessSettings && (
            <button
              type="button"
              role="menuitem"
              onClick={openSettings}
              className="flex min-h-14 w-full items-center gap-4 rounded-xl px-4 py-3 text-left text-base font-semibold text-slate-700 hover:bg-rose-50"
            >
              <Settings size={22} className="text-rose-400" /> Ajustes
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => void logout()}
            className="flex min-h-14 w-full items-center gap-4 rounded-xl px-4 py-3 text-left text-base font-semibold text-rose-500 hover:bg-rose-50"
          >
            <LogOut size={22} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
