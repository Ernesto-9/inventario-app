export type LocationType = 'almacén' | 'obra' | 'vehículo' | 'empleado' | 'otro'
export type MovementType = 'entrada' | 'salida' | 'transferencia' | 'ajuste'
export type UserRole = 'admin' | 'supervisor' | 'trabajador'
export type AttachmentType = 'foto' | 'factura' | 'documento'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Location {
  id: string
  name: string
  type: LocationType
  description: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
}

export interface Category {
  id: string
  name: string
  color: string
  created_at: string
}

export interface Item {
  id: string
  name: string
  description: string | null
  sku: string | null
  unit: string
  category_id: string | null
  min_stock: number
  track_stock: boolean
  photo_url: string | null
  variant_info: string | null
  aliases: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  // joins
  categories?: Category | null
}

export interface Stock {
  id: string
  item_id: string
  location_id: string
  quantity: number
  updated_at: string
}

export interface Movement {
  id: string
  type: MovementType
  item_id: string
  quantity: number
  origin_location_id: string | null
  destination_location_id: string | null
  notes: string | null
  unit_cost: number | null
  reference_number: string | null
  supplier: string | null
  responsible_id: string | null
  recipient_name: string | null
  razon_social: 'IPC' | 'Empresarial' | 'Arrendamiento' | 'Naian' | 'Carolina' | 'Jr' | 'Adriana' | null
  source_movement_id: string | null
  created_by: string
  created_at: string
  // joins
  items?: Pick<Item, 'id' | 'name' | 'unit'>
  origin_location?: Pick<Location, 'id' | 'name' | 'type'> | null
  destination_location?: Pick<Location, 'id' | 'name' | 'type'> | null
  responsible?: Pick<Profile, 'id' | 'full_name'> | null
  created_by_profile?: Pick<Profile, 'id' | 'full_name'>
  movement_attachments?: MovementAttachment[]
}

export interface MovementAttachment {
  id: string
  movement_id: string
  type: AttachmentType
  file_url: string
  file_name: string
  file_size: number | null
  uploaded_by: string | null
  created_at: string
}

export interface ItemAttachment {
  id: string
  item_id: string
  type: AttachmentType
  file_url: string
  file_name: string
  file_size: number | null
  uploaded_by: string | null
  created_at: string
}

export interface CashFund {
  id: string
  name: string
  location_id: string | null
  user_id: string | null
  balance: number
  description: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
}

export interface CashTransaction {
  id: string
  fund_id: string
  type: 'depósito' | 'gasto'
  amount: number
  description: string
  movement_id: string | null
  reference_number: string | null
  created_by: string
  created_at: string
}

// View types
export interface StockTotal {
  item_id: string
  item_name: string
  unit: string
  min_stock: number
  track_stock: boolean
  sku: string | null
  category_name: string | null
  category_color: string | null
  total_quantity: number
  is_low_stock: boolean
}

export interface StockByLocation {
  id: string
  item_id: string
  item_name: string
  unit: string
  sku: string | null
  location_id: string
  location_name: string
  location_type: LocationType
  quantity: number
  updated_at: string
}

export type PurchaseRequestStatus = 'pendiente' | 'en_proceso' | 'completada' | 'cancelada'
export type PurchaseRequestItemStatus = 'pendiente' | 'comprado'

export interface PurchaseRequest {
  id: string
  created_by: string
  location_id: string
  status: PurchaseRequestStatus
  notes: string | null
  created_at: string
  updated_at: string
  // joins
  locations?: Pick<Location, 'id' | 'name' | 'type'> | null
  profiles?: Pick<Profile, 'id' | 'full_name'> | null
  purchase_request_items?: PurchaseRequestItem[]
}

export interface PurchaseRequestItem {
  id: string
  request_id: string
  item_id: string | null
  item_name: string
  quantity: number
  unit: string | null
  notes: string | null
  status: PurchaseRequestItemStatus
  assigned_supplier: string | null
  actual_unit_cost: number | null
  purchased_quantity: number | null
  created_at: string
  // joins
  items?: Pick<Item, 'id' | 'name' | 'unit'> | null
}

export interface SupplierItemHistory {
  supplier: string
  item_id: string
  item_name: string
  unit: string
  unit_cost: number
  created_at: string
}

