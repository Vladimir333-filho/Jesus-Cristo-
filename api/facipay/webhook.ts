import { createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { env } from 'node:process';
import { createClient } from '@supabase/supabase-js';

type FaciPayStatus = 'PEN' | 'CON' | 'CAN';

type FaciPayWebhook = {
  event?: unknown;
  data?: {
    externalTransactionId?: unknown;
    paymentStatus?: unknown;
    referenceNumber?: unknown;
    amount?: unknown;
  };
};

const MAX_BODY_BYTES = 64 * 1024;

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const secret = env.FACIPAY_WEBHOOK_SECRET;
  if (!secret) {
    // Keep the endpoint closed until the webhook secret is configured in Vercel.
    return json({ error: 'Webhook is not configured' }, 503);
  }

  const signature = request.headers.get('x-facipay-content-token') ?? '';
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) {
    return json({ error: 'Invalid signature' }, 401);
  }

  let rawBody: Buffer;
  try {
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BODY_BYTES) {
      return json({ error: 'Invalid payload size' }, 413);
    }
    rawBody = bytes;
  } catch {
    return json({ error: 'Unable to read request body' }, 400);
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return json({ error: 'Invalid signature' }, 401);
  }

  // Parse JSON only after validating the HMAC over the exact raw request bytes.
  let payload: FaciPayWebhook;
  try {
    payload = JSON.parse(rawBody.toString('utf8')) as FaciPayWebhook;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const data = payload.data;
  const externalTransactionId = data?.externalTransactionId;
  const paymentStatus = data?.paymentStatus;
  const referenceNumber = data?.referenceNumber;
  const amount = data?.amount;

  if (
    payload.event !== 'payment' ||
    typeof externalTransactionId !== 'string' ||
    externalTransactionId.length < 1 ||
    externalTransactionId.length > 200 ||
    !['PEN', 'CON', 'CAN'].includes(String(paymentStatus)) ||
    typeof referenceNumber !== 'string' ||
    referenceNumber.length < 1 ||
    referenceNumber.length > 200 ||
    typeof amount !== 'number' ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    return json({ error: 'Invalid payment event' }, 400);
  }

  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Payment processing is not configured' }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: payment, error: lookupError } = await admin
    .from('payments')
    .select('id,amount_aoa,reference,status,provider_status')
    .eq('provider', 'facipay')
    .eq('external_transaction_id', externalTransactionId)
    .maybeSingle();

  if (lookupError) {
    console.error('FaciPay webhook payment lookup failed');
    return json({ error: 'Temporary payment lookup failure' }, 503);
  }

  if (!payment) {
    // Acknowledge unknown IDs to avoid retry storms; no financial state is changed.
    console.warn('FaciPay webhook received an unknown transaction');
    return json({ received: true, processed: false });
  }

  const amountMatches = Number(payment.amount_aoa) === amount;
  const referenceMatches = payment.reference === referenceNumber;
  if (!amountMatches || !referenceMatches) {
    // Never confirm a payment when the provider's amount or reference differs.
    console.error('FaciPay webhook mismatch; payment left unchanged', {
      amountMatches,
      referenceMatches,
    });
    return json({ received: true, processed: false });
  }

  if (
    payment.status !== 'pending' ||
    payment.provider_status === 'CON' ||
    payment.provider_status === 'CAN'
  ) {
    // CON/CAN are terminal. Duplicate or late events are acknowledged without replay.
    return json({ received: true, processed: false });
  }

  const nextStatus = paymentStatus as FaciPayStatus;
  const patch: {
    provider_status: FaciPayStatus;
    status?: 'confirmed' | 'rejected';
  } = { provider_status: nextStatus };

  if (nextStatus === 'CON') patch.status = 'confirmed';
  if (nextStatus === 'CAN') patch.status = 'rejected';

  const { error: updateError } = await admin
    .from('payments')
    .update(patch)
    .eq('id', payment.id)
    .eq('status', 'pending');

  if (updateError) {
    console.error('FaciPay webhook payment update failed');
    return json({ error: 'Temporary payment update failure' }, 503);
  }

  return json({ received: true, processed: true });
}

export async function GET(): Promise<Response> {
  return json({ error: 'Method not allowed' }, 405);
}
