import { supabase } from '../lib/supabase';
import {
  AccessAuditLog,
  Business,
  BusinessDocument,
  BusinessPrivate,
  BusinessStatus,
  BusinessVerificationStatus,
  ConnectManagerAssignment,
  Country,
  DocumentStatus,
  NotificationItem,
  Profile,
} from '../types';

// Explicit field allowlists — never use select('*') for public or cross-entity queries
export const BUSINESS_OWNER_FIELDS =
  'id, owner_id, name, slug, category, subcategory, description, description_en, province, municipality, address, whatsapp, phone, email, website, logo_url, cover_url, gallery_urls, services, languages, status, verification_status, plan, is_featured, approved_at, country_code, created_at, updated_at';

export const BUSINESS_PRIVATE_FIELDS = 'business_id, nif, license_number, owner_notes, updated_at';
export const BUSINESS_DOCUMENT_FIELDS = 'id, business_id, document_type, storage_path, status, reviewed_by, reviewed_at, created_at';
export const NOTIFICATION_FIELDS = 'id, recipient_id, actor_id, business_id, event_type, entity_table, entity_id, title, body, metadata, created_at, read_at';
export const AUDIT_FIELDS = 'id, actor_id, action, resource, resource_id, country_code, metadata, created_at';

export const ANGOLA_PROVINCES = [
  'Luanda',
  'Benguela',
  'Huambo',
  'Huíla',
  'Cabinda',
  'Kwanza Sul',
  'Kwanza Norte',
  'Bié',
  'Cunene',
  'Kuando Kubango',
  'Lunda Norte',
  'Lunda Sul',
  'Malanje',
  'Moxico',
  'Namibe',
  'Uíge',
  'Zaire',
  'Icolo e Bengo',
  'Moxico Leste',
  'Cuando',
];

export const BUSINESS_SECTORS = [
  'Agricultura & Agro-indústria',
  'Comércio Geral & Distribuição',
  'Construção Civil & Imobiliário',
  'Consultoria & Serviços Corporativos',
  'Energia, Petróleo & Gás',
  'Indústria Transformadora',
  'Logística, Transportes & Portos',
  'Mineração & Recursos Minerais',
  'Saúde & Farmacêutica',
  'Tecnologia & Telecomunicações',
  'Turismo, Hotelaria & Restauração',
  'Finanças, Banca & Seguros',
];

// Values intentionally match the live business_documents.document_type CHECK constraint.
export const DOCUMENT_TYPES = [
  { value: 'license', labelPt: 'Alvará / Licença Comercial', labelEn: 'Commercial License' },
  { value: 'nif', labelPt: 'Cartão de Contribuinte (NIF / Certidão Fiscal)', labelEn: 'Tax Registration Certificate (NIF / Tax ID)' },
  { value: 'identity', labelPt: 'Identificação do Representante Legal', labelEn: 'Legal Representative ID' },
  { value: 'other', labelPt: 'Certidão de Registo Comercial, Procuração ou Pacto Social', labelEn: 'Commercial Registry Certificate, Power of Attorney or Articles of Association' },
];

export interface UserPermissions {
  profile: Profile | null;
  assignments: ConnectManagerAssignment[];
  isStrictAdmin: boolean; // role === 'admin' (is_platform_admin_only)
  isModerator: boolean; // role === 'moderator' (read/scoped only until server-side audit exists)
  isCountryManager: boolean; // role in ('national_admin', 'connect_manager') or active assignment
  assignedCountries: string[];
  canViewVerificationConsole: boolean;
  canMutateVerification: boolean; // Strictly role === 'admin'
  canAccessAudit: boolean;
}

export interface BusinessRegistrationPayload {
  name: string;
  country_code: string;
  province: string;
  municipality?: string;
  address?: string;
  category: string;
  subcategory?: string;
  description: string;
  description_en?: string;
  whatsapp?: string;
  phone?: string;
  email?: string;
  website?: string;
  services: string[];
  languages: string[];
}

export interface BusinessPrivatePayload {
  nif: string;
  license_number: string;
  owner_notes?: string;
}

export interface OwnerBusinessBundle {
  business: Business;
  privateData: BusinessPrivate | null;
  documents: BusinessDocument[];
}

