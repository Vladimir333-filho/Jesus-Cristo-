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

class PayloadTooLargeError extends Error {}

async function readLimitedBody(request: Request): Promise<Buffer> {
  if (!request.body) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new PayloadTooLargeError();
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

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
    rawBody = await readLimitedBody(request);
    if (rawBody.byteLength === 0) {
      return json({ error: 'Invalid payload size' }, 400);
    }
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return json({ error: 'Invalid payload size' }, 413);
    }
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
  const expectedSupabaseUrl = 'https://ydqekbhstwlbxhfkuplz.supabase.co';
  // Never send a privileged service key to an unintended host because of
  // a misconfigured environment variable.
  if (!supabaseUrl || supabaseUrl !== expectedSupabaseUrl || !serviceRoleKey) {
    return json({ error: 'Payment processing is not configured' }, 503);
  }

  const admin = createClient(expectedSupabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: result, error: processingError } = await admin.rpc(
    'apply_facipay_payment_event',
    {
      p_external_transaction_id: externalTransactionId,
      p_reference_number: referenceNumber,
      p_amount: amount,
      p_payment_status: paymentStatus,
    }
  );

  if (processingError) {
    // Do not log request bodies, signatures, payment references or credentials.
    console.error('FaciPay webhook atomic processing failed');
    return json({ error: 'Temporary payment processing failure' }, 503);
  }

  if (!result || typeof result !== 'object' || result.received !== true) {
    console.error('FaciPay webhook returned an invalid processing result');
    return json({ error: 'Temporary payment processing failure' }, 503);
  }

  if (result.processed !== true && result.reason === 'payment_mismatch') {
    // A mismatch is acknowledged, but never updates the financial record.
    console.warn('FaciPay webhook rejected a payment mismatch');
  }

  return json({
    received: true,
    processed: result.processed === true,
  });
}

export async function GET(): Promise<Response> {
  return json({ error: 'Method not allowed' }, 405);
}
