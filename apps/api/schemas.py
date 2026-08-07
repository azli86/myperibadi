from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Any
from datetime import date, datetime

class UserBase(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    language: Optional[str] = "BM"

class UserCreate(UserBase):
    password: str
    turnstile_token: Optional[str] = None

class OnboardingRequest(BaseModel):
    language: Optional[str] = "BM"
    timezone: Optional[str] = "Asia/Kuala_Lumpur"
    time_format: Optional[str] = "24h"
    category_mode: str  # 'bm' | 'en' | 'manual'

class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    language: Optional[str] = None
    show_hero_amounts: Optional[bool] = None
    theme_mode: Optional[str] = Field(default=None, max_length=12)
    bot_personality: Optional[str] = Field(default=None, max_length=160)
    cycle_start_day: Optional[int] = Field(default=None, ge=1, le=28)
    cycle_mode: Optional[str] = Field(default=None, pattern="^(day|category)$")


class EmailChangeRequest(BaseModel):
    new_email: EmailStr
    current_password: str

class AccountActionRequest(BaseModel):
    current_password: str


class EmailChangeConfirmRequest(BaseModel):
    code: str

class UserResponse(UserBase):
    id: str
    is_active: bool
    is_admin: bool
    language: str
    show_hero_amounts: bool = True
    theme_mode: str = "system"
    bot_personality: Optional[str] = None
    cycle_start_day: int = 1
    cycle_mode: str = "day"
    onboarding_done: bool = True
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str
    theme_mode: Optional[str] = "system"
    language: Optional[str] = "BM"


class MessageResponse(BaseModel):
    message: str


class AdminPortalUserResponse(BaseModel):
    id: str
    name: str
    email: EmailStr
    is_active: bool
    is_admin: bool
    removed_business_enabled: bool
    brand_name: Optional[str] = None
    business_name: Optional[str] = None
    business_type: Optional[str] = None
    business_description: Optional[str] = None
    whatsapp_customer_per_day: Optional[int] = None
    whatsapp_use_case: Optional[str] = None
    current_tools: Optional[str] = None
    requested_brand_name: Optional[str] = None
    requested_business_type: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    removed_business_last_activity_at: Optional[datetime] = None
    removed_business_inactive_days: Optional[int] = None


class AdminPortalUsersResponse(BaseModel):
    total: Optional[int] = None
    users: List[AdminPortalUserResponse]


class AdminPortalRemovedBusinessActivationUpdate(BaseModel):
    enabled: bool


class RemovedBusinessAccessRequestSubmit(BaseModel):
    business_name: str = Field(..., min_length=1, max_length=190)
    business_type: Optional[str] = Field(default="", max_length=120)
    business_description: Optional[str] = Field(default="", max_length=1200)
    whatsapp_customer_per_day: int = Field(default=0, ge=0, le=100000)
    whatsapp_use_case: Optional[str] = Field(default="", max_length=1200)
    current_tools: Optional[str] = Field(default=None, max_length=600)


class RemovedBusinessAccessRequestResponse(BaseModel):
    status: str
    business_name: Optional[str] = None
    business_type: Optional[str] = None
    business_description: Optional[str] = None
    whatsapp_customer_per_day: Optional[int] = None
    whatsapp_use_case: Optional[str] = None
    current_tools: Optional[str] = None
    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by_name: Optional[str] = None


class AdminPortalRemovedBusinessAccessRequestResponse(RemovedBusinessAccessRequestResponse):
    user_id: str
    user_name: str
    user_email: EmailStr
    is_active: bool
    removed_business_enabled: bool


class AdminPortalRemovedBusinessAccessRequestsResponse(BaseModel):
    requests: List[AdminPortalRemovedBusinessAccessRequestResponse]



class RefreshTokenRequest(BaseModel):
    refresh_token: str
    session_id: Optional[str] = None


class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None
    session_id: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class ForgotPasswordRequest(BaseModel):
    email: str
    turnstile_token: Optional[str] = None

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
    turnstile_token: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    turnstile_token: Optional[str] = None
    session_id: Optional[str] = None


class PinLoginRequest(BaseModel):
    email: EmailStr
    pin: str
    turnstile_token: Optional[str] = None
    session_id: Optional[str] = None


class GoogleLoginRequest(BaseModel):
    id_token: str
    session_id: Optional[str] = None


class PinSetRequest(BaseModel):
    current_password: str
    pin: str


class PinDeleteRequest(BaseModel):
    current_password: str


class PinVerifyRequest(BaseModel):
    pin: str


class PinStatusResponse(BaseModel):
    enabled: bool
    failed_attempts: int = 0
    locked_until: Optional[datetime] = None

class InternalWhatsAppReconnectPushRequest(BaseModel):
    user_id: str
    reason: Optional[str] = None

class InternalPushResponse(BaseModel):
    ok: bool

class TelegramLinkRequestResponse(BaseModel):
    code: str
    expires_at: datetime
    bot_username: Optional[str] = None

class TelegramLinkStatusResponse(BaseModel):
    is_connected: bool
    telegram_username: Optional[str] = None
    telegram_user_id: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    linked_at: Optional[datetime] = None
    bot_username: Optional[str] = None

class TelegramUnlinkResponse(BaseModel):
    ok: bool

class LoginLogResponse(BaseModel):
    id: int
    email: EmailStr
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    device_label: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class IpBanCreateRequest(BaseModel):
    ip_address: str = Field(min_length=3, max_length=120)
    reason: Optional[str] = Field(default=None, max_length=500)

class IpBanResponse(BaseModel):
    id: int
    ip_address: str
    reason: Optional[str] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class AccessLogResponse(BaseModel):
    id: int
    ip_address: Optional[str] = None
    method: str
    path: str
    status_code: int
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    user_agent: Optional[str] = None
    is_blocked: bool
    created_at: datetime

    class Config:
        from_attributes = True

class AdminPortalTelegramSettingsRequest(BaseModel):
    bot_token: Optional[str] = Field(default=None, max_length=255)
    admin_chat_id: Optional[str] = Field(default=None, max_length=64)
    access_log_alerts: bool = True
    alert_status_min: int = Field(default=400, ge=100, le=599)
    alert_path_contains: Optional[str] = Field(default=None, max_length=120)

class AdminPortalTelegramSettingsResponse(AdminPortalTelegramSettingsRequest):
    bot_token_set: bool = False

class NoticeBannerItem(BaseModel):
    enabled: bool = False
    type: str = Field(default="info", pattern="^(info|warning|alert)$")
    title_bm: str = Field(default="", max_length=120)
    message_bm: str = Field(default="", max_length=600)
    title_en: str = Field(default="", max_length=120)
    message_en: str = Field(default="", max_length=600)

class NoticeBannerSettings(BaseModel):
    personal: NoticeBannerItem = Field(default_factory=NoticeBannerItem)
    removed_business: NoticeBannerItem = Field(default_factory=NoticeBannerItem)

class TransactionItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=190)
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)
    subtotal: Optional[float] = Field(default=None, ge=0)


