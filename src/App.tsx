/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { HeroCinematic } from './components/HeroCinematic';
import { BusinessRegistrationPortal } from './components/BusinessRegistrationPortal';
import { supabase, supabaseConfigStatus } from './lib/supabase';
import { fetchActiveCountries, syncOwnProfileAfterSignup } from './services/businessRegistration';
import { Building2, Briefcase, TrendingUp, Calendar, ShieldCheck, Search, CheckCircle, ExternalLink, ArrowRight, Lock, User, Mail, Phone, Globe, Award, Inbox, MapPin, X, AlertTriangle } from 'lucide-react';
import { Business, Country } from './types';

const SIGNUP_COUNTRY_OPTIONS_FALLBACK: Array<{ code: string; name_pt: string; name_en: string }> = [
  { code: 'AO', name_pt: 'Angola', name_en: 'Angola' },
  { code: 'ZA', name_pt: 'África do Sul', name_en: 'South Africa' },
  { code: 'MZ', name_pt: 'Moçambique', name_en: 'Mozambique' },
  { code: 'CV', name_pt: 'Cabo Verde', name_en: 'Cape Verde' },
  { code: 'NA', name_pt: 'Namíbia', name_en: 'Namibia' },
  { code: 'CD', name_pt: 'República Democrática do Congo', name_en: 'DR Congo' },
  { code: 'ZM', name_pt: 'Zâmbia', name_en: 'Zambia' },
  { code: 'NG', name_pt: 'Nigéria', name_en: 'Nigeria' },
  { code: 'KE', name_pt: 'Quénia', name_en: 'Kenya' },
  { code: 'PT', name_pt: 'Portugal', name_en: 'Portugal' },
  { code: 'BR', name_pt: 'Brasil', name_en: 'Brazil' },
];

