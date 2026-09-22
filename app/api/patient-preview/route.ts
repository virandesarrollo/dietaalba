import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return Response.json({ error: 'No autorizado' }, { status: 401 });
  const { patientId } = await request.json().catch(() => ({}));
  if (typeof patientId !== 'string') return Response.json({ error: 'Solicitud inválida' }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return Response.json({ error: 'Servicio no configurado' }, { status: 503 });
  const actor = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: email, error } = await actor.rpc('authorize_patient_preview', { p_patient_user_id: patientId });
  if (error || !email) return Response.json({ error: 'No autorizado' }, { status: 403 });
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: `${new URL(request.url).origin}/patient-preview` } });
  if (linkError || !data.properties.action_link) return Response.json({ error: 'No se pudo iniciar el acceso' }, { status: 502 });
  return Response.json({ link: data.properties.action_link });
}
