import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const responseHeaders = new Headers();
  const redirect = (path: string) =>
    NextResponse.redirect(new URL(path, origin), { headers: responseHeaders });
  const code = searchParams.get('code');
  const requestedNext = searchParams.get('next');
  const next =
    requestedNext?.startsWith('/') &&
    !requestedNext.startsWith('//') &&
    !requestedNext.includes('\\')
      ? requestedNext
      : '/';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet, headers) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
            Object.entries(headers).forEach(([name, value]) =>
              responseHeaders.set(name, value)
            );
          },
        },
      }
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { error: claimError } = await supabase.rpc(
        'claim_pending_invitation'
      );

      if (claimError) {
        return redirect('/?error=invitation-claim-error');
      }

      return redirect(next);
    }
  }

  // return the user to an error page with instructions
  return redirect('/?error=auth-code-error');
}
