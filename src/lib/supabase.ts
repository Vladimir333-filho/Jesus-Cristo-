import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const EXPECTED_SUPABASE_PROJECT_REF = 'ydqekbhstwlbxhfkuplz';
export const EXPECTED_SUPABASE_URL = `https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`;

export type SupabaseKeyFormat =
  | 'legacy_anon_jwt'
  | 'publishable'
  | 'secret_blocked'
  | 'invalid'
  | 'missing';

export interface SupabaseConfigStatus {
  configured: boolean;
  url: string;
  projectRefValid: boolean;
  keyPresent: boolean;
  keyMatchesProject: boolean;
  keyFormat: SupabaseKeyFormat;
  serviceRoleBlocked: boolean;
  reason?: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function validateSupabaseConfigValues(rawUrlInput: string, rawKeyInput: string): {
  status: SupabaseConfigStatus;
  url: string;
  key: string;
} {
  const rawUrl = rawUrlInput.trim();
  const rawKey = rawKeyInput.trim();

  if (!rawUrl || !rawKey) {
    return {
      url: rawUrl || EXPECTED_SUPABASE_URL,
      key: '',
      status: {
        configured: false,
        url: rawUrl || EXPECTED_SUPABASE_URL,
        projectRefValid: !rawUrl || rawUrl === EXPECTED_SUPABASE_URL,
        keyPresent: Boolean(rawKey),
        keyMatchesProject: false,
        keyFormat: 'missing',
        serviceRoleBlocked: false,
        reason: !rawUrl
          ? 'VITE_SUPABASE_URL não configurada nas variáveis de ambiente.'
          : 'VITE_SUPABASE_ANON_KEY (ou VITE_SUPABASE_PUBLISHABLE_KEY) não configurada nas variáveis de ambiente / Secrets.',
      },
    };
  }

  let parsedHost = '';
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') {
      throw new Error('URL deve usar HTTPS.');
    }
    parsedHost = u.host;
  } catch {
    return {
      url: rawUrl,
      key: '',
      status: {
        configured: false,
        url: rawUrl,
        projectRefValid: false,
        keyPresent: true,
        keyMatchesProject: false,
        keyFormat: 'invalid',
        serviceRoleBlocked: false,
        reason: 'VITE_SUPABASE_URL inválida.',
      },
    };
  }

  const projectRefFromUrl = parsedHost.split('.')[0];
  const projectRefValid = projectRefFromUrl === EXPECTED_SUPABASE_PROJECT_REF;

  if (!projectRefValid) {
    return {
      url: rawUrl,
      key: '',
      status: {
        configured: false,
        url: rawUrl,
        projectRefValid: false,
        keyPresent: true,
        keyMatchesProject: false,
        keyFormat: 'invalid',
        serviceRoleBlocked: false,
        reason: `VITE_SUPABASE_URL não corresponde ao projecto autorizado (${EXPECTED_SUPABASE_PROJECT_REF}).`,
      },
    };
  }

  // Block secret keys immediately (both new sb_secret_* format and legacy service_role JWT)
  if (rawKey.startsWith('sb_secret_')) {
    return {
      url: rawUrl,
      key: '',
      status: {
        configured: false,
        url: rawUrl,
        projectRefValid: true,
        keyPresent: true,
        keyMatchesProject: false,
        keyFormat: 'secret_blocked',
        serviceRoleBlocked: true,
        reason: 'BLOQUEIO DE SEGURANÇA: A chave secreta sb_secret_ nunca pode ser utilizada no frontend.',
      },
    };
  }

  // Accept new Supabase Publishable Keys (sb_publishable_...) directly without JWT decoding
  if (rawKey.startsWith('sb_publishable_')) {
    const isValidPublishable = /^sb_publishable_[A-Za-z0-9_-]{12,}$/.test(rawKey);
    if (!isValidPublishable) {
      return {
        url: rawUrl,
        key: '',
        status: {
          configured: false,
          url: rawUrl,
          projectRefValid: true,
          keyPresent: true,
          keyMatchesProject: false,
          keyFormat: 'invalid',
          serviceRoleBlocked: false,
          reason: 'Formato da Publishable Key (sb_publishable_) inválido ou incompleto.',
        },
      };
    }

    return {
      url: rawUrl,
      key: rawKey,
      status: {
        configured: true,
        url: rawUrl,
        projectRefValid: true,
        keyPresent: true,
        keyMatchesProject: true,
        keyFormat: 'publishable',
        serviceRoleBlocked: false,
      },
    };
  }

  // Legacy anon JWT validation (3 dot-separated base64url segments)
  if (rawKey.split('.').length === 3) {
    const jwtPayload = decodeJwtPayload(rawKey);
    if (!jwtPayload) {
      return {
        url: rawUrl,
        key: '',
        status: {
          configured: false,
          url: rawUrl,
          projectRefValid: true,
          keyPresent: true,
          keyMatchesProject: false,
          keyFormat: 'invalid',
          serviceRoleBlocked: false,
          reason: 'Chave JWT Supabase malformada ou ilegível.',
        },
      };
    }

    if (jwtPayload.role === 'service_role' || jwtPayload.role === 'supabase_admin') {
      return {
        url: rawUrl,
        key: '',
        status: {
          configured: false,
          url: rawUrl,
          projectRefValid: true,
          keyPresent: true,
          keyMatchesProject: false,
          keyFormat: 'secret_blocked',
          serviceRoleBlocked: true,
          reason: 'BLOQUEIO DE SEGURANÇA: A chave service_role nunca pode ser utilizada no frontend.',
        },
      };
    }

    if (typeof jwtPayload.role === 'string' && jwtPayload.role !== 'anon') {
      return {
        url: rawUrl,
        key: '',
        status: {
          configured: false,
          url: rawUrl,
          projectRefValid: true,
          keyPresent: true,
          keyMatchesProject: false,
          keyFormat: 'invalid',
          serviceRoleBlocked: false,
          reason: `Role JWT não autorizada para frontend (${jwtPayload.role}). Utilize apenas chave anon ou sb_publishable_.`,
        },
      };
    }

    if (typeof jwtPayload.ref === 'string' && jwtPayload.ref !== EXPECTED_SUPABASE_PROJECT_REF) {
      return {
        url: rawUrl,
        key: '',
        status: {
          configured: false,
          url: rawUrl,
          projectRefValid: true,
          keyPresent: true,
          keyMatchesProject: false,
          keyFormat: 'invalid',
          serviceRoleBlocked: false,
          reason: `VITE_SUPABASE_ANON_KEY pertence a outro projecto (${jwtPayload.ref}).`,
        },
      };
    }

    return {
      url: rawUrl,
      key: rawKey,
      status: {
        configured: true,
        url: rawUrl,
        projectRefValid: true,
        keyPresent: true,
        keyMatchesProject: true,
        keyFormat: 'legacy_anon_jwt',
        serviceRoleBlocked: false,
      },
    };
  }

  return {
    url: rawUrl,
    key: '',
    status: {
      configured: false,
      url: rawUrl,
      projectRefValid: true,
      keyPresent: true,
      keyMatchesProject: false,
      keyFormat: 'invalid',
      serviceRoleBlocked: false,
      reason: 'Formato de chave Supabase não reconhecido. Utilize a Legacy anon JWT ou a Publishable Key (sb_publishable_...).',
    },
  };
}

