'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, UserMinus, UserPlus, Users } from 'lucide-react';
import { deriveAdminViews, deriveAvailableViews, deriveCapabilities, type AdminView, type RoleCode } from '@/lib/authz.js';
import { createMutationLock, deriveFeatureCapabilities, normalizeFeatureRows, type FeatureCode } from '@/lib/feature-permissions.js';
import { assignableRoles, deriveMemberActions, destructiveActionConfirmation, groupManageableMembers, mutationSucceededAfterReload, normalizeFeatureCodes, toggleFeature } from '@/lib/users-authz.js';
import { supabase } from '@/lib/supabase';
import { AdminNavigation } from '@/components/AdminNavigation';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';
import { advanceAuthIdentity } from '@/lib/view-capabilities-guard.js';

type Profile = { id: string; email: string; full_name: string | null; is_sudo: boolean };
type Membership = { id: string };
type RoleRow = { role_code: RoleCode };
type Group = { id: string; name: string; slug: string };
type Member = {
  membership_id: string;
  user_id: string | null;
  email: string;
  full_name: string | null;
  status: 'pending' | 'active' | 'disabled';
  roles: RoleCode[];
  group_id: string;
  group_name: string;
  is_sudo: boolean | null;
  is_active: boolean | null;
  features: FeatureCode[];
};

const ALL_ROLES: { code: RoleCode; label: string }[] = [
  { code: 'patient', label: 'Paciente' },
  { code: 'self_manager', label: 'Autogestión' },
  { code: 'nutritionist', label: 'Nutricionista' },
  { code: 'group_admin', label: 'Administrador de grupo' },
  { code: 'gym_patient', label: 'Paciente de gimnasio' },
  { code: 'gym_coach', label: 'Entrenador de gimnasio' },
];
const ALL_FEATURES: { code: FeatureCode; label: string }[] = [
  { code: 'rate_recipes', label: 'Valorar recetas' },
  { code: 'send_report', label: 'Enviar informe' },
  { code: 'access_settings', label: 'Acceso a ajustes' },
  { code: 'change_theme', label: 'Cambiar tema' },
  { code: 'track_gym_workouts', label: 'Registrar entrenamientos' },
  { code: 'manage_gym_workouts', label: 'Gestionar entrenamientos' },
  { code: 'track_health', label: 'Registrar salud' },
];
function safeError(error: { code?: string } | null, fallback: string) {
  return error?.code === '42501' ? 'No tienes permiso para realizar esta operación.' : fallback;
}

