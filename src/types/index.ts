export type UserRole =
  | 'admin'
  | 'moderator'
  | 'national_admin'
  | 'connect_manager'
  | 'business_owner'
  | 'investor_or_partner'
  | 'customer';

export interface Profile {
  id: string;
  full_name: string;
  phone?: string;
  country: string;
  country_code: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Country {
  code: string;
  name_pt: string;
  name_en: string;
  region: string;
  is_active: boolean;
  created_at: string;
}

export type BusinessStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type BusinessVerificationStatus = 'unverified' | 'pending' | 'verified';
export type BusinessPlan = 'free' | 'premium' | 'enterprise';

export interface Business {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  category: string;
  subcategory?: string;
  description: string;
  description_en?: string;
  province: string;
  municipality?: string;
  address?: string;
  whatsapp?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo_url?: string;
  cover_url?: string;
  gallery_urls: string[];
  services: string[];
  languages: string[];
  status: BusinessStatus;
  verification_status: BusinessVerificationStatus;
  plan: BusinessPlan;
  is_featured: boolean;
  approved_at?: string;
  pilot_start_date?: string;
  pilot_end_date?: string;
  country_code: string;
  created_at: string;
  updated_at: string;
}

export interface BusinessPrivate {
  business_id: string;
  nif?: string | null;
  license_number?: string | null;
  owner_notes?: string | null;
  updated_at: string;
}

export type DocumentStatus = 'pending' | 'approved' | 'rejected';

export interface BusinessDocument {
  id: string;
  business_id: string;
  document_type: string;
  storage_path: string;
  status: DocumentStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  recipient_id: string;
  actor_id?: string | null;
  business_id?: string | null;
  event_type: string;
  entity_table: string;
  entity_id?: string | null;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  created_at: string;
  read_at?: string | null;
}

export interface AccessAuditLog {
  id: string;
  actor_id?: string | null;
  action: string;
  resource: string;
  resource_id?: string | null;
  country_code?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ConnectManagerAssignment {
  id: string;
  user_id: string;
  country_code: string;
  manager_role: string;
  status: string;
  assigned_by?: string | null;
  assigned_at: string;
  updated_at: string;
}

export interface BusinessCatalogItem {
  id: string;
  business_id: string;
  item_type: 'product' | 'service';
  name: string;
  description: string;
  category?: string;
  price_aoa?: number;
  price_mode: 'fixed' | 'from' | 'quote';
  stock_quantity?: number;
  availability: 'available' | 'unavailable' | 'on_request';
  image_url?: string;
  is_featured: boolean;
  display_order: number;
}

export interface BusinessOpportunity {
  id: string;
  business_id: string;
  created_by: string;
  title: string;
  description: string;
  sector: string;
  opportunity_type: string;
  target_country_codes: string[];
  budget_min?: number;
  budget_max?: number;
  currency: string;
  deadline?: string;
  visibility: 'public' | 'connections';
  status: 'draft' | 'published' | 'closed' | 'archived';
  created_at: string;
}

export interface InvestorProfile {
  id: string;
  user_id: string;
  investor_type: string;
  organisation_name?: string;
  country_code: string;
  bio: string;
  website?: string;
  contact_email?: string;
  investment_min?: number;
  investment_max?: number;
  currency: string;
  visibility: 'private' | 'public';
  verification_status: 'pending' | 'verified' | 'rejected';
}

export interface EventItem {
  id: string;
  created_by: string;
  country_code: string;
  title: string;
  description: string;
  event_type: string;
  venue?: string;
  city?: string;
  starts_at: string;
  ends_at: string;
  capacity?: number;
  status: 'draft' | 'published' | 'completed';
}
