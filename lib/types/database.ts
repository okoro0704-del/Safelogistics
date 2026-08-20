export type UserRole = "admin" | "customer" | "master_admin";

export type DeliveryStatus =
  | "pending"
  | "in_transit"
  | "at_stop"
  | "delivered"
  | "cancelled"
  | "delayed";

export type StopStatus = "upcoming" | "current" | "completed";

export type LocationEventType =
  | "created"
  | "origin"
  | "departed"
  | "arrived"
  | "at_stop"
  | "delivered"
  | "cancelled"
  | "delayed"
  | "status_change";

export type CompanyStatus = "active" | "suspended";

export type DomainOrder = {
  id: string;
  company_id: string;
  company_domain_id: string | null;
  domain: string;
  normalized_domain: string;
  years: number;
  namecheap_order_id: string | null;
  cost_cents: number | null;
  currency: string;
  status: "pending" | "purchased" | "failed" | "cancelled";
  contact_snapshot: Record<string, unknown> | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyEmailDomain = {
  id: string;
  company_id: string;
  domain: string;
  normalized_domain: string;
  resend_domain_id: string | null;
  status: "pending" | "verified" | "failed";
  last_error: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyMailbox = {
  id: string;
  company_id: string;
  email_domain_id: string;
  local_part: string;
  full_address: string;
  mailbox_type: "app_inbox";
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type EmailThreadFolder = "inbox" | "sent" | "drafts" | "spam";

export type EmailThread = {
  id: string;
  company_id: string;
  mailbox_id: string | null;
  subject: string;
  participants: unknown;
  folder: EmailThreadFolder;
  is_read: boolean;
  customer_id: string | null;
  customer_folder: EmailThreadFolder;
  customer_is_read: boolean;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

export type EmailMessage = {
  id: string;
  company_id: string;
  thread_id: string;
  mailbox_id: string | null;
  direction: "inbound" | "outbound";
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string;
  text_body: string | null;
  html_body: string | null;
  resend_email_id: string | null;
  resend_inbound_id: string | null;
  provider_message_id: string | null;
  raw_headers: Record<string, unknown> | null;
  created_at: string;
};

export type EmailMessageAttachment = {
  id: string;
  message_id: string;
  company_id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  created_at: string;
};

export type CompanyBranding = {
  company_id: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  tagline: string | null;
  support_email: string | null;
  website_url: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicCompanyBranding = {
  company_name: string;
  company_slug: string;
  logo_url?: string | null;
  favicon_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  tagline?: string | null;
  support_email?: string | null;
  website_url?: string | null;
};

export type Profile = {
  id: string;
  company_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export type Company = {
  id: string;
  name: string;
  slug: string;
  status: CompanyStatus;
  description: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  primary_color: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyDomainStatus =
  | "pending"
  | "provisioning"
  | "verifying"
  | "active"
  | "disabled"
  | "failed";

export type CompanyDomain = {
  id: string;
  company_id: string;
  domain: string;
  normalized_domain: string;
  is_primary: boolean;
  status: CompanyDomainStatus;
  verification_token: string;
  verified_at: string | null;
  last_verification_attempt_at: string | null;
  created_at: string;
  updated_at: string;
  dns_provider?: string | null;
  hosting_provider?: string | null;
  dns_status?: string | null;
  hosting_status?: string | null;
  ssl_status?: string | null;
  last_error?: string | null;
  last_checked_at?: string | null;
  activated_at?: string | null;
  dns_target_record_id?: string | null;
  dns_txt_record_id?: string | null;
  hosting_domain_id?: string | null;
  provider_zone_id?: string | null;
  acquisition_source?: "manual" | "namecheap" | null;
  registrar_order_id?: string | null;
  expires_at?: string | null;
};

export type CompanySettings = {
  company_id: string;
  timezone: string;
  currency: string;
  support_email: string | null;
  support_phone: string | null;
  website_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Delivery = {
  id: string;
  company_id: string;
  customer_id: string;
  tracking_number: string;
  reference_number: string | null;
  description: string | null;
  weight: number | null;
  origin_name: string;
  origin_latitude: number;
  origin_longitude: number;
  destination_name: string;
  destination_latitude: number;
  destination_longitude: number;
  current_stop_id: string | null;
  status: DeliveryStatus;
  estimated_delivery_at: string | null;
  movement_started_at: string | null;
  movement_duration_minutes: number | null;
  movement_from_stop_id: string | null;
  movement_to_stop_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DeliveryMovement = {
  started_at: string;
  duration_minutes: number;
  ends_at: string;
  from: {
    id?: string;
    name: string;
    latitude: number;
    longitude: number;
    stop_order: number;
  };
  to: {
    id?: string;
    name: string;
    latitude: number;
    longitude: number;
    stop_order: number;
  };
};

export type DeliveryStop = {
  id: string;
  delivery_id: string;
  name: string;
  latitude: number;
  longitude: number;
  stop_order: number;
  status: StopStatus;
  arrived_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DeliveryLocationHistory = {
  id: string;
  delivery_id: string;
  stop_id: string | null;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  event_type: LocationEventType;
  notes: string | null;
  created_at: string;
};

export type DeliveryWithRelations = Delivery & {
  customer: Pick<Profile, "id" | "full_name" | "email" | "phone"> | null;
  current_stop: Pick<
    DeliveryStop,
    "id" | "name" | "stop_order" | "status"
  > | null;
};

export type CustomerWithStats = Profile & {
  delivery_count: number;
};

export type DashboardStats = {
  totalDeliveries: number;
  pending: number;
  inTransit: number;
  atStop: number;
  delivered: number;
  cancelled: number;
  delayed: number;
  totalCustomers: number;
};

export type RouteStopInput = {
  name: string;
  latitude: number;
  longitude: number;
};

export type PublicTrackingStop = {
  name: string;
  stop_order: number;
  status?: StopStatus;
  arrived_at?: string | null;
  completed_at?: string | null;
  latitude?: number;
  longitude?: number;
};

export type PublicTrackingTimelineItem = {
  location_name: string;
  event_type: LocationEventType;
  created_at: string;
};

export type PublicTrackingResult =
  | {
      found: false;
      message: string;
    }
  | {
      found: true;
      tracking_number: string;
      status: DeliveryStatus;
      origin: {
        name: string;
        latitude: number;
        longitude: number;
      };
      destination: {
        name: string;
        latitude: number;
        longitude: number;
      };
      current_location: PublicTrackingStop | null;
      current_stop: {
        name: string;
        stop_order: number;
        status: StopStatus;
        arrived_at: string | null;
        latitude?: number;
        longitude?: number;
      } | null;
      completed_stops: PublicTrackingStop[];
      upcoming_stops: PublicTrackingStop[];
      timeline: PublicTrackingTimelineItem[];
      estimated_delivery_at: string | null;
      last_updated: string;
      branding?: PublicCompanyBranding | null;
      movement?: DeliveryMovement | null;
    };

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & {
          id: string;
          full_name: string;
          email: string;
          role: UserRole;
        };
        Update: Partial<Profile>;
        Relationships: [];
      };
      companies: {
        Row: Company;
        Insert: Partial<Company> & { name: string; slug: string };
        Update: Partial<Company>;
        Relationships: [];
      };
      company_branding: {
        Row: CompanyBranding;
        Insert: Partial<CompanyBranding> & { company_id: string };
        Update: Partial<CompanyBranding>;
        Relationships: [];
      };
      company_settings: {
        Row: CompanySettings;
        Insert: Partial<CompanySettings> & { company_id: string };
        Update: Partial<CompanySettings>;
        Relationships: [];
      };
      company_domains: {
        Row: CompanyDomain;
        Insert: Partial<CompanyDomain> & {
          company_id: string;
          domain: string;
          normalized_domain: string;
          verification_token: string;
        };
        Update: Partial<CompanyDomain>;
        Relationships: [];
      };
      domain_orders: {
        Row: DomainOrder;
        Insert: Partial<DomainOrder> & {
          company_id: string;
          domain: string;
          normalized_domain: string;
        };
        Update: Partial<DomainOrder>;
        Relationships: [];
      };
      company_email_domains: {
        Row: CompanyEmailDomain;
        Insert: Partial<CompanyEmailDomain> & {
          company_id: string;
          domain: string;
          normalized_domain: string;
        };
        Update: Partial<CompanyEmailDomain>;
        Relationships: [];
      };
      company_mailboxes: {
        Row: CompanyMailbox;
        Insert: Partial<CompanyMailbox> & {
          company_id: string;
          email_domain_id: string;
          local_part: string;
          full_address: string;
        };
        Update: Partial<CompanyMailbox>;
        Relationships: [];
      };
      email_threads: {
        Row: EmailThread;
        Insert: Partial<EmailThread> & {
          company_id: string;
          subject?: string;
        };
        Update: Partial<EmailThread>;
        Relationships: [];
      };
      email_messages: {
        Row: EmailMessage;
        Insert: Partial<EmailMessage> & {
          company_id: string;
          thread_id: string;
          direction: "inbound" | "outbound";
          from_address: string;
        };
        Update: Partial<EmailMessage>;
        Relationships: [];
      };
      email_message_attachments: {
        Row: EmailMessageAttachment;
        Insert: Partial<EmailMessageAttachment> & {
          message_id: string;
          company_id: string;
          filename: string;
        };
        Update: Partial<EmailMessageAttachment>;
        Relationships: [];
      };
      distributor_provision_requests: {
        Row: {
          idempotency_key: string;
          client_id: string;
          distributor_id: string;
          product_sku: string;
          request_hash: string;
          company_id: string | null;
          admin_email: string | null;
          response_json: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          idempotency_key: string;
          client_id: string;
          distributor_id: string;
          product_sku: string;
          request_hash: string;
          company_id?: string | null;
          admin_email?: string | null;
          response_json: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<{
          client_id: string;
          distributor_id: string;
          product_sku: string;
          request_hash: string;
          company_id: string | null;
          admin_email: string | null;
          response_json: Record<string, unknown>;
        }>;
        Relationships: [];
      };
      deliveries: {
        Row: Delivery;
        Insert: Partial<Delivery> & {
          company_id: string;
          customer_id: string;
          origin_name: string;
          origin_latitude: number;
          origin_longitude: number;
          destination_name: string;
          destination_latitude: number;
          destination_longitude: number;
        };
        Update: Partial<Delivery>;
        Relationships: [];
      };
      delivery_stops: {
        Row: DeliveryStop;
        Insert: Partial<DeliveryStop> & {
          delivery_id: string;
          name: string;
          latitude: number;
          longitude: number;
          stop_order: number;
        };
        Update: Partial<DeliveryStop>;
        Relationships: [];
      };
      delivery_location_history: {
        Row: DeliveryLocationHistory;
        Insert: Partial<DeliveryLocationHistory> & {
          delivery_id: string;
          location_name: string;
          event_type: LocationEventType;
        };
        Update: Partial<DeliveryLocationHistory>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_public_tracking: {
        Args: { p_tracking_number: string; p_company_id?: string | null };
        Returns: PublicTrackingResult;
      };
      create_delivery_with_stops: {
        Args: {
          p_customer_id: string;
          p_stops: RouteStopInput[];
          p_reference_number?: string | null;
          p_description?: string | null;
          p_weight?: number | null;
          p_estimated_delivery_at?: string | null;
        };
        Returns: Delivery;
      };
      proceed_to_next_stop: {
        Args: { p_delivery_id: string };
        Returns: unknown;
      };
      schedule_delivery_movement: {
        Args: {
          p_delivery_id: string;
          p_starts_at: string;
          p_duration_minutes: number;
        };
        Returns: unknown;
      };
      finalize_delivery_movement_if_due: {
        Args: {
          p_delivery_id?: string | null;
          p_tracking_number?: string | null;
        };
        Returns: unknown;
      };
      update_delivery_status: {
        Args: {
          p_delivery_id: string;
          p_status: DeliveryStatus;
          p_notes?: string | null;
        };
        Returns: Delivery;
      };
      replace_delivery_stops: {
        Args: { p_delivery_id: string; p_stops: RouteStopInput[] };
        Returns: DeliveryStop[];
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      admin_register_customer_profile: {
        Args: {
          p_user_id: string;
          p_full_name: string;
          p_email: string;
          p_phone?: string | null;
        };
        Returns: Profile;
      };
      is_master_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      auth_company_is_active: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      master_platform_stats: {
        Args: Record<string, never>;
        Returns: {
          companies: number;
          active_companies: number;
          suspended_companies: number;
          total_deliveries: number;
          active_deliveries: number;
          total_admins: number;
          total_customers: number;
        };
      };
      master_register_company_with_admin: {
        Args: {
          p_company_name: string;
          p_company_slug: string;
          p_admin_user_id: string;
          p_admin_full_name: string;
          p_admin_email: string;
          p_admin_phone?: string | null;
          p_company_email?: string | null;
          p_company_phone?: string | null;
        };
        Returns: { company: Company; admin: Profile };
      };
      master_register_company_admin: {
        Args: {
          p_company_id: string;
          p_admin_user_id: string;
          p_admin_full_name: string;
          p_admin_email: string;
          p_admin_phone?: string | null;
        };
        Returns: Profile;
      };
      master_set_company_status: {
        Args: {
          p_company_id: string;
          p_status: CompanyStatus;
        };
        Returns: Company;
      };
      master_upsert_company_branding: {
        Args: {
          p_company_id: string;
          p_logo_url?: string | null;
          p_favicon_url?: string | null;
          p_primary_color?: string | null;
          p_secondary_color?: string | null;
          p_accent_color?: string | null;
          p_tagline?: string | null;
          p_support_email?: string | null;
          p_website_url?: string | null;
          p_clear_logo?: boolean;
          p_clear_favicon?: boolean;
        };
        Returns: CompanyBranding;
      };
      master_upsert_company_settings: {
        Args: {
          p_company_id: string;
          p_timezone?: string;
          p_currency?: string;
          p_support_email?: string | null;
          p_support_phone?: string | null;
          p_website_url?: string | null;
        };
        Returns: CompanySettings;
      };
      master_provision_company: {
        Args: {
          p_company_name: string;
          p_company_slug: string;
          p_admin_user_id: string;
          p_admin_full_name: string;
          p_admin_email: string;
          p_admin_phone?: string | null;
          p_company_description?: string | null;
          p_company_email?: string | null;
          p_company_phone?: string | null;
          p_timezone?: string;
          p_currency?: string;
          p_support_email?: string | null;
          p_support_phone?: string | null;
          p_website_url?: string | null;
          p_primary_color?: string | null;
          p_secondary_color?: string | null;
          p_accent_color?: string | null;
          p_tagline?: string | null;
        };
        Returns: {
          company: Company;
          admin: Profile;
          settings: CompanySettings;
          branding: CompanyBranding | null;
        };
      };
      service_provision_company: {
        Args: {
          p_company_name: string;
          p_company_slug: string;
          p_admin_user_id: string;
          p_admin_full_name: string;
          p_admin_email: string;
          p_admin_phone?: string | null;
          p_company_description?: string | null;
          p_company_email?: string | null;
          p_company_phone?: string | null;
          p_timezone?: string;
          p_currency?: string;
          p_support_email?: string | null;
          p_support_phone?: string | null;
          p_website_url?: string | null;
          p_primary_color?: string | null;
          p_secondary_color?: string | null;
          p_accent_color?: string | null;
          p_tagline?: string | null;
        };
        Returns: {
          company: Company;
          admin: Profile;
          settings: CompanySettings;
          branding: CompanyBranding | null;
        };
      };
      master_rollback_company_provision: {
        Args: { p_company_id: string };
        Returns: null;
      };
      resolve_tenant_by_hostname: {
        Args: { p_hostname: string };
        Returns: {
          company_id: string;
          company_name: string;
          company_slug: string;
          company_status: string;
          domain_id: string;
          domain: string;
          is_primary: boolean;
        } | null;
      };
      resolve_tenant_by_slug: {
        Args: { p_slug: string };
        Returns: {
          company_id: string;
          company_name: string;
          company_slug: string;
          company_status: string;
          domain_id: string | null;
          domain: string;
          is_primary: boolean;
        } | null;
      };
      master_create_domain_order: {
        Args: {
          p_company_id: string;
          p_domain: string;
          p_years?: number;
          p_cost_cents?: number | null;
          p_currency?: string;
          p_contact_snapshot?: Record<string, unknown> | null;
        };
        Returns: DomainOrder;
      };
      master_complete_domain_order: {
        Args: {
          p_order_id: string;
          p_status: string;
          p_namecheap_order_id?: string | null;
          p_company_domain_id?: string | null;
          p_last_error?: string | null;
          p_expires_at?: string | null;
        };
        Returns: DomainOrder;
      };
      master_upsert_company_email_domain: {
        Args: {
          p_company_id: string;
          p_domain: string;
          p_resend_domain_id?: string | null;
          p_status?: string;
          p_last_error?: string | null;
        };
        Returns: CompanyEmailDomain;
      };
      master_ensure_default_mailbox: {
        Args: {
          p_email_domain_id: string;
          p_local_part?: string;
        };
        Returns: CompanyMailbox;
      };
      master_add_company_domain: {
        Args: {
          p_company_id: string;
          p_domain: string;
          p_verification_token: string;
        };
        Returns: CompanyDomain;
      };
      master_mark_domain_verified: {
        Args: { p_domain_id: string };
        Returns: CompanyDomain;
      };
      master_set_domain_status: {
        Args: {
          p_domain_id: string;
          p_status: CompanyDomainStatus;
        };
        Returns: CompanyDomain;
      };
      master_set_primary_domain: {
        Args: { p_domain_id: string };
        Returns: CompanyDomain;
      };
      master_touch_domain_verification_attempt: {
        Args: { p_domain_id: string };
        Returns: CompanyDomain;
      };
      master_set_domain_lifecycle: {
        Args: {
          p_domain_id: string;
          p_status: CompanyDomainStatus;
          p_dns_status?: string | null;
          p_hosting_status?: string | null;
          p_ssl_status?: string | null;
          p_last_error?: string | null;
          p_dns_target_record_id?: string | null;
          p_dns_txt_record_id?: string | null;
          p_hosting_domain_id?: string | null;
          p_provider_zone_id?: string | null;
          p_dns_provider?: string | null;
          p_hosting_provider?: string | null;
          p_clear_error?: boolean;
        };
        Returns: CompanyDomain;
      };
      master_reset_company_branding: {
        Args: { p_company_id: string };
        Returns: null;
      };
      get_public_company_branding: {
        Args: { p_company_id: string };
        Returns: PublicCompanyBranding | null;
      };
    };
    Enums: {
      user_role: UserRole;
      delivery_status: DeliveryStatus;
      stop_status: StopStatus;
      location_event_type: LocationEventType;
      company_status: CompanyStatus;
      company_domain_status: CompanyDomainStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