export interface Supplier {
  id: string
  name: string
  phone: string | null
  whatsapp_phone: string | null
  notes: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ItemSupplier {
  id: string
  item_id: string
  supplier_id: string
  created_at: string
  // joins
  items?: Pick<Item, 'id' | 'name' | 'unit'> | null
  suppliers?: Pick<Supplier, 'id' | 'name' | 'phone' | 'whatsapp_phone'> | null
}

export type QuotationStatus = 'abierta' | 'cerrada'

export interface Quotation {
  id: string
  name: string | null
  notes: string | null
  status: QuotationStatus
  created_by: string
  created_at: string
  updated_at: string
  // joins
  quotation_items?: QuotationItem[]
  profiles?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface QuotationItem {
  id: string
  quotation_id: string
  item_id: string
  quantity: number
  unit: string | null
  notes: string | null
  created_at: string
  // joins
  items?: Pick<Item, 'id' | 'name' | 'unit'> | null
}

export interface Vehicle {
  id: string
  name: string
  is_active: boolean
  created_at: string
}

export interface FuelEntry {
  id: string
  vehicle_id: string
  fuel_type: 'diesel' | 'gasolina'
  liters: number
  total_cost: number
  price_per_liter: number
  date: string
  payment_source: 'fondo' | 'otro'
  cash_fund_id: string | null
  photo_url: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  // joins
  vehicles?: Pick<Vehicle, 'id' | 'name'>
  cash_funds?: Pick<CashFund, 'id' | 'name'> | null
}

// Generic Supabase Database type (used by createClient)
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Omit<Profile, 'created_at' | 'updated_at'>; Update: Partial<Profile>; Relationships: [] }
      locations: { Row: Location; Insert: Omit<Location, 'id' | 'created_at'>; Update: Partial<Location>; Relationships: [] }
      categories: { Row: Category; Insert: Omit<Category, 'id' | 'created_at'>; Update: Partial<Category>; Relationships: [] }
      items: { Row: Item; Insert: Omit<Item, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Item>; Relationships: [] }
      stock: { Row: Stock; Insert: Omit<Stock, 'id'>; Update: Partial<Stock>; Relationships: [] }
      movements: { Row: Movement; Insert: Omit<Movement, 'id' | 'created_at'>; Update: Partial<Movement>; Relationships: [] }
      movement_attachments: { Row: MovementAttachment; Insert: Omit<MovementAttachment, 'id' | 'created_at'>; Update: Partial<MovementAttachment>; Relationships: [] }
      item_attachments: { Row: ItemAttachment; Insert: Omit<ItemAttachment, 'id' | 'created_at'>; Update: Partial<ItemAttachment>; Relationships: [] }
      cash_funds: { Row: CashFund; Insert: Omit<CashFund, 'id' | 'created_at'>; Update: Partial<CashFund>; Relationships: [] }
      cash_transactions: { Row: CashTransaction; Insert: Omit<CashTransaction, 'id' | 'created_at'>; Update: Partial<CashTransaction>; Relationships: [] }
      purchase_requests: { Row: PurchaseRequest; Insert: Omit<PurchaseRequest, 'id' | 'created_at' | 'updated_at'>; Update: Partial<PurchaseRequest>; Relationships: [] }
      purchase_request_items: { Row: PurchaseRequestItem; Insert: Omit<PurchaseRequestItem, 'id' | 'created_at'>; Update: Partial<PurchaseRequestItem>; Relationships: [] }
      suppliers: { Row: Supplier; Insert: Omit<Supplier, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Supplier>; Relationships: [] }
      item_suppliers: { Row: ItemSupplier; Insert: Omit<ItemSupplier, 'id' | 'created_at'>; Update: Partial<ItemSupplier>; Relationships: [] }
      quotations: { Row: Quotation; Insert: Omit<Quotation, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Quotation>; Relationships: [] }
      quotation_items: { Row: QuotationItem; Insert: Omit<QuotationItem, 'id' | 'created_at'>; Update: Partial<QuotationItem>; Relationships: [] }
      vehicles: { Row: Vehicle; Insert: Omit<Vehicle, 'id' | 'created_at'>; Update: Partial<Vehicle>; Relationships: [] }
      fuel_entries: { Row: FuelEntry; Insert: Omit<FuelEntry, 'id' | 'created_at' | 'price_per_liter'>; Update: Partial<FuelEntry>; Relationships: [] }
    }
    Views: {
      stock_totals: { Row: StockTotal; Relationships: [] }
      stock_by_location: { Row: StockByLocation; Relationships: [] }
      supplier_item_history: { Row: SupplierItemHistory; Relationships: [] }
    }
    Functions: {
      create_movement: {
        Args: {
          p_type: MovementType
          p_item_id: string
          p_quantity: number
          p_origin_location_id?: string
          p_destination_location_id?: string
          p_notes?: string
          p_unit_cost?: number
          p_reference_number?: string
          p_responsible_id?: string
          p_supplier?: string
          p_recipient_name?: string
        }
        Returns: string
      }
      get_my_role: { Args: Record<never, never>; Returns: UserRole }
      admin_clear_stock: {
        Args: { p_item_id: string; p_location_id: string }
        Returns: void
      }
    }
    Enums: {
      location_type: LocationType
      movement_type: MovementType
      user_role: UserRole
      attachment_type: AttachmentType
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