class TransactionItemResponse(BaseModel):
    id: int
    name: str
    quantity: float
    unit_price: float
    subtotal: float
    sort_order: int = 0

    class Config:
        from_attributes = True


class TransactionBase(BaseModel):
    type: str # income / expense
    amount: float
    vendor_or_source: str
    category_id: Optional[int] = None
    txn_date: Optional[date] = None
    txn_time: Optional[str] = None
    notes: Optional[str] = None
    wallet_id: Optional[int] = None
    subscription_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None

class TransactionCreate(TransactionBase):
    items: Optional[List[TransactionItemCreate]] = None

class TransactionResponse(TransactionBase):
    id: int
    reference_id: Optional[str] = None
    user_id: str
    wallet_name: Optional[str] = None
    category_name: Optional[str] = None
    category_icon_name: Optional[str] = None
    category_is_internal: bool = False
    category_system_code: Optional[str] = None
    is_wallet_transfer: bool = False
    is_debt_movement: bool = False
    source_channel: Optional[str] = None
    txn_time: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class AttachmentResponse(BaseModel):
    id: int
    transaction_id: int
    file_name: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    proxy_url: str
    direct_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class ChatMessageResponse(BaseModel):
    id: int
    role: str
    text: Optional[str] = None
    source_channel: str
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    attachment: Optional[AttachmentResponse] = None
    created_at: datetime

    class Config:
        from_attributes = True

class WalletBase(BaseModel):
    name: str
    label: Optional[str] = None
    card_color: Optional[str] = None
    image_url: Optional[str] = None
    type: str  # cash / bank / bank_digital / ewallet / credit_card
    currency: str = "MYR"

class WalletCreate(WalletBase):
    is_bot_default: Optional[bool] = False

class WalletUpdate(BaseModel):
    name: Optional[str] = None
    label: Optional[str] = None
    card_color: Optional[str] = None
    image_url: Optional[str] = None
    type: Optional[str] = None
    currency: Optional[str] = None
    status: Optional[str] = None
    is_bot_default: Optional[bool] = None

class WalletResponse(WalletBase):
    id: int
    owner_user_id: Optional[str] = None
    household_id: Optional[int] = None
    is_bot_default: bool = False
    balance: float = 0.0
    transaction_count: int = 0

    class Config:
        from_attributes = True

class DashboardStats(BaseModel):
    balance: float
    income_month: float
    expense_month: float
    safe_balance: float
    currency: str = "RM"

class KeywordBase(BaseModel):
    keyword: str
    match_type: str

class KeywordCreate(KeywordBase):
    pass

class KeywordResponse(KeywordBase):
    id: int
    is_active: bool = True
    removed_business_product_image_url: Optional[str] = None
    sort_order: Optional[int] = None
    sort_order: Optional[int] = None

    class Config:
        from_attributes = True

class CategoryBase(BaseModel):
    name: str
    kind: str
    icon_name: Optional[str] = None

class CategoryCreate(CategoryBase):
    pass

class CategoryResponse(CategoryBase):
    id: int
    keywordCount: int = 0
    amountMonth: float = 0
    transactionCountMonth: int = 0
    status: str = "active"
    is_internal: bool = False
    system_code: Optional[str] = None
    
    class Config:
        from_attributes = True


class BudgetBase(BaseModel):
    category_id: int
    month_key: Optional[str] = None  # YYYY-MM
    budget_amount: float


class BudgetCreate(BudgetBase):
    pass


class BudgetUpdate(BaseModel):
    month_key: Optional[str] = None  # YYYY-MM
    budget_amount: Optional[float] = None


class BudgetItemResponse(BaseModel):
    id: Optional[int] = None
    category_id: int
    category_name: str
    category_icon_name: Optional[str] = None
    month_key: str
    budget_amount: float
    used_amount: float
    remaining_amount: float
    progress_percent: float
    status: str

    class Config:
        from_attributes = True


class BudgetSummaryResponse(BaseModel):
    month_key: str
    total_budget: float
    total_used: float
    remaining_amount: float
    overall_progress_percent: float
    alert_count: int
    over_budget_count: int

    class Config:
        from_attributes = True


