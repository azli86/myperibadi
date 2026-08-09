export interface TransactionDetail {
  id: number
  reference_id?: string | null
  user_id: string
  wallet_id: number
  wallet_name: string
  type: string
  txn_date: string
  txn_time?: string | null
  vendor_or_source: string
  amount: number
  category_id: number | null
  subscription_id?: number | null
  linked_loan_name?: string | null
  linked_subscription_name?: string | null
  category_name: string | null
  category_icon_name?: string | null
  category_is_internal?: boolean
  category_system_code?: string | null
  is_wallet_transfer?: boolean
  is_debt_movement?: boolean
  is_refund?: boolean
  has_been_refunded?: boolean
  refund_reference_id?: string | null
  refund_txn_date?: string | null
  notes: string | null
  source_channel: string | null
  created_at: string | null
  items?: {
    id: number
    name: string
    quantity: number
    unit_price: number
    subtotal: number
    sort_order?: number
  }[]
  attachments?: {
    id: number
    file_name: string
    mime_type: string | null
    size_bytes: number | null
    proxy_url: string
    direct_url?: string | null
    created_at: string
  }[]
}

export interface CategoryOption {
  id: number
  name: string
  kind: string
  icon_name?: string | null
}

export interface WalletOption {
  id: number
  name: string
  label?: string | null
  image_url?: string
}

export interface LoanOption {
  id: number
  name: string
}

export interface SubscriptionOption {
  id: number
  name: string
}

export type EditItem = {
  name: string
  quantity: string
  unit_price: string
}

export interface UserProfile {
  id: string | number
  name?: string | null
  email?: string | null
  phone?: string | null
}

export type ReceiptPdfImage = {
  fileName: string
  data: Uint8Array
  width: number
  height: number
}
