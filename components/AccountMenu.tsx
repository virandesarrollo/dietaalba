'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Settings, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { deriveFeatureCapabilities, normalizeFeatureRows } from '@/lib/feature-permissions.js';
import { PatientPreviewReturn } from '@/components/PatientPreviewReturn';

type AccountMenuProps = {
  email?: string;
  canAccessSettings?: boolean;
  canUsePatientFriends?: boolean;
};

export function AccountMenu({ email = '', canAccessSettings, canUsePatientFriends = false }: AccountMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fetchedCanAccessSettings, setFetchedCanAccessSettings] = useState(false);
  const resolvedCanAccessSettings = canAccessSettings ?? fetchedCanAccessSettings;
  const containerRef = useRef<HTMLDivElement>(null);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [directory, setDirectory] = useState<Array<{ user_id: string; full_name: string; friendship_status: string | null }>>([]);

  async function openFriends() { setFriendsOpen(true); const { data } = await supabase.rpc('get_my_group_friend_directory'); setDirectory(Array.isArray(data) ? data : []); }
  async function requestFriend(userId: string) { await supabase.rpc('request_my_friend', { p_user_id: userId }); await openFriends(); }

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
          <PatientPreviewReturn />
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
          {canUsePatientFriends && <button type="button" role="menuitem" onClick={() => void openFriends()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-rose-50"><Users size={17} className="text-rose-400" /> Amigos</button>}
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
      {friendsOpen && <div className="theme-surface absolute right-0 top-12 z-[60] w-72 rounded-2xl border theme-border p-3 shadow-xl"><div className="mb-2 flex justify-between font-bold"><span>Amigos del grupo</span><button onClick={() => setFriendsOpen(false)}>×</button></div>{directory.map((person) => <div key={person.user_id} className="flex items-center justify-between py-2 text-sm"><span>{person.full_name}</span>{person.friendship_status ? <span className="text-xs text-slate-500">{person.friendship_status}</span> : <button onClick={() => void requestFriend(person.user_id)} className="rounded-lg bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-600">Añadir</button>}</div>)}</div>}
    </div>
  );
}