class DebtEventCreate(BaseModel):
    debtor_id: Optional[int] = None
    counterparty_name: Optional[str] = None
    event_type: str  # lend / borrow / payment_in / payment_out / opening_receivable / opening_payable
    amount: float
    wallet_id: Optional[int] = None
    txn_date: Optional[str] = None  # YYYY-MM-DD
    notes: Optional[str] = None

class DebtorBase(BaseModel):
    name: str

class DebtorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    opening_balance: Optional[float] = 0.0
    opening_type: Optional[str] = "receivable"  # receivable or payable

class DebtorUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    removed_business_product_image_url: Optional[str] = None

class DebtorResponse(DebtorBase):
    id: int
    key: str
    is_active: bool
    created_at: datetime
    balance: float = 0.0
    event_count: int = 0

    class Config:
        from_attributes = True


class DebtEventResponse(BaseModel):
    id: int
    user_id: str
    household_id: Optional[int] = None
    wallet_id: Optional[int] = None
    wallet_name: Optional[str] = None
    transaction_id: Optional[int] = None
    transaction_reference_id: Optional[str] = None
    debtor_id: Optional[int] = None
    counterparty_name: str
    counterparty_key: str
    event_type: str
    amount: float
    signed_delta: float
    txn_date: str
    notes: Optional[str] = None
    source_channel: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DebtSummaryResponse(BaseModel):
    debtor_id: Optional[int] = None
    counterparty_name: str
    counterparty_key: str
    balance: float
    total_lent: float
    total_borrowed: float
    total_paid_in: float
    total_paid_out: float
    event_count: int
    last_activity_at: Optional[datetime] = None

class LoanCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=190)
    opening_amount: float
    monthly_payment: Optional[float] = None
    start_date: Optional[str] = None
    notes: Optional[str] = None
    record_kind: Optional[str] = Field(default="loan", max_length=20)
    due_day_of_month: Optional[int] = Field(default=None, ge=1, le=31)

class LoanUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=190)
    opening_amount: Optional[float] = None
    monthly_payment: Optional[float] = None
    start_date: Optional[str] = None
    notes: Optional[str] = None
    record_kind: Optional[str] = Field(default=None, max_length=20)
    due_day_of_month: Optional[int] = Field(default=None, ge=1, le=31)

class LoanPaymentCreate(BaseModel):
    amount: float
    wallet_id: int
    payment_date: Optional[str] = None
    notes: Optional[str] = None

class TransactionLoanLinkUpdate(BaseModel):
    loan_id: Optional[int] = None

class TransactionLoanLinkResponse(BaseModel):
    payment_id: Optional[int] = None
    loan_id: Optional[int] = None
    loan_name: Optional[str] = None

class LoanPaymentResponse(BaseModel):
    id: int
    loan_id: int
    wallet_id: Optional[int] = None
    wallet_name: Optional[str] = None
    transaction_id: Optional[int] = None
    transaction_reference_id: Optional[str] = None
    amount: float
    payment_date: str
    notes: Optional[str] = None
    source_channel: Optional[str] = None
    created_at: datetime

class LoanResponse(BaseModel):
    id: int
    name: str
    key: str
    opening_amount: float
    outstanding_amount: float
    monthly_payment: Optional[float] = None
    paid_amount: float = 0.0
    remaining_months: Optional[int] = None
    start_date: str
    notes: Optional[str] = None
    status: str
    record_kind: str = "loan"
    due_day_of_month: Optional[int] = None
    payment_count: int = 0
    last_payment_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

class SubscriptionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=190)
    amount: float
    due_day_of_month: int = Field(..., ge=1, le=31)
    notes: Optional[str] = None

class SubscriptionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=190)
    amount: Optional[float] = None
    due_day_of_month: Optional[int] = Field(default=None, ge=1, le=31)
    notes: Optional[str] = None
    status: Optional[str] = None

class SubscriptionResponse(BaseModel):
    id: int
    name: str
    key: str
    amount: float
    due_day_of_month: int
    notes: Optional[str] = None
    status: str
    start_date: str
    last_payment_date: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class SubscriptionCommandCreate(BaseModel):
    command_text: str = Field(..., min_length=1, max_length=190)

class SubscriptionCommandResponse(BaseModel):
    ok: bool = True
    message: str
    commitment: SubscriptionResponse


class MonthlyCheckoffCreate(BaseModel):
    item_type: str = Field(..., pattern=r"^(loan|subscription)$")
    item_id: int


class MonthlyCheckoffResponse(BaseModel):
    id: int
    item_type: str
    item_id: int
    period_start: str
    period_end: str
    created_at: datetime


class TransactionMapPoint(BaseModel):
    id: int
    reference_id: Optional[str] = None
    type: str
    amount: float
    txn_date: str
    vendor_or_source: str
    category_name: Optional[str] = None
    category_icon_name: Optional[str] = None
    wallet_name: Optional[str] = None
    latitude: float
    longitude: float
    location_name: Optional[str] = None


class WhatsAppAvailableGroup(BaseModel):
    jid: str
    name: str
    participant_count: int = 0
    announce: bool = False


class WhatsAppGroupRuleBase(BaseModel):
    group_jid: str
    group_name: str
    trigger_prefix: str = "bd"
    show_current_balance: bool = False
    show_expense_amount: bool = False
    show_income_amount: bool = False


class WhatsAppGroupRuleCreate(WhatsAppGroupRuleBase):
    pass


