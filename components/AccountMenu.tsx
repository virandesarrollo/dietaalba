'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Settings } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { deriveFeatureCapabilities, normalizeFeatureRows } from '@/lib/feature-permissions.js';

type AccountMenuProps = {
  email?: string;
  canAccessSettings?: boolean;
};

export function AccountMenu({ email = '', canAccessSettings }: AccountMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fetchedCanAccessSettings, setFetchedCanAccessSettings] = useState(false);
  const resolvedCanAccessSettings = canAccessSettings ?? fetchedCanAccessSettings;
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
    if (canAccessSettings !== undefined) return;
    void supabase.rpc('get_my_features').then((result) => setFetchedCanAccessSettings(deriveFeatureCapabilities(normalizeFeatureRows(result.data)).canAccessSettings));
  }, [canAccessSettings]);

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
        <div role="menu" className="theme-surface absolute right-0 top-12 z-50 min-w-48 overflow-hidden rounded-2xl border theme-border p-1.5 shadow-xl">
          {resolvedCanAccessSettings && (
            <button
              type="button"
              role="menuitem"
              onClick={openSettings}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-rose-50"
            >
              <Settings size={17} className="text-rose-400" /> Ajustes
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => void logout()}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-500 hover:bg-rose-50"
          >
            <LogOut size={17} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
