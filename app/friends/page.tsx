'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { AppMobileNavigation } from '@/components/AppMobileNavigation';
import { supabase } from '@/lib/supabase';

type Friend = { user_id: string; full_name: string; friendship_status: string | null; incoming_request: boolean };
type Challenge = { id: string; challenge_type: string; status: string };

export default function FriendsPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [challengeMessage, setChallengeMessage] = useState<string | null>(null);

  async function loadChallenges() {
    const { data } = await supabase.rpc('get_my_friend_challenges');
    setChallenges(Array.isArray(data) ? data : []);
  }

  async function loadFriends() {
    const { data } = await supabase.rpc('get_my_group_friend_directory');
    setFriends(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void loadFriends();
    void loadChallenges();
  }, []);

  async function request(userId: string) {
    await supabase.rpc('request_my_friend', { p_user_id: userId });
    await loadFriends();
  }

  async function respond(userId: string, accept: boolean) {
    await supabase.rpc('respond_my_friend_request', { p_user_id: userId, p_accept: accept });
    await loadFriends();
  }

  async function challenge(userId: string) {
    setChallengeMessage(null);
    const { error } = await supabase.rpc('create_my_friend_challenge', {
      p_opponent_id: userId,
      p_type: 'good_days',
    });
    if (error) {
      setChallengeMessage(error.message || 'No se pudo crear el reto.');
      return;
    }
    await loadChallenges();
    setChallengeMessage('Reto semanal enviado.');
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
            <div className="mt-3 flex items-center justify-between text-lg font-bold"><span>🔥 Tú</span><span>VS</span><span>🔥 Amigo</span></div>
            <div className="mt-3 h-3 rounded-full bg-white/30"><div className="h-full w-1/2 rounded-full bg-yellow-300" /></div>
            <p className="mt-2 text-xs">{challenge.challenge_type === 'good_days' ? 'Más días buenos' : 'Mayor puntuación'} · {challenge.status === 'pending' ? 'Pendiente' : 'En curso'}</p>
          </div>
        ))}
        {friends.map((friend) => (
          <div key={friend.user_id} className="theme-surface flex items-center justify-between rounded-2xl p-4">
            <span className="font-semibold">{friend.full_name}</span>
            {friend.incoming_request ? <span className="flex gap-1"><button onClick={() => void respond(friend.user_id, true)} className="rounded-xl bg-emerald-500 px-2 py-1 text-xs font-semibold text-white">Aceptar</button><button onClick={() => void respond(friend.user_id, false)} className="rounded-xl bg-slate-200 px-2 py-1 text-xs">Rechazar</button></span>
              : friend.friendship_status === 'accepted' ? <button onClick={() => void challenge(friend.user_id)} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white">⚔️ Retar</button>
                : friend.friendship_status === 'pending' ? <span className="text-xs text-slate-500">Solicitud enviada</span>
                  : <button onClick={() => void request(friend.user_id)} className="rounded-xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white">Añadir</button>}
          </div>
        ))}
      </section>
      <AppMobileNavigation current="friends" />
    </main>
  );
}