class WhatsAppGroupRuleUpdate(BaseModel):
    group_name: Optional[str] = None
    trigger_prefix: Optional[str] = None
    show_current_balance: Optional[bool] = None
    show_expense_amount: Optional[bool] = None
    show_income_amount: Optional[bool] = None
    is_enabled: Optional[bool] = None


class WhatsAppGroupRuleResponse(WhatsAppGroupRuleBase):
    id: int
    is_enabled: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WhatsAppSessionSettingsUpdate(BaseModel):
    personal_prefix_mode_enabled: bool = False
    personal_trigger_prefix: Optional[str] = None


class RemovedBusinessAccessResponse(BaseModel):
    enabled: bool


class RemovedBusinessDashboardResponse(BaseModel):
    sales: float = 0.0
    delivery_fees: float = 0.0
    costs: float = 0.0
    profit: float = 0.0
    pending_approval: int = 0
    pending_amount: int = 0
    pending_payment: int = 0
    cod_pending: int = 0
    pending_orders: int = 0
    payment_review: int = 0
    paid_orders: int = 0
    products: int = 0
    trend_labels: List[str] = Field(default_factory=list)
    sales_trend: List[float] = Field(default_factory=list)
    costs_trend: List[float] = Field(default_factory=list)
    profit_trend: List[float] = Field(default_factory=list)
    top_products: List[dict] = Field(default_factory=list)
    recent_orders: List[dict] = Field(default_factory=list)
    recent_expenses: List[dict] = Field(default_factory=list)


class RemovedBusinessProductCreate(BaseModel):
    product_name: str = Field(..., min_length=1, max_length=190)
    product_type: Optional[str] = Field(default=None, max_length=120)
    keyword_aliases: List[str] = Field(default_factory=list)
    unit_label: Optional[str] = Field(default=None, max_length=32)
    default_price: Optional[float] = None
    is_active: bool = True
    follow_stock: bool = False
    delivery_mode: str = Field(default="all", pattern="^(all|pickup|delivery)$")
    delivery_charge_mode: str = Field(default="rider", pattern="^(rider|shipping)$")
    shipping_charge_basis: str = Field(default="order", pattern="^(order|item)$")
    shipping_fixed_amount: Optional[float] = None
    removed_business_product_image_url: Optional[str] = None
    sort_order: Optional[int] = None
    category_id: Optional[int] = None


class RemovedBusinessProductUpdate(BaseModel):
    product_name: Optional[str] = Field(default=None, min_length=1, max_length=190)
    product_type: Optional[str] = Field(default=None, max_length=120)
    keyword_aliases: Optional[List[str]] = None
    unit_label: Optional[str] = Field(default=None, max_length=32)
    default_price: Optional[float] = None
    is_active: Optional[bool] = None
    follow_stock: Optional[bool] = None
    delivery_mode: Optional[str] = Field(default=None, pattern="^(all|pickup|delivery)$")
    delivery_charge_mode: Optional[str] = Field(default=None, pattern="^(rider|shipping)$")
    shipping_charge_basis: Optional[str] = Field(default=None, pattern="^(order|item)$")
    shipping_fixed_amount: Optional[float] = None
    removed_business_product_image_url: Optional[str] = None
    sort_order: Optional[int] = None
    category_id: Optional[int] = None


class RemovedBusinessProductResponse(BaseModel):
    id: int
    product_name: str
    product_type: Optional[str] = None
    keyword_aliases: List[str] = Field(default_factory=list)
    unit_label: Optional[str] = None
    default_price: Optional[float] = None
    is_active: bool = True
    follow_stock: bool = False
    delivery_mode: str = "all"
    delivery_charge_mode: str = "rider"
    shipping_charge_basis: str = "order"
    shipping_fixed_amount: Optional[float] = None
    removed_business_product_image_url: Optional[str] = None
    category_id: Optional[int] = None
    sort_order: int = 0
    created_at: datetime
    updated_at: datetime


class RemovedBusinessExpenseCreate(BaseModel):
    category: str = Field(..., min_length=1, max_length=120)
    item_name: Optional[str] = Field(default=None, max_length=190)
    amount: float
    note: Optional[str] = None
    expense_date: Optional[str] = None


class RemovedBusinessExpenseUpdate(BaseModel):
    category: Optional[str] = Field(default=None, min_length=1, max_length=120)
    item_name: Optional[str] = Field(default=None, min_length=1, max_length=190)
    amount: Optional[float] = None
    note: Optional[str] = None


class RemovedBusinessExpenseResponse(BaseModel):
    id: int
    category: str
    item_name: str
    amount: float
    note: Optional[str] = None
    source: str
    created_at: datetime
    updated_at: datetime

class RemovedBusinessOwnerDrawCreate(BaseModel):
    amount: float
    note: Optional[str] = None
    auto_record_personal: bool = False
    personal_wallet_id: Optional[int] = None

class RemovedBusinessOwnerDrawResponse(BaseModel):
    id: int
    amount: float
    note: Optional[str] = None
    auto_record_personal: bool = False
    personal_wallet_id: Optional[int] = None
    personal_transaction_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

class RemovedBusinessOwnerDrawSummaryResponse(BaseModel):
    sales: float = 0.0
    costs: float = 0.0
    gross_profit: float = 0.0
    total_owner_drawn: float = 0.0
    safe_profit_available: float = 0.0
    rolling_modal_balance: float = 0.0
    auto_record_wallet_id: Optional[int] = None


