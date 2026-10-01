'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Dumbbell, HeartPulse, Scale, Users } from 'lucide-react';
import { AdminSidebar } from '@/components/AdminSidebar';
import { PatientTrainingEvolution } from '@/components/PatientTrainingEvolution';
import { deriveAdminViews, deriveAvailableViews, deriveCapabilities, type AdminView, type RoleCode } from '@/lib/authz.js';
import { supabase } from '@/lib/supabase';
import { advanceAuthIdentity } from '@/lib/view-capabilities-guard.js';
import { buildMetricChart, type MetricValue } from '@/lib/metric-chart.js';

type Profile = { id: string; email: string; full_name: string | null };
type Membership = { id: string };
type RoleRow = { role_code: RoleCode };
type Workout = { date: string; exercise: string | null; exercise_group?: string | null; weight_kg: number | null; reps: number | null };
type HealthRecord = {
  recorded_at: string;
  weight_kg: number | null;
  body_fat_percentage: number | null;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
};
type History = { workouts: Workout[]; health: HealthRecord[] };

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(value));
}

function formatValue(value: number | null, suffix = '') {
  return value === null ? '—' : `${value}${suffix}`;
}

function MetricChart({ title, values, unit, color = '#fb7185' }: { title: string; values: MetricValue[]; unit: string; color?: string }) {
  const chart = buildMetricChart(values);
  const format = (value: number) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value);

  return <section className="rounded-3xl bg-white p-5 shadow-sm">
    <h3 className="font-bold text-slate-800">{title}</h3>
    {chart.points.length === 0 ? <p className="mt-4 text-sm text-slate-500">Todavía no hay mediciones de {title.toLowerCase()}.</p> : <>
      <p className="mt-3 text-xs text-slate-500">Valores registrados: {format(chart.minimum!)}–{format(chart.maximum!)} {unit}</p>
      <svg viewBox="0 0 600 180" role="img" aria-label={`Evolución de ${title}: ${chart.points.length} mediciones entre ${format(chart.minimum!)} y ${format(chart.maximum!)} ${unit}`} className="mt-2 h-40 w-full">
        {chart.segments.map((segment, index) => segment.length > 1 && <polyline key={index} points={segment.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" />)}
        {chart.points.map((point, index) => <circle key={`${point.date}-${index}`} cx={point.x} cy={point.y} r="4" fill={color}><title>{formatDate(point.date)}: {format(point.value)} {unit}</title></circle>)}
      </svg>
      <div className="flex justify-between text-xs text-slate-400"><span>{formatDate(chart.points[0].date)}</span><span>{formatDate(chart.points[chart.points.length - 1].date)}</span></div>
    </>}
  </section>;
}

export default function PatientControlPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [patients, setPatients] = useState<Profile[]>([]);
  const [patientId, setPatientId] = useState('');
  const [history, setHistory] = useState<History | null>(null);
  const [loadedPatientId, setLoadedPatientId] = useState('');
  const [adminViews, setAdminViews] = useState<AdminView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const authGenerationRef = useRef(0);
  const requestGenerationRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  const isCurrent = useCallback((generation: number, userId: string) => (
    mountedRef.current && authGenerationRef.current === generation && currentUserIdRef.current === userId
  ), []);

  useEffect(() => {
    mountedRef.current = true;
    let receivedAuthEvent = false;
    async function initialize(userId: string, generation: number) {
      try {
        const [profileResult, membershipsResult] = await Promise.all([
          supabase.from('profiles').select('id, email, full_name').eq('id', userId).maybeSingle(),
          supabase.from('group_memberships').select('id').eq('user_id', userId).eq('status', 'active'),
        ]);
        const ownProfile = profileResult.data as Profile | null;
        const memberships = (membershipsResult.data ?? []) as Membership[];
        const membershipIds = memberships.map((membership) => membership.id);
        if (!isCurrent(generation, userId)) return;
        if (profileResult.error || membershipsResult.error || !ownProfile || membershipIds.length === 0) { router.replace('/'); return; }
        const rolesResult = await supabase.from('user_roles').select('role_code').in('membership_id', membershipIds);
        if (!isCurrent(generation, userId)) return;
        if (rolesResult.error) { setError('No se pudo verificar el acceso.'); return; }
        const roles = (rolesResult.data ?? []).map((row) => (row as RoleRow).role_code);
        const capabilities = deriveCapabilities(false, roles);
        if (!(capabilities.canManageGroupPlans || capabilities.canManageGroupUsers)) { router.replace('/'); return; }
        const patientsResult = await supabase.rpc('list_controlled_patients');
        if (!isCurrent(generation, userId)) return;
        if (patientsResult.error) { setError('No se pudo cargar la lista de pacientes.'); return; }
        const controlledPatients = (patientsResult.data ?? []) as Profile[];
        setProfile(ownProfile);
        setAdminViews(deriveAdminViews(deriveAvailableViews(capabilities)));
        setPatients(controlledPatients);
        setPatientId(controlledPatients[0]?.id ?? '');
      } catch {
        if (isCurrent(generation, userId)) setError('No se pudo verificar el acceso.');
      } finally {
        if (isCurrent(generation, userId)) setLoading(false);
      }
    }
    const applySession = (userId: string | null) => {
      const transition = advanceAuthIdentity({ initialized: initializedRef.current, generation: authGenerationRef.current, userId: currentUserIdRef.current }, userId);
      if (!transition.changed) return;
      initializedRef.current = transition.state.initialized;
      authGenerationRef.current = transition.state.generation;
      currentUserIdRef.current = transition.state.userId;
      requestGenerationRef.current += 1;
      setProfile(null); setPatients([]); setPatientId(''); setHistory(null); setLoadedPatientId(''); setAdminViews([]); setError(null); setLoadingHistory(false); setLoading(Boolean(userId));
      if (!userId) { router.replace('/'); return; }
      void initialize(userId, transition.state.generation);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { receivedAuthEvent = true; applySession(session?.user.id ?? null); });
    supabase.auth.getSession().then(({ data }) => { if (mountedRef.current && !receivedAuthEvent) applySession(data.session?.user.id ?? null); }).catch(() => applySession(null));
    return () => { mountedRef.current = false; authGenerationRef.current += 1; requestGenerationRef.current += 1; currentUserIdRef.current = null; subscription.unsubscribe(); };
  }, [isCurrent, router]);

  useEffect(() => {
    const userId = currentUserIdRef.current;
    const generation = authGenerationRef.current;
    const request = ++requestGenerationRef.current;
    if (!patientId || !userId) return;
    const activeUserId = userId;
    setLoadingHistory(true);
    async function loadHistory() {
      try {
        await Promise.resolve();
        if (!isCurrent(generation, activeUserId) || request !== requestGenerationRef.current) return;
        setHistory(null);
        setLoadedPatientId('');
        setError(null);
        const result = await supabase.rpc('get_controlled_patient_history', { p_patient_id: patientId });
        if (!isCurrent(generation, activeUserId) || request !== requestGenerationRef.current) return;
        if (result.error) { setError('No se pudo cargar el historial del paciente.'); return; }
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        setHistory({ workouts: (row?.workouts ?? []) as Workout[], health: (row?.health ?? []) as HealthRecord[] });
        setLoadedPatientId(patientId);
      } catch {
        if (isCurrent(generation, activeUserId) && request === requestGenerationRef.current) setError('No se pudo cargar el historial del paciente.');
      } finally {
        if (isCurrent(generation, activeUserId) && request === requestGenerationRef.current) setLoadingHistory(false);
      }
    }
    void loadHistory();
  }, [isCurrent, patientId]);

  const selectedPatient = patients.find((patient) => patient.id === patientId);
  const weight = (history?.health ?? []).map((record) => ({ date: record.recorded_at, value: record.weight_kg }));
  const fat = (history?.health ?? []).map((record) => ({ date: record.recorded_at, value: record.body_fat_percentage }));
  const pulse = (history?.health ?? []).map((record) => ({ date: record.recorded_at, value: record.pulse }));
  const tension = (history?.health ?? []).map((record) => ({ date: record.recorded_at, value: record.systolic }));

  if (loading) return <main className="theme-page flex min-h-screen items-center justify-center text-sm text-slate-500">Cargando control de pacientes…</main>;
  return <main className="theme-page min-h-screen text-slate-700">
    <AdminSidebar current="patientControl" views={adminViews} name={profile?.full_name || 'Usuario'} email={profile?.email || ''} />
    <div className="mx-auto max-w-7xl px-4 py-7 sm:px-8 lg:pl-80">
      <header className="mb-7"><p className="text-sm font-semibold text-rose-400">Panel profesional</p><h1 className="text-3xl font-bold text-slate-800">Controlar pacientes</h1><p className="mt-2 text-sm text-slate-500">Consulta de históricos y evolución. Los datos son de solo lectura.</p></header>
      {error && <p role="alert" className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      <section className="mb-7 rounded-3xl bg-white p-5 shadow-sm"><label className="block text-sm font-semibold text-slate-700"><span className="flex items-center gap-2"><Users size={18} className="text-rose-400" />Paciente</span><select value={patientId} onChange={(event) => setPatientId(event.target.value)} className="mt-3 min-h-11 w-full rounded-2xl bg-slate-50 px-4 text-sm font-normal outline-none ring-rose-200 focus:ring-2"><option value="">Selecciona un paciente</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name || patient.email}</option>)}</select></label></section>
      {!patientId && !error && <p className="rounded-3xl bg-white p-6 text-sm text-slate-500 shadow-sm">No hay pacientes disponibles en tus grupos.</p>}
      {patientId && <>
        <div className="mb-5 flex items-center gap-3"><Activity className="text-rose-400" /><div><h2 className="text-xl font-bold text-slate-800">{selectedPatient?.full_name || selectedPatient?.email}</h2><p className="text-sm text-slate-500">Evolución registrada</p></div></div>
        {loadingHistory ? <p className="rounded-3xl bg-white p-6 text-sm text-slate-500 shadow-sm">Cargando historial…</p> : history && loadedPatientId === patientId && <div className="space-y-8">
          <section><div className="mb-4 flex items-center gap-2"><Dumbbell className="text-rose-400" size={20} /><h2 className="text-xl font-bold text-slate-800">Entrenamientos</h2></div><PatientTrainingEvolution workouts={history.workouts} /></section>
          <section><div className="mb-4 flex items-center gap-2"><HeartPulse className="text-rose-400" size={20} /><h2 className="text-xl font-bold text-slate-800">Mediciones de salud</h2></div><div className="grid gap-5 md:grid-cols-2"><MetricChart title="Peso" values={weight} unit="kg" /><MetricChart title="Grasa corporal" values={fat} unit="%" color="#f59e0b" /><MetricChart title="Tensión sistólica" values={tension} unit="mmHg" color="#8b5cf6" /><MetricChart title="Pulso" values={pulse} unit="ppm" color="#10b981" /></div><div className="mt-5 rounded-3xl bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Scale className="text-rose-400" size={20} /><h3 className="font-bold text-slate-800">Historial de mediciones</h3></div><div className="space-y-3">{history.health.length === 0 ? <p className="text-sm text-slate-500">No hay mediciones de salud registradas.</p> : history.health.slice().reverse().map((record, index) => <div key={`${record.recorded_at}-${index}`} className="grid gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-5"><span className="font-semibold">{formatDate(record.recorded_at)}</span><span>Peso: {formatValue(record.weight_kg, ' kg')}</span><span>Grasa corporal: {formatValue(record.body_fat_percentage, '%')}</span><span>Tensión: {record.systolic === null && record.diastolic === null ? '—' : `${formatValue(record.systolic)}/${formatValue(record.diastolic)}`}</span><span>Pulso: {formatValue(record.pulse, ' ppm')}</span></div>)}</div></div></section>
        </div>}
      </>}
    </div>
  </main>;
}
