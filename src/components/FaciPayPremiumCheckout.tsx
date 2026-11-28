import React, { useEffect, useRef, useState } from 'react';
import { CreditCard, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

type FaciPayActions = {
  onPopupWindowClosed: (callback: () => void) => void;
};

type FaciPayButton = {
  render: (container: HTMLElement | string) => void;
  destroy?: () => void;
};

type FaciPayInstance = {
  generateButton: (params: {
    createOrder: () => Promise<string>;
    onApprove: (data: unknown, actions: FaciPayActions) => void | Promise<void>;
    onPending: (data: unknown, actions: FaciPayActions) => void | Promise<void>;
    onCancel: () => void | Promise<void>;
    onError: (error: unknown) => void | Promise<void>;
    options: {
      style: { width: string; shape: 'pill' };
      config: { lang: 'pt' | 'en'; showAmount: boolean };
      paymentConfig: {
        theme: 'light';
        allowedPaymentMethods: string[];
        showUIOfProcessingInfo: boolean;
        referencePaymentLifeSpan: number;
      };
    };
  }) => FaciPayButton;
};

declare global {
  interface Window {
    FaciPay?: (publishableKey: string) => FaciPayInstance;
  }
}

let faciPaySdkPromise: Promise<void> | null = null;

function loadFaciPaySdk(): Promise<void> {
  if (typeof window !== 'undefined' && window.FaciPay) return Promise.resolve();
  if (faciPaySdkPromise) return faciPaySdkPromise;

  faciPaySdkPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.faciconnect.com/sdks/v1/facipay.min.js';
    script.async = true;
    script.dataset.facipaySdk = 'true';
    script.onload = () => (window.FaciPay ? resolve() : reject(new Error('SDK indisponível')));
    script.onerror = () => reject(new Error('Não foi possível carregar a SDK FaciPay'));
    document.head.appendChild(script);
  }).catch((error) => {
    faciPaySdkPromise = null;
    throw error;
  });

  return faciPaySdkPromise;
}

interface FaciPayPremiumCheckoutProps {
  businessId: string;
  businessName: string;
  isRenewal: boolean;
  lang: 'pt' | 'en';
}

export const FaciPayPremiumCheckout: React.FC<FaciPayPremiumCheckoutProps> = ({
  businessId,
  businessName,
  isRenewal,
  lang,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const publishableKey = import.meta.env?.VITE_FACIPAY_PUBLISHABLE_KEY || '';

  const copy = lang === 'pt'
    ? {
        title: isRenewal ? 'Renovar Plano Premium' : 'Activar Plano Premium',
        price: isRenewal ? '3.000 Kz / trimestre' : '10.000 Kz / adesão inicial',
        pending: 'O checkout foi iniciado. A activação só acontece depois da confirmação do webhook FaciPay.',
        cancelled: 'O checkout foi fechado. O estado do pagamento será confirmado pelo servidor.',
        failed: 'Não foi possível iniciar o pagamento. Verifique a ligação e tente novamente.',
        unavailable: 'A integração FaciPay está em preparação. O checkout ficará disponível depois de configurar as credenciais de Sandbox.',
        secure: 'Pagamento protegido. Não introduza dados bancários nesta página.',
      }
    : {
        title: isRenewal ? 'Renew Premium Plan' : 'Activate Premium Plan',
        price: isRenewal ? '3,000 AOA / quarter' : '10,000 AOA / initial activation',
        pending: 'Checkout started. The plan is activated only after the FaciPay webhook confirms payment.',
        cancelled: 'Checkout was closed. The payment state will be confirmed by the server.',
        failed: 'Payment could not be started. Check your connection and try again.',
        unavailable: 'FaciPay integration is being prepared. Checkout will be available after Sandbox credentials are configured.',
        secure: 'Protected payment. Do not enter banking details on this page.',
      };

  useEffect(() => {
    let active = true;
    let button: FaciPayButton | undefined;

    if (!publishableKey || !containerRef.current) {
      setLoading(false);
      return;
    }

    setLoading(true);
    void loadFaciPaySdk()
      .then(() => {
        if (!active || !containerRef.current || !window.FaciPay) return;

        const faciPay = window.FaciPay(publishableKey);
        button = faciPay.generateButton({
          async createOrder() {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;
            if (sessionError || !accessToken) {
              throw new Error('A sessão expirou. Inicie sessão novamente.');
            }

            const response = await fetch('/api/facipay/create-order', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ businessId }),
              cache: 'no-store',
            });

            const result = await response.json().catch(() => ({}));
            if (!response.ok || typeof result.referenceNumber !== 'string' || !result.referenceNumber.trim()) {
              throw new Error(typeof result.error === 'string' ? result.error : copy.failed);
            }
            return result.referenceNumber;
          },
          async onApprove(_data, actions) {
            actions.onPopupWindowClosed(() => {
              if (active) setStatus(copy.pending);
            });
          },
          async onPending(_data, actions) {
            actions.onPopupWindowClosed(() => {
              if (active) setStatus(copy.pending);
            });
          },
          async onCancel() {
            if (active) setStatus(copy.cancelled);
          },
          async onError() {
            if (active) setStatus(copy.failed);
          },
          options: {
            style: { width: '100%', shape: 'pill' },
            config: { lang, showAmount: true },
            paymentConfig: {
              theme: 'light',
              allowedPaymentMethods: ['FPMCXEXPRSS', 'FPSOLPGEXT', 'FPSOLPG'],
              showUIOfProcessingInfo: true,
              referencePaymentLifeSpan: 1440,
            },
          },
        });

        button.render(containerRef.current);
        if (active) setLoading(false);
      })
      .catch(() => {
        if (active) {
          setStatus(copy.failed);
          setLoading(false);
        }
      });

    return () => {
      active = false;
      button?.destroy?.();
    };
  }, [businessId, copy.cancelled, copy.failed, copy.pending, lang, publishableKey]);

  return (
    <div className="rounded-2xl border border-[#D4AF37]/40 bg-[#0A192F] p-5 sm:p-6 text-white space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-widest font-bold text-[#D4AF37]">Angola Connect · Premium</p>
          <h4 className="text-lg font-serif font-bold mt-1">{copy.title}</h4>
          <p className="text-sm font-semibold text-white mt-1">{copy.price}</p>
          <p className="text-[11px] text-slate-300 mt-1">{businessName}</p>
        </div>
        <CreditCard className="w-6 h-6 text-[#D4AF37] shrink-0" />
      </div>

      {!publishableKey ? (
        <p className="text-xs text-slate-300 leading-relaxed">{copy.unavailable}</p>
      ) : (
        <>
          <div ref={containerRef} className="min-h-10" aria-label={copy.title} />
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              {lang === 'pt' ? 'A carregar o checkout seguro...' : 'Loading secure checkout...'}
            </div>
          )}
          {status && <p role="status" className="text-xs text-slate-200 leading-relaxed">{status}</p>}
        </>
      )}

      <div className="flex items-start gap-2 border-t border-white/10 pt-3">
        <ShieldCheck className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-300 leading-relaxed">{copy.secure}</p>
      </div>
    </div>
  );
};