class RemovedBusinessOrderCreate(BaseModel):
    customer_name: Optional[str] = Field(default=None, max_length=190)
    customer_phone: Optional[str] = Field(default=None, max_length=64)
    product_id: Optional[int] = None
    item_name: Optional[str] = Field(default=None, max_length=190)
    product_type: Optional[str] = Field(default=None, max_length=120)
    quantity: Optional[float] = None
    amount: Optional[float] = None
    delivery_charge: Optional[float] = None
    payment_method: Optional[str] = Field(default=None, max_length=24)
    status: Optional[str] = Field(default=None, max_length=32)
    note: Optional[str] = None
    source: Optional[str] = Field(default="web", max_length=24)
    order_mode: Optional[str] = Field(default=None, max_length=16)


class RemovedBusinessOrderUpdate(BaseModel):
    customer_name: Optional[str] = Field(default=None, max_length=190)
    customer_phone: Optional[str] = Field(default=None, max_length=64)
    product_id: Optional[int] = None
    item_name: Optional[str] = Field(default=None, min_length=1, max_length=190)
    product_type: Optional[str] = Field(default=None, max_length=120)
    quantity: Optional[float] = None
    amount: Optional[float] = None
    delivery_charge: Optional[float] = None
    payment_method: Optional[str] = Field(default=None, max_length=24)
    status: Optional[str] = Field(default=None, max_length=32)
    note: Optional[str] = None
    order_mode: Optional[str] = Field(default=None, max_length=16)


class RemovedBusinessOrderAmountConfirm(BaseModel):
    amount: float
    payment_method: Optional[str] = Field(default=None, max_length=24)


class RemovedBusinessOrderReadyPayload(BaseModel):
    rider_name: Optional[str] = Field(default=None, max_length=190)
    rider_id: Optional[int] = None

class RemovedBusinessOrderCancelPayload(BaseModel):
    cancel_reason: str = Field(min_length=1, max_length=120)


class RemovedBusinessRiderBase(BaseModel):
    name: str = Field(min_length=1, max_length=190)
    phone: Optional[str] = Field(default=None, max_length=64)
    vehicle_no: Optional[str] = Field(default=None, max_length=80)
    avatar_url: Optional[str] = None


class RemovedBusinessRiderCreate(RemovedBusinessRiderBase):
    pass


class RemovedBusinessRiderUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=190)
    phone: Optional[str] = Field(default=None, max_length=64)
    vehicle_no: Optional[str] = Field(default=None, max_length=80)
    avatar_url: Optional[str] = None


class RemovedBusinessRiderResponse(BaseModel):
    id: int
    name: str
    phone: Optional[str] = None
    vehicle_no: Optional[str] = None
    avatar_url: Optional[str] = None
    total_income: float = 0.0
    total_completed_order: int = 0
    created_at: datetime
    updated_at: datetime


class RemovedBusinessRiderOrderHistoryResponse(BaseModel):
    id: int
    order_no: str
    customer_name: Optional[str] = None
    order_amount: float = 0.0
    delivery_fee: float = 0.0
    status: str
    completed_at: datetime


class RemovedBusinessRiderDetailResponse(RemovedBusinessRiderResponse):
    order_history: List[RemovedBusinessRiderOrderHistoryResponse] = Field(default_factory=list)

class RemovedBusinessOrderItemCreate(BaseModel):
    product_id: Optional[int] = None
    item_name: Optional[str] = Field(default=None, min_length=1, max_length=190)
    quantity: Optional[float] = 1
    unit_price: Optional[float] = None
    line_total: Optional[float] = None

class RemovedBusinessOrderItemUpdate(BaseModel):
    product_id: Optional[int] = None
    item_name: Optional[str] = Field(default=None, min_length=1, max_length=190)
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    line_total: Optional[float] = None

