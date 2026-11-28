import React, { useEffect, useRef, useState } from 'react';
import { FaciPayPremiumCheckout } from './FaciPayPremiumCheckout';
import {
  Building2,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  Globe2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Upload,
  XCircle,
  Bell,
  History,
  ExternalLink,
  Eye,
  Edit3,
  AlertTriangle,
  RefreshCw,
  Check,
  X,
} from 'lucide-react';
import {
  AccessAuditLog,
  Business,
  BusinessDocument,
  BusinessStatus,
  BusinessVerificationStatus,
  Country,
  DocumentStatus,
  NotificationItem,
} from '../types';
import { supabaseConfigStatus } from '../lib/supabase';
import {
  ANGOLA_PROVINCES,
  BUSINESS_SECTORS,
  DOCUMENT_TYPES,
  OwnerBusinessBundle,
  UserPermissions,
  adminReviewDocument,
  adminTransitionBusinessState,
  createSignedDocumentLink,
  fetchActiveCountries,
  fetchAuditLogs,
  fetchBusinessesForGovernance,
  fetchCurrentUserPermissions,
  fetchMyBusinessBundles,
  fetchUserNotifications,
  markNotificationAsRead,
  registerBusinessWithPrivate,
  submitPrivateDocument,
  updatePendingBusinessWithPrivate,
  uploadBusinessPhoto,
} from '../services/businessRegistration';

interface BusinessRegistrationPortalProps {
  user: any;
  lang: 'pt' | 'en';
  onOpenAuth: () => void;
  onDirectoryRefresh: () => Promise<void>;
  onNavigateToDirectory: () => void;
  onUnreadCountChange?: (count: number) => void;
}

type PortalSubTab = 'register' | 'my_businesses' | 'notifications' | 'admin_verification';

