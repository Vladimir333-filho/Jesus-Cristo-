import React from 'react';
import { ArrowRight, ShieldCheck, Globe, Building2, TrendingUp, Sparkles } from 'lucide-react';

interface HeroCinematicProps {
  onExplore: () => void;
  onRegister?: () => void;
  lang: 'pt' | 'en';
}

export const HeroCinematic: React.FC<HeroCinematicProps> = ({ onExplore, onRegister, lang }) => {
  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-[#0A192F] via-[#0F2C59] to-[#0A192F] text-white py-20 lg:py-32">
      {/* Decorative background grid and glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(212,175,55,0.15),rgba(255,255,255,0))]"></div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column Text */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] text-xs font-semibold tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              {lang === 'pt' ? 'Rede Empresarial e Inteligência Africana' : 'African Business Network & Intelligence'}
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-bold tracking-tight leading-tight">
              {lang === 'pt' ? 'Conectando Mercados.' : 'Connecting Markets.'} <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D4AF37] via-amber-200 to-yellow-500">
                {lang === 'pt' ? 'Criando Oportunidades.' : 'Creating Opportunities.'}
              </span>
            </h1>

            <p className="text-base sm:text-lg text-gray-300 max-w-2xl mx-auto lg:mx-0 leading-relaxed font-light">
              {lang === 'pt'
                ? 'A plataforma oficial que une empresas verificadas, empreendedores, investidores e compradores em Angola e em todo o continente africano.'
                : 'The official platform uniting verified businesses, entrepreneurs, investors, and buyers across Angola and the African continent.'}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
              <button
                onClick={onExplore}
                className="w-full sm:w-auto flex items-center justify-center gap-3 bg-gradient-to-r from-[#D4AF37] to-amber-600 text-[#0A192F] px-7 py-4 rounded-xl font-bold text-sm sm:text-base shadow-xl hover:brightness-110 transition-all transform hover:-translate-y-0.5 whitespace-nowrap shrink-0"
              >
                {lang === 'pt' ? 'Explorar Directório Verificado' : 'Explore Verified Directory'}
                <ArrowRight className="w-5 h-5" />
              </button>

              {onRegister && (
                <button
                  onClick={onRegister}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 border border-white/25 text-white px-6 py-4 rounded-xl font-semibold text-sm transition-all whitespace-nowrap shrink-0"
                >
                  <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
                  {lang === 'pt' ? 'Registar & Verificar Empresa' : 'Register & Verify Business'}
                </button>
              )}
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-4 pt-8 border-t border-white/10 max-w-lg mx-auto lg:mx-0">
              <div>
                <p className="text-2xl font-bold text-[#D4AF37]">43</p>
                <p className="text-xs text-gray-400 mt-0.5">{lang === 'pt' ? 'Tabelas RLS Supabase' : 'Supabase RLS Tables'}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[#D4AF37]">AO</p>
                <p className="text-xs text-gray-400 mt-0.5">{lang === 'pt' ? 'Mercado Âncora' : 'Anchor Market'}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[#D4AF37]">100%</p>
                <p className="text-xs text-gray-400 mt-0.5">{lang === 'pt' ? 'Verificação Oficial' : 'Official Verification'}</p>
              </div>
            </div>

          </div>

          {/* Right Column Brand Emblem & Showcase */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-md bg-gradient-to-br from-white/10 to-white/5 p-8 rounded-3xl border border-[#D4AF37]/30 shadow-2xl backdrop-blur-xl text-center">
              
              <div className="absolute -top-4 -right-4 bg-[#D4AF37] text-[#0A192F] text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                OFFICIAL ECOSYSTEM
              </div>

              <div className="mb-6 flex justify-center">
                <div className="w-32 h-32 rounded-2xl bg-[#0A192F] border-2 border-[#D4AF37] flex items-center justify-center p-3 shadow-inner overflow-hidden">
                  <img src="/logo.png" alt="Brand Logo" className="w-full h-full object-contain" />
                </div>
              </div>

              <h3 className="text-xl font-bold font-serif text-white mb-2">Angola Connect Africa Business</h3>
              <p className="text-xs text-gray-300 leading-relaxed mb-6">
                {lang === 'pt'
                  ? 'Ecossistema unificado para comércio transfronteiriço, investimentos estruturados e parcerias estratégicas.'
                  : 'Unified ecosystem for cross-border trade, structured investments, and strategic partnerships.'}
              </p>

              <div className="space-y-3 text-left">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                  <Globe className="w-5 h-5 text-[#D4AF37] shrink-0" />
                  <div className="text-xs">
                    <p className="font-semibold text-white">Corredores Comerciais</p>
                    <p className="text-gray-400">Integração regional africana ativa</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                  <Building2 className="w-5 h-5 text-[#D4AF37] shrink-0" />
                  <div className="text-xs">
                    <p className="font-semibold text-white">Directório de Empresas</p>
                    <p className="text-gray-400">Alvarás e NIFs validados com segurança</p>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