export default function App() {
  const [currentTab, setCurrentTab] = useState('home');
  const [lang, setLang] = useState<'pt' | 'en'>('pt');
  const [user, setUser] = useState<any>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [fullNameInput, setFullNameInput] = useState('');
  const [signupCountryCode, setSignupCountryCode] = useState('AO');
  const [phoneInput, setPhoneInput] = useState('');
  const [activeCountries, setActiveCountries] = useState<Country[]>([]);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'recovery'>('signin');
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [authMessage, setAuthMessage] = useState('');

  // Real data state from Supabase (strict allowlist of public fields)
  const [verifiedBusinesses, setVerifiedBusinesses] = useState<Business[]>([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL');
  const [selectedProvince, setSelectedProvince] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  // Derived filter options
  const availableCountries = Array.from(new Set(verifiedBusinesses.map(b => b.country_code))).filter(Boolean);
  const availableProvinces = Array.from(new Set(verifiedBusinesses.map(b => b.province))).filter(Boolean);
  const availableCategories = Array.from(new Set(verifiedBusinesses.map(b => b.category))).filter(Boolean);

  const filteredBusinesses = verifiedBusinesses.filter(b => {
    const matchesSearch = searchQuery === '' || 
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.description && b.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (b.services && b.services.some(s => s.toLowerCase().includes(searchQuery.toLowerCase())));
    
    const matchesCountry = selectedCountry === 'ALL' || b.country_code === selectedCountry;
    const matchesProvince = selectedProvince === 'ALL' || b.province === selectedProvince;
    const matchesCategory = selectedCategory === 'ALL' || b.category === selectedCategory;

    return matchesSearch && matchesCountry && matchesProvince && matchesCategory;
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('recovery');
        setIsPasswordRecovery(true);
        setAuthMessage('');
        setAuthModalOpen(true);
      }
    });

    fetchVerifiedBusinesses();
    fetchActiveCountries().then(setActiveCountries).catch(() => setActiveCountries([]));

    return () => subscription.unsubscribe();
  }, []);

  const fetchVerifiedBusinesses = async () => {
    setLoadingBusinesses(true);
    try {
      // SECURITY: Query strictly public allowlist of fields. Never select('*') for public tables.
      // Explicitly excludes private columns like NIF, license numbers, or business_private table.
      const publicFields = 'id, name, slug, category, subcategory, description, province, municipality, address, whatsapp, phone, email, website, logo_url, cover_url, gallery_urls, services, languages, status, verification_status, plan, is_featured, approved_at, country_code';
      
      const { data, error } = await supabase
        .from('businesses')
        .select(publicFields)
        .eq('status', 'approved')
        .eq('verification_status', 'verified')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Supabase fetch notice:', error.message);
        setVerifiedBusinesses([]);
      } else {
        setVerifiedBusinesses((data as Business[]) || []);
      }
    } catch (err) {
      console.error('Error fetching businesses:', err);
      setVerifiedBusinesses([]);
    } finally {
      setLoadingBusinesses(false);
    }
  };

  const signupCountries = activeCountries.length > 0 ? activeCountries : SIGNUP_COUNTRY_OPTIONS_FALLBACK;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthMessage('');

    if (!supabaseConfigStatus.configured) {
      setAuthMessage(
        supabaseConfigStatus.reason ||
          (lang === 'pt'
            ? 'Configuração Supabase em falta. Configure VITE_SUPABASE_ANON_KEY.'
            : 'Supabase configuration missing. Configure VITE_SUPABASE_ANON_KEY.')
      );
      return;
    }

    try {
      if (authMode === 'recovery' && isPasswordRecovery) {
        if (passwordInput.length < 8) {
          setAuthMessage(lang === 'pt' ? 'A nova palavra-passe deve ter pelo menos 8 caracteres.' : 'The new password must contain at least 8 characters.');
          return;
        }
        const { error } = await supabase.auth.updateUser({ password: passwordInput });
        if (error) throw error;
        setPasswordInput('');
        await supabase.auth.signOut();
        setIsPasswordRecovery(false);
        setAuthMessage(lang === 'pt' ? 'Palavra-passe actualizada com sucesso. Já pode iniciar sessão.' : 'Password updated successfully. You can now sign in.');
        setAuthMode('signin');
        setAuthModalOpen(false);
      } else if (authMode === 'recovery') {
        const { error } = await supabase.auth.resetPasswordForEmail(emailInput.trim(), {
          redirectTo: `${window.location.origin}/`,
        });
        if (error) throw error;
        setAuthMessage(
          lang === 'pt'
            ? 'Se o endereço estiver registado, receberá um email com as instruções para redefinir a palavra-passe.'
            : 'If the address is registered, you will receive an email with instructions to reset your password.'
        );
      } else if (authMode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailInput.trim(),
          password: passwordInput,
        });
        if (error) throw error;
        setAuthMessage(lang === 'pt' ? 'Sessão iniciada com sucesso!' : 'Logged in successfully!');
        setAuthModalOpen(false);
      } else {
        const trimmedName = fullNameInput.trim();
        if (trimmedName.length < 2) {
          setAuthMessage(
            lang === 'pt'
              ? 'Indique o seu nome completo real para concluir o registo.'
              : 'Please enter your full name to complete registration.'
          );
          return;
        }

        const matchedCountry = signupCountries.find((c) => c.code === signupCountryCode);
        const countryName = matchedCountry?.name_pt || 'Angola';

        const { data, error } = await supabase.auth.signUp({
          email: emailInput.trim(),
          password: passwordInput,
          options: {
            data: {
              full_name: trimmedName,
              country: countryName,
              country_code: signupCountryCode,
              phone: phoneInput.trim() || undefined,
              account_type: 'business_owner',
            },
          },
        });
        if (error) throw error;

        if (data.session?.user) {
          await syncOwnProfileAfterSignup({
            userId: data.session.user.id,
            fullName: trimmedName,
            countryName,
            countryCode: signupCountryCode,
            phone: phoneInput.trim() || undefined,
          });
        }

        setAuthMessage(
          lang === 'pt'
            ? 'Registo efectuado com os seus dados reais! Verifique o seu email se aplicável.'
            : 'Registration complete! Please verify your email if required.'
        );
        setFullNameInput('');
        setPhoneInput('');
        setPasswordInput('');
        setAuthModalOpen(false);
      }
    } catch (err: any) {
      setAuthMessage(err.message || (lang === 'pt' ? 'Erro na autenticação' : 'Authentication error'));
    }
  };



  return (
    <div className="min-h-screen bg-[#FDFBF7] text-gray-900 flex flex-col font-sans">
      
      {/* Header */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        lang={lang}
        setLang={setLang}
        user={user}
        onOpenAuth={() => setAuthModalOpen(true)}
        unreadNotificationsCount={unreadNotificationsCount}
      />

      {/* Main Content Area */}
      <main className="flex-grow">
        {!supabaseConfigStatus.configured && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs">
            <div className="max-w-7xl mx-auto flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Configuração Supabase pendente:</strong> {supabaseConfigStatus.reason}
              </span>
            </div>
          </div>
        )}
        {currentTab === 'home' && (
          <div>
            <HeroCinematic
              onExplore={() => setCurrentTab('directory')}
              onRegister={() => setCurrentTab('registration')}
              lang={lang}
            />

            {/* Verified Directory Preview Section (Real Supabase Data Only) */}
            <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
                <div>
                  <span className="text-[#0F4C5C] text-xs font-bold tracking-widest uppercase bg-[#0F4C5C]/10 px-3 py-1 rounded-full">
                    {lang === 'pt' ? 'EXCELÊNCIA CORPORATIVA' : 'CORPORATE EXCELLENCE'}
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-serif font-bold text-[#0A192F] mt-3">
                    {lang === 'pt' ? 'Empresas Aprovadas & Verificadas' : 'Approved & Verified Businesses'}
                  </h2>
                  <p className="text-gray-600 text-sm mt-2 max-w-xl">
                    {lang === 'pt'
                      ? 'Dados reais obtidos em tempo real do directório oficial protegido por RLS (apenas campos públicos permitidos).'
                      : 'Real-time verified data retrieved directly from the official RLS-protected directory (public allowlist fields only).'}
                  </p>
                </div>
                <button
                  onClick={() => setCurrentTab('directory')}
                  className="mt-4 md:mt-0 inline-flex items-center gap-2 text-sm font-bold text-[#0F4C5C] hover:text-[#0A192F] transition-colors"
                >
                  {lang === 'pt' ? 'Ver Directório Completo' : 'View Full Directory'} <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {loadingBusinesses ? (
                <div className="text-center py-16 text-gray-400">
                  <div className="w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-sm">A carregar empresas verificadas...</p>
                </div>
              ) : filteredBusinesses.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
                  <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-base font-bold text-gray-800">
                    {lang === 'pt' ? 'Nenhuma empresa verificada encontrada' : 'No verified businesses found'}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                    {lang === 'pt'
                      ? 'De acordo com as políticas RLS, apenas empresas aprovadas e com verificação activa são exibidas no directório público.'
                      : 'Per RLS policies, only approved businesses with active verification are displayed in the public directory.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {filteredBusinesses.slice(0, 3).map((b) => (
                    <div key={b.id} className="bg-white rounded-2xl border border-gray-200/80 shadow-lg hover:shadow-xl transition-all p-6 flex flex-col justify-between group">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" /> Verified
                          </span>
                          <span className="text-xs font-bold text-[#D4AF37] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            {b.country_code} - {b.province}
                          </span>
                        </div>
                        <h3 className="text-xl font-bold font-serif text-[#0A192F] group-hover:text-[#0F4C5C] transition-colors">
                          {b.name}
                        </h3>
                        <p className="text-xs font-medium text-gray-500 mt-1">{b.category}</p>
                        <p className="text-sm text-gray-600 mt-3 line-clamp-3 leading-relaxed">
                          {b.description || 'Sem descrição detalhada fornecida.'}
                        </p>
                      </div>

                      <div className="pt-6 mt-6 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-400">ID: {b.id.slice(0, 8)}...</span>
                        <button
                          onClick={() => setCurrentTab('directory')}
                          className="text-xs font-bold text-[#0F4C5C] hover:underline flex items-center gap-1"
                        >
                          {lang === 'pt' ? 'Ver Perfil' : 'View Profile'} <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Brand Identity & Logo Showcase Banner */}
            <section className="bg-[#0A192F] text-white py-16 border-y border-[#D4AF37]/30">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                <div className="inline-block p-4 rounded-3xl bg-white/5 border border-[#D4AF37]/40 mb-6 shadow-2xl">
                  <img src="/logo.png" alt="Official Logo" className="h-20 w-auto mx-auto object-contain" />
                </div>
                <h3 className="text-2xl sm:text-3xl font-serif font-bold mb-3">Angola Connect Africa Business</h3>
                <p className="text-sm text-gray-300 italic max-w-xl mx-auto mb-6">
                  "Conectando Mercados. Criando Oportunidades."
                </p>
                <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-[#D4AF37] font-semibold uppercase tracking-wider">
                  <span>• Parcerias Estratégicas</span>
                  <span>• Negócios Transfronteiriços</span>
                  <span>• África Conectada</span>
                  <span>• Crescimento Sustentável</span>
                </div>
              </div>
            </section>
          </div>
        )}

        {currentTab === 'directory' && (
          <div className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <span className="text-[#0F4C5C] text-xs font-bold tracking-widest uppercase bg-[#0F4C5C]/10 px-3 py-1 rounded-full">
                {lang === 'pt' ? 'MÓDULO OFICIAL' : 'OFFICIAL MODULE'}
              </span>
              <h1 className="text-3xl sm:text-4xl font-serif font-bold text-[#0A192F] mt-3">
                {lang === 'pt' ? 'Directório de Empresas Verificadas' : 'Verified Business Directory'}
              </h1>
              <p className="text-gray-600 text-sm mt-3">
                {lang === 'pt'
                  ? 'Explore empresas aprovadas em Angola e nos corredores comerciais africanos com conformidade RLS e verificação rigorosa.'
                  : 'Explore approved businesses in Angola and African trade corridors with RLS compliance and rigorous verification.'}
              </p>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-200 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                {/* Search Text */}
                <div className="md:col-span-1 relative">
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    {lang === 'pt' ? 'Pesquisa Geral' : 'General Search'}
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={lang === 'pt' ? 'Nome, sector ou serviço...' : 'Name, sector or service...'}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
                    />
                  </div>
                </div>

                {/* Country Filter */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    {lang === 'pt' ? 'País' : 'Country'}
                  </label>
                  <select
                    value={selectedCountry}
                    onChange={(e) => setSelectedCountry(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C] bg-white"
                  >
                    <option value="ALL">{lang === 'pt' ? 'Todos os Países' : 'All Countries'}</option>
                    {availableCountries.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Province Filter */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    {lang === 'pt' ? 'Província / Região' : 'Province / Region'}
                  </label>
                  <select
                    value={selectedProvince}
                    onChange={(e) => setSelectedProvince(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C] bg-white"
                  >
                    <option value="ALL">{lang === 'pt' ? 'Todas as Províncias' : 'All Provinces'}</option>
                    {availableProvinces.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* Category Filter */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    {lang === 'pt' ? 'Sector de Actividade' : 'Activity Sector'}
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C] bg-white"
                  >
                    <option value="ALL">{lang === 'pt' ? 'Todos os Sectores' : 'All Sectors'}</option>
                    {availableCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 pt-4 border-t border-gray-100">
                <span>
                  {lang === 'pt' 
                    ? `A exibir ${filteredBusinesses.length} empresas verificadas (Directório RLS Seguro)`
                    : `Showing ${filteredBusinesses.length} verified businesses (Secure RLS Directory)`}
                </span>
                {(selectedCountry !== 'ALL' || selectedProvince !== 'ALL' || selectedCategory !== 'ALL' || searchQuery !== '') && (
                  <button
                    onClick={() => {
                      setSelectedCountry('ALL');
                      setSelectedProvince('ALL');
                      setSelectedCategory('ALL');
                      setSearchQuery('');
                    }}
                    className="text-[#0F4C5C] font-bold hover:underline"
                  >
                    {lang === 'pt' ? 'Limpar Filtros' : 'Clear Filters'}
                  </button>
                )}
              </div>
            </div>

            {/* Results Grid / List */}
            {loadingBusinesses ? (
              <div className="text-center py-16 text-gray-400">
                <div className="w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-xs">A consultar base de dados Supabase...</p>
              </div>
            ) : filteredBusinesses.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-xl p-16 text-center border border-gray-200">
                <Inbox className="w-16 h-16 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-gray-800">
                  {lang === 'pt' ? 'Nenhuma empresa verificada encontrada' : 'No verified businesses found'}
                </h3>
                <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                  {lang === 'pt'
                    ? 'Tente ajustar os filtros de pesquisa ou remover os critérios seleccionados. Apenas empresas com estatuto aprovado e verificação activa são apresentadas.'
                    : 'Try adjusting your search filters or clearing criteria. Only approved and active-verified businesses are displayed.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredBusinesses.map((b) => (
                  <div 
                    key={b.id} 
                    onClick={() => setSelectedBusiness(b)}
                    className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-xl transition-all p-6 flex flex-col justify-between cursor-pointer group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> Verified
                        </span>
                        <span className="text-xs font-bold text-[#D4AF37] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          {b.country_code} • {b.province}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-[#0F4C5C] text-lg shrink-0 overflow-hidden">
                          {b.logo_url ? (
                            <img src={b.logo_url} alt={b.name} className="w-full h-full object-cover" />
                          ) : (
                            b.name[0]
                          )}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold font-serif text-[#0A192F] group-hover:text-[#0F4C5C] transition-colors line-clamp-1">
                            {b.name}
                          </h3>
                          <p className="text-xs font-medium text-gray-500">{b.category}</p>
                        </div>
                      </div>

                      <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed mt-3">
                        {b.description || (lang === 'pt' ? 'Sem descrição institucional detalhada.' : 'No detailed institutional description.')}
                      </p>

                      {b.services && b.services.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-4">
                          {b.services.slice(0, 3).map((srv, idx) => (
                            <span key={idx} className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md font-medium">
                              {srv}
                            </span>
                          ))}
                          {b.services.length > 3 && (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md font-medium">
                              +{b.services.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="pt-5 mt-5 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-[11px] text-gray-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {b.municipality || b.province}
                      </span>
                      <span className="text-xs font-bold text-[#0F4C5C] group-hover:underline flex items-center gap-1">
                        {lang === 'pt' ? 'Ver Perfil Completo' : 'View Full Profile'} <ExternalLink className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {currentTab === 'registration' && (
          <BusinessRegistrationPortal
            user={user}
            lang={lang}
            onOpenAuth={() => setAuthModalOpen(true)}
            onDirectoryRefresh={fetchVerifiedBusinesses}
            onNavigateToDirectory={() => setCurrentTab('directory')}
            onUnreadCountChange={setUnreadNotificationsCount}
          />
        )}

        {currentTab === 'opportunities' && (
          <div className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-3xl font-serif font-bold text-[#0A192F] mb-4">Oportunidades Comerciais & Connect Africa</h1>
            <p className="text-gray-600 text-sm max-w-xl mx-auto mb-8">
              Módulo conectado às tabelas <code className="bg-gray-100 px-2 py-1 rounded text-xs text-[#0F4C5C]">business_opportunities</code> e <code className="bg-gray-100 px-2 py-1 rounded text-xs text-[#0F4C5C]">opportunity_participants</code>.
            </p>
            <div className="bg-white rounded-2xl shadow-xl p-12 border border-gray-200">
              <Inbox className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-800 mb-2">Sem oportunidades publicadas no momento</h3>
              <p className="text-sm text-gray-500">As oportunidades transfronteiriças aparecerão aqui quando forem criadas por empresas verificadas.</p>
            </div>
          </div>
        )}

        {currentTab === 'investors' && (
          <div className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-3xl font-serif font-bold text-[#0A192F] mb-4">Rede Privada de Investidores</h1>
            <p className="text-gray-600 text-sm max-w-xl mx-auto mb-8">
              Perfis de investidores privados por defeito, com verificação obrigatória administrada pela plataforma.
            </p>
            <div className="bg-white rounded-2xl shadow-xl p-12 border border-gray-200">
              <Lock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-800 mb-2">Perfis de Investidor Protegidos por RLS</h3>
              <p className="text-sm text-gray-500">Os perfis de investimento são privados por defeito e requerem autenticação e autorização.</p>
            </div>
          </div>
        )}

        {currentTab === 'events' && (
          <div className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-3xl font-serif font-bold text-[#0A192F] mb-4">Eventos, Talentos & Delegações Comerciais</h1>
            <p className="text-gray-600 text-sm max-w-xl mx-auto mb-8">
              Gestão de missões empresariais, agendas, delegações e perfis profissionais verificados.
            </p>
            <div className="bg-white rounded-2xl shadow-xl p-12 border border-gray-200">
              <Inbox className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-800 mb-2">Nenhum evento agendado</h3>
              <p className="text-sm text-gray-500">Consulte mais tarde para verificar os próximos roteiros de delegações comerciais.</p>
            </div>
          </div>
        )}

        {currentTab === 'dashboard' && (
          <div className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-[#0A192F] text-white rounded-3xl p-8 sm:p-12 shadow-2xl border border-[#D4AF37]/30">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-gray-800">
                <div>
                  <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider">Painel Executivo Empresarial</span>
                  <h2 className="text-2xl sm:text-3xl font-serif font-bold mt-1">Gestão de Negócio & CRM</h2>
                </div>
                {user ? (
                  <span className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
                    Sessão Activa: {user.email}
                  </span>
                ) : (
                  <button
                    onClick={() => setAuthModalOpen(true)}
                    className="bg-[#D4AF37] text-[#0A192F] px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg hover:brightness-110 transition-all"
                  >
                    Iniciar Sessão no Painel
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <p className="text-xs text-gray-400 uppercase">Leads Comerciais</p>
                  <p className="text-3xl font-bold text-[#D4AF37] mt-2">0</p>
                  <p className="text-xs text-gray-400 mt-1">A aguardar dados reais</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <p className="text-xs text-gray-400 uppercase">Clientes Activos</p>
                  <p className="text-3xl font-bold text-[#D4AF37] mt-2">0</p>
                  <p className="text-xs text-gray-400 mt-1">A aguardar dados reais</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <p className="text-xs text-gray-400 uppercase">Encomendas / Pedidos</p>
                  <p className="text-3xl font-bold text-[#D4AF37] mt-2">0</p>
                  <p className="text-xs text-gray-400 mt-1">A aguardar dados reais</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <p className="text-xs text-gray-400 uppercase">Documentos Legais</p>
                  <p className="text-3xl font-bold text-emerald-400 mt-2">Seguro</p>
                  <p className="text-xs text-gray-400 mt-1">Bucket privado RLS</p>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-xs text-gray-300">
                  {lang === 'pt'
                    ? 'Aceda ao módulo de Registo & Verificação para submeter empresas, NIF/Alvará e documentos no cofre privado.'
                    : 'Open the Registration & Verification module to submit businesses, Tax IDs, and private verification documents.'}
                </p>
                <button
                  onClick={() => setCurrentTab('registration')}
                  className="bg-[#D4AF37] text-[#0A192F] px-5 py-2.5 rounded-xl font-bold text-xs hover:brightness-110 transition-all whitespace-nowrap shrink-0"
                >
                  {lang === 'pt' ? 'Gerir Registo & Verificação' : 'Manage Registration & Verification'}
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Auth Modal */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative border border-gray-100 my-8">
            <button
              onClick={() => {
                setAuthModalOpen(false);
                setAuthMode('signin');
                setIsPasswordRecovery(false);
                setPasswordInput('');
                setAuthMessage('');
              }}
              className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 font-bold text-lg"
            >
              ✕
            </button>

            <div className="text-center mb-6">
              <img src="/logo.png" alt="Logo" className="h-12 w-auto mx-auto mb-3 object-contain" />
              <h3 className="text-2xl font-serif font-bold text-[#0A192F]">
                {authMode === 'signin'
                  ? lang === 'pt' ? 'Iniciar Sessão' : 'Sign In'
                  : authMode === 'recovery'
                    ? lang === 'pt' ? 'Recuperar Palavra-passe' : 'Reset Password'
                    : lang === 'pt' ? 'Registar Nova Conta' : 'Create Account'}
              </h3>
              <p className="text-xs text-gray-500 mt-1">Angola Connect Africa Business Portal</p>
            </div>

            {!supabaseConfigStatus.configured && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <span>{supabaseConfigStatus.reason}</span>
              </div>
            )}

            {authMessage && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 text-center font-medium">
                {authMessage}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                      {lang === 'pt' ? 'Nome Completo *' : 'Full Name *'}
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={fullNameInput}
                        onChange={(e) => setFullNameInput(e.target.value)}
                        placeholder={lang === 'pt' ? 'Nome completo do responsável' : 'Full name'}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                        {lang === 'pt' ? 'País *' : 'Country *'}
                      </label>
                      <select
                        required
                        value={signupCountryCode}
                        onChange={(e) => setSignupCountryCode(e.target.value)}
                        className="w-full px-3 py-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C] bg-white"
                      >
                        {signupCountries.map((c) => (
                          <option key={c.code} value={c.code}>
                            {lang === 'pt' ? c.name_pt : c.name_en} ({c.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                        {lang === 'pt' ? 'Telefone (Opcional)' : 'Phone (Optional)'}
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
                        <input
                          type="tel"
                          value={phoneInput}
                          onChange={(e) => setPhoneInput(e.target.value)}
                          placeholder="+244 ..."
                          className="w-full pl-9 pr-3 py-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {!isPasswordRecovery && (
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Email Corporativo</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="ex: empresa@angolaconnect.africa"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
                  />
                </div>
              </div>
              )}

              {(authMode !== 'recovery' || isPasswordRecovery) && (
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">{authMode === 'recovery' ? (lang === 'pt' ? 'Nova palavra-passe' : 'New password') : 'Palavra-passe'}</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    required
                    minLength={authMode === 'recovery' ? 8 : 6}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
                  />
                </div>
              </div>
              )}

              <button
                type="submit"
                disabled={!supabaseConfigStatus.configured}
                className="w-full bg-[#0A192F] text-white py-3.5 rounded-xl font-bold text-sm shadow-lg hover:bg-[#0F4C5C] transition-colors disabled:opacity-50"
              >
                {authMode === 'signin'
                  ? lang === 'pt' ? 'Entrar no Sistema' : 'Sign In'
                  : authMode === 'recovery'
                    ? isPasswordRecovery
                      ? lang === 'pt' ? 'Actualizar palavra-passe' : 'Update password'
                      : lang === 'pt' ? 'Enviar instruções' : 'Send instructions'
                    : lang === 'pt' ? 'Criar Registo' : 'Create Account'}
              </button>
            </form>

            <div className="text-center mt-6 pt-4 border-t border-gray-100 space-y-3">
              {authMode === 'signin' && (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMessage('');
                    setAuthMode('recovery');
                  }}
                  className="text-xs font-semibold text-[#0F4C5C] hover:underline"
                >
                  {lang === 'pt' ? 'Esqueceu-se da palavra-passe?' : 'Forgot your password?'}
                </button>
              )}
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMessage('');
                    setPasswordInput('');
                    setIsPasswordRecovery(false);
                    setAuthMode(authMode === 'signup' || authMode === 'recovery' ? 'signin' : 'signup');
                  }}
                  className="text-xs font-semibold text-[#0F4C5C] hover:underline"
                >
                  {authMode === 'signup'
                    ? lang === 'pt' ? 'Já tem conta? Iniciar sessão' : 'Already registered? Sign in'
                    : lang === 'recovery'
                      ? lang === 'pt' ? 'Voltar ao início de sessão' : 'Back to sign in'
                      : lang === 'pt' ? 'Não tem conta? Registe-se agora' : 'No account? Register now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Company Profile Detail Modal */}
      {selectedBusiness && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl relative border border-gray-100 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedBusiness(null)}
              className="absolute top-6 right-6 w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-700 font-bold transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Cover Banner */}
            <div className="w-full h-36 rounded-2xl bg-gradient-to-r from-[#0A192F] to-[#0F4C5C] mb-6 relative overflow-hidden flex items-end p-4">
              {selectedBusiness.cover_url && (
                <img src={selectedBusiness.cover_url} alt="Cover" className="absolute inset-0 w-full h-full object-cover opacity-60" />
              )}
              <div className="relative z-10 flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white shadow-lg border-2 border-white flex items-center justify-center font-bold text-[#0F4C5C] text-2xl overflow-hidden shrink-0">
                  {selectedBusiness.logo_url ? (
                    <img src={selectedBusiness.logo_url} alt={selectedBusiness.name} className="w-full h-full object-cover" />
                  ) : (
                    selectedBusiness.name[0]
                  )}
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-serif font-bold text-white drop-shadow-md">
                    {selectedBusiness.name}
                  </h2>
                  <p className="text-xs text-[#D4AF37] font-semibold tracking-wide">
                    {selectedBusiness.category} {selectedBusiness.subcategory ? `• ${selectedBusiness.subcategory}` : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {/* Status & Location badges */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> {lang === 'pt' ? 'Empresa Verificada' : 'Verified Business'}
                </span>
                <span className="text-xs font-bold px-3 py-1 rounded-lg bg-amber-50 text-[#0F4C5C] border border-amber-200 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> {selectedBusiness.municipality ? `${selectedBusiness.municipality}, ` : ''}{selectedBusiness.province}, {selectedBusiness.country_code}
                </span>
                <span className="text-xs font-bold px-3 py-1 rounded-lg bg-gray-100 text-gray-700 uppercase">
                  Plan: {selectedBusiness.plan}
                </span>
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  {lang === 'pt' ? 'Descrição Institucional' : 'Institutional Description'}
                </h4>
                <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100">
                  {selectedBusiness.description || (lang === 'pt' ? 'Nenhuma descrição detalhada informada.' : 'No detailed description provided.')}
                </p>
              </div>

              {/* Services & Products */}
              {selectedBusiness.services && selectedBusiness.services.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    {lang === 'pt' ? 'Serviços & Produtos' : 'Services & Products'}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedBusiness.services.map((srv, idx) => (
                      <span key={idx} className="text-xs bg-[#0F4C5C]/10 text-[#0F4C5C] px-3 py-1.5 rounded-xl font-semibold border border-[#0F4C5C]/20">
                        {srv}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact Information (Secure Public Allowlist) */}
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                  {lang === 'pt' ? 'Contactos Autorizados para Divulgação' : 'Authorized Public Contacts'}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedBusiness.whatsapp && (
                    <a
                      href={`https://wa.me/${selectedBusiness.whatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 transition-colors text-xs font-bold"
                    >
                      <Phone className="w-4 h-4 text-emerald-600" />
                      <span>WhatsApp: {selectedBusiness.whatsapp}</span>
                    </a>
                  )}
                  {selectedBusiness.phone && (
                    <a
                      href={`tel:${selectedBusiness.phone}`}
                      className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 hover:bg-gray-100 transition-colors text-xs font-bold"
                    >
                      <Phone className="w-4 h-4 text-gray-500" />
                      <span>Tel: {selectedBusiness.phone}</span>
                    </a>
                  )}
                  {selectedBusiness.email && (
                    <a
                      href={`mailto:${selectedBusiness.email}`}
                      className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-800 hover:bg-gray-100 transition-colors text-xs font-bold"
                    >
                      <Mail className="w-4 h-4 text-gray-500" />
                      <span>Email: {selectedBusiness.email}</span>
                    </a>
                  )}
                  {selectedBusiness.website && (
                    <a
                      href={selectedBusiness.website.startsWith('http') ? selectedBusiness.website : `https://${selectedBusiness.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100 transition-colors text-xs font-bold"
                    >
                      <Globe className="w-4 h-4 text-[#D4AF37]" />
                      <span className="truncate">Website Oficial</span>
                      <ExternalLink className="w-3.5 h-3.5 ml-auto" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedBusiness(null)}
                className="bg-[#0A192F] text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-[#0F4C5C] transition-colors"
              >
                {lang === 'pt' ? 'Fechar Perfil' : 'Close Profile'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <Footer lang={lang} />

    </div>
  );
}
