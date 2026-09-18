"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AppMobileNavigation } from "@/components/AppMobileNavigation";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { supabase } from "@/lib/supabase";
import { formatWorkoutDate } from "@/lib/gym-workouts.js";
type R = {
  id: string;
  recorded_at: string;
  weight_kg: number | null;
  body_fat_percentage: number | null;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
};
const day = (d: string, n = 0) => {
  const x = new Date(`${d}T12:00`);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};
const blank = (d: string) => ({
  recorded_at: `${d}T12:00`,
  weight_kg: 0,
  body_fat_percentage: 0,
  systolic: 0,
  diastolic: 0,
  pulse: 0,
});
const blankNow = (d: string) => {
  const now = new Date();
  const pad = (part: number) => String(part).padStart(2, "0");
  return { ...blank(d), recorded_at: `${d}T${pad(now.getHours())}:${pad(now.getMinutes())}` };
};
const measurementOrdinals = ["Primera", "Segunda", "Tercera", "Cuarta", "Quinta"];
const localDateTimeInput = (value: string) => {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
function C({
  l,
  v,
  s = 1,
  set,
}: {
  l: string;
  v: number;
  s?: number;
  set: (v: number) => void;
}) {
  return (
    <div className="mb-3">
      <b className="block text-center text-xs">{l}</b>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => set(Math.max(0, v - s))}
          className="min-h-14 min-w-14 rounded-2xl bg-slate-100 text-2xl"
        >
          −
        </button>
        <input
          type="number"
          step={s}
          value={v || ""}
          onChange={(e) => set(Number(e.target.value))}
          className="min-h-14 min-w-0 flex-1 rounded-2xl border text-center text-lg font-bold"
        />
        <button
          type="button"
          onClick={() => set(v + s)}
          className="min-h-14 min-w-14 rounded-2xl bg-slate-100 text-2xl"
        >
          +
        </button>
      </div>
    </div>
  );
}
export default function Health() {
  const confirmDialog = useConfirmDialog();
  const [d, setD] = useState(new Date().toISOString().slice(0, 10)),
    [rows, setRows] = useState<R[]>([]),
    [f, setF] = useState<ReturnType<typeof blank> | null>(null),
    [editingId, setEditingId] = useState<string | null>(null),
    [userId, setUserId] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    void supabase.auth
      .getSession()
      .then(({ data }) => setUserId(data.session?.user.id ?? ""));
    void supabase
      .from("health_records")
      .select("*")
      .gte("recorded_at", `${d}T00:00`)
      .lt("recorded_at", `${day(d, 1)}T00:00`)
      .order("recorded_at", { ascending: true })
      .then((r) => {
        const loadedRows = (r.data ?? []) as R[];
        setRows(loadedRows);
        if (loadedRows.length === 1) edit(loadedRows[0]);
      });
  }, [d]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f) return;
    if (
      ![
        f.weight_kg,
        f.body_fat_percentage,
        f.systolic,
        f.diastolic,
        f.pulse,
      ].some((value) => value > 0)
    ) {
      setError("Indica al menos un valor mayor que cero.");
      return;
    }
    setError("");
    const p = {
      ...f,
      user_id: userId,
      recorded_at: new Date(f.recorded_at).toISOString(),
      weight_kg: f.weight_kg || null,
      body_fat_percentage: f.body_fat_percentage || null,
      systolic: f.systolic || null,
      diastolic: f.diastolic || null,
      pulse: f.pulse || null,
    };
    const query = editingId
      ? supabase.from("health_records").update(p).eq("id", editingId)
      : supabase.from("health_records").insert(p);
    const result = await query.select().single();
    if (result.error) {
      setError("No se pudo guardar la medición.");
      return;
    }
    setF(null);
    setEditingId(null);
    setRows((current) =>
      editingId
        ? current.map((row) =>
            row.id === editingId ? (result.data as R) : row,
          )
        : [result.data as R, ...current],
    );
  }
  function edit(row: R) {
    setEditingId(row.id);
    setF({
      recorded_at: localDateTimeInput(row.recorded_at),
      weight_kg: row.weight_kg ?? 0,
      body_fat_percentage: row.body_fat_percentage ?? 0,
      systolic: row.systolic ?? 0,
      diastolic: row.diastolic ?? 0,
      pulse: row.pulse ?? 0,
    });
  }
  async function remove() {
    if (
      !editingId ||
      !(await confirmDialog({
        title: "Eliminar medición",
        message: "¿Eliminar esta medición de salud?",
        confirmLabel: "Eliminar",
        tone: "danger",
      }))
    )
      return;
    const result = await supabase
      .from("health_records")
      .delete()
      .eq("id", editingId);
    if (result.error) {
      setError("No se pudo eliminar la medición.");
      return;
    }
    setRows((current) => current.filter((row) => row.id !== editingId));
    setF(null);
    setEditingId(null);
  }
  return (
    <main className="theme-page mx-auto min-h-screen max-w-md p-5 pb-28">
      <header className="flex items-center justify-between">
        <button
          aria-label="Día anterior"
          onClick={() => setD(day(d, -1))}
          className="min-h-12 min-w-12"
        >
          <ChevronLeft />
        </button>
        <b>Salud</b>
        <button
          aria-label="Día siguiente"
          onClick={() => setD(day(d, 1))}
          className="min-h-12 min-w-12"
        >
          <ChevronRight />
        </button>
      </header>
      <label className="relative my-4 block text-center">
        {formatWorkoutDate(d)}
        <input
          aria-label="Seleccionar fecha de salud"
          type="date"
          value={d}
          onChange={(e) => setD(e.target.value)}
          className="absolute inset-0 opacity-0"
        />
      </label>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      {rows.map((r, index) => (
        <div key={r.id}>
          <button
            type="button"
            onClick={() => edit(r)}
            className="mb-3 w-full rounded-3xl bg-white p-4 text-left shadow-sm"
          >
            <b>
              {measurementOrdinals[index]
                ? `${measurementOrdinals[index]} medición: `
                : "Medición de las "}
              {new Date(r.recorded_at).toLocaleTimeString("es-ES", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </b>
          </button>
          {editingId === r.id && f && (
            <form
              onSubmit={save}
              className="mb-3 rounded-3xl bg-white p-4 shadow-sm"
            >
              <h2>Composición corporal</h2>
              <label className="mb-3 block text-xs font-semibold text-slate-600">
                Hora
                <input
                  type="time"
                  value={f.recorded_at.slice(11, 16)}
                  onChange={(event) =>
                    setF({ ...f, recorded_at: `${d}T${event.target.value}` })
                  }
                  className="mt-1 min-h-12 w-full rounded-2xl border px-3 text-base"
                />
              </label>
              <C
                l="Peso (kg)"
                v={f.weight_kg}
                s={0.1}
                set={(v) => setF({ ...f, weight_kg: v })}
              />
              <C
                l="% de grasa"
                v={f.body_fat_percentage}
                s={0.1}
                set={(v) => setF({ ...f, body_fat_percentage: v })}
              />
              <h2>Tensión arterial</h2>
              <C
                l="Sistólica"
                v={f.systolic}
                set={(v) => setF({ ...f, systolic: v })}
              />
              <C
                l="Diastólica"
                v={f.diastolic}
                set={(v) => setF({ ...f, diastolic: v })}
              />
              <C l="Pulso" v={f.pulse} set={(v) => setF({ ...f, pulse: v })} />
              <div className="mt-3 flex gap-2">
                <button className="min-h-14 flex-1 rounded-2xl bg-slate-800 text-white">
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setF(null);
                    setEditingId(null);
                  }}
                  className="min-h-14 flex-1 rounded-2xl bg-slate-100 text-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  aria-label="Eliminar medición"
                  onClick={() => void remove()}
                  className="min-h-14 min-w-14 rounded-2xl bg-rose-50 text-xl text-rose-600"
                >
                  🗑
                </button>
              </div>
            </form>
          )}
        </div>
      ))}
      {f && editingId === null ? (
        <form onSubmit={save} className="rounded-3xl bg-white p-4 shadow-sm">
          <h2>Composición corporal</h2>
          <label className="mb-3 block text-xs font-semibold text-slate-600">
            Hora
            <input
              type="time"
              value={f.recorded_at.slice(11, 16)}
              onChange={(event) =>
                setF({ ...f, recorded_at: `${d}T${event.target.value}` })
              }
              className="mt-1 min-h-12 w-full rounded-2xl border px-3 text-base"
            />
          </label>
          <C
            l="Peso (kg)"
            v={f.weight_kg}
            s={0.1}
            set={(v) => setF({ ...f, weight_kg: v })}
          />
          <C
            l="% de grasa"
            v={f.body_fat_percentage}
            s={0.1}
            set={(v) => setF({ ...f, body_fat_percentage: v })}
          />
          <h2>Tensión arterial</h2>
          <C
            l="Sistólica"
            v={f.systolic}
            set={(v) => setF({ ...f, systolic: v })}
          />
          <C
            l="Diastólica"
            v={f.diastolic}
            set={(v) => setF({ ...f, diastolic: v })}
          />
          <C l="Pulso" v={f.pulse} set={(v) => setF({ ...f, pulse: v })} />
          <div className="mt-3 flex gap-2">
            <button className="min-h-14 flex-1 rounded-2xl bg-slate-800 text-white">
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setF(null);
                setEditingId(null);
              }}
              className="min-h-14 flex-1 rounded-2xl bg-slate-100 text-slate-800"
            >
              Cancelar
            </button>
            {editingId && (
              <button
                type="button"
                aria-label="Eliminar medición"
                onClick={() => void remove()}
                className="min-h-14 min-w-14 rounded-2xl bg-rose-50 text-xl text-rose-600"
              >
                🗑
              </button>
            )}
          </div>
        </form>
      ) : (
        <button
          onClick={() => {
            setEditingId(null);
            setF(blankNow(d));
          }}
          className="min-h-14 w-full rounded-2xl bg-slate-800 text-white"
        >
          <Plus className="inline" /> Añadir medición
        </button>
      )}
      <AppMobileNavigation
        current="health"
        resolvedViews={["patient", "training", "health"]}
      />
    </main>
  );
}