class RemovedBusinessOrderItemResponse(BaseModel):
    id: int
    order_id: int
    product_id: Optional[int] = None
    item_name: str
    quantity: float
    unit_price: Optional[float] = None
    line_total: float
    sort_order: int
    removed_business_product_image_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class RemovedBusinessOrderResponse(BaseModel):
    id: int
    order_no: str
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    order_mode: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_address_text: Optional[str] = None
    delivery_latitude: Optional[float] = None
    delivery_longitude: Optional[float] = None
    delivery_distance_km: Optional[float] = None
    delivery_charge: Optional[float] = None
    subtotal_amount: Optional[float] = None
    delivery_rider_id: Optional[int] = None
    delivery_rider_name: Optional[str] = None
    delivery_rider_vehicle_no: Optional[str] = None
    delivery_rider_avatar_url: Optional[str] = None
    delivery_public_token: Optional[str] = None
    delivery_public_status: Optional[str] = None
    delivery_public_note: Optional[str] = None
    delivery_public_updated_at: Optional[datetime] = None
    stripe_payment_url: Optional[str] = None
    stripe_payment_short_url: Optional[str] = None
    paid_at: Optional[str] = None
    product_id: Optional[int] = None
    item_name: str
    product_type: Optional[str] = None
    quantity: Optional[float] = None
    amount: Optional[float] = None
    payment_method: Optional[str] = None
    status: str
    cancel_reason: Optional[str] = None
    note: Optional[str] = None
    customer_note: Optional[str] = None
    source: str
    receipt_url: Optional[str] = None
    scam_status: Optional[str] = None
    scam_bank_account: Optional[str] = None
    scam_holder_name: Optional[str] = None
    scam_bank_name: Optional[str] = None
    scam_report_count: Optional[int] = None
    scam_fraud_flag: bool = False
    scam_checked_at: Optional[datetime] = None
    scam_scan_source: Optional[str] = None
    is_official: bool = False
    order_items: List[RemovedBusinessOrderItemResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class RemovedBusinessScamCheckResponse(BaseModel):
    order_id: int
    order_no: str
    bank_account: str | None = None
    holder_name: str | None = None
    bank_name: str | None = None
    police_report_count: int = 0
    verified_report_count: int = 0
    fraud: bool = False
    scanned_from: str | None = None


class RemovedBusinessCustomerScamSummary(BaseModel):
    customer_name: str
    customer_phone: str | None = None
    scam_orders_count: int = 0
    total_fraud_bank_accounts: int = 0
    fraud_bank_accounts: list[str] = Field(default_factory=list)
    is_scammer: bool = False


class ScamPhoneReportRequest(BaseModel):
    phone: str


class ScamPhoneReportResponse(BaseModel):
    phone: str
    report_count: int = 0
    reported_by_me: bool = False


class RemovedBusinessPublicDeliveryItemResponse(BaseModel):
    item_name: str
    quantity: float


class RemovedBusinessPublicDeliveryResponse(BaseModel):
    order_no: str
    customer_name: Optional[str] = None
    order_mode: Optional[str] = None
    delivery_address: Optional[str] = None
    delivery_address_text: Optional[str] = None
    delivery_latitude: Optional[float] = None
    delivery_longitude: Optional[float] = None
    delivery_charge: Optional[float] = None
    amount: Optional[float] = None
    status: str
    delivery_public_status: Optional[str] = None
    delivery_public_note: Optional[str] = None
    delivery_public_updated_at: Optional[datetime] = None
    rider_name: Optional[str] = None
    rider_vehicle_no: Optional[str] = None
    rider_avatar_url: Optional[str] = None
    items: List[RemovedBusinessPublicDeliveryItemResponse] = Field(default_factory=list)
    created_at: datetime


class RemovedBusinessPublicDeliveryUpdate(BaseModel):
    status: str = Field(pattern="^(picked_up|on_the_way|arrived|delivered|failed)$")
    note: Optional[str] = Field(default=None, max_length=500)


class RemovedBusinessKitchenOrderItem(BaseModel):
    item_name: str
    quantity: float
    note: Optional[str] = None


class RemovedBusinessKitchenOrder(BaseModel):
    id: int
    order_no: str
    customer_name: Optional[str] = None
    order_mode: Optional[str] = None
    status: str
    payment_method: Optional[str] = None
    customer_note: Optional[str] = None
    note: Optional[str] = None
    amount: Optional[float] = None
    items: List[RemovedBusinessKitchenOrderItem] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class RemovedBusinessKitchenDisplayResponse(BaseModel):
    shop_name: Optional[str] = None
    orders: List[RemovedBusinessKitchenOrder] = Field(default_factory=list)
    visible_columns: List[str] = Field(default_factory=list)


class RemovedBusinessOrderTrackColumnSettings(BaseModel):
    pending_payment: bool = True
    payment_review: bool = True
    cod_pending: bool = True
    paid: bool = True
    packing: bool = True
    ready_pickup: bool = True


class RemovedBusinessOrderTrackSettingsResponse(BaseModel):
    columns: RemovedBusinessOrderTrackColumnSettings
    public_slug: Optional[str] = None
    password_set: bool = False


class RemovedBusinessOrderTrackSettingsUpdate(BaseModel):
    columns: RemovedBusinessOrderTrackColumnSettings
    password: Optional[str] = Field(default=None, max_length=80)


class RemovedBusinessPaymentSettingsUpdate(BaseModel):
    brand_name: Optional[str] = Field(default=None, max_length=120)
    qr_image_url: Optional[str] = None
    store_address: Optional[str] = None
    store_latitude: Optional[float] = None
    store_longitude: Optional[float] = None
    delivery_rate_per_km: Optional[float] = None
    delivery_base_price: Optional[float] = None
    delivery_max_distance_km: Optional[float] = None
    delivery_charge_mode: Optional[str] = Field(default=None, pattern="^(rider|shipping)$")
    shipping_fixed_amount: Optional[float] = None
    pickup_enabled: bool = True
    delivery_enabled: bool = True
    payment_image_url: Optional[str] = None
    bank_name: Optional[str] = Field(default=None, max_length=120)
    account_name: Optional[str] = Field(default=None, max_length=190)
    account_number: Optional[str] = Field(default=None, max_length=120)
    stripe_enabled: Optional[bool] = None
    stripe_secret_key: Optional[str] = None
    stripe_publishable_key: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None
    auto_acknowledge_incoming_order: Optional[bool] = None
    auto_acknowledge_payment_receipt: Optional[bool] = None
    auto_reply_qr_on_order: Optional[bool] = None
    auto_reply_qr_when_amount_ready: Optional[bool] = None
    is_business_open: Optional[bool] = None
    capture_all_whatsapp_messages: Optional[bool] = None
    allow_owner_whatsapp_order_proxy: Optional[bool] = None
    whatsapp_trigger_prefix: Optional[str] = Field(default=None, max_length=80)
    business_closed_reply_template: Optional[str] = None
    incoming_order_reply_template: Optional[str] = None
    payment_review_reply_template: Optional[str] = None
    qr_caption_template: Optional[str] = None
    payment_note_template: Optional[str] = None
    customer_note_prompt: Optional[str] = None
    customer_note_example: Optional[str] = None
    customer_note_enabled: Optional[bool] = None
    catalog_list_enabled: Optional[bool] = None
    catalog_image_url: Optional[str] = None
    prepared_order_notify_enabled: Optional[bool] = None


class RemovedBusinessProfileChangeRequestSubmit(BaseModel):
    requested_brand_name: Optional[str] = Field(default=None, max_length=120)
    requested_business_type: Optional[str] = Field(default=None, max_length=120)


class RemovedBusinessProfileChangeRequestResponse(BaseModel):
    status: str
    current_brand_name: Optional[str] = None
    current_business_type: Optional[str] = None
    requested_brand_name: Optional[str] = None
    requested_business_type: Optional[str] = None
    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by_name: Optional[str] = None


class AdminPortalRemovedBusinessProfileChangeRequestResponse(RemovedBusinessProfileChangeRequestResponse):
    user_id: str
    user_name: str
    user_email: EmailStr
    is_active: bool
    removed_business_enabled: bool


class AdminPortalRemovedBusinessProfileChangeRequestsResponse(BaseModel):
    requests: List[AdminPortalRemovedBusinessProfileChangeRequestResponse]


class RemovedBusinessPaymentSettingsResponse(BaseModel):
    brand_name: Optional[str] = None
    business_type: Optional[str] = None
    profile_change_request: Optional[RemovedBusinessProfileChangeRequestResponse] = None
    qr_image_url: Optional[str] = None
    store_address: Optional[str] = None
    store_latitude: Optional[float] = None
    store_longitude: Optional[float] = None
    delivery_rate_per_km: Optional[float] = None
    delivery_base_price: Optional[float] = None
    delivery_max_distance_km: Optional[float] = None
    delivery_charge_mode: Optional[str] = None
    shipping_fixed_amount: Optional[float] = None
    pickup_enabled: bool = True
    delivery_enabled: bool = True
    payment_image_url: Optional[str] = None
    bank_name: Optional[str] = None
    account_name: Optional[str] = None
    account_number: Optional[str] = None
    stripe_enabled: bool = False
    stripe_configured: bool = False
    stripe_publishable_key: Optional[str] = None
    stripe_webhook_configured: bool = False
    auto_acknowledge_incoming_order: bool = True
    auto_acknowledge_payment_receipt: bool = True
    auto_reply_qr_on_order: bool = False
    auto_reply_qr_when_amount_ready: bool = True
    is_business_open: bool = True
    capture_all_whatsapp_messages: bool = False
    allow_owner_whatsapp_order_proxy: bool = False
    whatsapp_trigger_prefix: Optional[str] = None
    business_closed_reply_template: Optional[str] = None
    incoming_order_reply_template: Optional[str] = None
    payment_review_reply_template: Optional[str] = None
    qr_caption_template: Optional[str] = None
    payment_note_template: Optional[str] = None
    customer_note_prompt: Optional[str] = None
    customer_note_example: Optional[str] = None
    customer_note_enabled: bool = True
    catalog_list_enabled: bool = True
    catalog_image_url: Optional[str] = None
    prepared_order_notify_enabled: bool = True
    updated_at: Optional[datetime] = None

class RemovedBusinessAutomationFlowSaveRequest(BaseModel):
    name: Optional[str] = Field(default="Automation Flow", max_length=120)
    enabled: bool = False
    nodes: List[Any] = Field(default_factory=list)
    edges: List[Any] = Field(default_factory=list)
    version: int = 1

class RemovedBusinessAutomationFlowResponse(BaseModel):
    name: str = "Automation Flow"
    enabled: bool = False
    nodes: List[Any] = Field(default_factory=list)
    edges: List[Any] = Field(default_factory=list)
    version: int = 1
    updated_at: Optional[datetime] = None

class RemovedBusinessAutomationFlowTestRequest(BaseModel):
    text: str = Field(default="", max_length=1000)


class RemovedBusinessReportTopProductResponse(BaseModel):
    product_id: Optional[int] = None
    product_name: str
    units_sold: float = 0.0
    revenue: float = 0.0
    pending_delivery: float = 0.0
    current_stock: float = 0.0
    available_after_delivery: float = 0.0

class RemovedBusinessReportExpenseCategoryResponse(BaseModel):
    category: str
    amount: float = 0.0

class RemovedBusinessWhatsAppCloudSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    phone_number_id: Optional[str] = Field(default=None, max_length=120)
    business_account_id: Optional[str] = Field(default=None, max_length=120)
    access_token: Optional[str] = None
    verify_token: Optional[str] = Field(default=None, max_length=190)
    app_secret: Optional[str] = Field(default=None, max_length=190)
    webhook_url: Optional[str] = None
    webhook_token: Optional[str] = Field(default=None, max_length=120)
    regenerate_webhook_token: Optional[bool] = None
    clear_access_token: Optional[bool] = None

class RemovedBusinessWhatsAppCloudSettingsResponse(BaseModel):
    enabled: bool = False
    phone_number_id: Optional[str] = None
    business_account_id: Optional[str] = None
    has_access_token: bool = False
    access_token_masked: Optional[str] = None
    verify_token: Optional[str] = None
    app_secret: Optional[str] = None
    webhook_url: Optional[str] = None
    webhook_token: Optional[str] = None
    callback_url: Optional[str] = None

class RemovedBusinessWhatsAppCloudWebhookTestResponse(BaseModel):
    ok: bool
    callback_url: Optional[str] = None
    verify_token_present: bool = False
    webhook_token_present: bool = False
    challenge_url: Optional[str] = None
    detail: str

class RemovedBusinessInboxThreadResponse(BaseModel):
    id: int
    source_channel: str
    customer_phone: str
    customer_name: Optional[str] = None
    last_message_text: Optional[str] = None
    last_message_direction: Optional[str] = None
    last_message_at: Optional[datetime] = None
    unread_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

class RemovedBusinessInboxMessageResponse(BaseModel):
    id: int
    thread_id: int
    source_channel: str
    direction: str
    message_type: Optional[str] = None
    text: Optional[str] = None
    external_message_id: Optional[str] = None
    created_at: datetime

class RemovedBusinessInboxReplyRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)

