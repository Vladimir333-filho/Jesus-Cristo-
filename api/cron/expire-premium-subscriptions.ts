import { timingSafeEqual } from 'node:crypto';
import { env } from 'node:process';
import { createClient } from '@supabase/supabase-js';

const EXPECTED_SUPABASE_URL = 'https://ydqekbhstwlbxhfkuplz.supabase.co';

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function isAuthorized(request: Request, secret: string): boolean {
  const supplied = request.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  const suppliedBytes = Buffer.from(supplied, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes);
}

export async function GET(request: Request): Promise<Response> {
  const cronSecret = env.CRON_SECRET || '';
  const supabaseUrl = env.SUPABASE_URL || '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!cronSecret || supabaseUrl !== EXPECTED_SUPABASE_URL || !serviceRoleKey) {
    return json({ error: 'Subscription expiry job is not configured.' }, 503);
  }

  if (!isAuthorized(request, cronSecret)) {
    return json({ error: 'Unauthorized.' }, 401);
  }

  const admin = createClient(EXPECTED_SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc('expire_business_premium_subscriptions');
  if (error || typeof data !== 'number') {
    console.error('Premium subscription expiry job failed');
    return json({ error: 'Subscription expiry could not be completed.' }, 503);
  }

  return json({ success: true, expiredSubscriptions: data });
}

export async function POST(): Promise<Response> {
  return json({ error: 'Method not allowed' }, 405);
}
