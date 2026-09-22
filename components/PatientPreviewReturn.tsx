'use client';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
export function PatientPreviewReturn() {
  const router = useRouter();
  if (typeof window === 'undefined' || !sessionStorage.getItem('patient-preview-admin-session')) return null;
  async function restore() { const stored = sessionStorage.getItem('patient-preview-admin-session'); if (!stored) return; const { error } = await supabase.auth.setSession(JSON.parse(stored)); if (!error) { sessionStorage.removeItem('patient-preview-admin-session'); router.replace('/users'); } }
  return <button type="button" role="menuitem" onClick={() => void restore()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-indigo-700 hover:bg-indigo-50">Volver a administrador</button>;
}