function validateSupabaseConfig(): { status: SupabaseConfigStatus; url: string; key: string } {
  const rawUrl = import.meta.env?.VITE_SUPABASE_URL || '';
  const rawKey =
    import.meta.env?.VITE_SUPABASE_ANON_KEY ||
    import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
    '';
  return validateSupabaseConfigValues(rawUrl, rawKey);
}

function createUnconfiguredClient(reason: string): SupabaseClient {
  const errResult = { data: null, error: { message: reason, status: 503 } };

  const queryBuilder: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (val: unknown) => void) => resolve(errResult);
        }
        return () => queryBuilder;
      },
    }
  );

  const authStub: any = {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: { message: reason } }),
    signUp: async () => ({ data: { user: null, session: null }, error: { message: reason } }),
    signOut: async () => ({ error: null }),
  };

  const storageBucketStub: any = {
    upload: async () => ({ data: null, error: { message: reason } }),
    createSignedUrl: async () => ({ data: null, error: { message: reason } }),
    getPublicUrl: () => ({ data: { publicUrl: '' } }),
    remove: async () => ({ data: null, error: { message: reason } }),
  };

  return {
    auth: authStub,
    from: () => queryBuilder,
    storage: {
      from: () => storageBucketStub,
    },
  } as unknown as SupabaseClient;
}

const validated = validateSupabaseConfig();

export const supabaseConfigStatus: SupabaseConfigStatus = validated.status;

export const supabase: SupabaseClient = validated.status.configured
  ? createClient(validated.url, validated.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : createUnconfiguredClient(
      validated.status.reason || 'Configuração Supabase em falta (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'
    );
