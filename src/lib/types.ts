export type SupportCase = {
  id: string;
  folio: string;
  support_type: 'technical' | 'programming';
  support_agent_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  performed_by: string;
  manufacturer: string;
  printer_model: string;
  part_number: string | null;
  serial_number: string;
  sale_date: string | null;
  warranty_end_date: string | null;
  programming_business_days: number | null;
  status: 'open' | 'closed' | 'pending';
  issue_summary: string;
  resolution_notes: string | null;
  repair_required: boolean;
  repair_request_note: string | null;
  repair_approval_status: 'pending' | 'accepted' | 'declined' | null;
  repair_approval_requested_at: string | null;
  repair_approval_deadline: string | null;
  repair_decided_at: string | null;
  repair_approval_response_source: 'customer' | 'automatic' | null;
  repair_approval_pin: string | null;
  repair_quote_pdf_path: string | null;
  repair_quote_pdf_name: string | null;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

export type SupportEvent = {
  id: string;
  support_case_id: string;
  event_type: 'ticket_created' | 'remote_support_scheduled' | 'diagnosis' | 'repair' | 'closed' | 'note';
  support_event_type_id: string | null;
  title: string;
  event_note: string | null;
  event_date: string;
  status_email_last_attempt_at: string | null;
  status_email_sent_at: string | null;
  status_email_sent_by: string | null;
  status_email_sent_by_email: string | null;
  status_email_last_error: string | null;
  ticket_reference: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  created_at: string;
  support_event_types?: {
    name: string;
    description: string | null;
  } | null;
};

export type SupportImage = {
  id: string;
  support_case_id: string;
  bucket_id: string;
  storage_path: string;
  original_name: string | null;
  mime_type: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  sort_order: number;
  created_at: string;
};

export type SupportCaseWithEvents = SupportCase & {
  support_events: SupportEvent[];
  support_images: SupportImage[];
};

export type SupportCustomer = {
  id: string;
  full_name: string;
  full_name_normalized: string;
  email: string | null;
  phone: string | null;
  last_used_at: string;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

export type Manufacturer = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SupportAgent = {
  id: string;
  full_name: string;
  position: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PrinterModel = {
  id: string;
  manufacturer_id: string;
  name: string;
  part_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SupportEventType = {
  id: string;
  name: string;
  code: string;
  event_type: SupportEvent['event_type'];
  support_type: SupportCase['support_type'];
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type SupportMailerSettings = {
  id: string;
  provider: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_username: string;
  smtp_password: string;
  sender_email: string;
  sender_name: string;
  reply_to_email: string | null;
  subject_template: string | null;
  text_template: string | null;
  html_template: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PrinterModelWithManufacturer = PrinterModel & {
  manufacturers?: Pick<Manufacturer, 'id' | 'name'> | null;
};

export type InventoryProduct = {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  warehouse_id: string | null;
  unit: 'pieza' | 'metro' | 'equipo' | 'caja';
  condition: 'active' | 'bone' | 'inactive';
  quantity: number;
  minimum_stock: number;
  required_quantity: number;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryMovement = {
  id: string;
  batch_id: string | null;
  product_id: string;
  warehouse_id: string | null;
  source_warehouse_id: string | null;
  destination_warehouse_id: string | null;
  movement_type: 'input' | 'output' | 'adjustment' | 'transfer';
  quantity: number;
  previous_quantity: number | null;
  next_quantity: number | null;
  reason: string | null;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
};

export type InventoryMovementWithProduct = InventoryMovement & {
  inventory_products?: Pick<InventoryProduct, 'id' | 'name' | 'category' | 'unit' | 'sku' | 'barcode'> | null;
};

export type InventoryMovementBatch = {
  id: string;
  movement_type: InventoryMovement['movement_type'];
  warehouse_id: string | null;
  source_warehouse_id: string | null;
  destination_warehouse_id: string | null;
  item_count: number;
  total_quantity: number;
  reason: string | null;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
};

export type InventoryMovementBatchWithItems = InventoryMovementBatch & {
  inventory_movements?: InventoryMovementWithProduct[];
};

export type InventoryWarehouse = {
  id: string;
  name: string;
  code: string;
  location: string | null;
  is_active: boolean;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryStock = {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  updated_at: string;
};

export type InventoryStockWithWarehouse = InventoryStock & {
  inventory_warehouses?: Pick<InventoryWarehouse, 'id' | 'name' | 'code'> | null;
};

export type PolicyHours = 10 | 20 | 30 | 40 | 50;

export type PolicyClient = {
  id: string;
  full_name: string;
  curp: string;
  business_name: string;
  address: string;
  policy_hours: PolicyHours;
  additional_hours: number;
  rfc: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_by_email: string | null;
  archived_at: string | null;
  archived_until: string | null;
  created_at: string;
  updated_at: string;
};

export type PolicyService = {
  id: string;
  client_id: string;
  service_type: 'Programación' | 'Soporte Remoto' | 'Soporte Tectronic' | 'Instalación' | 'Software' | 'Mantenimiento';
  start_at: string;
  end_at: string;
  duration_hours: number;
  notes: string | null;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

export type PolicyClientWithServices = PolicyClient & {
  policy_services?: PolicyService[];
};

export type AdminUserRole =
  | 'sales_agent'
  | 'manager'
  | 'marketing_agent'
  | 'support_agent'
  | 'purchase_agent'
  | 'owner';

export type AdminUserStatus = 'active' | 'inactive';

export const ADMIN_USER_ROLE_LABELS: Record<AdminUserRole, string> = {
  sales_agent: 'Agente de ventas',
  manager: 'Gerente',
  marketing_agent: 'Agente de marketing',
  support_agent: 'Agente de soporte',
  purchase_agent: 'Agente de compras',
  owner: 'Propietario',
};

export type AdminModulePermission = {
  id: string;
  user_id: string;
  email: string;
  user_type: 'owner' | 'user';
  full_name: string | null;
  role: AdminUserRole;
  is_active: boolean;
  can_access_supports: boolean;
  can_access_inventory: boolean;
  can_access_policies: boolean;
  can_access_reports: boolean;
  can_access_purchases: boolean;
  can_access_marketing: boolean;
  can_access_forms: boolean;
  can_access_calculator: boolean;
  can_access_quoting: boolean;
  can_access_shipping_quotes: boolean;
  created_by: string | null;
  updated_by: string | null;
  odoo_user_id: number | null;
  odoo_partner_id: number | null;
  odoo_salesperson_id: number | null;
  odoo_email: string | null;
  odoo_link_status: 'unlinked' | 'linked' | 'ambiguous' | 'not_found' | 'manual';
  odoo_linked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminModuleKey =
  | 'supports'
  | 'inventory'
  | 'policies'
  | 'reports'
  | 'purchases'
  | 'marketing'
  | 'forms'
  | 'calculator'
  | 'quoting'
  | 'shipping_quotes';
export type AdminVisibilityScope = 'all' | 'own';

export type AdminModulePermissionItem = {
  id: string;
  permission_id: string;
  user_id: string;
  module_key: AdminModuleKey;
  can_access: boolean;
  visibility_scope: AdminVisibilityScope;
  actions: {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
    export: boolean;
  };
  created_at: string;
  updated_at: string;
};

export type AdminUserModulePermissions = AdminModulePermission & {
  module_permissions: AdminModulePermissionItem[];
};

export type ReportPreference = {
  id: string;
  user_id: string;
  module_key: 'reports';
  filters: Record<string, unknown>;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SharedSalesReportRow = {
  id: string;
  token: string;
  owner_user_id: string;
  company_name: string;
  seller_name: string | null;
  title: string;
  report_period: string;
  report_html: string;
  score: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type MarketingReportExportRow = {
  id: string;
  created_by: string;
  title: string;
  period_start: string;
  period_end: string;
  period_label: string;
  report_html: string;
  snapshot: Record<string, unknown>;
  created_at: string;
};

export type FormStatus = 'draft' | 'published' | 'closed';
export type FormTheme = 'terracotta' | 'ocean' | 'forest' | 'sand' | 'graphite';
export type FormQuestionType =
  | 'short_text'
  | 'long_text'
  | 'single_choice'
  | 'multiple_choice'
  | 'dropdown'
  | 'rating';

export type CustomFormRow = {
  id: string;
  owner_user_id: string;
  title: string;
  description: string;
  slug: string;
  status: FormStatus;
  theme: FormTheme;
  submit_label: string;
  thank_you_title: string;
  thank_you_message: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type FormQuestionRow = {
  id: string;
  form_id: string;
  label: string;
  help_text: string;
  question_type: FormQuestionType;
  is_required: boolean;
  options: string[];
  placeholder: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type FormResponseRow = {
  id: string;
  form_id: string;
  respondent_name: string | null;
  respondent_email: string | null;
  answers: Record<string, unknown>;
  submitted_at: string;
  user_agent: string | null;
};

export type FormNotificationRow = {
  id: string;
  user_id: string;
  form_id: string;
  response_id: string | null;
  title: string;
  message: string;
  answers: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
};

export type CustomFormWithQuestions = CustomFormRow & {
  form_questions: FormQuestionRow[];
};

export type SalesAgentNotificationRow = {
  id: string;
  user_id: string;
  seller_email: string;
  fingerprint: string;
  category:
    | 'inactive_client'
    | 'declining_client'
    | 'low_conversion'
    | 'new_customer_gap'
    | 'expired_quotes'
    | 'crm_lead'
    | 'cross_sell'
    | 'sales_decline'
    | 'portfolio_concentration';
  severity: 'info' | 'opportunity' | 'warning' | 'critical';
  title: string;
  message: string;
  recommendation: string;
  entity_type: 'client' | 'crm_lead' | 'portfolio' | 'quotation';
  entity_key: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  dismissed_at: string | null;
  first_detected_at: string;
  last_detected_at: string;
  created_at: string;
  updated_at: string;
};

export type ShippingQuoteSettings = {
  id: string;
  provider: 'fedex';
  fedex_base_url: string;
  fedex_origin_postal_code: string | null;
  fedex_client_id: string | null;
  fedex_client_secret: string | null;
  fedex_account_number: string | null;
  fedex_child_key: string | null;
  fedex_child_secret: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ShippingMode =
  | 'FACTORY_PACKAGE'
  | 'LOOSE_ITEM'
  | 'MASTER_CARTON'
  | 'SHIP_SEPARATELY';

export type ShippingProductProfile = {
  id: string;
  odoo_product_id: number;
  sku: string;
  product_name: string;
  unit_weight_kg: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  shipping_mode: ShippingMode;
  packed_weight_kg: number | null;
  packed_length_cm: number | null;
  packed_width_cm: number | null;
  packed_height_cm: number | null;
  units_per_master_carton: number | null;
  can_rotate: boolean;
  stackable: boolean;
  fragile: boolean;
  can_combine: boolean;
  product_family: string | null;
  packaging_group: string | null;
  max_units_per_package: number | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type ShippingBox = {
  id: string;
  name: string;
  inner_length_cm: number;
  inner_width_cm: number;
  inner_height_cm: number;
  outer_length_cm: number;
  outer_width_cm: number;
  outer_height_cm: number;
  empty_weight_kg: number;
  padding_weight_kg: number;
  max_weight_kg: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type ShippingCarrierEnvironment = 'SANDBOX' | 'PRODUCTION';
export type ShippingWeightInputMode = 'NET_CONTENT' | 'GROSS_PACKAGE';
export type ShippingDimensionUnit = 'CM' | 'IN';
export type ShippingWeightUnit = 'KG' | 'LB';
export type ShippingQuoteStatus = 'SUCCESS' | 'ERROR';

export type ShippingCarrierConfig = {
  id: string;
  carrier: 'FEDEX';
  environment: ShippingCarrierEnvironment;
  is_active: boolean;
  fedex_base_url: string;
  account_number_masked: string | null;
  client_id_masked: string | null;
  origin_country_code: string;
  origin_postal_code: string | null;
  origin_state_code: string | null;
  origin_city: string | null;
  origin_street: string | null;
  preferred_currency: string;
  pickup_type: string;
  return_transit_times: boolean;
  rate_request_types: string[];
  rate_display_option: string;
  weight_input_mode: ShippingWeightInputMode;
  final_volume_padding_enabled: boolean;
  final_padding_length_cm: number;
  final_padding_width_cm: number;
  final_padding_height_cm: number;
  final_packaging_cost_enabled: boolean;
  final_packaging_material_cost: number;
  created_at: string;
  updated_at: string;
};

export type ShippingPackageType = {
  id: string;
  carrier: 'FEDEX';
  name: string;
  internal_code: string;
  description: string | null;
  length: number | null;
  width: number | null;
  height: number | null;
  internal_length?: number | null;
  internal_width?: number | null;
  internal_height?: number | null;
  external_length?: number | null;
  external_width?: number | null;
  external_height?: number | null;
  max_fill_percent?: number | null;
  box_cost?: number | null;
  dimension_unit: ShippingDimensionUnit;
  empty_weight: number | null;
  weight_unit: ShippingWeightUnit;
  max_weight: number | null;
  is_active: boolean;
  sort_order: number;
  fedex_packaging_type: string;
  created_at: string;
  updated_at: string;
};

export type ShippingProductDimension = {
  id: string;
  sku: string;
  normalized_sku: string;
  product_name: string | null;
  unit_weight_kg: number | null;
  volumetric_weight_kg: number | null;
  billable_weight_kg: number | null;
  width_cm: number;
  length_cm: number;
  height_cm: number;
  source_file_name: string | null;
  source_row: number | null;
  uploaded_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ShippingAddressSnapshot = {
  countryCode: string;
  postalCode: string;
  stateOrProvinceCode: string | null;
  city: string | null;
  neighborhood?: string | null;
  street: string | null;
};

export type ShippingQuoteRow = {
  id: string;
  quote_number: string;
  user_id: string;
  user_email: string | null;
  carrier: 'FEDEX';
  environment: ShippingCarrierEnvironment;
  status: ShippingQuoteStatus;
  calculation_method: 'MULTI_PACKAGE_RATE' | 'INDIVIDUAL_PACKAGE_SUM';
  origin: ShippingAddressSnapshot;
  destination: ShippingAddressSnapshot;
  requested_ship_date: string | null;
  package_count: number;
  total_content_weight: number;
  total_billable_weight: number;
  weight_unit: ShippingWeightUnit;
  best_rate_id: string | null;
  best_total_amount: number | null;
  best_currency: string | null;
  best_service_code: string | null;
  best_service_name: string | null;
  best_delivery_label: string | null;
  error_message: string | null;
  technical_error: string | null;
  odoo_order_name?: string | null;
  odoo_order_id?: number | null;
  selected_packing_plan?: Record<string, unknown> | null;
  packing_source?: string | null;
  created_at: string;
  updated_at: string;
};

export type ShippingQuotePackageRow = {
  id: string;
  quote_id: string;
  package_type_id: string | null;
  package_snapshot: Record<string, unknown>;
  package_index: number;
  content_weight: number;
  tare_weight: number;
  billable_weight: number;
  weight_unit: ShippingWeightUnit;
  length: number;
  width: number;
  height: number;
  dimension_unit: ShippingDimensionUnit;
  created_at: string;
};

export type ShippingQuoteRateRow = {
  id: string;
  quote_id: string;
  carrier: 'FEDEX';
  service_code: string;
  service_name: string;
  currency: string;
  base_amount: number | null;
  discount_amount: number | null;
  surcharge_amount: number | null;
  tax_amount: number | null;
  total_amount: number;
  transit_days: number | null;
  estimated_delivery_date: string | null;
  delivery_timestamp: string | null;
  delivery_label: string | null;
  rate_type: string | null;
  raw_summary: Record<string, unknown>;
  created_at: string;
};

export type ShippingQuoteDetail = ShippingQuoteRow & {
  packages: ShippingQuotePackageRow[];
  rates: ShippingQuoteRateRow[];
};

export type Database = {
  public: {
    Tables: {
      support_cases: {
        Row: SupportCase;
        Insert: Omit<SupportCase, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<SupportCase, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      support_events: {
        Row: SupportEvent;
        Insert: Omit<SupportEvent, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<SupportEvent, 'id' | 'created_at'>>;
        Relationships: [
          {
            foreignKeyName: 'support_events_support_case_id_fkey';
            columns: ['support_case_id'];
            isOneToOne: false;
            referencedRelation: 'support_cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_events_support_event_type_id_fkey';
            columns: ['support_event_type_id'];
            isOneToOne: false;
            referencedRelation: 'support_event_types';
            referencedColumns: ['id'];
          },
        ];
      };
      support_customers: {
        Row: SupportCustomer;
        Insert: Omit<SupportCustomer, 'id' | 'created_at' | 'updated_at' | 'full_name_normalized'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<SupportCustomer, 'id' | 'created_at' | 'updated_at' | 'full_name_normalized'>>;
        Relationships: [];
      };
      support_images: {
        Row: SupportImage;
        Insert: Omit<SupportImage, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<SupportImage, 'id' | 'created_at'>>;
        Relationships: [
          {
            foreignKeyName: 'support_images_support_case_id_fkey';
            columns: ['support_case_id'];
            isOneToOne: false;
            referencedRelation: 'support_cases';
            referencedColumns: ['id'];
          },
        ];
      };
      support_mailer_settings: {
        Row: SupportMailerSettings;
        Insert: Omit<SupportMailerSettings, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<SupportMailerSettings, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      manufacturers: {
        Row: Manufacturer;
        Insert: Omit<Manufacturer, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Manufacturer, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      support_agents: {
        Row: SupportAgent;
        Insert: Omit<SupportAgent, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<SupportAgent, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      printer_models: {
        Row: PrinterModel;
        Insert: Omit<PrinterModel, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<PrinterModel, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [
          {
            foreignKeyName: 'printer_models_manufacturer_id_fkey';
            columns: ['manufacturer_id'];
            isOneToOne: false;
            referencedRelation: 'manufacturers';
            referencedColumns: ['id'];
          },
        ];
      };
      support_event_types: {
        Row: SupportEventType;
        Insert: Omit<SupportEventType, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<SupportEventType, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [
        ];
      };
      inventory_products: {
        Row: InventoryProduct;
        Insert: Omit<InventoryProduct, 'id' | 'created_at' | 'updated_at' | 'quantity'> & {
          id?: string;
          quantity?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<InventoryProduct, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      inventory_warehouses: {
        Row: InventoryWarehouse;
        Insert: Omit<InventoryWarehouse, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<InventoryWarehouse, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      inventory_stock: {
        Row: InventoryStock;
        Insert: Omit<InventoryStock, 'id' | 'updated_at'> & {
          id?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<InventoryStock, 'id'>>;
        Relationships: [
          {
            foreignKeyName: 'inventory_stock_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_stock_warehouse_id_fkey';
            columns: ['warehouse_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_warehouses';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_movements: {
        Row: InventoryMovement;
        Insert: Omit<InventoryMovement, 'id' | 'created_at' | 'previous_quantity' | 'next_quantity'> & {
          id?: string;
          created_at?: string;
          previous_quantity?: number | null;
          next_quantity?: number | null;
        };
        Update: Partial<Omit<InventoryMovement, 'id' | 'created_at'>>;
        Relationships: [
          {
            foreignKeyName: 'inventory_movements_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_movements_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_movement_batches';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_movement_batches: {
        Row: InventoryMovementBatch;
        Insert: Omit<InventoryMovementBatch, 'id' | 'created_at' | 'item_count' | 'total_quantity'> & {
          id?: string;
          created_at?: string;
          item_count?: number;
          total_quantity?: number;
        };
        Update: Partial<Omit<InventoryMovementBatch, 'id' | 'created_at'>>;
        Relationships: [
          {
            foreignKeyName: 'inventory_movement_batches_warehouse_id_fkey';
            columns: ['warehouse_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_warehouses';
            referencedColumns: ['id'];
          },
        ];
      };
      policy_clients: {
        Row: PolicyClient;
        Insert: Omit<PolicyClient, 'id' | 'created_at' | 'updated_at' | 'additional_hours' | 'archived_at' | 'archived_until'> & {
          id?: string;
          additional_hours?: number;
          archived_at?: string | null;
          archived_until?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<PolicyClient, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      policy_services: {
        Row: PolicyService;
        Insert: Omit<PolicyService, 'id' | 'created_at' | 'updated_at' | 'duration_hours' | 'service_type' | 'notes'> & {
          id?: string;
          duration_hours?: number;
          service_type?: PolicyService['service_type'];
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<PolicyService, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [
          {
            foreignKeyName: 'policy_services_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'policy_clients';
            referencedColumns: ['id'];
          },
        ];
      };
      admin_module_permissions: {
        Row: AdminModulePermission;
        Insert: Omit<AdminModulePermission, 'id' | 'created_at' | 'updated_at' | 'full_name' | 'role' | 'is_active' | 'created_by' | 'updated_by' | 'odoo_user_id' | 'odoo_partner_id' | 'odoo_salesperson_id' | 'odoo_email' | 'odoo_link_status' | 'odoo_linked_at' | 'can_access_purchases' | 'can_access_marketing' | 'can_access_forms' | 'can_access_shipping_quotes'> & {
          id?: string;
          full_name?: string | null;
          role?: AdminUserRole;
          is_active?: boolean;
          created_by?: string | null;
          updated_by?: string | null;
          odoo_user_id?: number | null;
          odoo_partner_id?: number | null;
          odoo_salesperson_id?: number | null;
          odoo_email?: string | null;
          odoo_link_status?: AdminModulePermission['odoo_link_status'];
          odoo_linked_at?: string | null;
          can_access_purchases?: boolean;
          can_access_marketing?: boolean;
          can_access_forms?: boolean;
          can_access_shipping_quotes?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<AdminModulePermission, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      admin_module_permission_items: {
        Row: AdminModulePermissionItem;
        Insert: Omit<AdminModulePermissionItem, 'id' | 'created_at' | 'updated_at' | 'actions'> & {
          id?: string;
          actions?: AdminModulePermissionItem['actions'];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<AdminModulePermissionItem, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      report_preferences: {
        Row: ReportPreference;
        Insert: Omit<ReportPreference, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ReportPreference, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      shared_sales_reports: {
        Row: SharedSalesReportRow;
        Insert: Omit<SharedSalesReportRow, 'id' | 'token' | 'is_active' | 'created_at' | 'updated_at'> & {
          id?: string;
          token?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<SharedSalesReportRow, 'id' | 'token' | 'owner_user_id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      marketing_report_exports: {
        Row: MarketingReportExportRow;
        Insert: Omit<MarketingReportExportRow, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<MarketingReportExportRow, 'id' | 'created_by' | 'created_at'>>;
        Relationships: [];
      };
      sales_agent_notifications: {
        Row: SalesAgentNotificationRow;
        Insert: Omit<SalesAgentNotificationRow, 'id' | 'is_read' | 'dismissed_at' | 'first_detected_at' | 'created_at' | 'updated_at'> & {
          id?: string;
          is_read?: boolean;
          dismissed_at?: string | null;
          first_detected_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<SalesAgentNotificationRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      forms: {
        Row: CustomFormRow;
        Insert: Omit<CustomFormRow, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<CustomFormRow, 'id' | 'created_at'>>;
        Relationships: [];
      };
      form_questions: {
        Row: FormQuestionRow;
        Insert: Omit<FormQuestionRow, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<FormQuestionRow, 'id' | 'form_id' | 'created_at'>>;
        Relationships: [];
      };
      form_responses: {
        Row: FormResponseRow;
        Insert: Omit<FormResponseRow, 'id' | 'submitted_at'> & {
          id?: string;
          submitted_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      form_notifications: {
        Row: FormNotificationRow;
        Insert: Omit<FormNotificationRow, 'id' | 'is_read' | 'created_at'> & {
          id?: string;
          is_read?: boolean;
          created_at?: string;
        };
        Update: Partial<Pick<FormNotificationRow, 'is_read'>>;
        Relationships: [];
      };
      shipping_quote_settings: {
        Row: ShippingQuoteSettings;
        Insert: Omit<ShippingQuoteSettings, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ShippingQuoteSettings, 'id' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
      shipping_product_dimensions: {
        Row: ShippingProductDimension;
        Insert: Omit<ShippingProductDimension, 'id' | 'normalized_sku' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ShippingProductDimension, 'id' | 'normalized_sku' | 'created_at' | 'updated_at'>>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      respond_to_repair_approval: {
        Args: {
          p_support_case_id: string;
          p_pin: string;
          p_decision: string;
        };
        Returns: {
          id: string;
          repair_approval_status: string;
          repair_decided_at: string;
          repair_approval_response_source: string;
        }[];
      };
      delete_support_event: {
        Args: {
          p_support_event_id: string;
        };
        Returns: {
          support_case_id: string;
          removed_repair_request: boolean;
        }[];
      };
      get_shared_sales_report: {
        Args: {
          p_token: string;
        };
        Returns: Array<{
          id: string;
          token: string;
          company_name: string;
          seller_name: string | null;
          title: string;
          report_period: string;
          report_html: string;
          score: number | null;
          created_at: string;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