export default function UsersPage() {
  const router = useRouter();
  const confirmDialog = useConfirmDialog();
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [isSudo, setIsSudo] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [groupId, setGroupId] = useState('');
  const [inviteRoles, setInviteRoles] = useState<RoleCode[]>(['patient']);
  const [inviteFeatures, setInviteFeatures] = useState<FeatureCode[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, RoleCode[]>>({});
  const [draftFeatures, setDraftFeatures] = useState<Record<string, FeatureCode[]>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [adminViews, setAdminViews] = useState<AdminView[]>([]);
  const mutationLockRef = useRef(createMutationLock());
  const mountedRef = useRef(true);
  const authGenerationRef = useRef(0);
  const currentUserIdRef = useRef<string | null>(null);
  const authInitializedRef = useRef(false);
  const requestGenerationRef = useRef(0);

  const isAuthCurrent = useCallback((generation: number, userId: string | null) => (
    mountedRef.current && generation === authGenerationRef.current
    && userId !== null && userId === currentUserIdRef.current
  ), []);

  const loadScopedData = useCallback(async (generation: number, userId: string) => {
    const requestGeneration = ++requestGenerationRef.current;
    try {
      const [groupsResult, membersResult] = await Promise.all([
        supabase.rpc('list_manageable_groups'), supabase.rpc('list_manageable_members'),
      ]);
      if (!isAuthCurrent(generation, userId) || requestGeneration !== requestGenerationRef.current) return false;
      if (groupsResult.error || membersResult.error) {
        setMessage({ kind: 'error', text: safeError(groupsResult.error ?? membersResult.error, 'No se pudieron cargar los usuarios.') });
        return false;
      }
      const nextGroups = (groupsResult.data ?? []) as Group[];
      const nextMembers: Member[] = (membersResult.data ?? []).map((row: unknown) => {
        const member = row as Omit<Member, 'features'> & { features?: string[] | null };
        return { ...member, features: normalizeFeatureCodes(member.features) };
      });
      setGroups(nextGroups); setMembers(nextMembers);
      setGroupId((current) => nextGroups.some((group) => group.id === current) ? current : (nextGroups[0]?.id ?? ''));
      setDraftRoles(Object.fromEntries(nextMembers.map((member) => [member.membership_id, member.roles])));
      setDraftFeatures(Object.fromEntries(nextMembers.map((member) => [member.membership_id, member.features])));
      return true;
    } catch {
      if (isAuthCurrent(generation, userId) && requestGeneration === requestGenerationRef.current) {
        setMessage({ kind: 'error', text: 'No se pudieron cargar los usuarios.' });
      }
      return false;
    }
  }, [isAuthCurrent]);

  useEffect(() => {
    mountedRef.current = true;
    let receivedAuthEvent = false;
    async function initialize(userId: string, generation: number) {
      try {
      const [profileResult, membershipResult] = await Promise.all([
        supabase.from('profiles').select('id, email, full_name, is_sudo').eq('id', userId).maybeSingle(),
        supabase.from('group_memberships').select('id').eq('user_id', userId).eq('status', 'active').maybeSingle(),
      ]);
      const profile = profileResult.data as Profile | null;
      const membership = membershipResult.data as Membership | null;
      if (!isAuthCurrent(generation, userId)) return;
      if (profileResult.error || membershipResult.error || !profile || (!profile.is_sudo && !membership)) {
        setMessage({ kind: 'error', text: 'No se pudo verificar el acceso.' }); setLoading(false); return;
      }
      const [rolesResult, featuresResult] = await Promise.all([
        membership
          ? supabase.from('user_roles').select('role_code').eq('membership_id', membership.id)
          : Promise.resolve({ data: [] as RoleRow[], error: null }),
        supabase.rpc('get_my_features'),
      ]);
      if (!isAuthCurrent(generation, userId)) return;
      if (rolesResult.error) { setMessage({ kind: 'error', text: 'No se pudo verificar el acceso.' }); setLoading(false); return; }
      const roles = (rolesResult.data ?? []).map((row) => (row as RoleRow).role_code);
      const capabilities = deriveCapabilities(profile.is_sudo, roles);
      const featureCapabilities = deriveFeatureCapabilities(
        featuresResult.error ? [] : normalizeFeatureRows(featuresResult.data),
      );
      if (!(capabilities.canManageAllUsers || capabilities.canManageGroupUsers)) { router.replace('/'); return; }
      setCurrentProfile(profile);
      setIsSudo(capabilities.canManageAllUsers);
      setAdminViews(deriveAdminViews(deriveAvailableViews(capabilities, {
        canManageGymWorkouts: featureCapabilities.canManageGymWorkouts,
      })));
      await loadScopedData(generation, userId);
      } catch {
        if (isAuthCurrent(generation, userId)) setMessage({ kind: 'error', text: 'No se pudo verificar el acceso.' });
      } finally {
        if (isAuthCurrent(generation, userId)) setLoading(false);
      }
    }
    const applySession = (userId: string | null) => {
      const transition = advanceAuthIdentity({ initialized: authInitializedRef.current, generation: authGenerationRef.current, userId: currentUserIdRef.current }, userId);
      if (!transition.changed) return;
      authInitializedRef.current = transition.state.initialized;
      authGenerationRef.current = transition.state.generation;
      currentUserIdRef.current = transition.state.userId;
      requestGenerationRef.current += 1;
      mutationLockRef.current = createMutationLock();
      setCurrentProfile(null); setMembers([]); setGroups([]); setIsSudo(false); setAdminViews([]);
      setEmail(''); setGroupId(''); setInviteRoles(['patient']); setInviteFeatures([]);
      setDraftRoles({}); setDraftFeatures({}); setSavingKey(null); setMessage(null); setLoading(Boolean(userId));
      if (!userId) { router.replace('/'); return; }
      void initialize(userId, transition.state.generation);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true; applySession(session?.user.id ?? null);
    });
    supabase.auth.getSession()
      .then(({ data }) => { if (mountedRef.current && !receivedAuthEvent) applySession(data.session?.user.id ?? null); })
      .catch(() => { if (mountedRef.current && !receivedAuthEvent) applySession(null); });
    return () => {
      mountedRef.current = false; authGenerationRef.current += 1; currentUserIdRef.current = null;
      requestGenerationRef.current += 1; subscription.unsubscribe();
    };
  }, [isAuthCurrent, loadScopedData, router]);

  const allowedCodes = assignableRoles(isSudo);
  const allowedRoles = ALL_ROLES.filter(({ code }) => allowedCodes.includes(code));
  const groupedMembers = useMemo(() => groupManageableMembers(groups, members), [groups, members]);

  function toggleRole(current: RoleCode[], role: RoleCode) {
    return current.includes(role) ? current.filter((value) => value !== role) : [...current, role];
  }

  async function invite() {
    if (!email.trim() || !groupId || inviteRoles.length === 0) return;
    const generation = authGenerationRef.current;
    const userId = currentUserIdRef.current;
    if (!userId || !isAuthCurrent(generation, userId)) return;
    const mutationLock = mutationLockRef.current;
    if (!mutationLock.tryAcquire()) return;
    try {
      setSavingKey('invite'); setMessage(null);
      const { error } = await supabase.rpc('invite_group_member_with_features', { p_group_id: groupId, p_email: email, p_roles: inviteRoles, p_features: inviteFeatures });
      if (!isAuthCurrent(generation, userId)) return;
      if (error) setMessage({ kind: 'error', text: safeError(error, 'No se pudo crear la invitación.') });
      else {
        setEmail(''); setInviteRoles(['patient']); setInviteFeatures([]);
        const reloaded = await loadScopedData(generation, userId);
        if (isAuthCurrent(generation, userId) && mutationSucceededAfterReload(reloaded)) setMessage({ kind: 'success', text: 'Invitación creada.' });
      }
    } catch { if (isAuthCurrent(generation, userId)) setMessage({ kind: 'error', text: 'No se pudo crear la invitación.' });
    } finally {
      if (isAuthCurrent(generation, userId)) setSavingKey(null);
      mutationLock.release();
    }
  }

  async function saveFeatures(member: Member) {
    const features = draftFeatures[member.membership_id] ?? [];
    if (features.length === 0 && !(await confirmDialog({ title: 'Retirar funcionalidades', message: `¿Retirar todas las funcionalidades de ${member.full_name || member.email} en ${member.group_name}?`, confirmLabel: 'Retirar', tone: 'danger' }))) return;
    const generation = authGenerationRef.current;
    const userId = currentUserIdRef.current;
    if (!userId || !isAuthCurrent(generation, userId)) return;
    const mutationLock = mutationLockRef.current;
    if (!mutationLock.tryAcquire()) return;
    try {
      setSavingKey(member.membership_id); setMessage(null);
      const { error } = await supabase.rpc('set_member_features', { p_membership_id: member.membership_id, p_features: features });
      if (!isAuthCurrent(generation, userId)) return;
      if (error) setMessage({ kind: 'error', text: safeError(error, 'No se pudieron actualizar las funcionalidades.') });
      else {
        const reloaded = await loadScopedData(generation, userId);
        if (isAuthCurrent(generation, userId) && mutationSucceededAfterReload(reloaded)) setMessage({ kind: 'success', text: 'Funcionalidades actualizadas.' });
      }
    } catch { if (isAuthCurrent(generation, userId)) setMessage({ kind: 'error', text: 'No se pudieron actualizar las funcionalidades.' });
    } finally {
      if (isAuthCurrent(generation, userId)) setSavingKey(null);
      mutationLock.release();
    }
  }

  async function saveRoles(member: Member) {
    const allowedCodes = new Set(allowedRoles.map(({ code }) => code));
    const roles = (draftRoles[member.membership_id] ?? []).filter((role) => allowedCodes.has(role));
    if (roles.length === 0) return;
    const generation = authGenerationRef.current;
    const userId = currentUserIdRef.current;
    if (!userId || !isAuthCurrent(generation, userId)) return;
    const mutationLock = mutationLockRef.current;
    if (!mutationLock.tryAcquire()) return;
    try {
      setSavingKey(member.membership_id); setMessage(null);
      const { error } = await supabase.rpc('set_member_roles', { p_membership_id: member.membership_id, p_roles: roles });
      if (!isAuthCurrent(generation, userId)) return;
      if (error) setMessage({ kind: 'error', text: safeError(error, 'No se pudieron actualizar los roles.') });
      else {
        const reloaded = await loadScopedData(generation, userId);
        if (isAuthCurrent(generation, userId) && mutationSucceededAfterReload(reloaded)) setMessage({ kind: 'success', text: 'Roles actualizados.' });
      }
    } catch { if (isAuthCurrent(generation, userId)) setMessage({ kind: 'error', text: 'No se pudieron actualizar los roles.' });
    } finally {
      if (isAuthCurrent(generation, userId)) setSavingKey(null);
      mutationLock.release();
    }
  }

  async function disableMembership(member: Member) {
    if (!(await confirmDialog({ title: 'Desactivar membresía', message: destructiveActionConfirmation('membership', member.full_name, member.email, member.group_name), confirmLabel: 'Desactivar', tone: 'danger' }))) return;
    const generation = authGenerationRef.current;
    const userId = currentUserIdRef.current;
    if (!userId || !isAuthCurrent(generation, userId)) return;
    const mutationLock = mutationLockRef.current;
    if (!mutationLock.tryAcquire()) return;
    try {
      setSavingKey(member.membership_id); setMessage(null);
      const { error } = await supabase.rpc('disable_membership', { p_membership_id: member.membership_id });
      if (!isAuthCurrent(generation, userId)) return;
      if (error) setMessage({ kind: 'error', text: safeError(error, 'No se pudo desactivar la membresía.') });
      else {
        const reloaded = await loadScopedData(generation, userId);
        if (isAuthCurrent(generation, userId) && mutationSucceededAfterReload(reloaded)) setMessage({ kind: 'success', text: 'Membresía desactivada.' });
      }
    } catch { if (isAuthCurrent(generation, userId)) setMessage({ kind: 'error', text: 'No se pudo desactivar la membresía.' });
    } finally {
      if (isAuthCurrent(generation, userId)) setSavingKey(null);
      mutationLock.release();
    }
  }

  async function setAccountActive(member: Member, active: boolean) {
    if (!member.user_id) return;
    if (!active) {
      if (!(await confirmDialog({ title: 'Desactivar cuenta', message: destructiveActionConfirmation('account', member.full_name, member.email, member.group_name), confirmLabel: 'Desactivar', tone: 'danger' }))) return;
    }
    const generation = authGenerationRef.current;
    const userId = currentUserIdRef.current;
    if (!userId || !isAuthCurrent(generation, userId)) return;
    const mutationLock = mutationLockRef.current;
    if (!mutationLock.tryAcquire()) return;
    try {
      setSavingKey(member.membership_id); setMessage(null);
      const { error } = await supabase.rpc('set_user_active', { p_user_id: member.user_id, p_is_active: active });
      if (!isAuthCurrent(generation, userId)) return;
      if (error) setMessage({ kind: 'error', text: safeError(error, 'No se pudo cambiar el estado de la cuenta.') });
      else {
        const reloaded = await loadScopedData(generation, userId);
        if (isAuthCurrent(generation, userId) && mutationSucceededAfterReload(reloaded)) setMessage({ kind: 'success', text: active ? 'Cuenta activada.' : 'Cuenta desactivada.' });
      }
    } catch { if (isAuthCurrent(generation, userId)) setMessage({ kind: 'error', text: 'No se pudo cambiar el estado de la cuenta.' });
    } finally {
      if (isAuthCurrent(generation, userId)) setSavingKey(null);
      mutationLock.release();
    }
  }

  async function setUserSudo(member: Member, sudo: boolean) {
    if (!member.user_id) return;
    const action = sudo ? 'sudo-grant' : 'sudo-revoke';
    if (!(await confirmDialog({ title: sudo ? 'Conceder acceso sudo' : 'Retirar acceso sudo', message: destructiveActionConfirmation(action, member.full_name, member.email, member.group_name), confirmLabel: sudo ? 'Conceder' : 'Retirar', tone: sudo ? 'default' : 'danger' }))) return;
    const generation = authGenerationRef.current;
    const userId = currentUserIdRef.current;
    if (!userId || !isAuthCurrent(generation, userId)) return;
    const mutationLock = mutationLockRef.current;
    if (!mutationLock.tryAcquire()) return;
    try {
      setSavingKey(member.membership_id); setMessage(null);
      const { error } = await supabase.rpc('set_user_sudo', { target_user: member.user_id, sudo });
      if (!isAuthCurrent(generation, userId)) return;
      if (error) setMessage({ kind: 'error', text: safeError(error, 'No se pudo cambiar el acceso sudo.') });
      else {
        const reloaded = await loadScopedData(generation, userId);
        if (isAuthCurrent(generation, userId) && mutationSucceededAfterReload(reloaded)) setMessage({ kind: 'success', text: sudo ? 'Acceso sudo concedido.' : 'Acceso sudo retirado.' });
      }
    } catch { if (isAuthCurrent(generation, userId)) setMessage({ kind: 'error', text: 'No se pudo cambiar el acceso sudo.' });
    } finally {
      if (isAuthCurrent(generation, userId)) setSavingKey(null);
      mutationLock.release();
    }
  }

  if (loading) return <main className="theme-page flex min-h-screen items-center justify-center text-sm text-slate-500">Cargando gestión de usuarios…</main>;

  return (
    <main className="theme-page min-h-screen px-4 py-7 text-slate-700 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm font-semibold text-rose-400">Administración</p><h1 className="text-3xl font-bold text-slate-800">Usuarios y permisos</h1></div>
          <AdminNavigation current="users" resolvedViews={adminViews} />
        </header>

        {message && <p role="status" className={`mb-5 rounded-2xl border p-4 text-sm ${message.kind === 'error' ? 'border-red-100 bg-red-50 text-red-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>{message.text}</p>}

        {currentProfile && groups.length > 0 && <section className="mb-7 rounded-3xl bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-2"><UserPlus className="text-rose-400" size={20} /><h2 className="font-bold text-slate-800">Invitar usuario</h2></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-semibold">Correo<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={savingKey !== null} className="mt-2 w-full rounded-2xl bg-slate-50 px-4 py-3 text-sm font-normal outline-none ring-rose-200 focus:ring-2" /></label>
            <label className="text-xs font-semibold">Grupo<select value={groupId} onChange={(event) => setGroupId(event.target.value)} disabled={!isSudo || savingKey !== null} className="mt-2 w-full rounded-2xl bg-slate-50 px-4 py-3 text-sm font-normal">{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">{allowedRoles.map(({ code, label }) => <label key={code} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs"><input type="checkbox" checked={inviteRoles.includes(code)} onChange={() => setInviteRoles((roles) => toggleRole(roles, code))} disabled={savingKey !== null} />{label}</label>)}</div>
          <div className="mt-4"><p className="mb-2 text-xs font-semibold">Funcionalidades</p><div className="flex flex-wrap gap-2">{ALL_FEATURES.map(({ code, label }) => <label key={code} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs"><input type="checkbox" checked={inviteFeatures.includes(code)} onChange={() => setInviteFeatures((features) => toggleFeature(features, code))} disabled={savingKey !== null} />{label}</label>)}</div></div>
          <button type="button" onClick={() => void invite()} disabled={!email.trim() || !groupId || inviteRoles.length === 0 || savingKey !== null} className="mt-5 rounded-2xl bg-slate-800 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{savingKey === 'invite' ? 'Invitando…' : 'Crear invitación'}</button>
        </section>}

        <section><div className="mb-4 flex items-center gap-2"><Users className="text-rose-400" size={20} /><h2 className="font-bold text-slate-800">Miembros administrables</h2></div>
          <div className="space-y-4">{groupedMembers.map((group) => <details key={group.id} className="rounded-3xl border border-rose-50 bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 font-bold text-slate-800 sm:px-6">
              <span>{group.name}</span><span className="rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-500">{group.members.length} usuarios</span>
            </summary>
            <div className="grid gap-4 border-t border-rose-50 p-4 lg:grid-cols-2">{group.members.map((member) => {
            const actions = deriveMemberActions(isSudo, currentProfile?.id ?? '', member.user_id, member.status, member.roles, member.is_active);
            const isSelf = member.user_id === currentProfile?.id;
            const busy = savingKey !== null;
            const roles = draftRoles[member.membership_id] ?? [];
            const features = draftFeatures[member.membership_id] ?? [];
            return <article key={member.membership_id} className="rounded-3xl border border-rose-50 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-bold text-slate-800">{member.full_name || 'Invitación pendiente'}</h3><p className="truncate text-xs text-slate-500">{member.email}</p><p className="mt-1 text-xs text-rose-400">{member.group_name} · {member.status}{isSudo && member.is_active !== null ? ` · cuenta ${member.is_active ? 'activa' : 'inactiva'}` : ''}{isSudo && member.is_sudo ? ' · sudo' : ''}</p></div><ShieldCheck className="shrink-0 text-rose-300" size={20} /></div>
              <div className="mt-4 flex flex-wrap gap-2">{allowedRoles.map(({ code, label }) => <label key={code} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs"><input type="checkbox" checked={roles.includes(code)} onChange={() => setDraftRoles((all) => ({ ...all, [member.membership_id]: toggleRole(roles, code) }))} disabled={!actions.canEditRoles || busy} />{label}</label>)}</div>
              <div className="mt-4"><p className="mb-2 text-xs font-semibold">Funcionalidades</p><div className="flex flex-wrap gap-2">{ALL_FEATURES.map(({ code, label }) => <label key={code} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs"><input type="checkbox" checked={features.includes(code)} onChange={() => setDraftFeatures((all) => ({ ...all, [member.membership_id]: toggleFeature(features, code) }))} disabled={!actions.canSetFeatures || busy} />{label}</label>)}</div></div>
              <button type="button" onClick={() => void saveFeatures(member)} disabled={!actions.canSetFeatures || busy} className="mt-3 rounded-xl bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700 disabled:opacity-40">{busy ? 'Guardando…' : 'Guardar funcionalidades'}</button>
              <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void saveRoles(member)} disabled={!actions.canEditRoles || busy || roles.length === 0} className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{busy ? 'Guardando…' : 'Guardar roles'}</button><button type="button" onClick={() => void disableMembership(member)} disabled={!actions.canDisableMembership || busy} className="flex items-center gap-1 rounded-xl bg-rose-50 px-4 py-2 text-xs font-bold text-rose-600 disabled:opacity-40"><UserMinus size={14} /> Desactivar membresía</button>{actions.canSetAccountActive && (member.is_active === true ? <button type="button" onClick={() => void setAccountActive(member, false)} disabled={busy} className="rounded-xl bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 disabled:opacity-40">Desactivar cuenta</button> : <button type="button" onClick={() => void setAccountActive(member, true)} disabled={busy} className="rounded-xl bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 disabled:opacity-40">Activar cuenta</button>)}{actions.canSetSudo && <button type="button" onClick={() => void setUserSudo(member, !member.is_sudo)} disabled={busy} className="rounded-xl bg-indigo-50 px-4 py-2 text-xs font-bold text-indigo-700 disabled:opacity-40">{member.is_sudo ? 'Retirar sudo' : 'Conceder sudo'}</button>}</div>
              {isSelf && <p className="mt-3 text-xs text-slate-400">Tu propia cuenta no se puede editar desde aquí.</p>}
            </article>;
          })}</div>
          </details>)}</div>
          {groups.length === 0 && <p className="rounded-3xl bg-white p-6 text-sm text-slate-500 shadow-sm">No hay grupos administrables.</p>}
        </section>
      </div>
    </main>
  );
}
