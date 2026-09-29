"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp, X } from "lucide-react";
import {
  buildProgressChartPoints,
  buildProgressSessions,
  summarizeProgress,
  type ProgressRow,
} from "@/lib/gym-progress.js";
import { decideFocusTrapTarget } from "@/lib/gym-workouts.js";

type Props = {
  exerciseName: string;
  rows: ProgressRow[];
  loading: boolean;
  error: string;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
};

function formatSessionDate(date: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Madrid",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function GymProgressDialog({
  exerciseName,
  rows,
  loading,
  error,
  onClose,
  returnFocusRef,
}: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const [range, setRange] = useState<"all" | "last10">("last10");
  const sessions = useMemo(
    () => buildProgressSessions(rows, range === "last10" ? 10 : undefined),
    [range, rows],
  );
  const summary = useMemo(() => summarizeProgress(sessions), [sessions]);
  const points = useMemo(() => buildProgressChartPoints(sessions), [sessions]);
  const weights = points.map((point) => point.weightKg);
  const chartMinimum = weights.length ? Math.min(...weights) : 0;
  const chartMaximum = weights.length ? Math.max(...weights) : 0;
  const polyline = points
    .map((point) => `${38 + point.x * 2.45},${18 + point.y * 1.7}`)
    .join(" ");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocus = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("keydown", closeWithEscape);
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => returnFocus?.focus());
    };
  }, [onClose, returnFocusRef]);

  const change = summary.changeKg;
  const ChangeIcon = change === null || change === 0
    ? Minus
    : change > 0 ? ArrowUpRight : ArrowDownRight;

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ];
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const activeElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const target = decideFocusTrapTarget(
      focusable,
      activeElement,
      event.shiftKey,
      activeElement === dialogRef.current,
    );
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-2 backdrop-blur-sm sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gym-progress-title"
        onKeyDown={handleDialogKeyDown}
        className="gym-progress-sheet w-full max-w-lg overflow-hidden"
      >
        <header className="gym-progress-hero">
          <div className="gym-progress-hero-icon" aria-hidden="true">
            <TrendingUp />
          </div>
          <div className="min-w-0 flex-1">
            <p className="gym-progress-eyebrow">Seguimiento</p>
            <h2 id="gym-progress-title" className="truncate text-xl font-black">
              {exerciseName}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Cerrar seguimiento"
            onClick={onClose}
            className="gym-progress-close"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="gym-progress-body">
          <div className="gym-progress-filter" aria-label="Filtrar sesiones">
            <button
              type="button"
              aria-pressed={range === "all"}
              onClick={() => setRange("all")}
            >
              Todo
            </button>
            <button
              type="button"
              aria-pressed={range === "last10"}
              onClick={() => setRange("last10")}
            >
              Últimas 10
            </button>
          </div>

          {loading ? (
            <div className="gym-progress-state" role="status">
              <span className="gym-progress-spinner" aria-hidden="true" />
              Cargando seguimiento…
            </div>
          ) : error ? (
            <div className="gym-progress-state is-error" role="alert">
              {error || "No se pudo cargar el seguimiento."}
            </div>
          ) : sessions.length === 0 ? (
            <div className="gym-progress-state">
              <TrendingUp aria-hidden="true" />
              <b>Aún no hay series para mostrar</b>
              <span>Registra una serie y aquí verás tu evolución.</span>
            </div>
          ) : (
            <>
              <div className="gym-progress-stats">
                <article className="gym-progress-stat">
                  <span>Último</span>
                  <strong>{summary.latest?.weightKg} kg</strong>
                  <small>{summary.latest?.reps} reps</small>
                </article>
                <article className="gym-progress-stat is-accent">
                  <span>Máximo</span>
                  <strong>{summary.maximum?.weightKg} kg</strong>
                  <small>{summary.maximum?.reps} reps</small>
                </article>
                <article className={`gym-progress-stat ${change !== null && change > 0 ? "is-positive" : ""}`}>
                  <span>Evolución</span>
                  <strong className="flex items-center gap-1">
                    <ChangeIcon size={18} aria-hidden="true" />
                    {change !== null && change > 0 ? "+" : ""}{change} kg
                  </strong>
                  <small>{sessions.length} sesiones</small>
                </article>
              </div>

              <div className="gym-progress-chart">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold">Evolución del peso</h3>
                    <p className="text-xs theme-muted">Mejor serie de cada sesión</p>
                  </div>
                  <span className="gym-progress-count">{sessions.length} sesiones</span>
                </div>
                <svg viewBox="0 0 320 210" role="img" aria-label="Evolución del peso por sesión">
                  <defs>
                    <linearGradient id="gym-progress-line" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0" stopColor="#8b5cf6" />
                      <stop offset="1" stopColor="#ec4899" />
                    </linearGradient>
                  </defs>
                  {[45, 95, 145].map((y) => (
                    <line key={y} x1="38" x2="283" y1={y} y2={y} className="gym-progress-grid" />
                  ))}
                  <text x="4" y="26" className="gym-progress-axis">{chartMaximum} kg</text>
                  <text x="4" y="169" className="gym-progress-axis">{chartMinimum} kg</text>
                  {points.length > 1 && (
                    <polyline points={polyline} className="gym-progress-line" />
                  )}
                  {points.map((point) => {
                    const x = 38 + point.x * 2.45;
                    const y = 18 + point.y * 1.7;
                    return (
                      <g key={point.date}>
                        <circle cx={x} cy={y} r="8" className="gym-progress-dot-halo" />
                        <circle cx={x} cy={y} r="4.5" className="gym-progress-dot" />
                        <text x={x} y={Math.max(13, y - 12)} textAnchor="middle" className="gym-progress-reps">
                          {point.reps}r
                        </text>
                      </g>
                    );
                  })}
                  <text x="38" y="199" className="gym-progress-date">
                    {formatSessionDate(sessions[0].date).replace(/ de /g, " ")}
                  </text>
                  <text x="283" y="199" textAnchor="end" className="gym-progress-date">
                    {formatSessionDate(sessions[sessions.length - 1].date).replace(/ de /g, " ")}
                  </text>
                </svg>
              </div>

              <section className="gym-progress-history" aria-labelledby="gym-progress-history-title">
                <div className="flex items-center justify-between">
                  <h3 id="gym-progress-history-title" className="font-extrabold">Historial</h3>
                  <span className="text-xs theme-muted">Más reciente primero</span>
                </div>
                {[...sessions].reverse().map((session) => {
                  const bestSetIndex = session.sets.findIndex((set) =>
                    set.weightKg === session.bestSet.weightKg &&
                    set.reps === session.bestSet.reps,
                  );
                  const remainingSets = session.sets.filter((_, index) => index !== bestSetIndex);
                  return (
                    <article key={session.date} className="gym-progress-session">
                      <div>
                        <time dateTime={session.date}>{formatSessionDate(session.date)}</time>
                        <p>
                          {remainingSets.length
                            ? remainingSets.map((set) => `${set.weightKg} kg × ${set.reps}`).join(" · ")
                            : "Única serie"}
                        </p>
                      </div>
                      <strong>{session.bestSet.weightKg} kg <small>× {session.bestSet.reps}</small></strong>
                    </article>
                  );
                })}
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
