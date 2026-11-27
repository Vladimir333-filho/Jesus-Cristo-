import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, CreditCard, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

type PaymentRow = {
  id: string;
  business_id: string;
  amount_aoa: number | string;
  method: string;
  reference: string | null;
  status: 'pending' | 'confirmed' | 'rejected' | 'refunded';
  period_start: string | null;
  period_end: string | null;
  confirmed_at: string | null;
  created_at: string;
  businesses?: { name?: string } | null;
};

interface PaymentsPortalProps {
  user: any;
  lang: 'pt' | 'en';
  onOpenAuth: () => void;
}

const STATUS_LABELS = {
  pt: { pending: 'Pendente', confirmed: 'Confirmado', rejected: 'Rejeitado', refunded: 'Estornado' },
  en: { pending: 'Pending', confirmed: 'Confirmed', rejected: 'Rejected', refunded: 'Refunded' },
};

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Transferência bancária',
  multicaixa_express: 'Multicaixa Express',
  unitel_money: 'Unitel Money',
  other: 'Outro',
};

export const PaymentsPortal: React.FC<PaymentsPortalProps> = ({ user, lang, onOpenAuth }) => {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const copy = lang === 'pt'
    ? {
        title: 'Gestão Financeira',
        subtitle: 'Consulta segura dos pagamentos registados na plataforma.',
        signIn: 'Inicie sessão para consultar os seus pagamentos.',
        signInButton: 'Iniciar sessão',
        refresh: 'Actualizar',
        loading: 'A carregar pagamentos...',
        failed: 'Não foi possível carregar os pagamentos. Verifique a sessão e tente novamente.',
        noPayments: 'Ainda não existem pagamentos visíveis nesta conta.',
        totalConfirmed: 'Total confirmado',
        pending: 'Pendentes',
        records: 'Registos',
        readOnly: 'Modo de consulta',
        readOnlyText: 'A confirmação, rejeição e o estorno permanecem bloqueados até à aplicação e validação da protecção financeira na base de dados.',
        payment: 'Pagamento',
        company: 'Empresa',
        method: 'Método',
        reference: 'Referência',
        period: 'Período',
        date: 'Data',
        status: 'Estado',
        admin: 'Acesso administrativo',
        owner: 'Os dados apresentados respeitam as permissões da sua conta.',
      }
    : {
        title: 'Financial Management',
        subtitle: 'Secure view of payments registered on the platform.',
        signIn: 'Sign in to view your payments.',
        signInButton: 'Sign in',
        refresh: 'Refresh',
        loading: 'Loading payments...',
        failed: 'Could not load payments. Check your session and try again.',
        noPayments: 'There are no payments visible to this account yet.',
        totalConfirmed: 'Confirmed total',
        pending: 'Pending',
        records: 'Records',
        readOnly: 'Read-only mode',
        readOnlyText: 'Confirmation, rejection and refunds remain disabled until the financial database protections are applied and validated.',
        payment: 'Payment',
        company: 'Business',
        method: 'Method',
        reference: 'Reference',
        period: 'Period',
        date: 'Date',
        status: 'Status',
        admin: 'Administrative access',
        owner: 'Displayed records respect your account permissions.',
      };

  const money = useMemo(() => new Intl.NumberFormat(lang === 'pt' ? 'pt-AO' : 'en-AO', {
    style: 'currency',
    currency: 'AOA',
    maximumFractionDigits: 0,
  }), [lang]);

  const loadPayments = useCallback(async () => {
    if (!user?.id) {
      setPayments([]);
      setIsAdmin(false);
      setLoaded(true);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      setIsAdmin(profile?.role === 'admin');

      // RLS on public.payments limits this query to the business owner or platform admin.
      // Never request proof_path or provider secrets in this read-only portal.
      const { data, error: queryError } = await supabase
        .from('payments')
        .select('id,business_id,amount_aoa,method,reference,status,period_start,period_end,confirmed_at,created_at,businesses(name)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (queryError) throw queryError;
      setPayments((data || []) as unknown as PaymentRow[]);
      setLoaded(true);
    } catch {
      setError(copy.failed);
    } finally {
      setLoading(false);
    }
  }, [user?.id, copy.failed]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const confirmedTotal = payments
    .filter((payment) => payment.status === 'confirmed')
    .reduce((sum, payment) => sum + Number(payment.amount_aoa || 0), 0);
  const pendingCount = payments.filter((payment) => payment.status === 'pending').length;

  const formatDate = (value: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(lang === 'pt' ? 'pt-AO' : 'en-AO');
  };

  const statusClass = (status: PaymentRow['status']) => {
    if (status === 'confirmed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'rejected') return 'bg-red-50 text-red-700 border-red-200';
    if (status === 'refunded') return 'bg-slate-100 text-slate-700 border-slate-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  };

  return (
    <section className="py-12 sm:py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="bg-[#0A192F] text-white rounded-3xl p-6 sm:p-10 shadow-2xl border border-[#D4AF37]/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 text-[#D4AF37] text-xs font-bold uppercase tracking-widest">
              <CreditCard className="w-4 h-4" />
              {copy.title}
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold mt-2">{copy.title}</h1>
            <p className="text-sm text-slate-300 mt-2">{copy.subtitle}</p>
          </div>
          {user ? (
            <button
              type="button"
              onClick={() => void loadPayments()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#D4AF37] text-[#0A192F] px-4 py-2.5 text-sm font-bold disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {copy.refresh}
            </button>
          ) : null}
        </div>

        {!user ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <LockIcon />
            <p className="text-slate-200 mt-3">{copy.signIn}</p>
            <button onClick={onOpenAuth} className="mt-5 rounded-xl bg-[#D4AF37] text-[#0A192F] px-5 py-2.5 text-sm font-bold">
              {copy.signInButton}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <SummaryCard icon={<CheckCircle2 className="w-5 h-5 text-emerald-300" />} label={copy.totalConfirmed} value={money.format(confirmedTotal)} />
              <SummaryCard icon={<Clock3 className="w-5 h-5 text-amber-300" />} label={copy.pending} value={String(pendingCount)} />
              <SummaryCard icon={<CreditCard className="w-5 h-5 text-[#D4AF37]" />} label={copy.records} value={String(payments.length)} />
            </div>

            <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 mb-6">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-[#D4AF37] shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm text-white">{copy.readOnly}</p>
                  <p className="text-xs text-slate-200 mt-1 leading-relaxed">{copy.readOnlyText}</p>
                </div>
              </div>
            </div>

            {isAdmin && (
              <p className="text-[11px] text-[#D4AF37] uppercase tracking-wider font-bold mb-3">{copy.admin}</p>
            )}
            {!isAdmin && <p className="text-xs text-slate-400 mb-3">{copy.owner}</p>}

            {error && (
              <div role="alert" className="rounded-xl border border-red-300/30 bg-red-500/10 p-4 text-sm text-red-100 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            {loading ? (
              <div className="py-12 text-center text-slate-300 text-sm">{copy.loading}</div>
            ) : loaded && payments.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-300 text-sm">{copy.noPayments}</div>
            ) : (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <article key={payment.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-sm font-bold text-white">{payment.businesses?.name || copy.company}</span>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(payment.status)}`}>
                            {STATUS_LABELS[lang][payment.status] || payment.status}
                          </span>
                        </div>
                        <p className="text-xl font-bold text-[#D4AF37]">{money.format(Number(payment.amount_aoa || 0))}</p>
                        <p className="text-[11px] text-slate-400 mt-1">{copy.payment} #{payment.id.slice(0, 8)}</p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3 text-xs">
                        <Info label={copy.method} value={METHOD_LABELS[payment.method] || payment.method} />
                        <Info label={copy.reference} value={payment.reference || '—'} />
                        <Info label={copy.period} value={payment.period_start || payment.period_end ? `${formatDate(payment.period_start)} – ${formatDate(payment.period_end)}` : '—'} />
                        <Info label={copy.date} value={formatDate(payment.created_at)} />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

const SummaryCard: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
    <div className="flex items-center gap-2 text-xs text-slate-300">{icon}{label}</div>
    <p className="text-2xl font-bold text-white mt-3 tabular-nums">{value}</p>
  </div>
);

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0">
    <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
    <p className="text-xs text-slate-100 mt-1 break-words">{value}</p>
  </div>
);

const LockIcon: React.FC = () => (
  <div className="mx-auto w-11 h-11 rounded-full bg-white/10 flex items-center justify-center">
    <XCircle className="w-5 h-5 text-[#D4AF37]" />
  </div>
);
