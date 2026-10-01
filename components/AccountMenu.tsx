'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { CalendarDays, ChartNoAxesCombined, ClipboardList, Dumbbell, LogOut, Settings, UserRoundCog, X } from 'lucide-react';
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
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    function closeOutside(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
      const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      if (buttons.length === 0) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Tab') {
        if (index === -1 || (event.shiftKey ? index === 0 : index === buttons.length - 1)) {
          event.preventDefault();
          buttons[event.shiftKey ? buttons.length - 1 : 0].focus();
        }
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
      }
    }

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeWithEscape);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
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
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Abrir menú de cuenta"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-pink-200 bg-white/70 text-xs font-bold text-pink-500 shadow-sm transition hover:bg-white"
      >
        {email.charAt(0).toUpperCase() || 'U'}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[100] bg-slate-950/50">
          <section
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="theme-surface theme-border absolute inset-x-0 bottom-0 mx-auto max-h-[80dvh] max-w-md overflow-y-auto overscroll-contain rounded-t-3xl border p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between gap-4">
              <h2 id={titleId} className="text-lg font-bold text-slate-800">Mi cuenta</h2>
              <button type="button" aria-label="Cerrar menú de cuenta" onClick={() => setOpen(false)} className="flex min-h-12 min-w-12 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">
                <X size={22} />
              </button>
            </div>
            <div role="menu" aria-labelledby={titleId}>
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
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}
