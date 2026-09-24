'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users } from 'lucide-react';
import { AppMobileNavigation } from '@/components/AppMobileNavigation';

type Friend = { user_id: string; full_name: string; friendship_status: string | null; incoming_request: boolean };
export default function FriendsPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  useEffect(() => { supabase.rpc('get_my_group_friend_directory').then(({ data }) => setFriends(Array.isArray(data) ? data : [])); }, []);
  async function request(userId: string) { await supabase.rpc('request_my_friend', { p_user_id: userId }); const { data } = await supabase.rpc('get_my_group_friend_directory'); setFriends(Array.isArray(data) ? data : []); }
  async function respond(userId: string, accept: boolean) { await supabase.rpc('respond_my_friend_request', { p_user_id: userId, p_accept: accept }); const { data } = await supabase.rpc('get_my_group_friend_directory'); setFriends(Array.isArray(data) ? data : []); }
  return <main className="theme-page min-h-screen max-w-md mx-auto pb-28"><header className="rounded-b-[2.5rem] bg-gradient-to-br from-pink-100 via-purple-100 to-blue-100 px-6 pb-7 pt-8"><div className="flex items-center gap-2 text-pink-500"><Users size={18}/><p className="text-xs font-semibold uppercase tracking-widest">Comunidad</p></div><h1 className="mt-2 text-3xl font-bold text-slate-800">Amigos</h1><p className="mt-2 text-sm text-slate-600">Comparte racha y puntuación, nada más.</p></header><section className="space-y-3 px-5 pt-6">{friends.map((friend) => <div key={friend.user_id} className="theme-surface flex items-center justify-between rounded-2xl p-4"><span className="font-semibold">{friend.full_name}</span>{friend.incoming_request ? <span className="flex gap-1"><button onClick={() => void respond(friend.user_id, true)} className="rounded-xl bg-emerald-500 px-2 py-1 text-xs font-semibold text-white">Aceptar</button><button onClick={() => void respond(friend.user_id, false)} className="rounded-xl bg-slate-200 px-2 py-1 text-xs">Rechazar</button></span> : friend.friendship_status === 'pending' ? <span className="text-xs text-slate-500">Solicitud enviada</span> : friend.friendship_status === 'accepted' ? <span className="text-xs text-emerald-600">Amigos</span> : <button onClick={() => void request(friend.user_id)} className="rounded-xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white">Añadir</button>}</div>)}</section><AppMobileNavigation current="friends" /></main>;
}
