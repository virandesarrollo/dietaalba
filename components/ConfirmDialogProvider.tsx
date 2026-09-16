'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
};

type PendingConfirmation = ConfirmOptions & { resolve: (confirmed: boolean) => void };
type ConfirmDialog = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmDialogContext = createContext<ConfirmDialog | null>(null);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const pendingRef = useRef<PendingConfirmation | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const finish = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    current.resolve(confirmed);
    requestAnimationFrame(() => previouslyFocusedRef.current?.focus());
  }, []);

  const confirmDialog = useCallback<ConfirmDialog>((options) => {
    if (pendingRef.current) return Promise.resolve(false);
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return new Promise<boolean>((resolve) => {
      const request = { ...options, resolve };
      pendingRef.current = request;
      setPending(request);
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelButtonRef.current?.focus();
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish(false);
    };
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('keydown', closeWithEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [finish, pending]);

  useEffect(() => () => {
    pendingRef.current?.resolve(false);
    pendingRef.current = null;
  }, []);

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <ConfirmDialogContext.Provider value={confirmDialog}>
      <div inert={pending ? true : undefined} aria-hidden={pending ? true : undefined}>{children}</div>
      {pending && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-5 backdrop-blur-sm">
          <section ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description" onKeyDown={handleDialogKeyDown} className="theme-surface w-full max-w-sm rounded-3xl border theme-border p-6 shadow-2xl">
            <h2 id="confirm-dialog-title" className="text-lg font-bold text-slate-800">{pending.title}</h2>
            <p id="confirm-dialog-description" className="mt-3 text-sm leading-relaxed text-slate-600">{pending.message}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button ref={cancelButtonRef} type="button" onClick={() => finish(false)} className="min-h-14 rounded-2xl bg-slate-100 px-4 font-bold text-slate-800">
                {pending.cancelLabel ?? 'Cancelar'}
              </button>
              <button type="button" onClick={() => finish(true)} className={`min-h-14 rounded-2xl px-4 font-bold text-white ${pending.tone === 'danger' ? 'bg-rose-600' : 'bg-slate-800'}`}>
                {pending.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </section>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const value = useContext(ConfirmDialogContext);
  if (!value) throw new Error('useConfirmDialog debe usarse dentro de ConfirmDialogProvider');
  return value;
}
