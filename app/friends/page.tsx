'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Users } from 'lucide-react';
import { AppMobileNavigation } from '@/components/AppMobileNavigation';
import { useConfirmDialog } from '@/components/ConfirmDialogProvider';
import {
  challengedFriendIdsForWeek as challengedFriendIdsForWeekHelper,
  challengeProgress,
  normalizeChallenge,
  weekStartFromDateString,
} from '@/lib/friend-challenges.mjs';
import { madridDateString } from '@/lib/historical-date.js';
import { supabase } from '@/lib/supabase';

type Friend = { user_id: string; full_name: string; friendship_status: string | null; incoming_request: boolean };
type Challenge = { id: string; challenger_id: string; opponent_id: string; week_start: string; challenge_type: string; status: string; my_score: number; opponent_score: number };

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'No se pudo completar la operación.';
}

export default function FriendsPage() {
  const confirmDialog = useConfirmDialog();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [challengeMessage, setChallengeMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [madridToday, setMadridToday] = useState(madridDateString);
  const loadGenerationRef = useRef(0);
  const busyActionRef = useRef<string | null>(null);
  const challengesRef = useRef<Challenge[]>([]);
  const mountedRef = useRef(false);
  const currentWeekStart = weekStartFromDateString(madridToday);
  const challengedFriendIdsForWeek = useMemo(
    () => challengedFriendIdsForWeekHelper(challenges, currentWeekStart),
    [challenges, currentWeekStart],
  );

  const load = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    const [friendsResult, challengesResult] = await Promise.all([
      supabase.rpc('get_my_group_friend_directory'),
      supabase.rpc('get_my_friend_challenges'),
    ]);
    if (!mountedRef.current || generation !== loadGenerationRef.current) return false;
    if (friendsResult.error) throw friendsResult.error;
    if (challengesResult.error) throw challengesResult.error;

    const nextFriends = Array.isArray(friendsResult.data) ? friendsResult.data : [];
    const nextChallenges = Array.isArray(challengesResult.data) ? challengesResult.data.map(normalizeChallenge) : [];
    setFriends(nextFriends);
    challengesRef.current = nextChallenges;
    setChallenges(nextChallenges);
    return true;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void Promise.resolve().then(load).catch((error: unknown) => {
      if (mountedRef.current && !busyActionRef.current) setChallengeMessage(errorMessage(error));
    });
    return () => {
      mountedRef.current = false;
      loadGenerationRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const refreshMadridDate = () => {
      const nextDate = madridDateString();
      setMadridToday((currentDate) => currentDate === nextDate ? currentDate : nextDate);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshMadridDate();
    };
    const intervalId = window.setInterval(refreshMadridDate, 60_000);
    window.addEventListener('focus', refreshMadridDate);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshMadridDate);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  async function runAction(action: string, mutation: () => PromiseLike<{ error: unknown }>, successMessage: string) {
    if (busyActionRef.current) return;
    busyActionRef.current = action;
    setBusyAction(action);
    setChallengeMessage(null);
    try {
      const mutationResult = await mutation();
      if (mutationResult.error) throw mutationResult.error;
      const published = await load();
      if (!published || !mountedRef.current || busyActionRef.current !== action) return;
      setChallengeMessage(successMessage);
    } catch (error) {
      if (mountedRef.current && busyActionRef.current === action) setChallengeMessage(errorMessage(error));
    } finally {
      if (busyActionRef.current === action) {
        busyActionRef.current = null;
        if (mountedRef.current) setBusyAction(null);
      }
    }
  }

  async function request(userId: string) {
    await runAction(
      `request:${userId}`,
      () => supabase.rpc('request_my_friend', { p_user_id: userId }),
      'Solicitud enviada.',
    );
  }

  async function respond(userId: string, accept: boolean) {
    await runAction(
      `respond:${userId}`,
      () => supabase.rpc('respond_my_friend_request', { p_user_id: userId, p_accept: accept }),
      accept ? 'Solicitud aceptada.' : 'Solicitud rechazada.',
    );
  }

  async function challenge(userId: string) {
    const challengeMadridToday = madridDateString();
    const challengeCurrentWeekStart = weekStartFromDateString(challengeMadridToday);
    if (challengeMadridToday !== madridToday || challengeCurrentWeekStart !== currentWeekStart) {
      setMadridToday(challengeMadridToday);
    }
    await runAction(
      `challenge:${userId}`,
      () => supabase.rpc('create_my_friend_challenge', {
        p_opponent_id: userId,
        p_type: 'good_days',
      }),
      'Reto semanal enviado.',
    );
  }

  async function deleteChallenge(challengeId: string) {
    if (busyActionRef.current) return;
    const challengeToDelete = challenges.find((item) => item.id === challengeId);
    const actualCurrentWeekStart = weekStartFromDateString(madridDateString());
    if (!challengeToDelete || challengeToDelete.week_start !== actualCurrentWeekStart) return;

    const confirmed = await confirmDialog({
      title: 'Eliminar reto',
      message: 'Podréis volver a retaros durante esta semana',
      confirmLabel: 'Eliminar',
      cancelLabel: 'Mantener',
      tone: 'danger',
    });
    if (!confirmed) return;
    if (!mountedRef.current || busyActionRef.current) return;
    const confirmedMadridToday = madridDateString();
    const confirmedCurrentWeekStart = weekStartFromDateString(confirmedMadridToday);
    const challengeIsStillCurrent = challengesRef.current.some(
      (item) => item.id === challengeId && item.week_start === confirmedCurrentWeekStart,
    );
    if (!challengeIsStillCurrent) {
      setMadridToday(confirmedMadridToday);
      return;
    }

    await runAction(
      `delete:${challengeId}`,
      () => supabase.rpc('delete_my_friend_challenge', { p_challenge_id: challengeId }),
      'Reto eliminado.',
    );
  }

  return (
    <main className="theme-page min-h-screen max-w-md mx-auto pb-28">
      <header className="rounded-b-[2.5rem] bg-gradient-to-br from-pink-100 via-purple-100 to-blue-100 px-6 pb-7 pt-8">
        <div className="flex items-center gap-2 text-pink-500"><Users size={18} /><p className="text-xs font-semibold uppercase tracking-widest">Comunidad</p></div>
        <h1 className="mt-2 text-3xl font-bold text-slate-800">Amigos</h1>
      </header>
      <section className="space-y-3 px-5 pt-6">
        <h2 className="font-bold">⚔️ Retos semanales</h2>
        {challengeMessage && <p role="status" className="rounded-2xl bg-violet-50 px-4 py-3 text-sm font-medium text-violet-800">{challengeMessage}</p>}
        {challenges.map((challenge) => (
          <div key={challenge.id} className="rounded-3xl bg-gradient-to-r from-violet-600 to-rose-500 p-4 text-white">
            <p className="text-xs font-bold uppercase">Duelo semanal</p>
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-3 text-center">
              <div><p className="inline-block rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white">Tú</p><p className="text-3xl font-bold">{challenge.my_score}</p></div>
              <span className="pb-2 text-sm font-bold">VS</span>
              <div><p className="inline-block rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white">Amigo</p><p className="text-3xl font-bold">{challenge.opponent_score}</p></div>
            </div>
            <div role="progressbar" aria-label="Progreso de tu puntuación en el reto" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(challengeProgress(challenge.my_score, challenge.opponent_score))} className="mt-3 h-3 overflow-hidden rounded-full bg-white/30"><div className="h-full rounded-full bg-yellow-300" style={{ width: `${challengeProgress(challenge.my_score, challenge.opponent_score)}%` }} /></div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs">{challenge.challenge_type === 'good_days' ? 'Más días buenos' : 'Mayor puntuación'} · {challenge.status === 'pending' ? 'Pendiente' : 'En curso'}</p>
              {challenge.week_start === currentWeekStart && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  aria-label={`Eliminar reto semanal del ${challenge.week_start}`}
                  onClick={() => void deleteChallenge(challenge.id)}
                  className="min-h-11 min-w-11 rounded-xl text-white/90 hover:bg-white/15 disabled:opacity-50"
                >
                  <Trash2 aria-hidden="true" className="mx-auto" size={18} />
                </button>
              )}
            </div>
          </div>
        ))}
        {friends.map((friend) => (
          <div key={friend.user_id} className="theme-surface flex items-center justify-between rounded-2xl p-4">
            <span className="font-semibold">{friend.full_name}</span>
            {friend.incoming_request ? <span className="flex gap-1"><button disabled={busyAction !== null} onClick={() => void respond(friend.user_id, true)} className="rounded-xl bg-emerald-500 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">Aceptar</button><button disabled={busyAction !== null} onClick={() => void respond(friend.user_id, false)} className="rounded-xl bg-slate-200 px-2 py-1 text-xs disabled:opacity-50">Rechazar</button></span>
              : friend.friendship_status === 'accepted' ? challengedFriendIdsForWeek.has(friend.user_id)
                ? <span className="rounded-xl bg-violet-800 px-3 py-2 text-xs font-semibold text-white">Reto activo</span>
                : <button disabled={busyAction !== null} onClick={() => void challenge(friend.user_id)} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">⚔️ Retar</button>
                : friend.friendship_status === 'pending' ? <span className="text-xs text-slate-500">Solicitud enviada</span>
                  : <button disabled={busyAction !== null} onClick={() => void request(friend.user_id)} className="rounded-xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Añadir</button>}
          </div>
        ))}
      </section>
      <AppMobileNavigation current="friends" />
    </main>
  );
}
