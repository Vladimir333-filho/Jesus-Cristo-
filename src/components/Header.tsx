import React, { useState } from 'react';
import { Globe, Menu, X, Building2, Briefcase, TrendingUp, Calendar, ShieldCheck, LogIn, FileCheck2, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface HeaderProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  lang: 'pt' | 'en';
  setLang: (lang: 'pt' | 'en') => void;
  user: any;
  onOpenAuth: () => void;
  unreadNotificationsCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  lang,
  setLang,
  user,
  onOpenAuth,
  unreadNotificationsCount = 0,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'home', labelPt: 'Início', labelEn: 'Home', icon: Globe },
    { id: 'directory', labelPt: 'Directório', labelEn: 'Directory', icon: Building2 },
    { id: 'registration', labelPt: 'Registo & Verificação', labelEn: 'Registration', icon: FileCheck2 },
    { id: 'payments', labelPt: 'Financeiro', labelEn: 'Finance', icon: CreditCard },
    { id: 'opportunities', labelPt: 'Oportunidades', labelEn: 'Opportunities', icon: Briefcase },
    { id: 'investors', labelPt: 'Investidores', labelEn: 'Investors', icon: TrendingUp },
    { id: 'events', labelPt: 'Eventos', labelEn: 'Events', icon: Calendar },
    { id: 'dashboard', labelPt: 'Painel', labelEn: 'Dashboard', icon: ShieldCheck },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#0A192F]/95 backdrop-blur-md border-b border-[#D4AF37]/30 text-white shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Logo Brand */}
          <div className="flex items-center gap-3 cursor-pointer shrink-0" onClick={() => setCurrentTab('home')}>
            <div className="h-12 w-auto bg-white/10 p-1 rounded-lg border border-[#D4AF37]/40 flex items-center justify-center overflow-hidden">
              <img 
                src="/logo.png" 
                alt="Angola Connect Africa Business" 
                className="h-10 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="hidden xl:block whitespace-nowrap">
              <span className="text-lg font-bold tracking-wide font-serif text-white">ANGOLA <span className="text-[#D4AF37]">CONNECT</span></span>
              <p className="text-[10px] text-gray-300 tracking-widest uppercase">Africa Business Network</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-[#D4AF37] text-[#0A192F] shadow-md font-semibold'
                      : 'text-gray-200 hover:bg-white/10 hover:text-[#D4AF37]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{lang === 'pt' ? item.labelPt : item.labelEn}</span>
                  {item.id === 'registration' && unreadNotificationsCount > 0 && (
                    <span className="font-mono tabular-nums text-[10px] font-bold px-1 rounded bg-[#0F4C5C] text-white">
                      {unreadNotificationsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Actions & Language & User */}
          <div className="hidden sm:flex items-center gap-4">
            <button
              onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-600 bg-white/5 text-xs font-semibold text-gray-300 hover:border-[#D4AF37] hover:text-[#D4AF37] transition-colors"
              title="Mudar Idioma / Change Language"
            >
              <Globe className="w-3.5 h-3.5 text-[#D4AF37]" />
              {lang.toUpperCase()}
            </button>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full border border-[#D4AF37]/30">
                  <div className="w-7 h-7 rounded-full bg-[#D4AF37] text-[#0A192F] font-bold flex items-center justify-center text-xs">
                    {user.email?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <span className="text-xs font-medium text-gray-200 max-w-[120px] truncate">
                    {user.email}
                  </span>
                </div>
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="text-xs font-semibold text-gray-300 hover:text-red-400 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-gray-700 transition-colors"
                  title="Terminar Sessão"
                >
                  Sair
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-2 bg-gradient-to-r from-[#D4AF37] to-amber-600 text-[#0A192F] px-4 py-2 rounded-lg text-sm font-bold shadow-lg hover:brightness-110 transition-all"
              >
                <LogIn className="w-4 h-4" />
                {lang === 'pt' ? 'Entrar / Registar' : 'Sign In'}
              </button>
            )}
          </div>

          {/* Mobile & Tablet menu button */}
          <div className="flex items-center lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md text-gray-300 hover:text-white hover:bg-white/10 focus:outline-none"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile & Tablet Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#0A192F] border-b border-gray-800 px-4 pt-2 pb-6 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-lg text-base font-medium ${
                  isActive ? 'bg-[#D4AF37] text-[#0A192F]' : 'text-gray-200 hover:bg-white/10'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-5 h-5" />
                  {lang === 'pt' ? item.labelPt : item.labelEn}
                </span>
                {item.id === 'registration' && unreadNotificationsCount > 0 && (
                  <span className="font-mono tabular-nums text-xs font-bold px-2 py-0.5 rounded bg-[#0F4C5C] text-white">
                    {unreadNotificationsCount}
                  </span>
                )}
              </button>
            );
          })}
          
          <div className="pt-4 border-t border-gray-800 flex items-center justify-between">
            <button
              onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}
              className="flex items-center gap-2 px-3 py-2 rounded border border-gray-700 text-sm text-gray-300"
            >
              <Globe className="w-4 h-4 text-[#D4AF37]" />
              Idioma: {lang.toUpperCase()}
            </button>

            {user ? (
              <button
                onClick={() => {
                  supabase.auth.signOut();
                  setMobileMenuOpen(false);
                }}
                className="text-xs font-semibold text-red-300 border border-red-500/40 px-4 py-2 rounded"
              >
                Sair
              </button>
            ) : (
              <button
                onClick={() => {
                  onOpenAuth();
                  setMobileMenuOpen(false);
                }}
                className="bg-[#D4AF37] text-[#0A192F] px-4 py-2 rounded text-sm font-bold"
              >
                Entrar
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
