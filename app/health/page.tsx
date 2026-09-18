"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AppMobileNavigation } from "@/components/AppMobileNavigation";
import { useConfirmDialog } from "@/components/ConfirmDialogProvider";
import { deriveFeatureCapabilities, normalizeFeatureRows } from "@/lib/feature-permissions.js";
import { supabase } from "@/lib/supabase";
import { formatWorkoutDate } from "@/lib/gym-workouts.js";
type R = { id: string; recorded_at: string; weight_kg: number | null; body_fat_percentage: number | null; systolic: number | null; diastolic: number | null; pulse: number | null };
const day = (d: string, n = 0) => { const x = new Date(`${d}T12:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const blank = (d: string) => ({ recorded_at: `${d}T12:00`, weight_kg: 0, body_fat_percentage: 0, systolic: 0, diastolic: 0, pulse: 0 });
const blankNow = (d: string) => { const now = new Date(); const pad = (n: number) => String(n).padStart(2, "0"); return { ...blank(d), recorded_at: `${d}T${pad(now.getHours())}:${pad(now.getMinutes())}` }; };
const measurementOrdinals = ["Primera", "Segunda", "Tercera", "Cuarta", "Quinta"];
const localDateTimeInput = (value: string) => { const x = new Date(value); const pad = (n: number) => String(n).padStart(2, "0"); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`; };
function C({ l, v, s = 1, set }: { l: string; v: number; s?: number; set: (v: number) => void }) { return <div className="mb-3"><b className="block text-center text-xs">{l}</b><div className="flex gap-2"><button type="button" onClick={() => set(Math.max(0, v - s))} className="min-h-14 min-w-14 rounded-2xl bg-slate-100 text-2xl">−</button><input type="number" step={s} value={v || ""} onChange={(e) => set(Number(e.target.value))} className="min-h-14 min-w-0 flex-1 rounded-2xl border text-center text-lg font-bold"/><button type="button" onClick={() => set(v + s)} className="min-h-14 min-w-14 rounded-2xl bg-slate-100 text-2xl">+</button></div></div>; }
export default function Health() {
  const confirmDialog = useConfirmDialog();
  const [d, setD] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<R[]>([]); const [f, setF] = useState<ReturnType<typeof blank> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); const [error, setError] = useState("");
  const [features, setFeatures] = useState(() => deriveFeatureCapabilities([]));
  const { canTrackHealth, canTrackWeight, canTrackBloodPressure } = features;
  const loadRows = async () => {
    if (!canTrackHealth) { setRows([]); return; }
    const r = await supabase.rpc("get_my_health_records", { p_start: `${d}T00:00`, p_end: `${day(d, 1)}T00:00` });
    if (r.error) { setError("No se pudieron cargar las mediciones."); return; }
    const loadedRows = (r.data ?? []) as R[]; setRows(loadedRows);
    if (loadedRows.length === 1) edit(loadedRows[0]);
  };
  useEffect(() => { void supabase.rpc("get_my_features").then((r) => setFeatures(deriveFeatureCapabilities(normalizeFeatureRows(r.data)))); }, []);
  useEffect(() => { void loadRows(); }, [d, canTrackHealth]);
  function edit(row: R) { setEditingId(row.id); setF({ recorded_at: localDateTimeInput(row.recorded_at), weight_kg: row.weight_kg ?? 0, body_fat_percentage: row.body_fat_percentage ?? 0, systolic: row.systolic ?? 0, diastolic: row.diastolic ?? 0, pulse: row.pulse ?? 0 }); }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!f) return;
    const values = [canTrackWeight && f.weight_kg, canTrackWeight && f.body_fat_percentage, canTrackBloodPressure && f.systolic, canTrackBloodPressure && f.diastolic, canTrackBloodPressure && f.pulse];
    if (!values.some((v) => typeof v === "number" && v > 0)) { setError("Indica al menos un valor mayor que cero."); return; }
    const r = await supabase.rpc("save_my_health_record", { p_id: editingId, p_recorded_at: new Date(f.recorded_at).toISOString(), p_weight_kg: canTrackWeight ? f.weight_kg || null : null, p_body_fat_percentage: canTrackWeight ? f.body_fat_percentage || null : null, p_systolic: canTrackBloodPressure ? f.systolic || null : null, p_diastolic: canTrackBloodPressure ? f.diastolic || null : null, p_pulse: canTrackBloodPressure ? f.pulse || null : null });
    if (r.error) { setError("No se pudo guardar la medición."); return; }
    setError(""); setF(null); setEditingId(null); await loadRows();
  }
  async function remove() {
    if (!editingId || !(await confirmDialog({ title: "Eliminar medición", message: "¿Eliminar esta medición de salud?", confirmLabel: "Eliminar", tone: "danger" }))) return;
    const r = await supabase.rpc("delete_my_health_record", { p_id: editingId });
    if (r.error) { setError("No se pudo eliminar la medición."); return; }
    setF(null); setEditingId(null); await loadRows();
  }
  const form = <form onSubmit={save} className="mb-3 rounded-3xl bg-white p-4 shadow-sm"><label className="mb-3 block text-xs font-semibold text-slate-600">Hora<input type="time" value={f?.recorded_at.slice(11, 16) ?? ""} onChange={(e) => f && setF({ ...f, recorded_at: `${d}T${e.target.value}` })} className="mt-1 min-h-12 w-full rounded-2xl border px-3 text-base"/></label>{canTrackWeight && (<section><h2>Composición corporal</h2><C l="Peso (kg)" v={f?.weight_kg ?? 0} s={0.1} set={(v) => f && setF({ ...f, weight_kg: v })}/><C l="% de grasa" v={f?.body_fat_percentage ?? 0} s={0.1} set={(v) => f && setF({ ...f, body_fat_percentage: v })}/></section>)}{canTrackBloodPressure && (<section><h2>Tensión arterial</h2><C l="Sistólica" v={f?.systolic ?? 0} set={(v) => f && setF({ ...f, systolic: v })}/><C l="Diastólica" v={f?.diastolic ?? 0} set={(v) => f && setF({ ...f, diastolic: v })}/><C l="Pulso" v={f?.pulse ?? 0} set={(v) => f && setF({ ...f, pulse: v })}/></section>)}<div className="mt-3 flex gap-2"><button className="min-h-14 flex-1 rounded-2xl bg-slate-800 text-white">Guardar</button><button type="button" onClick={() => { setF(null); setEditingId(null); }} className="min-h-14 flex-1 rounded-2xl bg-slate-100 text-slate-800">Cancelar</button>{editingId && <button type="button" aria-label="Eliminar medición" onClick={() => void remove()} className="min-h-14 min-w-14 rounded-2xl bg-rose-50 text-xl text-rose-600">🗑</button>}</div></form>;
  return <main className="theme-page mx-auto min-h-screen max-w-md p-5 pb-28"><header className="flex items-center justify-between"><button aria-label="Día anterior" onClick={() => setD(day(d, -1))} className="min-h-12 min-w-12"><ChevronLeft /></button><b>Salud</b><button aria-label="Día siguiente" onClick={() => setD(day(d, 1))} className="min-h-12 min-w-12"><ChevronRight /></button></header><label className="relative my-4 block text-center">{formatWorkoutDate(d)}<input aria-label="Seleccionar fecha de salud" type="date" value={d} onChange={(e) => setD(e.target.value)} className="absolute inset-0 opacity-0"/></label>{error && <p role="alert" className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{rows.map((r, index) => <div key={r.id}>{rows.length > 1 && <button type="button" onClick={() => edit(r)} className="mb-3 w-full rounded-3xl bg-white p-4 text-left shadow-sm"><b>{measurementOrdinals[index] ? `${measurementOrdinals[index]} medición: ` : "Medición de las "}{new Date(r.recorded_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</b></button>}{editingId === r.id && f && form}</div>)}{f && editingId === null ? form : <button onClick={() => { setEditingId(null); setF(blankNow(d)); }} className="min-h-14 w-full rounded-2xl bg-slate-800 text-white"><Plus className="inline" /> Añadir medición</button>}<AppMobileNavigation current="health" resolvedViews={["patient", "training", "health"]}/></main>;
}
