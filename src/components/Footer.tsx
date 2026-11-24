import React from 'react';
import { Handshake, TrendingUp, Globe2, Diamond, Shield, Mail, Phone, MapPin } from 'lucide-react';

interface FooterProps {
  lang: 'pt' | 'en';
}

export const Footer: React.FC<FooterProps> = ({ lang }) => {
  const pillars = [
    { icon: Handshake, title: lang === 'pt' ? 'Parcerias' : 'Partnerships', desc: lang === 'pt' ? 'Alianças comerciais estratégicas' : 'Strategic commercial alliances' },
    { icon: TrendingUp, title: lang === 'pt' ? 'Negócios' : 'Business', desc: lang === 'pt' ? 'Oportunidades de investimento real' : 'Real investment opportunities' },
    { icon: Globe2, title: lang === 'pt' ? 'África Conectada' : 'Connected Africa', desc: lang === 'pt' ? 'Rede transfronteiriça unificada' : 'Unified cross-border network' },
    { icon: Diamond, title: lang === 'pt' ? 'Crescimento' : 'Growth', desc: lang === 'pt' ? 'Diversificação económica sustentável' : 'Sustainable economic diversification' },
  ];

  return (
    <footer className="bg-[#0A192F] text-white border-t border-[#D4AF37]/30 pt-16 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Brand Pillars Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pb-12 border-b border-gray-800">
          {pillars.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <div key={idx} className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:border-[#D4AF37]/50 transition-all">
                <div className="p-3 rounded-lg bg-[#D4AF37]/10 text-[#D4AF37]">
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-white">{pillar.title}</h4>
                  <p className="text-xs text-gray-400 mt-1">{pillar.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Main Footer Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 py-12 border-b border-gray-800">
          
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-auto bg-white/10 p-1 rounded-lg border border-[#D4AF37]/40 flex items-center justify-center overflow-hidden">
                <img src="/logo.png" alt="Angola Connect Logo" className="h-8 w-auto object-contain" />
              </div>
              <span className="text-lg font-bold font-serif">ANGOLA <span className="text-[#D4AF37]">CONNECT</span></span>
            </div>
            <p className="text-sm text-gray-300 italic mb-4">
              "Conectando Mercados. Criando Oportunidades."
            </p>
            <p className="text-xs text-gray-400 leading-relaxed">
              {lang === 'pt'
                ? 'Plataforma empresarial de referência para o desenvolvimento económico transfronteiriço, ligando Angola ao continente africano.'
                : 'Premier business platform for cross-border economic development, connecting Angola to the African continent.'}
            </p>
          </div>

          <div>
            <h5 className="text-sm font-semibold uppercase tracking-wider text-[#D4AF37] mb-4">
              {lang === 'pt' ? 'Links Institucionais' : 'Institutional Links'}
            </h5>
            <ul className="space-y-2 text-sm text-gray-300">
              <li><a href="#directory" className="hover:text-[#D4AF37] transition-colors">{lang === 'pt' ? 'Directório Verificado' : 'Verified Directory'}</a></li>
              <li><a href="#opportunities" className="hover:text-[#D4AF37] transition-colors">{lang === 'pt' ? 'Oportunidades de Negócio' : 'Business Opportunities'}</a></li>
              <li><a href="#investors" className="hover:text-[#D4AF37] transition-colors">{lang === 'pt' ? 'Rede de Investidores' : 'Investor Network'}</a></li>
              <li><a href="#delegations" className="hover:text-[#D4AF37] transition-colors">{lang === 'pt' ? 'Delegações e Roteiros' : 'Delegations & Itineraries'}</a></li>
            </ul>
          </div>

          <div>
            <h5 className="text-sm font-semibold uppercase tracking-wider text-[#D4AF37] mb-4">
              {lang === 'pt' ? 'Contacto & Sede' : 'Contact & Headquarters'}
            </h5>
            <ul className="space-y-3 text-sm text-gray-300">
              <li className="flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-[#D4AF37]" />
                <span>Luanda, Angola (Mercado Âncora)</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#D4AF37]" />
                <span>contacto@angolaconnect.africa</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-[#D4AF37]" />
                <span>+244 920 000 000</span>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom Copyright */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Angola Connect Africa Business. All rights reserved.</p>
          <div className="flex items-center gap-6 mt-4 sm:mt-0">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Shield className="w-3.5 h-3.5" /> Supabase RLS Secured
            </span>
            <span>Português (AO) / English</span>
          </div>
        </div>

      </div>
    </footer>
  );
};
