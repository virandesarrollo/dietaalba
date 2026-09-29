import { LoaderCircle } from 'lucide-react';

export default function Loading() {
  return <main role="status" aria-live="polite" className="theme-page flex min-h-screen items-center justify-center px-5 text-slate-700">
    <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-semibold shadow-lg">
      <LoaderCircle aria-hidden="true" className="animate-spin text-rose-500" size={22} />
      Cargando…
    </div>
  </main>;
}