export function sanitizePublicUrl(rawUrl?: string): string | undefined {
  if (!rawUrl || !rawUrl.trim()) return undefined;
  const trimmed = rawUrl.trim();
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function buildUniqueSlug(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || 'empresa'}-${suffix}`;
}

export async function fetchActiveCountries(): Promise<Country[]> {
  const { data, error } = await supabase
    .from('countries')
    .select('code, name_pt, name_en, region, is_active, created_at')
    .eq('is_active', true)
    .order('name_pt', { ascending: true });

  if (error || !data) {
    return [];
  }
  return data as Country[];
}

export async function syncOwnProfileAfterSignup(params: {
  userId: string;
  fullName: string;
  countryName: string;
  countryCode: string;
  phone?: string;
}): Promise<void> {
  // Never pass 'role' in client update (protected by profiles_role_guard & profiles_update_own)
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: params.fullName.trim(),
      country: params.countryName.trim(),
      country_code: params.countryCode,
      phone: params.phone?.trim() || null,
    })
    .eq('id', params.userId);

  if (error) {
    console.warn('Profile sync notice:', error.message);
  }
}

export async function fetchCurrentUserPermissions(userId: string): Promise<UserPermissions> {
  const [profileRes, assignRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, phone, country, country_code, role, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('connect_manager_assignments')
      .select('id, user_id, country_code, manager_role, status, assigned_by, assigned_at, updated_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .in('manager_role', ['national_admin', 'connect_manager']),
  ]);

  const profile = (profileRes.data as Profile) || null;
  const assignments = ((assignRes.data as ConnectManagerAssignment[]) || []).filter(
    (assignment) =>
      assignment.status === 'active' &&
      ['national_admin', 'connect_manager'].includes(assignment.manager_role)
  );
  const role = profile?.role;

  const isStrictAdmin = role === 'admin';
  const isModerator = role === 'moderator';
  const isCountryManager =
    role === 'national_admin' ||
    role === 'connect_manager' ||
    assignments.some((a) => ['national_admin', 'connect_manager'].includes(a.manager_role));

  const assignedCountries = Array.from(new Set(assignments.map((a) => a.country_code).filter(Boolean)));

  return {
    profile,
    assignments,
    isStrictAdmin,
    isModerator,
    isCountryManager,
    assignedCountries,
    canViewVerificationConsole: isStrictAdmin || isModerator || isCountryManager,
    // Security rule: restrict approval/rejection/suspension strictly to global admin until server-side audit exists
    canMutateVerification: isStrictAdmin,
    canAccessAudit: isStrictAdmin || assignedCountries.length > 0,
  };
}

export async function fetchMyBusinessBundles(ownerId: string): Promise<OwnerBusinessBundle[]> {
  const { data: businesses, error } = await supabase
    .from('businesses')
    .select(BUSINESS_OWNER_FIELDS)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const businessList = (businesses as Business[]) || [];
  if (businessList.length === 0) return [];

  const ids = businessList.map((b) => b.id);

  const [privateRes, docsRes] = await Promise.all([
    supabase.from('business_private').select(BUSINESS_PRIVATE_FIELDS).in('business_id', ids),
    supabase
      .from('business_documents')
      .select(BUSINESS_DOCUMENT_FIELDS)
      .in('business_id', ids)
      .order('created_at', { ascending: false }),
  ]);

  const privateMap = new Map<string, BusinessPrivate>();
  ((privateRes.data as BusinessPrivate[]) || []).forEach((p) => privateMap.set(p.business_id, p));

  const docsMap = new Map<string, BusinessDocument[]>();
  ((docsRes.data as BusinessDocument[]) || []).forEach((d) => {
    const existing = docsMap.get(d.business_id) || [];
    existing.push(d);
    docsMap.set(d.business_id, existing);
  });

  return businessList.map((b) => ({
    business: b,
    privateData: privateMap.get(b.id) || null,
    documents: docsMap.get(b.id) || [],
  }));
}

export async function registerBusinessWithPrivate(
  ownerId: string,
  payload: BusinessRegistrationPayload,
  privatePayload: BusinessPrivatePayload
): Promise<OwnerBusinessBundle> {
  const cleanWebsite = sanitizePublicUrl(payload.website);
  const slug = buildUniqueSlug(payload.name);

  // Strictly enforces businesses_owner_create RLS policy
  const { data: insertedBusiness, error: businessError } = await supabase
    .from('businesses')
    .insert({
      owner_id: ownerId,
      name: payload.name.trim(),
      slug,
      country_code: payload.country_code,
      province: payload.province.trim(),
      municipality: payload.municipality?.trim() || null,
      address: payload.address?.trim() || null,
      category: payload.category.trim(),
      subcategory: payload.subcategory?.trim() || null,
      description: payload.description.trim(),
      description_en: payload.description_en?.trim() || null,
      whatsapp: payload.whatsapp?.trim() || null,
      phone: payload.phone?.trim() || null,
      email: payload.email?.trim() || null,
      website: cleanWebsite || null,
      services: payload.services,
      languages: payload.languages.length > 0 ? payload.languages : ['pt'],
    })
    .select(BUSINESS_OWNER_FIELDS)
    .single();

  if (businessError || !insertedBusiness) {
    throw new Error(businessError?.message || 'Não foi possível registar a empresa.');
  }

  const business = insertedBusiness as Business;

  // Save sensitive legal identifiers exclusively in business_private (RLS owner/admin protected)
  const { data: insertedPrivate, error: privateError } = await supabase
    .from('business_private')
    .upsert({
      business_id: business.id,
      nif: privatePayload.nif.trim() || null,
      license_number: privatePayload.license_number.trim() || null,
      owner_notes: privatePayload.owner_notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .select(BUSINESS_PRIVATE_FIELDS)
    .single();

  if (privateError) {
    throw new Error(`Empresa criada, mas erro ao guardar dados legais privados: ${privateError.message}`);
  }

  return {
    business,
    privateData: (insertedPrivate as BusinessPrivate) || null,
    documents: [],
  };
}

export async function updatePendingBusinessWithPrivate(
  ownerId: string,
  businessId: string,
  payload: BusinessRegistrationPayload,
  privatePayload: BusinessPrivatePayload
): Promise<OwnerBusinessBundle> {
  const cleanWebsite = sanitizePublicUrl(payload.website);

  // Strictly satisfies businesses_owner_update RLS policy for pending/rejected resubmissions
  const { data: updatedBusiness, error: businessError } = await supabase
    .from('businesses')
    .update({
      name: payload.name.trim(),
      country_code: payload.country_code,
      province: payload.province.trim(),
      municipality: payload.municipality?.trim() || null,
      address: payload.address?.trim() || null,
      category: payload.category.trim(),
      subcategory: payload.subcategory?.trim() || null,
      description: payload.description.trim(),
      description_en: payload.description_en?.trim() || null,
      whatsapp: payload.whatsapp?.trim() || null,
      phone: payload.phone?.trim() || null,
      email: payload.email?.trim() || null,
      website: cleanWebsite || null,
      services: payload.services,
      languages: payload.languages.length > 0 ? payload.languages : ['pt'],
    })
    .eq('id', businessId)
    .eq('owner_id', ownerId)
    .select(BUSINESS_OWNER_FIELDS)
    .single();

  if (businessError || !updatedBusiness) {
    throw new Error(
      businessError?.message ||
        'Apenas empresas pendentes ou rejeitadas (não verificadas) podem ser editadas e resubmetidas pelo proprietário.'
    );
  }

  const { data: updatedPrivate, error: privateError } = await supabase
    .from('business_private')
    .upsert({
      business_id: businessId,
      nif: privatePayload.nif.trim() || null,
      license_number: privatePayload.license_number.trim() || null,
      owner_notes: privatePayload.owner_notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .select(BUSINESS_PRIVATE_FIELDS)
    .single();

  if (privateError) {
    throw new Error(privateError.message);
  }

  const { data: docs } = await supabase
    .from('business_documents')
    .select(BUSINESS_DOCUMENT_FIELDS)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  return {
    business: updatedBusiness as Business,
    privateData: (updatedPrivate as BusinessPrivate) || null,
    documents: (docs as BusinessDocument[]) || [],
  };
}

export async function uploadBusinessPhoto(
  businessId: string,
  file: File,
  kind: 'logo' | 'cover'
): Promise<string> {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Formato inválido. Use JPG, PNG ou WEBP para fotografias.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('A imagem excede o limite máximo de 5 MB.');
  }

  // Derive the stored extension from the accepted MIME type, not the user-supplied filename.
  const photoExtension: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const ext = photoExtension[file.type];
  const filePath = `${businessId}/${kind}_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('business-photos')
    .upload(filePath, file, { upsert: true });

  if (uploadError) {
    throw new Error(`Erro no envio da imagem (business-photos): ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from('business-photos').getPublicUrl(filePath);
  const publicUrl = publicUrlData.publicUrl;

  // Owners may update the image URL only. Administrative fields
  // (status, verification, plan and featuring) remain database-controlled.
  const updatePatch = kind === 'logo' ? { logo_url: publicUrl } : { cover_url: publicUrl };

  const { error: updateErr } = await supabase
    .from('businesses')
    .update(updatePatch)
    .eq('id', businessId);

  if (updateErr) {
    // Compensate for a failed database association to avoid leaving an
    // unreferenced public object behind.
    const { error: cleanupError } = await supabase.storage
      .from('business-photos')
      .remove([filePath]);

    if (cleanupError) {
      throw new Error(
        `Imagem carregada, mas não associada à empresa (${updateErr.message}) e a limpeza falhou (${cleanupError.message}). Ficheiro para revisão: ${filePath}`
      );
    }
    throw new Error(`Não foi possível associar a imagem à empresa (${updateErr.message}). O ficheiro temporário foi removido.`);
  }

  return publicUrl;
}

export async function submitPrivateDocument(
  businessId: string,
  documentType: string,
  file: File
): Promise<BusinessDocument> {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Formato não permitido. Envie PDF, JPG ou PNG para documentos legais.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('O documento excede o limite máximo de 10 MB.');
  }

  // Keep a sanitized display stem, but enforce the extension from the accepted MIME type.
  const documentExtension: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
  };
  const originalName = file.name.replace(/\.[^.]*$/, '');
  const safeName = originalName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) || 'documento';
  const storagePath = `${businessId}/${Date.now()}_${safeName}.${documentExtension[file.type]}`;

  const { error: uploadError } = await supabase.storage
    .from('business-documents')
    .upload(storagePath, file, { upsert: false });

  if (uploadError) {
    throw new Error(`Erro ao enviar documento para o cofre privado: ${uploadError.message}`);
  }

  // Strictly enforces documents_owner_submit RLS policy (status='pending', reviewed_by=null, reviewed_at=null)
  const { data: docRecord, error: insertError } = await supabase
    .from('business_documents')
    .insert({
      business_id: businessId,
      document_type: documentType,
      storage_path: storagePath,
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
    })
    .select(BUSINESS_DOCUMENT_FIELDS)
    .single();

  if (insertError || !docRecord) {
    // The Storage upload and metadata insert are separate requests. If the
    // database write fails, compensate by removing the just-uploaded object.
    const { error: cleanupError } = await supabase.storage
      .from('business-documents')
      .remove([storagePath]);

    const detail = insertError?.message || 'Erro ao registar metadados do documento.';
    if (cleanupError) {
      throw new Error(
        `Não foi possível registar o documento (${detail}) nem remover o ficheiro órfão (${cleanupError.message}). Caminho para revisão administrativa: ${storagePath}`
      );
    }
    throw new Error(`${detail} O ficheiro temporário foi removido do armazenamento.`);
  }

  return docRecord as BusinessDocument;
}

export async function createSignedDocumentLink(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('business-documents')
    .createSignedUrl(storagePath, 300);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Não foi possível gerar link assinado temporário.');
  }
  return data.signedUrl;
}

export async function fetchUserNotifications(userId: string): Promise<NotificationItem[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_FIELDS)
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }
  return (data as NotificationItem[]) || [];
}

export async function markNotificationAsRead(userId: string, notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('recipient_id', userId);

  if (error) {
    throw new Error(error.message);
  }
}

// =========================================================================
// GOVERNANCE, COUNTRY-SCOPED SUPERVISION & STRICT ADMIN VERIFICATION
// =========================================================================

export async function fetchBusinessesForGovernance(
  permissions: UserPermissions
): Promise<OwnerBusinessBundle[]> {
  if (!permissions.canViewVerificationConsole) {
    throw new Error('Acesso negado: perfil sem permissões de supervisão ou verificação.');
  }

  // Fail-closed geographic scope for non-global-admin roles
  if (!permissions.isStrictAdmin && permissions.assignedCountries.length === 0) {
    return [];
  }

  let query = supabase
    .from('businesses')
    .select(BUSINESS_OWNER_FIELDS)
    .order('created_at', { ascending: false });

  if (!permissions.isStrictAdmin) {
    query = query.in('country_code', permissions.assignedCountries);
  }

  const { data: businesses, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const businessList = (businesses as Business[]) || [];
  if (businessList.length === 0) return [];

  const ids = businessList.map((b) => b.id);

  // Only global admin or moderator (RLS is_platform_admin) may read business_private;
  // only global admin (is_platform_admin_only) may read business_documents.
  const privatePromise =
    permissions.isStrictAdmin || permissions.isModerator
      ? supabase.from('business_private').select(BUSINESS_PRIVATE_FIELDS).in('business_id', ids)
      : Promise.resolve({ data: [], error: null });

  const docsPromise = permissions.isStrictAdmin
    ? supabase
        .from('business_documents')
        .select(BUSINESS_DOCUMENT_FIELDS)
        .in('business_id', ids)
        .order('created_at', { ascending: false })
    : Promise.resolve({ data: [], error: null });

  const [privateRes, docsRes] = await Promise.all([privatePromise, docsPromise]);

  const privateMap = new Map<string, BusinessPrivate>();
  ((privateRes.data as BusinessPrivate[]) || []).forEach((p) => privateMap.set(p.business_id, p));

  const docsMap = new Map<string, BusinessDocument[]>();
  ((docsRes.data as BusinessDocument[]) || []).forEach((d) => {
    const existing = docsMap.get(d.business_id) || [];
    existing.push(d);
    docsMap.set(d.business_id, existing);
  });

  return businessList.map((b) => ({
    business: b,
    privateData: privateMap.get(b.id) || null,
    documents: docsMap.get(b.id) || [],
  }));
}

export async function adminReviewDocument(
  adminId: string,
  isStrictAdmin: boolean,
  doc: BusinessDocument,
  nextStatus: DocumentStatus,
  _countryCode: string
): Promise<BusinessDocument> {
  if (!isStrictAdmin) {
    throw new Error('Operação bloqueada: apenas role = admin pode validar documentos e registar auditoria.');
  }

  const { data, error } = await supabase
    .from('business_documents')
    .update({
      status: nextStatus,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', doc.id)
    .select(BUSINESS_DOCUMENT_FIELDS)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Erro ao actualizar o estado do documento.');
  }

  return data as BusinessDocument;
}

export async function adminTransitionBusinessState(params: {
  adminId: string;
  isStrictAdmin: boolean;
  business: Business;
  nextStatus: BusinessStatus;
  nextVerificationStatus: BusinessVerificationStatus;
  reason?: string;
}): Promise<Business> {
  const { isStrictAdmin, business, nextStatus, nextVerificationStatus } = params;

  if (!isStrictAdmin) {
    throw new Error(
      'Operação bloqueada: aprovação, rejeição e suspensão estão limitadas a role = admin até existir auditoria server-side para moderadores.'
    );
  }

  const isPublishing = nextStatus === 'approved' && nextVerificationStatus === 'verified';
  const updatePayload: Record<string, unknown> = {
    status: nextStatus,
    verification_status: nextVerificationStatus,
    approved_at: isPublishing ? business.approved_at || new Date().toISOString() : business.approved_at,
  };

  const { data, error } = await supabase
    .from('businesses')
    .update(updatePayload)
    .eq('id', business.id)
    .select(BUSINESS_OWNER_FIELDS)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Erro ao actualizar estado de verificação da empresa.');
  }

  return data as Business;
}

export async function fetchAuditLogs(
  permissions: UserPermissions,
  countryFilter?: string
): Promise<AccessAuditLog[]> {
  if (!permissions.canAccessAudit) {
    return [];
  }

  let query = supabase
    .from('access_audit')
    .select(AUDIT_FIELDS)
    .order('created_at', { ascending: false })
    .limit(100);

  if (!permissions.isStrictAdmin) {
    if (permissions.assignedCountries.length === 0) return [];
    if (countryFilter && countryFilter !== 'ALL') {
      if (!permissions.assignedCountries.includes(countryFilter)) {
        return [];
      }
      query = query.eq('country_code', countryFilter);
    } else {
      query = query.in('country_code', permissions.assignedCountries);
    }
  } else if (countryFilter && countryFilter !== 'ALL') {
    query = query.eq('country_code', countryFilter);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }
  return (data as AccessAuditLog[]) || [];
}