export const BusinessRegistrationPortal: React.FC<BusinessRegistrationPortalProps> = ({
  user,
  lang,
  onOpenAuth,
  onDirectoryRefresh,
  onNavigateToDirectory,
  onUnreadCountChange,
}) => {
  const [subTab, setSubTab] = useState<PortalSubTab>('register');
  const [permissions, setPermissions] = useState<UserPermissions>({
    profile: null,
    assignments: [],
    isStrictAdmin: false,
    isModerator: false,
    isCountryManager: false,
    assignedCountries: [],
    canViewVerificationConsole: false,
    canMutateVerification: false,
    canAccessAudit: false,
  });

  const [countries, setCountries] = useState<Country[]>([]);
  const [myBundles, setMyBundles] = useState<OwnerBusinessBundle[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [adminBundles, setAdminBundles] = useState<OwnerBusinessBundle[]>([]);
  const [auditLogs, setAuditLogs] = useState<AccessAuditLog[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadedContextUserId, setLoadedContextUserId] = useState<string | null>(null);
  const contextRequestIdRef = useRef(0);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Registration / Edit Form State
  const [editingBusinessId, setEditingBusinessId] = useState<string | null>(null);
  const [scope, setScope] = useState<'national' | 'international'>('national');
  const [countryCode, setCountryCode] = useState<string>('AO');
  const [name, setName] = useState('');
  const [category, setCategory] = useState(BUSINESS_SECTORS[0]);
  const [subcategory, setSubcategory] = useState('');
  const [province, setProvince] = useState('Luanda');
  const [municipality, setMunicipality] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [servicesInput, setServicesInput] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(['pt']);
  const [whatsapp, setWhatsapp] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');

  // Private vault fields (business_private)
  const [nif, setNif] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [ownerNotes, setOwnerNotes] = useState('');

  // Optional initial attachments during registration
  const [initialLogoFile, setInitialLogoFile] = useState<File | null>(null);
  const [initialDocType, setInitialDocType] = useState(DOCUMENT_TYPES[0].value);
  const [initialDocFile, setInitialDocFile] = useState<File | null>(null);
  const [submittingForm, setSubmittingForm] = useState(false);

  // Document upload per business in "My Businesses"
  const [uploadDocTypes, setUploadDocTypes] = useState<Record<string, string>>({});
  const [uploadingForId, setUploadingForId] = useState<string | null>(null);

  // Signed URL inline modal preview (avoids window.open)
  const [previewDoc, setPreviewDoc] = useState<{ url: string; label: string; path: string } | null>(null);

  // Admin filters & reason notes
  const [adminStatusFilter, setAdminStatusFilter] = useState<'all' | BusinessStatus | 'in_review'>('all');
  const [auditCountryFilter, setAuditCountryFilter] = useState<string>('ALL');
  const [adminReasons, setAdminReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    loadCountries();
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadUserContext();
    } else {
      // Invalidate any in-flight request from the previous authenticated account.
      contextRequestIdRef.current += 1;
      setLoadedContextUserId(null);
      setPermissions({
        profile: null,
        assignments: [],
        isStrictAdmin: false,
        isModerator: false,
        isCountryManager: false,
        assignedCountries: [],
        canViewVerificationConsole: false,
        canMutateVerification: false,
        canAccessAudit: false,
      });
      setMyBundles([]);
      setNotifications([]);
      setAdminBundles([]);
      setAuditLogs([]);
      setPreviewDoc(null);
      setFeedback(null);
      setLoading(false);
      onUnreadCountChange?.(0);
    }

    return () => {
      // Also invalidate requests when the account changes or this portal unmounts.
      contextRequestIdRef.current += 1;
    };
  }, [user?.id]);

  const loadCountries = async () => {
    try {
      const list = await fetchActiveCountries();
      setCountries(list);
    } catch {
      setCountries([]);
    }
  };

  const loadUserContext = async () => {
    const userId = user?.id;
    if (!userId) return;

    const requestId = ++contextRequestIdRef.current;
    const isCurrentRequest = () => requestId === contextRequestIdRef.current;
    if (loadedContextUserId !== userId) {
      // Do not leave the previous account's private business data on screen
      // while the newly authenticated account is still loading.
      setLoadedContextUserId(null);
      setPermissions({
        profile: null,
        assignments: [],
        isStrictAdmin: false,
        isModerator: false,
        isCountryManager: false,
        assignedCountries: [],
        canViewVerificationConsole: false,
        canMutateVerification: false,
        canAccessAudit: false,
      });
      setMyBundles([]);
      setNotifications([]);
      setAdminBundles([]);
      setAuditLogs([]);
      setPreviewDoc(null);
      setFeedback(null);
      onUnreadCountChange?.(0);
    }
    setLoading(true);
    try {
      const perms = await fetchCurrentUserPermissions(userId);
      if (!isCurrentRequest()) return;
      setPermissions(perms);

      const [bundles, notifs] = await Promise.all([
        fetchMyBusinessBundles(userId),
        fetchUserNotifications(userId).catch(() => [] as NotificationItem[]),
      ]);
      if (!isCurrentRequest()) return;

      setMyBundles(bundles);
      setNotifications(notifs);
      onUnreadCountChange?.(notifs.filter((n) => !n.read_at).length);

      if (perms.canViewVerificationConsole) {
        const scopedBusinesses = await fetchBusinessesForGovernance(perms);
        if (!isCurrentRequest()) return;
        setAdminBundles(scopedBusinesses);
      } else {
        setAdminBundles([]);
      }

      if (perms.canAccessAudit) {
        const logs = await fetchAuditLogs(perms, auditCountryFilter);
        if (!isCurrentRequest()) return;
        setAuditLogs(logs);
      } else {
        setAuditLogs([]);
      }
      if (isCurrentRequest()) setLoadedContextUserId(userId);
    } catch (err: any) {
      if (isCurrentRequest()) {
        setFeedback({ type: 'error', text: err?.message || 'Erro ao carregar dados de registo.' });
        setLoadedContextUserId(userId);
      }
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  };

  const handleScopeChange = (nextScope: 'national' | 'international') => {
    setScope(nextScope);
    if (nextScope === 'national') {
      setCountryCode('AO');
      setProvince('Luanda');
    } else {
      const firstInternational = countries.find((c) => c.code !== 'AO');
      setCountryCode(firstInternational?.code || 'ZA');
      setProvince('');
    }
  };

  const resetForm = () => {
    setEditingBusinessId(null);
    setScope('national');
    setCountryCode('AO');
    setName('');
    setCategory(BUSINESS_SECTORS[0]);
    setSubcategory('');
    setProvince('Luanda');
    setMunicipality('');
    setAddress('');
    setDescription('');
    setDescriptionEn('');
    setServicesInput('');
    setSelectedLanguages(['pt']);
    setWhatsapp('');
    setPhone('');
    setEmail('');
    setWebsite('');
    setNif('');
    setLicenseNumber('');
    setOwnerNotes('');
    setInitialLogoFile(null);
    setInitialDocFile(null);
  };

  const startEditingPending = (bundle: OwnerBusinessBundle) => {
    const b = bundle.business;
    setEditingBusinessId(b.id);
    setScope(b.country_code === 'AO' ? 'national' : 'international');
    setCountryCode(b.country_code || 'AO');
    setName(b.name);
    setCategory(b.category);
    setSubcategory(b.subcategory || '');
    setProvince(b.province);
    setMunicipality(b.municipality || '');
    setAddress(b.address || '');
    setDescription(b.description || '');
    setDescriptionEn(b.description_en || '');
    setServicesInput((b.services || []).join(', '));
    setSelectedLanguages(b.languages?.length ? b.languages : ['pt']);
    setWhatsapp(b.whatsapp || '');
    setPhone(b.phone || '');
    setEmail(b.email || '');
    setWebsite(b.website || '');
    setNif(bundle.privateData?.nif || '');
    setLicenseNumber(bundle.privateData?.license_number || '');
    setOwnerNotes(bundle.privateData?.owner_notes || '');
    setSubTab('register');
    setFeedback(null);
  };

  const toggleLanguage = (code: string) => {
    setSelectedLanguages((prev) =>
      prev.includes(code) ? (prev.length > 1 ? prev.filter((l) => l !== code) : prev) : [...prev, code]
    );
  };

  const handleSubmitRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      onOpenAuth();
      return;
    }

    setFeedback(null);

    if (!name.trim() || !province.trim() || !description.trim() || !nif.trim() || !licenseNumber.trim()) {
      setFeedback({
        type: 'error',
        text:
          lang === 'pt'
            ? 'Preencha todos os campos obrigatórios: Nome, Província/Região, Descrição, NIF/Registo Fiscal e Licença/Alvará.'
            : 'Please complete all required fields: Name, Province/Region, Description, Tax ID, and Commercial License.',
      });
      return;
    }

    setSubmittingForm(true);
    try {
      const services = servicesInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const publicPayload = {
        name,
        country_code: countryCode,
        province,
        municipality,
        address,
        category,
        subcategory,
        description,
        description_en: descriptionEn,
        whatsapp,
        phone,
        email,
        website,
        services,
        languages: selectedLanguages,
      };

      const privatePayload = {
        nif,
        license_number: licenseNumber,
        owner_notes: ownerNotes,
      };

      let savedBundle: OwnerBusinessBundle;

      if (editingBusinessId) {
        savedBundle = await updatePendingBusinessWithPrivate(user.id, editingBusinessId, publicPayload, privatePayload);
      } else {
        savedBundle = await registerBusinessWithPrivate(user.id, publicPayload, privatePayload);
      }

      const warnings: string[] = [];

      if (initialLogoFile) {
        try {
          await uploadBusinessPhoto(savedBundle.business.id, initialLogoFile, 'logo');
        } catch (photoErr: any) {
          warnings.push(photoErr?.message || 'Falha ao carregar logótipo.');
        }
      }

      if (initialDocFile) {
        try {
          await submitPrivateDocument(savedBundle.business.id, initialDocType, initialDocFile);
        } catch (docErr: any) {
          warnings.push(docErr?.message || 'Falha ao enviar documento.');
        }
      }

      await loadUserContext();
      resetForm();
      setSubTab('my_businesses');

      setFeedback({
        type: warnings.length > 0 ? 'error' : 'success',
        text:
          warnings.length > 0
            ? `${editingBusinessId ? 'Registo actualizado' : 'Empresa registada'} com estado pendente, mas com avisos nos anexos: ${warnings.join(' | ')}`
            : editingBusinessId
            ? lang === 'pt'
              ? 'Registo empresarial actualizado com sucesso. Aguarda validação administrativa.'
              : 'Business registration updated. Pending administrative review.'
            : lang === 'pt'
            ? 'Empresa registada com sucesso! Dados fiscais guardados no cofre privado e candidatura submetida para verificação.'
            : 'Business registered successfully! Fiscal data stored in private vault and submitted for verification.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Erro ao submeter o registo empresarial.',
      });
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleUploadAdditionalDocument = async (businessId: string, file: File | undefined) => {
    if (!file) return;
    setUploadingForId(businessId);
    setFeedback(null);
    try {
      const docType = uploadDocTypes[businessId] || DOCUMENT_TYPES[0].value;
      await submitPrivateDocument(businessId, docType, file);
      await loadUserContext();
      setFeedback({
        type: 'success',
        text:
          lang === 'pt'
            ? 'Documento submetido com segurança no bucket privado business-documents (estado: pendente).'
            : 'Document securely submitted to private bucket business-documents (status: pending).',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Erro ao enviar documento.' });
    } finally {
      setUploadingForId(null);
    }
  };

  const handleUploadPhotoUpdate = async (businessId: string, kind: 'logo' | 'cover', file: File | undefined) => {
    if (!file) return;
    setUploadingForId(businessId);
    setFeedback(null);
    try {
      await uploadBusinessPhoto(businessId, file, kind);
      await loadUserContext();
      setFeedback({
        type: 'success',
        text:
          lang === 'pt'
            ? `${kind === 'logo' ? 'Logótipo' : 'Imagem de capa'} actualizado com sucesso.`
            : `${kind === 'logo' ? 'Logo' : 'Cover image'} updated successfully.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Erro ao carregar fotografia.' });
    } finally {
      setUploadingForId(null);
    }
  };

  const handlePreviewSignedDocument = async (doc: BusinessDocument) => {
    setFeedback(null);
    try {
      const signedUrl = await createSignedDocumentLink(doc.storage_path);
      const docLabel =
        DOCUMENT_TYPES.find((d) => d.value === doc.document_type)?.[lang === 'pt' ? 'labelPt' : 'labelEn'] ||
        doc.document_type;
      setPreviewDoc({ url: signedUrl, label: docLabel, path: doc.storage_path });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Não foi possível gerar link assinado para este documento.',
      });
    }
  };

  const handleMarkNotificationRead = async (notifId: string) => {
    if (!user?.id) return;
    try {
      await markNotificationAsRead(user.id, notifId);
      setNotifications((prev) => {
        const updated = prev.map((n) => (n.id === notifId ? { ...n, read_at: new Date().toISOString() } : n));
        onUnreadCountChange?.(updated.filter((n) => !n.read_at).length);
        return updated;
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Erro ao marcar notificação.' });
    }
  };

  const handleAdminDocDecision = async (doc: BusinessDocument, decision: DocumentStatus, cCode: string) => {
    if (!user?.id || !permissions.canMutateVerification) return;
    setFeedback(null);
    try {
      await adminReviewDocument(user.id, permissions.isStrictAdmin, doc, decision, cCode);
      await loadUserContext();
      setFeedback({
        type: 'success',
        text:
          decision === 'approved'
            ? 'Documento aprovado e registado na trilha de auditoria.'
            : 'Documento rejeitado e registado na trilha de auditoria.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Erro ao rever documento.' });
    }
  };

  const handleAdminBusinessTransition = async (
    business: Business,
    nextStatus: BusinessStatus,
    nextVerification: BusinessVerificationStatus
  ) => {
    if (!user?.id || !permissions.canMutateVerification) return;
    setFeedback(null);
    try {
      const reason = adminReasons[business.id];
      if ((nextStatus === 'rejected' || nextStatus === 'suspended') && !reason?.trim()) {
        setFeedback({
          type: 'error',
          text: 'Indique uma justificação antes de rejeitar ou suspender esta empresa.',
        });
        return;
      }
      await adminTransitionBusinessState({
        adminId: user.id,
        isStrictAdmin: permissions.isStrictAdmin,
        business,
        nextStatus,
        nextVerificationStatus: nextVerification,
        reason,
      });

      await Promise.all([loadUserContext(), onDirectoryRefresh()]);

      const published = nextStatus === 'approved' && nextVerification === 'verified';
      setFeedback({
        type: 'success',
        text: published
          ? `Empresa "${business.name}" aprovada e verificada! Publicação automática no Directório Empresarial concluída.`
          : `Estado da empresa "${business.name}" actualizado para ${nextStatus} / ${nextVerification}.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Erro na transição de verificação.' });
    }
  };

  const handleFilterAuditCountry = async (nextCountry: string) => {
    setAuditCountryFilter(nextCountry);
    try {
      const logs = await fetchAuditLogs(permissions, nextCountry);
      setAuditLogs(logs);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Erro ao consultar auditoria.' });
    }
  };

  const renderStatusLabel = (status: BusinessStatus, verification: BusinessVerificationStatus) => {
    if (status === 'approved' && verification === 'verified') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="w-4 h-4" />
          {lang === 'pt' ? 'Aprovada & Verificada (No Directório)' : 'Approved & Verified (Live)'}
        </span>
      );
    }
    if (status === 'pending' && verification === 'pending') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
          <Clock className="w-4 h-4" />
          {lang === 'pt' ? 'Em Análise Administrativa' : 'Under Administrative Review'}
        </span>
      );
    }
    if (status === 'rejected' || status === 'suspended') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
          <XCircle className="w-4 h-4" />
          {status === 'rejected'
            ? lang === 'pt'
              ? 'Rejeitada'
              : 'Rejected'
            : lang === 'pt'
            ? 'Suspensa'
            : 'Suspended'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <Clock className="w-4 h-4" />
        {lang === 'pt' ? 'Pendente de Verificação' : 'Pending Verification'}
      </span>
    );
  };

  const internationalCountries = countries.filter((c) => c.code !== 'AO');
  const unreadNotificationsCount = notifications.filter((n) => !n.read_at).length;

  const filteredAdminBundles = adminBundles.filter((bundle) => {
    const b = bundle.business;
    if (adminStatusFilter === 'all') return true;
    if (adminStatusFilter === 'in_review') return b.status === 'pending' && b.verification_status === 'pending';
    return b.status === adminStatusFilter;
  });

  if (!user) {
    return (
      <section className="py-16 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white border border-gray-200 rounded-2xl p-10 sm:p-14 text-center shadow-sm">
          <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-[#0A192F] text-[#D4AF37] flex items-center justify-center">
            <Lock className="w-7 h-7" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#0F4C5C] mb-2">
            {lang === 'pt' ? 'Registo & Verificação Empresarial' : 'Business Registration & Verification'}
          </p>
          <h1 className="text-3xl font-serif font-bold text-[#0A192F] mb-3">
            {lang === 'pt'
              ? 'Autenticação Obrigatória para Registo Seguro'
              : 'Authentication Required for Secure Registration'}
          </h1>
          <p className="text-sm text-gray-600 max-w-xl mx-auto mb-8 leading-relaxed">
            {lang === 'pt'
              ? 'Por conformidade com as políticas RLS do Supabase, o registo de empresas nacionais e internacionais, submissão de documentos privados (NIF, Alvará) e acompanhamento de verificação exigem uma conta autenticada.'
              : 'Per Supabase RLS policies, national and international business registration, private document submission (Tax ID, License), and verification tracking require an authenticated account.'}
          </p>
          <button
            onClick={onOpenAuth}
            className="inline-flex items-center gap-2 bg-[#0A192F] text-white px-7 py-3.5 rounded-xl text-sm font-bold hover:bg-[#0F4C5C] transition-colors whitespace-nowrap shrink-0"
          >
            <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
            {lang === 'pt' ? 'Entrar ou Criar Conta' : 'Sign In or Create Account'}
          </button>
        </div>
      </section>
    );
  }

  if (loadedContextUserId !== user.id) {
    return (
      <section className="py-16 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8" aria-live="polite">
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center text-sm text-gray-600 shadow-sm">
          <div className="w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          {lang === 'pt' ? 'A carregar os dados da conta...' : 'Loading account data...'}
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Top Institutional Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-8 border-b border-gray-200 mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#0F4C5C]">
            {lang === 'pt' ? 'Conformidade Empresarial · Angola & África' : 'Enterprise Compliance · Angola & Africa'}
          </p>
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-[#0A192F] mt-2">
            {lang === 'pt' ? 'Registo & Verificação Empresarial' : 'Business Registration & Verification'}
          </h1>
          <p className="text-sm text-gray-600 mt-2 max-w-2xl">
            {lang === 'pt'
              ? 'Submeta a sua empresa nacional ou internacional, envie documentação legal para o cofre privado e acompanhe a validação administrativa para integração automática no Directório.'
              : 'Register your national or international company, upload legal documents to the private vault, and track administrative approval for automatic Directory publishing.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <span>{user.email}</span>
          <span aria-hidden="true">·</span>
          <span className="font-semibold text-[#0A192F]">
            {permissions.profile?.role || 'business_owner'}
          </span>
          <button
            onClick={loadUserContext}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {lang === 'pt' ? 'Actualizar' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Segmented Navigation Bar */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-gray-100 rounded-xl mb-8 w-fit">
        <button
          onClick={() => setSubTab('register')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            subTab === 'register' ? 'bg-white text-[#0A192F] shadow-sm' : 'text-gray-600 hover:text-[#0A192F]'
          }`}
        >
          <Building2 className="w-4 h-4" />
          {editingBusinessId
            ? lang === 'pt'
              ? 'Editar Registo Pendente'
              : 'Edit Pending Registration'
            : lang === 'pt'
            ? 'Registar Empresa'
            : 'Register Business'}
        </button>

        <button
          onClick={() => setSubTab('my_businesses')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            subTab === 'my_businesses' ? 'bg-white text-[#0A192F] shadow-sm' : 'text-gray-600 hover:text-[#0A192F]'
          }`}
        >
          <FileText className="w-4 h-4" />
          {lang === 'pt' ? 'Minhas Empresas & Documentos' : 'My Businesses & Docs'}
          <span className="tabular-nums font-mono text-[11px] text-gray-500">({myBundles.length})</span>
        </button>

        <button
          onClick={() => setSubTab('notifications')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            subTab === 'notifications' ? 'bg-white text-[#0A192F] shadow-sm' : 'text-gray-600 hover:text-[#0A192F]'
          }`}
        >
          <Bell className="w-4 h-4" />
          {lang === 'pt' ? 'Notificações' : 'Notifications'}
          {unreadNotificationsCount > 0 && (
            <span className="tabular-nums font-mono text-[11px] font-bold text-[#0F4C5C]">
              ({unreadNotificationsCount})
            </span>
          )}
        </button>

        {(permissions.canViewVerificationConsole || permissions.canAccessAudit) && (
          <button
            onClick={() => setSubTab('admin_verification')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'admin_verification'
                ? 'bg-[#0A192F] text-[#D4AF37] shadow-sm'
                : 'text-gray-700 hover:text-[#0A192F]'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            {permissions.canMutateVerification
              ? lang === 'pt'
                ? 'Validação Admin & Auditoria'
                : 'Admin Verification & Audit'
              : lang === 'pt'
              ? 'Supervisão por País & Auditoria'
              : 'Country Supervision & Audit'}
          </button>
        )}
      </div>

      {!supabaseConfigStatus.configured && (
        <div className="mb-6 p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Configuração Supabase Pendente</p>
            <p className="mt-0.5">{supabaseConfigStatus.reason}</p>
          </div>
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`mb-6 p-4 rounded-xl border flex items-start justify-between gap-4 text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-start gap-3">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-gray-500 hover:text-gray-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 1: NATIONAL & INTERNATIONAL REGISTRATION FORM         */}
      {/* ========================================================= */}
      {subTab === 'register' && (
        <form onSubmit={handleSubmitRegistration} className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-10 space-y-10">
          {/* Scope Selector */}
          <div className="pb-8 border-b border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-xl font-serif font-bold text-[#0A192F]">
                  {lang === 'pt' ? '01. Âmbito Geográfico do Registo' : '01. Geographic Registration Scope'}
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {lang === 'pt'
                    ? 'Seleccione se a empresa está sediada em Angola (mercado âncora) ou noutro país africano / parceiro internacional.'
                    : 'Select whether the company is headquartered in Angola (anchor market) or another African / international country.'}
                </p>
              </div>
              {editingBusinessId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs font-semibold text-gray-600 hover:text-gray-900 underline"
                >
                  {lang === 'pt' ? 'Cancelar Edição' : 'Cancel Edit'}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => handleScopeChange('national')}
                className={`p-5 rounded-xl border text-left transition-all ${
                  scope === 'national'
                    ? 'border-[#0A192F] bg-[#0A192F]/5'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm text-[#0A192F]">
                    {lang === 'pt' ? 'Registo Nacional — Angola (AO)' : 'National Registration — Angola (AO)'}
                  </span>
                  {scope === 'national' && <Check className="w-4 h-4 text-[#0F4C5C]" />}
                </div>
                <p className="text-xs text-gray-500">
                  {lang === 'pt'
                    ? 'Empresas com sede fiscal em Angola (NIF e Alvará Comercial nacional).'
                    : 'Companies legally established in Angola (National NIF and Commercial License).'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleScopeChange('international')}
                className={`p-5 rounded-xl border text-left transition-all ${
                  scope === 'international'
                    ? 'border-[#0A192F] bg-[#0A192F]/5'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm text-[#0A192F] flex items-center gap-1.5">
                    <Globe2 className="w-4 h-4 text-[#0F4C5C]" />
                    {lang === 'pt' ? 'Registo Internacional — África & Global' : 'International Registration — Africa & Global'}
                  </span>
                  {scope === 'international' && <Check className="w-4 h-4 text-[#0F4C5C]" />}
                </div>
                <p className="text-xs text-gray-500">
                  {lang === 'pt'
                    ? 'Parceiros, exportadores e empresas estrangeiras nos corredores comerciais africanos.'
                    : 'Partners, exporters, and foreign enterprises across African trade corridors.'}
                </p>
              </button>
            </div>
          </div>

          {/* Public Institutional Profile */}
          <div className="pb-8 border-b border-gray-100 space-y-6">
            <div>
              <h2 className="text-xl font-serif font-bold text-[#0A192F]">
                {lang === 'pt' ? '02. Identificação Institucional (Directório Público após Aprovação)' : '02. Institutional Identification'}
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                {lang === 'pt'
                  ? 'Estes campos ficam visíveis no Directório Empresarial apenas quando status = approved e verification_status = verified.'
                  : 'These fields become visible in the Public Directory only when status = approved and verification_status = verified.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {lang === 'pt' ? 'Denominação Social / Nome da Empresa *' : 'Company Legal / Brand Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Atlântico Logística & Comércio, Lda."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {lang === 'pt' ? 'País de Sede *' : 'Headquarters Country *'}
                </label>
                {scope === 'national' ? (
                  <input
                    type="text"
                    readOnly
                    value="Angola (AO)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-700"
                  />
                ) : (
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:border-[#0F4C5C]"
                  >
                    {internationalCountries.length > 0 ? (
                      internationalCountries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {lang === 'pt' ? c.name_pt : c.name_en} ({c.code}) · {c.region}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="ZA">África do Sul (ZA)</option>
                        <option value="NA">Namíbia (NA)</option>
                        <option value="CD">República Democrática do Congo (CD)</option>
                        <option value="MZ">Moçambique (MZ)</option>
                        <option value="PT">Portugal (PT)</option>
                        <option value="BR">Brasil (BR)</option>
                        <option value="AE">Emirados Árabes Unidos (AE)</option>
                      </>
                    )}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {scope === 'national'
                    ? lang === 'pt'
                      ? 'Província *'
                      : 'Province *'
                    : lang === 'pt'
                    ? 'Estado / Província / Região *'
                    : 'State / Province / Region *'}
                </label>
                {scope === 'national' ? (
                  <select
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:border-[#0F4C5C]"
                  >
                    {ANGOLA_PROVINCES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    placeholder={lang === 'pt' ? 'Ex: Gauteng, Lisboa, Windhoek...' : 'e.g. Gauteng, Lisbon, Windhoek...'}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {lang === 'pt' ? 'Município / Cidade' : 'Municipality / City'}
                </label>
                <input
                  type="text"
                  value={municipality}
                  onChange={(e) => setMunicipality(e.target.value)}
                  placeholder={scope === 'national' ? 'Ex: Talatona, Ingombota, Lobito' : 'Ex: Johannesburg, Maputo'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {lang === 'pt' ? 'Sector de Actividade Principal *' : 'Primary Activity Sector *'}
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:border-[#0F4C5C]"
                >
                  {BUSINESS_SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {lang === 'pt' ? 'Subcategoria / Especialidade' : 'Subcategory / Specialty'}
                </label>
                <input
                  type="text"
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  placeholder="Ex: Transporte Marítimo e Despacho Aduaneiro"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                {lang === 'pt' ? 'Morada Comercial Completa' : 'Business Physical Address'}
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Rua, Edifício, Zona Industrial ou Distrito Comercial"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {lang === 'pt' ? 'Descrição Institucional (Português) *' : 'Institutional Description (Portuguese) *'}
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva a actividade principal, capacidade operacional e mercado-alvo..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {lang === 'pt' ? 'Descrição Institucional (Inglês - Opcional)' : 'Institutional Description (English - Optional)'}
                </label>
                <textarea
                  rows={4}
                  value={descriptionEn}
                  onChange={(e) => setDescriptionEn(e.target.value)}
                  placeholder="Optional English overview for international investors and trade delegations..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {lang === 'pt' ? 'Produtos e Serviços (separados por vírgula)' : 'Products & Services (comma-separated)'}
                </label>
                <input
                  type="text"
                  value={servicesInput}
                  onChange={(e) => setServicesInput(e.target.value)}
                  placeholder="Importação, Logística Portuária, Consultoria Fiscal"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {lang === 'pt' ? 'Idiomas de Atendimento' : 'Business Languages'}
                </label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {[
                    { code: 'pt', label: 'Português' },
                    { code: 'en', label: 'English' },
                    { code: 'fr', label: 'Français' },
                    { code: 'es', label: 'Español' },
                  ].map((l) => {
                    const active = selectedLanguages.includes(l.code);
                    return (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => toggleLanguage(l.code)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          active
                            ? 'bg-[#0A192F] text-white border-[#0A192F]'
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {l.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">WhatsApp</label>
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="+244 923 000 000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {lang === 'pt' ? 'Telefone Comercial' : 'Business Phone'}
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+244 222 000 000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {lang === 'pt' ? 'Email Institucional' : 'Corporate Email'}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="geral@empresa.ao"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Website</label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://empresa.ao"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
                />
              </div>
            </div>
          </div>

          {/* Private Legal Vault (business_private) */}
          <div className="pb-8 border-b border-gray-100 space-y-5">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-[#0F4C5C] shrink-0 mt-0.5" />
              <div>
                <h2 className="text-xl font-serif font-bold text-[#0A192F]">
                  {lang === 'pt'
                    ? '03. Cofre Legal Privado (Confidencial · Tabela business_private)'
                    : '03. Private Legal Vault (Confidential)'}
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  {lang === 'pt'
                    ? 'Estes identificadores são protegidos por RLS estrita e nunca são expostos no Directório Público. Visíveis apenas ao proprietário e administradores de verificação.'
                    : 'Protected by strict RLS and never exposed in the Public Directory. Visible only to the owner and verification administrators.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {scope === 'national'
                    ? 'NIF (Número de Identificação Fiscal) *'
                    : lang === 'pt'
                    ? 'Identificador Fiscal Internacional (Tax ID / VAT) *'
                    : 'International Tax Registration ID *'}
                </label>
                <input
                  type="text"
                  required
                  value={nif}
                  onChange={(e) => setNif(e.target.value)}
                  placeholder={scope === 'national' ? 'Ex: 5417000000' : 'Ex: ZA-REG-2026-0091'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm font-mono focus:outline-none focus:border-[#0F4C5C]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {scope === 'national'
                    ? 'Número de Alvará / Licença Comercial *'
                    : lang === 'pt'
                    ? 'Registo Comercial / Licença Operacional *'
                    : 'Commercial Registry / Operating License *'}
                </label>
                <input
                  type="text"
                  required
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  placeholder={scope === 'national' ? 'Ex: ALV-LDA-2026-8841' : 'Ex: CIPC-2026/112233/07'}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm font-mono focus:outline-none focus:border-[#0F4C5C]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                {lang === 'pt' ? 'Notas para a Equipa de Validação (Opcional)' : 'Notes for Verification Team (Optional)'}
              </label>
              <textarea
                rows={2}
                value={ownerNotes}
                onChange={(e) => setOwnerNotes(e.target.value)}
                placeholder={
                  lang === 'pt'
                    ? 'Informações adicionais sobre filiais, licenças sectoriais ou representação legal...'
                    : 'Additional details on branches, sector permits, or legal representation...'
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:border-[#0F4C5C]"
              />
            </div>
          </div>

          {/* Optional Immediate Attachments */}
          <div className="pb-6 border-b border-gray-100 space-y-5">
            <div>
              <h2 className="text-xl font-serif font-bold text-[#0A192F]">
                {lang === 'pt'
                  ? '04. Anexos Legais e Logótipo (Opcional agora, obrigatório para aprovação)'
                  : '04. Legal Attachments & Logo'}
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                {lang === 'pt'
                  ? 'Pode anexar ou actualizar o logótipo (JPG/PNG/WEBP até 5 MB) e um documento legal comprovativo (PDF/JPG/PNG até 10 MB).'
                  : 'You may attach or update a logo (up to 5 MB) and a legal verification document (PDF/JPG/PNG up to 10 MB).'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {lang === 'pt' ? 'Logótipo Oficial (bucket business-photos)' : 'Official Logo (business-photos)'}
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setInitialLogoFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-800 hover:file:bg-gray-200"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-700">
                  {lang === 'pt' ? 'Documento Legal (bucket privado business-documents)' : 'Legal Document (private bucket)'}
                </label>
                <select
                  value={initialDocType}
                  onChange={(e) => setInitialDocType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs bg-white focus:outline-none focus:border-[#0F4C5C]"
                >
                  {DOCUMENT_TYPES.map((dt) => (
                    <option key={dt.value} value={dt.value}>
                      {lang === 'pt' ? dt.labelPt : dt.labelEn}
                    </option>
                  ))}
                </select>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(e) => setInitialDocFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#0F4C5C]/10 file:text-[#0F4C5C] hover:file:bg-[#0F4C5C]/20"
                />
              </div>
            </div>
          </div>

          {/* Submit Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-500">
              {lang === 'pt'
                ? 'Ao submeter ou resubmeter, o registo fica como status = pending e verification_status = unverified conforme política RLS.'
                : 'On submission or resubmission, registration is set to status = pending and verification_status = unverified per RLS policy.'}
            </p>
            <button
              type="submit"
              disabled={submittingForm}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#0A192F] text-white px-8 py-3.5 rounded-xl text-sm font-bold hover:bg-[#0F4C5C] transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
              {submittingForm
                ? lang === 'pt'
                  ? 'A Submeter...'
                  : 'Submitting...'
                : editingBusinessId
                ? lang === 'pt'
                  ? 'Guardar e Resubmeter para Verificação'
                  : 'Save & Resubmit for Verification'
                : lang === 'pt'
                ? 'Submeter Registo para Verificação'
                : 'Submit Registration for Verification'}
            </button>
          </div>
        </form>
      )}

      {/* ========================================================= */}
      {/* TAB 2: MY BUSINESSES & PRIVATE DOCUMENT VAULT             */}
      {/* ========================================================= */}
      {subTab === 'my_businesses' && (
        <div className="space-y-6">
          {myBundles.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-14 text-center">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-serif font-bold text-[#0A192F]">
                {lang === 'pt' ? 'Ainda não tem empresas registadas' : 'You have no registered businesses yet'}
              </h3>
              <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto mb-6">
                {lang === 'pt'
                  ? 'Crie o seu registo empresarial nacional ou internacional e envie os documentos legais para aparecer no Directório Verificado.'
                  : 'Create your national or international business registration and submit legal documents to join the Verified Directory.'}
              </p>
              <button
                onClick={() => setSubTab('register')}
                className="inline-flex items-center gap-2 bg-[#0A192F] text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-[#0F4C5C] transition-colors"
              >
                {lang === 'pt' ? 'Registar Primeira Empresa' : 'Register First Business'}
              </button>
            </div>
          ) : (
            myBundles.map(({ business, privateData, documents }) => {
              const isEditableByOwner =
                (business.status === 'pending' || business.status === 'rejected') &&
                business.verification_status === 'unverified';
              const isPublished =
                business.status === 'approved' && business.verification_status === 'verified';

              return (
                <div key={business.id} className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 space-y-6">
                  {/* Business Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-100">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-[#0F4C5C] text-xl overflow-hidden shrink-0">
                        {business.logo_url ? (
                          <img src={business.logo_url} alt={business.name} className="w-full h-full object-cover" />
                        ) : (
                          business.name[0]
                        )}
                      </div>
                      <div>
                        <h3 className="text-xl font-serif font-bold text-[#0A192F]">{business.name}</h3>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-1">
                          <span>{business.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {business.province}, {business.country_code}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">ID: {business.id.slice(0, 8)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {renderStatusLabel(business.status, business.verification_status)}

                      {isEditableByOwner && (
                        <button
                          onClick={() => startEditingPending({ business, privateData, documents })}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          {business.status === 'rejected'
                            ? lang === 'pt'
                              ? 'Corrigir & Resubmeter'
                              : 'Edit & Resubmit'
                            : lang === 'pt'
                            ? 'Editar Registo'
                            : 'Edit'}
                        </button>
                      )}

                      {isPublished && (
                        <button
                          onClick={onNavigateToDirectory}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          {lang === 'pt' ? 'Ver no Directório' : 'View in Directory'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Private Legal Data Summary & Photo Uploads */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-5 border-b border-gray-100">
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        {lang === 'pt' ? 'Dados Legais (Cofre Privado)' : 'Legal Data (Private Vault)'}
                      </p>
                      <div className="text-xs space-y-1.5 text-gray-700">
                        <p>
                          <span className="text-gray-500">NIF / Tax ID:</span>{' '}
                          <span className="font-mono font-semibold">{privateData?.nif || '—'}</span>
                        </p>
                        <p>
                          <span className="text-gray-500">Alvará / Licença:</span>{' '}
                          <span className="font-mono font-semibold">{privateData?.license_number || '—'}</span>
                        </p>
                        <p>
                          <span className="text-gray-500">Plano / Destaque:</span>{' '}
                          <span className="font-semibold uppercase">{business.plan}</span>
                        </p>
                      </div>
                    </div>

                    <div className="lg:col-span-2">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        {lang === 'pt' ? 'Identidade Visual (Bucket business-photos)' : 'Visual Assets (business-photos)'}
                      </p>
                      {isEditableByOwner ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <label className="block border border-dashed border-gray-300 rounded-xl p-3 text-xs text-gray-600 cursor-pointer hover:border-[#0F4C5C]">
                            <span className="font-semibold text-[#0A192F] block mb-1">
                              {lang === 'pt' ? 'Carregar Logótipo (JPG/PNG/WEBP)' : 'Upload Logo'}
                            </span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              disabled={uploadingForId === business.id}
                              onChange={(e) => handleUploadPhotoUpdate(business.id, 'logo', e.target.files?.[0])}
                              className="w-full text-[11px]"
                            />
                          </label>
                          <label className="block border border-dashed border-gray-300 rounded-xl p-3 text-xs text-gray-600 cursor-pointer hover:border-[#0F4C5C]">
                            <span className="font-semibold text-[#0A192F] block mb-1">
                              {lang === 'pt' ? 'Carregar Capa Institucional' : 'Upload Cover Photo'}
                            </span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              disabled={uploadingForId === business.id}
                              onChange={(e) => handleUploadPhotoUpdate(business.id, 'cover', e.target.files?.[0])}
                              className="w-full text-[11px]"
                            />
                          </label>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">
                          {lang === 'pt'
                            ? 'A edição directa de activos públicos pelo proprietário está bloqueada enquanto a empresa está em análise ou já verificada (regra RLS).'
                            : 'Direct owner edits are locked while the company is under review or verified (RLS policy).'}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Private Documents Table & Upload */}
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-bold text-[#0A192F] flex items-center gap-2">
                          <FileCheck2 className="w-4 h-4 text-[#0F4C5C]" />
                          {lang === 'pt'
                            ? 'Documentos de Verificação (Bucket Privado business-documents)'
                            : 'Verification Documents (Private Bucket)'}
                        </h4>
                        <p className="text-xs text-gray-500">
                          {lang === 'pt'
                            ? 'PDF, JPG ou PNG até 10 MB. Acedidos apenas por links assinados temporários.'
                            : 'PDF, JPG or PNG up to 10 MB. Accessed solely via short-lived signed URLs.'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={uploadDocTypes[business.id] || DOCUMENT_TYPES[0].value}
                          onChange={(e) =>
                            setUploadDocTypes((prev) => ({ ...prev, [business.id]: e.target.value }))
                          }
                          className="px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white focus:outline-none focus:border-[#0F4C5C]"
                        >
                          {DOCUMENT_TYPES.map((dt) => (
                            <option key={dt.value} value={dt.value}>
                              {lang === 'pt' ? dt.labelPt : dt.labelEn}
                            </option>
                          ))}
                        </select>

                        <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F4C5C] text-white text-xs font-semibold cursor-pointer hover:bg-[#0A192F] transition-colors whitespace-nowrap shrink-0">
                          <Upload className="w-3.5 h-3.5" />
                          {uploadingForId === business.id
                            ? lang === 'pt'
                              ? 'A Enviar...'
                              : 'Uploading...'
                            : lang === 'pt'
                            ? 'Enviar Documento'
                            : 'Upload Document'}
                          <input
                            type="file"
                            accept="application/pdf,image/jpeg,image/png"
                            className="hidden"
                            disabled={uploadingForId === business.id}
                            onChange={(e) => {
                              handleUploadAdditionalDocument(business.id, e.target.files?.[0]);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    {documents.length === 0 ? (
                      <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-500">
                        {lang === 'pt'
                          ? 'Nenhum documento legal anexado. Envie pelo menos o Alvará Comercial e o Comprovativo de NIF para acelerar a validação administrativa.'
                          : 'No legal documents uploaded yet. Upload Commercial License and Tax ID certificate to speed up review.'}
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-gray-200 rounded-xl">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase">
                              <th className="py-2.5 px-4 font-semibold">Tipo de Documento</th>
                              <th className="py-2.5 px-4 font-semibold">Estado</th>
                              <th className="py-2.5 px-4 font-semibold">Submetido em</th>
                              <th className="py-2.5 px-4 font-semibold text-right">Acção</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {documents.map((doc) => {
                              const label =
                                DOCUMENT_TYPES.find((d) => d.value === doc.document_type)?.[
                                  lang === 'pt' ? 'labelPt' : 'labelEn'
                                ] || doc.document_type;
                              return (
                                <tr key={doc.id} className="hover:bg-gray-50/70">
                                  <td className="py-3 px-4 font-medium text-[#0A192F]">{label}</td>
                                  <td className="py-3 px-4">
                                    <span
                                      className={`font-semibold ${
                                        doc.status === 'approved'
                                          ? 'text-emerald-700'
                                          : doc.status === 'rejected'
                                          ? 'text-red-700'
                                          : 'text-amber-700'
                                      }`}
                                    >
                                      {doc.status === 'approved'
                                        ? 'Aprovado'
                                        : doc.status === 'rejected'
                                        ? 'Rejeitado'
                                        : 'Pendente'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-gray-500 font-mono tabular-nums">
                                    {new Date(doc.created_at).toLocaleDateString('pt-PT')}
                                  </td>
                                  <td className="py-3 px-4 text-right">
                                    <button
                                      type="button"
                                      onClick={() => handlePreviewSignedDocument(doc)}
                                      className="inline-flex items-center gap-1 text-[#0F4C5C] font-semibold hover:underline"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      {lang === 'pt' ? 'Link Assinado' : 'Signed View'}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {isPublished && (
                    <FaciPayPremiumCheckout
                      businessId={business.id}
                      businessName={business.name}
                      isRenewal={business.plan === 'premium'}
                      lang={lang}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: REAL NOTIFICATIONS (notifications table)           */}
      {/* ========================================================= */}
      {subTab === 'notifications' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center justify-between pb-5 border-b border-gray-100 mb-6">
            <div>
              <h2 className="text-xl font-serif font-bold text-[#0A192F]">
                {lang === 'pt' ? 'Centro de Notificações Reais' : 'Notifications Center'}
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                {lang === 'pt'
                  ? 'Eventos gerados automaticamente pelos triggers de verificação, documentos e alterações de estado no Supabase.'
                  : 'Events automatically generated by Supabase verification, document, and status change triggers.'}
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-gray-500">
              {unreadNotificationsCount} {lang === 'pt' ? 'não lidas' : 'unread'}
            </span>
          </div>

          {notifications.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-700">
                {lang === 'pt' ? 'Sem notificações registadas' : 'No notifications recorded'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {lang === 'pt'
                  ? 'Receberá notificações automáticas quando submeter empresas, enviar documentos ou houver decisões de verificação.'
                  : 'You will receive automatic notifications on company submissions, document uploads, and verification decisions.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    !n.read_at ? 'bg-amber-50/40 -mx-4 px-4 rounded-xl' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                      <span className="font-semibold text-[#0F4C5C]">{n.event_type}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {new Date(n.created_at).toLocaleString('pt-PT')}
                      </span>
                      {!n.read_at && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-bold text-amber-700">{lang === 'pt' ? 'Nova' : 'New'}</span>
                        </>
                      )}
                    </div>
                    <h4 className="text-sm font-bold text-[#0A192F]">{n.title}</h4>
                    {n.body && <p className="text-xs text-gray-600 mt-1">{n.body}</p>}
                  </div>

                  {!n.read_at && (
                    <button
                      onClick={() => handleMarkNotificationRead(n.id)}
                      className="text-xs font-semibold text-[#0F4C5C] hover:underline whitespace-nowrap shrink-0"
                    >
                      {lang === 'pt' ? 'Marcar como lida' : 'Mark as read'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: ADMIN VERIFICATION & COUNTRY-SCOPED SUPERVISION    */}
      {/* ========================================================= */}
      {subTab === 'admin_verification' && (permissions.canViewVerificationConsole || permissions.canAccessAudit) && (
        <div className="space-y-8">
          {/* Verification Queue (Global Admin full mutation; Moderator / National Admin / Connect Manager country-scoped read-only) */}
          {permissions.canViewVerificationConsole && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-gray-100">
                <div>
                  <h2 className="text-xl font-serif font-bold text-[#0A192F]">
                    {permissions.canMutateVerification
                      ? lang === 'pt'
                        ? 'Consola de Validação Administrativa (Administrador Global)'
                        : 'Administrative Verification Console'
                      : lang === 'pt'
                      ? 'Supervisão Territorial de Empresas (Consulta por País)'
                      : 'Country-Scoped Business Supervision (Read-Only)'}
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    {permissions.canMutateVerification
                      ? lang === 'pt'
                        ? 'Valide dados fiscais privados, reveja documentos assinados e aprove empresas para publicação automática no Directório.'
                        : 'Validate private fiscal records, review signed documents, and approve companies for automatic Directory publishing.'
                      : lang === 'pt'
                      ? `Âmbito atribuído: ${
                          permissions.assignedCountries.length > 0
                            ? permissions.assignedCountries.join(', ')
                            : 'Nenhum país atribuído em connect_manager_assignments'
                        }.`
                      : `Assigned scope: ${
                          permissions.assignedCountries.length > 0
                            ? permissions.assignedCountries.join(', ')
                            : 'No countries assigned'
                        }.`}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5 bg-gray-100 p-1 rounded-lg text-xs">
                  {[
                    { id: 'all', label: 'Todas' },
                    { id: 'pending', label: 'Pendentes' },
                    { id: 'in_review', label: 'Em Análise' },
                    { id: 'approved', label: 'Aprovadas' },
                    { id: 'rejected', label: 'Rejeitadas' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setAdminStatusFilter(tab.id as any)}
                      className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                        adminStatusFilter === tab.id ? 'bg-white text-[#0A192F] shadow-sm' : 'text-gray-600'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {!permissions.canMutateVerification && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    {lang === 'pt'
                      ? 'Modo de Supervisão Limitado: decisões de aprovação, rejeição, suspensão e validação documental estão restritas ao Administrador Global (role = admin) até existir auditoria server-side e isolamento geográfico completo nas políticas RLS.'
                      : 'Limited Supervision Mode: approval, rejection, suspension, and document review are restricted to Global Admin (role = admin) until server-side audit and strict geographic RLS enforcement are in place.'}
                  </span>
                </div>
              )}

              {filteredAdminBundles.length === 0 ? (
                <div className="py-10 text-center text-xs text-gray-500">
                  {!permissions.isStrictAdmin && permissions.assignedCountries.length === 0
                    ? lang === 'pt'
                      ? 'Sem países activos atribuídos em connect_manager_assignments. Nenhuma empresa exibida.'
                      : 'No active countries assigned in connect_manager_assignments.'
                    : lang === 'pt'
                    ? 'Nenhuma candidatura encontrada para o filtro seleccionado no seu âmbito.'
                    : 'No submissions found for the selected filter within your scope.'}
                </div>
              ) : (
                <div className="space-y-5">
                  {filteredAdminBundles.map(({ business, privateData, documents }) => (
                    <div key={business.id} className="border border-gray-200 rounded-xl p-5 space-y-4">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-1">
                            <span className="font-bold text-[#0A192F]">{business.country_code}</span>
                            <span aria-hidden="true">·</span>
                            <span>{business.province}</span>
                            <span aria-hidden="true">·</span>
                            <span>{business.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {new Date(business.created_at).toLocaleDateString('pt-PT')}
                            </span>
                          </div>
                          <h3 className="text-lg font-serif font-bold text-[#0A192F]">{business.name}</h3>
                          <div className="mt-1">{renderStatusLabel(business.status, business.verification_status)}</div>
                        </div>

                        {permissions.canMutateVerification && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => handleAdminBusinessTransition(business, 'pending', 'pending')}
                              className="px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 transition-colors"
                            >
                              Marcar Em Análise
                            </button>
                            <button
                              onClick={() => handleAdminBusinessTransition(business, 'approved', 'verified')}
                              className="px-3.5 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 transition-colors"
                            >
                              Aprovar & Publicar no Directório
                            </button>
                            <button
                              onClick={() => handleAdminBusinessTransition(business, 'rejected', 'unverified')}
                              className="px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-red-800 text-xs font-semibold hover:bg-red-100 transition-colors"
                            >
                              Rejeitar
                            </button>
                            <button
                              onClick={() => handleAdminBusinessTransition(business, 'suspended', 'unverified')}
                              className="px-3 py-2 rounded-lg border border-gray-300 bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition-colors"
                            >
                              Suspender
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Private Data & Audit Reason Input */}
                      {(permissions.isStrictAdmin || permissions.isModerator) && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-gray-100 text-xs">
                          <div>
                            <span className="text-gray-500 block">NIF / Tax ID Privado:</span>
                            <span className="font-mono font-bold text-[#0A192F]">
                              {privateData?.nif || 'Não informado'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 block">Alvará / Licença:</span>
                            <span className="font-mono font-bold text-[#0A192F]">
                              {privateData?.license_number || 'Não informado'}
                            </span>
                          </div>
                          {permissions.canMutateVerification && (
                            <div>
                              <input
                                type="text"
                                value={adminReasons[business.id] || ''}
                                onChange={(e) =>
                                  setAdminReasons((prev) => ({ ...prev, [business.id]: e.target.value }))
                                }
                                placeholder="Justificação obrigatória para rejeitar/suspender; nota opcional para outras decisões..."
                                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:border-[#0F4C5C]"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Admin Document Review */}
                      {permissions.canMutateVerification ? (
                        <div className="pt-3 border-t border-gray-100">
                          <p className="text-xs font-semibold text-gray-500 mb-2">
                            Documentos Submetidos ({documents.length}):
                          </p>
                          {documents.length === 0 ? (
                            <p className="text-xs text-gray-400">Nenhum documento submetido.</p>
                          ) : (
                            <div className="space-y-2">
                              {documents.map((doc) => (
                                <div
                                  key={doc.id}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-gray-50 px-3 py-2 rounded-lg text-xs"
                                >
                                  <div>
                                    <span className="font-semibold text-[#0A192F]">{doc.document_type}</span>
                                    <span className="mx-2 text-gray-400">·</span>
                                    <span
                                      className={`font-semibold ${
                                        doc.status === 'approved'
                                          ? 'text-emerald-700'
                                          : doc.status === 'rejected'
                                          ? 'text-red-700'
                                          : 'text-amber-700'
                                      }`}
                                    >
                                      {doc.status}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handlePreviewSignedDocument(doc)}
                                      className="text-[#0F4C5C] font-semibold hover:underline"
                                    >
                                      Ver Documento
                                    </button>
                                    <button
                                      onClick={() => handleAdminDocDecision(doc, 'approved', business.country_code)}
                                      className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-semibold hover:bg-emerald-200"
                                    >
                                      Aprovar Doc
                                    </button>
                                    <button
                                      onClick={() => handleAdminDocDecision(doc, 'rejected', business.country_code)}
                                      className="px-2.5 py-1 rounded bg-red-100 text-red-800 font-semibold hover:bg-red-200"
                                    >
                                      Rejeitar Doc
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 pt-2 border-t border-gray-100">
                          Documentos legais privados e acções de validação acessíveis apenas ao Administrador Global (`role = admin`).
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Access Audit Trail (Append-only) */}
          {permissions.canAccessAudit && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <History className="w-5 h-5 text-[#0F4C5C]" />
                  <div>
                    <h3 className="text-lg font-serif font-bold text-[#0A192F]">
                      {lang === 'pt' ? 'Registo de Auditoria (access_audit · Append-Only)' : 'Audit Log (access_audit)'}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {lang === 'pt'
                        ? 'Histórico imutável de decisões administrativas, revisões de documentos e acessos por país.'
                        : 'Immutable log of administrative decisions, document reviews, and country-scoped actions.'}
                    </p>
                  </div>
                </div>

                <select
                  value={auditCountryFilter}
                  onChange={(e) => handleFilterAuditCountry(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-300 text-xs bg-white focus:outline-none focus:border-[#0F4C5C]"
                >
                  <option value="ALL">
                    {permissions.isStrictAdmin
                      ? 'Todos os Países'
                      : `Meus Países (${permissions.assignedCountries.join(', ')})`}
                  </option>
                  {permissions.isStrictAdmin ? (
                    <>
                      <option value="AO">Angola (AO)</option>
                      {internationalCountries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name_pt} ({c.code})
                        </option>
                      ))}
                    </>
                  ) : (
                    permissions.assignedCountries.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {auditLogs.length === 0 ? (
                <p className="text-xs text-gray-500 py-6 text-center">
                  {lang === 'pt' ? 'Nenhum evento de auditoria encontrado.' : 'No audit events found.'}
                </p>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase">
                        <th className="py-2.5 px-4 font-semibold">Data / Hora</th>
                        <th className="py-2.5 px-4 font-semibold">Acção</th>
                        <th className="py-2.5 px-4 font-semibold">Recurso</th>
                        <th className="py-2.5 px-4 font-semibold">País</th>
                        <th className="py-2.5 px-4 font-semibold">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                          <td className="py-2.5 px-4 font-mono tabular-nums text-gray-600 whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString('pt-PT')}
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-[#0A192F]">{log.action}</td>
                          <td className="py-2.5 px-4 font-mono text-gray-600">
                            {log.resource}
                            {log.resource_id ? ` (${log.resource_id.slice(0, 8)})` : ''}
                          </td>
                          <td className="py-2.5 px-4 font-mono font-semibold text-[#0F4C5C]">
                            {log.country_code || '—'}
                          </td>
                          <td className="py-2.5 px-4 text-gray-500 max-w-xs truncate font-mono">
                            {JSON.stringify(log.metadata)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Signed Document Inline Preview Modal (never uses window.open) */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-gray-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-serif font-bold text-[#0A192F]">{previewDoc.label}</h3>
                <p className="text-[11px] font-mono text-gray-500">{previewDoc.path} · URL Assinada (300s)</p>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden h-[60vh] flex items-center justify-center">
              {/\.(png|jpg|jpeg|webp)(\?|$)/i.test(previewDoc.path) ? (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.label}
                  referrerPolicy="no-referrer"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <iframe
                  src={previewDoc.url}
                  title={previewDoc.label}
                  className="w-full h-full border-0"
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <a
                href={previewDoc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F4C5C] hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {lang === 'pt' ? 'Abrir em novo separador' : 'Open in new tab'}
              </a>
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-5 py-2 rounded-lg bg-[#0A192F] text-white text-xs font-bold hover:bg-[#0F4C5C]"
              >
                {lang === 'pt' ? 'Fechar' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
