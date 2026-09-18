'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AdminNavigation } from '@/components/AdminNavigation';
import type { AdminView } from '@/lib/authz.js';
import { supabase } from '@/lib/supabase';

export function AdminSidebar({ current, views, name = 'Usuario', email = '' }: { current: AdminView; views: readonly AdminView[]; name?: string; email?: string }) {
  const router = useRouter();
  async function logout() { await supabase.auth.signOut(); router.replace('/'); }
  return <aside className="border-b border-rose-100 bg-white/90 px-5 py-6 shadow-sm backdrop-blur lg:fixed lg:inset-y-0 lg:left-0 lg:w-80 lg:border-b-0 lg:border-r lg:px-7 lg:py-8"><div className="flex h-full flex-col"><div className="mb-7"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">Panel profesional</p><h1 className="mt-2 text-2xl font-bold text-slate-800">Dieta Alba - Admin</h1><div className="mt-4 rounded-2xl bg-rose-50 p-4"><p className="font-semibold text-slate-700">{name}</p>{email && <p className="mt-1 truncate text-xs text-slate-500">{email}</p>}</div></div><nav className="mt-auto space-y-2 border-t border-slate-100 pt-5"><AdminNavigation current={current} resolvedViews={views} /><button type="button" onClick={() => void logout()} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-rose-500 hover:bg-rose-50"><LogOut size={17} /> Cerrar sesión</button></nav></div></aside>;
}
