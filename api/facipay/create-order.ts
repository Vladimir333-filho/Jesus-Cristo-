import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { env } from 'node:process';
import { createClient } from '@supabase/supabase-js';

type Reservation = {
  reservation_id: string;
  external_transaction_id: string;
  amount_aoa: number;
  period_start: string;
  period_end: string;
  reference_number?: string;
  already_ready?: boolean;
};

type FaciPayTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
};

type FaciPayOrderResponse = {
  code?: unknown;
  data?: { referenceNumber?: unknown };
};

const EXPECTED_SUPABASE_URL = 'https://ydqekbhstwlbxhfkuplz.supabase.co';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REQUEST_BYTES = 2048;

let cachedAccessToken = '';
let cachedAccessTokenExpiresAt = 0;

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function readJsonLimited(request: Request): Promise<Record<string, unknown> | null> {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_REQUEST_BYTES) return null;
  const raw = await request.text();
  if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_REQUEST_BYTES) return null;
  const parsed: unknown = JSON.parse(raw);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

function getFaciPayConfiguration() {
  const publishableKey = env.FACIPAY_PUBLISHABLE_KEY || '';
  const clientId = env.FACIPAY_CLIENT_ID || '';
  const clientSecret = env.FACIPAY_CLIENT_SECRET || '';
  const configuredApiUrl = env.FACIPAY_API_URL || '';
  const frontendPublishableKey = env.VITE_FACIPAY_PUBLISHABLE_KEY || '';

  const isSandbox = publishableKey.startsWith('pk_test_');
  const isProduction = publishableKey.startsWith('pk_live_');
  const expectedApiUrl = isSandbox
    ? 'https://sandbox.api.faciconnect.com'
    : isProduction
      ? 'https://api.faciconnect.com'
      : '';

  if (
    !expectedApiUrl ||
    configuredApiUrl !== expectedApiUrl ||
    (frontendPublishableKey && frontendPublishableKey !== publishableKey) ||
    !clientId ||
    !clientSecret ||
    publishableKey.length <= 8
  ) {
    return null;
  }

  return {
    publishableKey,
    applicationUUID: publishableKey.replace(/^pk_(test|live)_/, ''),
    clientId,
    clientSecret,
    apiUrl: expectedApiUrl,
  };
}

async function getFaciPayAccessToken(config: NonNullable<ReturnType<typeof getFaciPayConfiguration>>) {
  if (cachedAccessToken && cachedAccessTokenExpiresAt > Date.now() + 60_000) {
    return cachedAccessToken;
  }

  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`, 'utf8').toString('base64');
  const response = await fetch(`${config.apiUrl}/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials&validity_period=3600',
    signal: AbortSignal.timeout(12_000),
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as FaciPayTokenResponse | null;
  if (
    !response.ok ||
    !payload ||
    typeof payload.access_token !== 'string' ||
    payload.access_token.length < 10
  ) {
    throw new Error('FACIPAY_TOKEN_FAILED');
  }

  const lifetimeSeconds =
    typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in)
      ? Math.max(120, Math.min(payload.expires_in, 3600))
      : 3600;

  cachedAccessToken = payload.access_token;
  cachedAccessTokenExpiresAt = Date.now() + (lifetimeSeconds - 60) * 1000;
  return cachedAccessToken;
}

