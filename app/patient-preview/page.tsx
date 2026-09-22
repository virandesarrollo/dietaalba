'use client';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
function PatientPreviewContent() {
  const router = useRouter(); const searchParams = useSearchParams();
  useEffect(() => { const code = searchParams.get('code'); if (!code) { router.replace('/'); return; } void supabase.auth.exchangeCodeForSession(code).then(({ error }) => router.replace(error ? '/?error=patient-preview-auth-error' : '/')); }, [router, searchParams]);
  return <main className="theme-page flex min-h-screen items-center justify-center text-sm text-slate-500">Abriendo vista de paciente…</main>;
}

export default function PatientPreviewPage() {
  return <Suspense fallback={<main className="theme-page flex min-h-screen items-center justify-center text-sm text-slate-500">Abriendo vista de paciente…</main>}><PatientPreviewContent /></Suspense>;
}