class RemovedBusinessReportSummaryResponse(BaseModel):
    sales: float
    costs: float
    profit: float
    paid_orders: int
    pending_orders: int
    pending_amount: int
    pending_payment: int
    cod_pending: int
    pending_approval: int = 0
    pending_address: int = 0
    payment_review: int = 0
    packing_orders: int = 0
    ready_pickup_orders: int = 0
    completed_orders: int = 0
    cod_completed: int = 0
    cancelled_orders: int = 0
    total_orders: int = 0
    total_items_sold: float = 0.0
    average_order_value: float = 0.0
    active_products: int = 0
    total_stock: float = 0.0
    total_pending_delivery_units: float = 0.0
    total_available_stock: float = 0.0
    total_owner_drawn: float = 0.0
    safe_profit_available: float = 0.0
    expense_categories: List[RemovedBusinessReportExpenseCategoryResponse] = Field(default_factory=list)
    top_products_by_units: List[RemovedBusinessReportTopProductResponse] = Field(default_factory=list)
    top_products_by_revenue: List[RemovedBusinessReportTopProductResponse] = Field(default_factory=list)


class RemovedBusinessCustomerSummaryResponse(BaseModel):
    customer_name: str
    customer_phone: Optional[str] = None
    total_orders: int
    total_paid: float
    unpaid_amount: float
    item_total: float = 0.0
    delivery_total: float = 0.0
    is_official: bool = False