export async function POST(request: Request): Promise<Response> {
  const authorization = request.headers.get('authorization') || '';
  const bearerMatch = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!bearerMatch) return json({ error: 'Autenticação obrigatória.' }, 401);

  let body: Record<string, unknown> | null;
  try {
    body = await readJsonLimited(request);
  } catch {
    return json({ error: 'Pedido inválido.' }, 400);
  }

  const businessId = body?.businessId;
  if (typeof businessId !== 'string' || !UUID_PATTERN.test(businessId)) {
    return json({ error: 'Identificador de empresa inválido.' }, 400);
  }

  const supabaseUrl = env.SUPABASE_URL || '';
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (supabaseUrl !== EXPECTED_SUPABASE_URL || !anonKey || !serviceRoleKey) {
    return json({ error: 'O serviço de subscrições ainda não está configurado.' }, 503);
  }

  const authClient = createClient(EXPECTED_SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(bearerMatch[1]);
  if (authError || !authData.user?.id) {
    return json({ error: 'Sessão inválida ou expirada.' }, 401);
  }

  const admin = createClient(EXPECTED_SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const config = getFaciPayConfiguration();
  if (!config) {
    return json({ error: 'A FaciPay ainda não está configurada para este ambiente.' }, 503);
  }

  const externalTransactionId = `acb_premium_${randomUUID()}`;
  const { data: reservationData, error: reservationError } = await admin.rpc(
    'reserve_facipay_premium_checkout',
    {
      p_business_id: businessId,
      p_owner_id: authData.user.id,
      p_external_transaction_id: externalTransactionId,
    }
  );

  if (reservationError || !reservationData || typeof reservationData !== 'object') {
    const message = reservationError?.message || '';
    if (message.includes('pendente') || message.includes('checkout')) {
      return json({ error: 'Já existe um checkout ou pagamento pendente para esta empresa. Aguarde a confirmação antes de tentar novamente.' }, 409);
    }
    if (message.includes('aprovada') || message.includes('verificada')) {
      return json({ error: 'A empresa precisa de estar aprovada e verificada para aderir ao Premium.' }, 403);
    }
    if (message.includes('reconciliação')) {
      return json({ error: 'O plano desta empresa precisa de reconciliação administrativa antes de uma nova cobrança.' }, 409);
    }
    return json({ error: 'Não foi possível preparar a subscrição Premium.' }, 400);
  }

  const reservation = reservationData as Reservation;
  if (
    reservation.already_ready === true &&
    typeof reservation.reference_number === 'string' &&
    reservation.reference_number.trim()
  ) {
    return json({
      referenceNumber: reservation.reference_number,
      amount: reservation.amount_aoa,
      periodStart: reservation.period_start,
      periodEnd: reservation.period_end,
    });
  }

  if (
    typeof reservation.reservation_id !== 'string' ||
    typeof reservation.external_transaction_id !== 'string' ||
    !Number.isSafeInteger(Number(reservation.amount_aoa)) ||
    ![3000, 10000].includes(Number(reservation.amount_aoa))
  ) {
    return json({ error: 'A reserva de pagamento devolveu dados inválidos.' }, 502);
  }

  let providerOrderAttempted = false;
  let providerReferenceNumber = '';
  try {
    const accessToken = await getFaciPayAccessToken(config);
    providerOrderAttempted = true;
    const providerResponse = await fetch(
      `${config.apiUrl}/facipaypartner/createPaymentOrder`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Accept-Language': 'pt',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          externalTransactionId: reservation.external_transaction_id,
          clientId: authData.user.id,
          applicationUUID: config.applicationUUID,
          name: 'Subscrição Premium - Angola Connect',
          amount: Number(reservation.amount_aoa),
          quantity: 1,
          additionalInfo: 'Plano Premium empresarial com período de três meses',
        }),
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      }
    );

    const providerPayload = (await providerResponse.json().catch(() => null)) as FaciPayOrderResponse | null;
    const referenceNumber = providerPayload?.data?.referenceNumber;
    if (
      !providerResponse.ok ||
      typeof referenceNumber !== 'string' ||
      !referenceNumber.trim() ||
      referenceNumber !== referenceNumber.trim() ||
      referenceNumber.length > 200
    ) {
      throw new Error('FACIPAY_ORDER_FAILED');
    }
    providerReferenceNumber = referenceNumber;

    const { data: finalized, error: finalizeError } = await admin.rpc(
      'finalize_facipay_premium_checkout',
      {
        p_reservation_id: reservation.reservation_id,
        p_reference_number: referenceNumber,
      }
    );

    if (finalizeError || !finalized || typeof finalized !== 'object') {
      throw new Error('FACIPAY_FINALIZE_FAILED');
    }

    const finalizedResult = finalized as { reference_number?: unknown };
    if (
      typeof finalizedResult.reference_number !== 'string' ||
      !finalizedResult.reference_number.trim()
    ) {
      throw new Error('FACIPAY_FINALIZE_FAILED');
    }

    return json({
      referenceNumber: finalizedResult.reference_number,
      amount: Number(reservation.amount_aoa),
      periodStart: reservation.period_start,
      periodEnd: reservation.period_end,
    });
  } catch {
    try {
      if (providerOrderAttempted) {
        await admin.rpc('mark_facipay_premium_checkout_reconciliation', {
          p_reservation_id: reservation.reservation_id,
          p_reference_number: providerReferenceNumber || null,
        });
      } else {
        await admin.rpc('fail_facipay_premium_checkout', {
          p_reservation_id: reservation.reservation_id,
        });
      }
    } catch {
      // Keep the reservation locked if cleanup fails; do not risk a duplicate charge.
    }

    // Never log provider credentials, bearer tokens, references, or request bodies.
    console.error('FaciPay Premium order creation failed');
    return json({ error: 'Não foi possível criar a ordem FaciPay. Tente novamente mais tarde.' }, 502);
  }
}

export async function GET(): Promise<Response> {
  return json({ error: 'Method not allowed' }, 405);
}