class RemovedBusinessCustomerOrderHistoryResponse(BaseModel):
    id: int
    order_no: str
    amount: float
    item_amount: float = 0.0
    delivery_charge: float = 0.0
    status: str
    payment_method: Optional[str] = None
    item_name: Optional[str] = None
    total_items: int = 0
    created_at: datetime

class RemovedBusinessCustomerDetailResponse(BaseModel):
    customer_name: str
    customer_phone: Optional[str] = None
    total_orders: int
    total_paid: float
    unpaid_amount: float
    item_total: float = 0.0
    delivery_total: float = 0.0
    latest_order_at: Optional[datetime] = None
    is_official: bool = False
    orders: List[RemovedBusinessCustomerOrderHistoryResponse] = Field(default_factory=list)


class RemovedBusinessSendQrResponse(BaseModel):
    order_no: str
    amount: float
    qr_image_url: Optional[str] = None
    payment_image_url: Optional[str] = None
    message: str


class RemovedBusinessAuditLogResponse(BaseModel):
    id: int
    user_id: str
    actor_user_id: Optional[str] = None
    entity_type: str
    entity_id: Optional[str] = None
    action: str
    before_state: Optional[dict[str, Any]] = None
    after_state: Optional[dict[str, Any]] = None
    order_name: Optional[str] = None
    user_name: Optional[str] = None
    created_at: datetime


class RemovedBusinessDispatchResponse(BaseModel):
    ok: bool
    channel: str
    target: str
    message: str
    image_urls: List[str] = Field(default_factory=list)
    status: str = "queued"

class RemovedBusinessStripeCheckoutResponse(BaseModel):
    ok: bool
    checkout_url: str
    short_url: Optional[str] = None
    session_id: Optional[str] = None
    message: Optional[str] = None


class RemovedBusinessStockCountsUpdate(BaseModel):
    counts: dict[str, float] = Field(default_factory=dict)


class PushTokenRegister(BaseModel):
    token: str = Field(..., max_length=512)
    platform: Optional[str] = "web"


class RemovedBusinessPhonebookGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=190)
    color: Optional[str] = Field(default=None, max_length=32)

class RemovedBusinessPhonebookGroupUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=190)
    color: Optional[str] = Field(default=None, max_length=32)

class RemovedBusinessPhonebookGroupResponse(BaseModel):
    id: int
    name: str
    color: Optional[str] = None
    contact_count: int = 0
    created_at: Optional[datetime] = None

class RemovedBusinessPhonebookContactCreate(BaseModel):
    group_id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=190)
    phone_number: str = Field(..., min_length=3, max_length=60)
    display_phone: Optional[str] = Field(default=None, max_length=60)
    note: Optional[str] = None

class RemovedBusinessPhonebookContactUpdate(BaseModel):
    group_id: Optional[int] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=190)
    phone_number: Optional[str] = Field(default=None, min_length=3, max_length=60)
    display_phone: Optional[str] = Field(default=None, max_length=60)
    note: Optional[str] = None

class RemovedBusinessPhonebookContactResponse(BaseModel):
    id: int
    group_id: Optional[int] = None
    name: str
    phone_number: str
    display_phone: Optional[str] = None
    note: Optional[str] = None
    created_at: Optional[datetime] = None


# ── Product Categories ────────────────────────────────────

class RemovedBusinessProductCategoryCreate(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    sort_order: int = 0


class RemovedBusinessProductCategoryUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class RemovedBusinessProductCategoryResponse(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    sort_order: int
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ── Donations ──────────────────────────────────────────────

class DonationCreate(BaseModel):
    name: str
    amount: float
    session_id: str

class DonationResponse(BaseModel):
    id: int
    name: str
    amount: float
    status: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
