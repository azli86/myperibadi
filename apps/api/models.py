from sqlalchemy import String, Boolean, DateTime, BigInteger, DECIMAL, ForeignKey, Integer, Text, Date, Time, UniqueConstraint, Index, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import date, datetime, time
from typing import List, Optional
from database import Base

import string
import random

# System category that defines the per-user budget/transaction cycle when
# cycle_mode == 'category' (cycle resets on each Monthly Salary transaction).
MONTHLY_SALARY_CATEGORY_CODE = "monthly_salary"
MONTHLY_SALARY_CATEGORY_NAME = "Monthly Salary"
MONTHLY_SALARY_KEYWORDS = ("Mgaji", "Msalary")
MONTHLY_SALARY_LOCKED_KEYWORDS = {kw.lower() for kw in MONTHLY_SALARY_KEYWORDS}

def generate_nano_id():
    return ''.join(random.choices(string.ascii_letters + string.digits, k=16))

def generate_txn_reference(dt: datetime = None):
    if dt is None: dt = datetime.utcnow()
    yy = dt.strftime("%y")
    # 6 random uppercase letters or digits
    rand = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"TXN{yy}-{rand}"

generate_transaction_reference = generate_txn_reference

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(16), primary_key=True, default=generate_nano_id)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(190), unique=True, nullable=False, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    auth_provider: Mapped[str] = mapped_column(String(20), default="email")
    firebase_uid: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, unique=True)
    default_household_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    deactivated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # set when account is deactivated
    deactivated_reason: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # 'manual' | 'inactivity'; NULL=legacy
    verification_email_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # account-verification email sent
    email_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # email ownership confirmed via verify link / oauth
    email_verify_token: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # hashed verify-email token
    email_verify_token_expires: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    verification_email_resend_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None
    language: Mapped[str] = mapped_column(String(5), default="BM") # 'EN' or 'BM'
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # profile picture stored in R2 (public CDN URL)
    onboarding_done: Mapped[bool] = mapped_column(Boolean, default=True)  # False => new user sees onboarding intro after first login
    category_language: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # 'bm' | 'en' | 'manual' (auto-seeded category set)
    theme_mode: Mapped[str] = mapped_column(String(12), default="system") # dark / light / system
    show_hero_amounts: Mapped[bool] = mapped_column(Boolean, default=True)
    bot_personality: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    personal_bot_prefix_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    personal_bot_prefix: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    cycle_start_day: Mapped[int] = mapped_column(BigInteger, default=1, nullable=False)  # 1..28, monthly reset day for budgets/transactions
    cycle_mode: Mapped[str] = mapped_column(String(12), default="day", nullable=False)  # 'day' | 'category' (reset by Monthly Salary category)
    
    reset_token: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    reset_token_expires: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    pending_email: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    email_change_token: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    email_change_token_expires: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    refresh_token_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    refresh_token_expires: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    pin_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    pin_failed_attempts: Mapped[int] = mapped_column(BigInteger, default=0)
    pin_locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    pin_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def has_password(self) -> bool:
        return self.password_hash is not None

    # Relationships
    transactions: Mapped[List["Transaction"]] = relationship(back_populates="user")
    memberships: Mapped[List["HouseholdMember"]] = relationship(back_populates="user")
    chat_messages: Mapped[List["ChatMessage"]] = relationship(back_populates="user")
    login_logs: Mapped[List["LoginLog"]] = relationship(back_populates="user")
    auth_sessions: Mapped[List["UserAuthSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")

class UserAuthSession(Base):
    __tablename__ = "user_auth_sessions"
    __table_args__ = (
        UniqueConstraint("user_id", "session_id", name="uq_user_auth_sessions_user_session"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    refresh_token_expires: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    session_kind: Mapped[str] = mapped_column(String(20), default="default")
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_used_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    user: Mapped["User"] = relationship(back_populates="auth_sessions")

class Household(Base):
    __tablename__ = "households"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    owner_user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    members: Mapped[List["HouseholdMember"]] = relationship(back_populates="household")
    wallets: Mapped[List["Wallet"]] = relationship(back_populates="household")

class HouseholdMember(Base):
    __tablename__ = "household_members"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    household_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("households.id"))
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"))
    role: Mapped[str] = mapped_column(String(20), default="member")
    status: Mapped[str] = mapped_column(String(20), default="active")
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="memberships")
    household: Mapped["Household"] = relationship(back_populates="members")

class Wallet(Base):
    __tablename__ = "wallets"
    __table_args__ = (
        Index(
            "uq_wallets_owner_name",
            "owner_user_id",
            func.lower("name"),
            unique=True,
            postgresql_where=text("owner_user_id IS NOT NULL"),
        ),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    household_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=True)
    owner_user_id: Mapped[Optional[str]] = mapped_column(String(16), ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    label: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    card_color: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    type: Mapped[str] = mapped_column(String(20))  # cash / bank / bank_digital / ewallet / credit_card / saving (+ legacy shared)
    is_saving: Mapped[bool] = mapped_column(Boolean, default=False)  # saving wallet: transfers only, excluded from total balance
    show_on_dashboard: Mapped[bool] = mapped_column(Boolean, default=True)  # show saving wallet in dashboard wallet section
    currency: Mapped[str] = mapped_column(String(10), default="MYR")
    status: Mapped[str] = mapped_column(String(20), default="active")
    is_bot_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    household: Mapped[Optional["Household"]] = relationship(back_populates="wallets")
    transactions: Mapped[List["Transaction"]] = relationship(back_populates="wallet")

class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    icon_name: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    kind: Mapped[str] = mapped_column(String(20)) # expense / income
    is_default: Mapped[bool] = mapped_column(Boolean, default=True)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)
    system_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    household_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    keywords: Mapped[List["CategoryKeyword"]] = relationship(back_populates="category")

class CategoryBudget(Base):
    __tablename__ = "category_budgets"
    __table_args__ = (
        UniqueConstraint("household_id", "category_id", "month_key", name="uq_category_budget_household_category_month"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    household_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=False, index=True)
    category_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("categories.id"), nullable=False, index=True)
    month_key: Mapped[str] = mapped_column(String(7), nullable=False, index=True)  # YYYY-MM
    budget_amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class CategoryKeyword(Base):
    __tablename__ = "category_keywords"
    __table_args__ = (
        Index("uq_category_keywords_cat_keyword", "category_id", func.lower("keyword"), unique=True),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    category_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("categories.id"))
    keyword: Mapped[str] = mapped_column(String(190), nullable=False)
    match_type: Mapped[str] = mapped_column(String(20), default="contains")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    category: Mapped["Category"] = relationship(back_populates="keywords")

class CategoryLayout(Base):
    """UI-only category arrangement (order + parent nesting) stored as JSON per household."""
    __tablename__ = "category_layout"
    household_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    data: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transactions_user_date_id", "user_id", "txn_date", "id"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    reference_id: Mapped[Optional[str]] = mapped_column(String(20), unique=True, index=True, nullable=True) # TXN26-XXXXXX
    wallet_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("wallets.id"))
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"))
    household_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(20)) # income / expense
    txn_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    txn_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    vendor_or_source: Mapped[str] = mapped_column(String(190), nullable=False)
    amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    category_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("categories.id"), nullable=True)
    subscription_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("subscriptions.id"), nullable=True, index=True)
    bnpl_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("bnpl.id"), nullable=True, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 7), nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(DECIMAL(11, 8), nullable=True)
    location_name: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    source_channel: Mapped[Optional[str]] = mapped_column(String(30)) # whatsapp / web
    transaction_kind: Mapped[Optional[str]] = mapped_column(String(20), nullable=True) # normal / reimbursement / split / subscription / loan
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="transactions")
    wallet: Mapped["Wallet"] = relationship(back_populates="transactions")
    attachments: Mapped[List["Attachment"]] = relationship(back_populates="transaction")
    items: Mapped[List["TransactionItem"]] = relationship(back_populates="transaction", cascade="all, delete-orphan")
    debt: Mapped[Optional["Debt"]] = relationship(back_populates="transaction")

class TransactionItem(Base):
    __tablename__ = "transaction_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    transaction_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("transactions.id"), index=True)
    sort_order: Mapped[int] = mapped_column(BigInteger, default=0)
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    quantity: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False, default=1)
    unit_price: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    subtotal: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    transaction: Mapped["Transaction"] = relationship(back_populates="items")

class Debt(Base):
    __tablename__ = "debts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    household_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=True, index=True)
    wallet_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("wallets.id"), nullable=True, index=True)
    transaction_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("transactions.id"), nullable=True, index=True)
    debtor_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("debtors.id"), nullable=True, index=True)
    counterparty_name: Mapped[str] = mapped_column(String(190), nullable=False)
    counterparty_key: Mapped[str] = mapped_column(String(190), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(24), nullable=False, index=True)  # lend / borrow / payment_in / payment_out
    amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    txn_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_channel: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    transaction: Mapped[Optional["Transaction"]] = relationship(back_populates="debt")
    debtor: Mapped[Optional["Debtor"]] = relationship(back_populates="debts")

class Debtor(Base):
    __tablename__ = "debtors"
    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uq_debtor_user_key"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    household_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    key: Mapped[str] = mapped_column(String(190), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    debts: Mapped[List["Debt"]] = relationship(back_populates="debtor")

class Loan(Base):
    __tablename__ = "loans"
    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uq_loan_user_key"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    household_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    key: Mapped[str] = mapped_column(String(190), nullable=False, index=True)
    category_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("categories.id"), nullable=True, index=True)
    opening_amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    outstanding_amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    monthly_payment: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    start_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    payments: Mapped[List["LoanPayment"]] = relationship(back_populates="loan", cascade="all, delete-orphan")

class Subscription(Base):
    __tablename__ = "subscriptions"
    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uq_subscription_user_key"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    household_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    key: Mapped[str] = mapped_column(String(190), nullable=False, index=True)
    category_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("categories.id"), nullable=True, index=True)
    amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    due_day_of_month: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    start_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    last_payment_date: Mapped[Optional[datetime]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class LoanPayment(Base):
    __tablename__ = "loan_payments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    household_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=True, index=True)
    loan_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("loans.id"), index=True)
    wallet_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("wallets.id"), nullable=True, index=True)
    transaction_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("transactions.id"), nullable=True, index=True)
    amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    payment_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_channel: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    loan: Mapped["Loan"] = relationship(back_populates="payments")

class Bnpl(Base):
    __tablename__ = "bnpl"
    __table_args__ = (
        UniqueConstraint("user_id", "key", name="uq_bnpl_user_key"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    household_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    key: Mapped[str] = mapped_column(String(190), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(60), nullable=False)
    category_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("categories.id"), nullable=False, index=True)
    icon_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    image_object_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    total_amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    installment_count: Mapped[int] = mapped_column(Integer, nullable=False)
    monthly_amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    due_day_of_month: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    last_payment_date: Mapped[Optional[datetime]] = mapped_column(Date, nullable=True)
    outstanding_amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    payments: Mapped[List["BnplPayment"]] = relationship(back_populates="bnpl", cascade="all, delete-orphan")

class BnplPayment(Base):
    __tablename__ = "bnpl_payments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    household_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=True, index=True)
    bnpl_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("bnpl.id"), index=True)
    wallet_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("wallets.id"), nullable=True, index=True)
    transaction_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("transactions.id"), nullable=True, index=True)
    amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    payment_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_channel: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    bnpl: Mapped["Bnpl"] = relationship(back_populates="payments")


class UserLocationContext(Base):
    __tablename__ = "user_location_contexts"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_location_context_user"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    latitude: Mapped[float] = mapped_column(DECIMAL(10, 7), nullable=False)
    longitude: Mapped[float] = mapped_column(DECIMAL(11, 8), nullable=False)
    location_name: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)

class Attachment(Base):
    __tablename__ = "attachments"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    transaction_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("transactions.id"))
    uploaded_by_user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"))
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(String(120))
    size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    transaction: Mapped["Transaction"] = relationship(back_populates="attachments")
    chat_messages: Mapped[List["ChatMessage"]] = relationship(back_populates="attachment")

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    source_channel: Mapped[str] = mapped_column(String(30), nullable=False, default="chat")
    role: Mapped[str] = mapped_column(String(20), nullable=False) # user / bot
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attachment_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("attachments.id"), nullable=True)
    file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    mime_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="chat_messages")
    attachment: Mapped[Optional["Attachment"]] = relationship(back_populates="chat_messages")

class MonthlyCheckoff(Base):
    __tablename__ = "monthly_checkoffs"
    __table_args__ = (
        UniqueConstraint("user_id", "item_type", "item_id", "period_start", name="uq_monthly_checkoff"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True, nullable=False)
    item_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    item_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    period_end: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class WhatsAppLink(Base):
    __tablename__ = "whatsapp_links"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"))
    phone: Mapped[str] = mapped_column(String(30), unique=True)
    link_code: Mapped[str] = mapped_column(String(32), unique=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class WhatsAppGroupRule(Base):
    __tablename__ = "whatsapp_group_rules"
    __table_args__ = (
        UniqueConstraint("user_id", "group_jid", name="uq_whatsapp_group_rule_user_group"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    group_jid: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    group_name: Mapped[str] = mapped_column(String(190), nullable=False)
    trigger_prefix: Mapped[str] = mapped_column(String(32), default="bd")
    show_current_balance: Mapped[bool] = mapped_column(Boolean, default=False)
    show_expense_amount: Mapped[bool] = mapped_column(Boolean, default=False)
    show_income_amount: Mapped[bool] = mapped_column(Boolean, default=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class WhatsAppInboundEvent(Base):
    __tablename__ = "whatsapp_inbound_events"
    __table_args__ = (
        UniqueConstraint("user_id", "message_key", name="uq_whatsapp_inbound_user_message"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    source_channel: Mapped[str] = mapped_column(String(30), nullable=False, default="whatsapp")
    message_key: Mapped[str] = mapped_column(String(191), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

class TelegramPairCode(Base):
    __tablename__ = "telegram_pair_codes"
    __table_args__ = (
        UniqueConstraint("code", name="uq_telegram_pair_codes_code"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    consumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    attempt_count: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

class TelegramLink(Base):
    __tablename__ = "telegram_links"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    telegram_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    telegram_chat_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    telegram_username: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    telegram_first_name: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    telegram_last_name: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    linked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class TelegramInboundEvent(Base):
    __tablename__ = "telegram_inbound_events"
    __table_args__ = (
        UniqueConstraint("telegram_user_id", "telegram_chat_id", "message_key", name="uq_telegram_inbound_identity_message"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    telegram_user_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    telegram_chat_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    message_key: Mapped[str] = mapped_column(String(191), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class LoginLog(Base):
    __tablename__ = "login_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    email: Mapped[str] = mapped_column(String(190), nullable=False, index=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    device_label: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="success")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    user: Mapped["User"] = relationship(back_populates="login_logs")

class IpBan(Base):
    __tablename__ = "ip_bans"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ip_address: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_by_user_id: Mapped[Optional[str]] = mapped_column(String(16), ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class AccessLog(Base):
    __tablename__ = "access_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    method: Mapped[str] = mapped_column(String(12), nullable=False)
    path: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(16), ForeignKey("users.id"), nullable=True, index=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

def generate_business_order_no(dt: datetime = None):
    if dt is None:
        dt = datetime.utcnow()
    return f"ORD-{dt.strftime('%m%y')}{''.join(random.choices(string.digits, k=5))}"


class BusinessOrder(Base):
    __tablename__ = "business_orders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    order_no: Mapped[str] = mapped_column(String(24), unique=True, index=True, default=generate_business_order_no)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    customer_name: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    customer_phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    product_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("business_products.id", ondelete="SET NULL"), nullable=True, index=True)
    item_name: Mapped[str] = mapped_column(String(190), nullable=False)
    product_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    quantity: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    amount: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    payment_method: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending_amount", index=True)
    cancel_reason: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    customer_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    order_mode: Mapped[Optional[str]] = mapped_column(String(16), nullable=True, index=True)
    delivery_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    delivery_address_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    delivery_latitude: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 8), nullable=True)
    delivery_longitude: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 8), nullable=True)
    delivery_distance_km: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    delivery_charge: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    subtotal_amount: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    checkout_stage: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    delivery_rider_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("business_riders.id"), nullable=True, index=True)
    delivery_rider_name: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    delivery_public_token: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, unique=True, index=True)
    delivery_public_status: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    delivery_public_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    delivery_public_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    stripe_checkout_session_id: Mapped[Optional[str]] = mapped_column(String(190), nullable=True, index=True)
    stripe_payment_intent_id: Mapped[Optional[str]] = mapped_column(String(190), nullable=True, index=True)
    stripe_payment_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stripe_payment_short_token: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, unique=True, index=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    source: Mapped[str] = mapped_column(String(24), nullable=False, default="web")
    raw_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    receipt_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    scam_status: Mapped[Optional[str]] = mapped_column(String(24), nullable=True, index=True)
    scam_bank_account: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    scam_holder_name: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    scam_bank_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    scam_report_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    scam_fraud_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    scam_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    scam_scan_source: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    is_official: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class BusinessOfficialStaff(Base):
    __tablename__ = "business_official_staff"
    __table_args__ = (
        UniqueConstraint("user_id", "identifier", name="uq_business_official_staff_user_identifier"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    identifier: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    is_global: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BusinessRider(Base):
    __tablename__ = "business_riders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    vehicle_no: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class BusinessOrderItem(Base):
    __tablename__ = "business_order_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("business_orders.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    product_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("business_products.id", ondelete="SET NULL"), nullable=True, index=True)
    item_name: Mapped[str] = mapped_column(String(190), nullable=False)
    quantity: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False, default=1)
    unit_price: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    line_total: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    sort_order: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BusinessExpense(Base):
    __tablename__ = "business_expenses"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    category: Mapped[str] = mapped_column(String(120), nullable=False)
    item_name: Mapped[str] = mapped_column(String(190), nullable=False)
    amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(24), nullable=False, default="web")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class BusinessOwnerDraw(Base):
    __tablename__ = "business_owner_draws"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    auto_record_personal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    personal_wallet_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("wallets.id"), nullable=True, index=True)
    personal_transaction_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("transactions.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BusinessProduct(Base):
    __tablename__ = "business_products"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    product_name: Mapped[str] = mapped_column(String(190), nullable=False)
    product_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    keyword_aliases: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    unit_label: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    default_price: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    removed_business_product_image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    category_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("business_product_categories.id", ondelete="SET NULL"), nullable=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BusinessPaymentSetting(Base):
    __tablename__ = "business_payment_settings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), unique=True, index=True)
    brand_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    qr_image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payment_image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    bank_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    account_name: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    account_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    stripe_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    stripe_secret_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stripe_publishable_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stripe_webhook_secret: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    auto_acknowledge_incoming_order: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_acknowledge_payment_receipt: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_reply_qr_on_order: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_reply_qr_when_amount_ready: Mapped[bool] = mapped_column(Boolean, default=True)
    is_business_open: Mapped[bool] = mapped_column(Boolean, default=True)
    capture_all_whatsapp_messages: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_owner_whatsapp_order_proxy: Mapped[bool] = mapped_column(Boolean, default=False)
    pickup_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    delivery_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    whatsapp_trigger_prefix: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    business_closed_reply_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    incoming_order_reply_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payment_review_reply_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    qr_caption_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payment_note_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    customer_note_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    customer_note_example: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    customer_note_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    catalog_list_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    catalog_image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prepared_order_notify_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class BusinessAutomationFlow(Base):
    __tablename__ = "business_automation_flows"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="Automation Flow")
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    flow_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RemovedBusinessInboxThread(Base):
    __tablename__ = "removed_business_inbox_threads"
    __table_args__ = (
        UniqueConstraint("user_id", "source_channel", "customer_phone", name="uq_removed_business_inbox_thread_user_source_phone"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    source_channel: Mapped[str] = mapped_column(String(30), nullable=False, default="whatsapp_cloud", index=True)
    customer_phone: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    customer_name: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    last_message_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_message_direction: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    last_message_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    unread_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)


class RemovedBusinessInboxMessage(Base):
    __tablename__ = "removed_business_inbox_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    thread_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("removed_business_inbox_threads.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    source_channel: Mapped[str] = mapped_column(String(30), nullable=False, default="whatsapp_cloud", index=True)
    direction: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # incoming / outgoing
    message_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    external_message_id: Mapped[Optional[str]] = mapped_column(String(190), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class UserSetting(Base):
    __tablename__ = "user_settings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    key: Mapped[str] = mapped_column(String(120), index=True)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BusinessAuditLog(Base):
    __tablename__ = "business_audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    actor_user_id: Mapped[Optional[str]] = mapped_column(String(16), ForeignKey("users.id"), nullable=True, index=True)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    before_state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    after_state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class ScamPhoneReport(Base):
    __tablename__ = "scam_phone_reports"
    __table_args__ = (
        UniqueConstraint("phone", "reporter_user_id", name="uq_scam_phone_reporter"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    phone: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    reporter_user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class RemovedBusinessNotification(Base):
    __tablename__ = "removed_business_notifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    order_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("business_orders.id"), nullable=True, index=True)
    event: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    user: Mapped["User"] = relationship("User", backref="removed_business_notifications", lazy="joined")
    order: Mapped[Optional["BusinessOrder"]] = relationship("BusinessOrder", backref="notifications", lazy="joined")


class BusinessPhonebookGroup(Base):
    __tablename__ = "business_phonebook_groups"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    color: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    sort_order: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BusinessPhonebookContact(Base):
    __tablename__ = "business_phonebook_contacts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True)
    group_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("business_phonebook_groups.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(60), nullable=False)
    display_phone: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserPushToken(Base):
    __tablename__ = "user_push_tokens"
    __table_args__ = (
        UniqueConstraint("token", name="uq_user_push_token"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(512), nullable=False)
    platform: Mapped[str] = mapped_column(String(32), default="web")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RemovedBusinessTheme(Base):
    __tablename__ = "removed_business_themes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), unique=True, nullable=False, index=True)
    theme_name: Mapped[str] = mapped_column(String(255), default="Default Theme")
    status: Mapped[str] = mapped_column(String(50), default="draft")

    primary_color: Mapped[str] = mapped_column(String(7), default="#058B70")
    secondary_color: Mapped[str] = mapped_column(String(7), default="#4f46e5")
    background_color: Mapped[str] = mapped_column(String(7), default="#f7f8f4")
    text_color: Mapped[str] = mapped_column(String(7), default="#102015")
    font_family: Mapped[str] = mapped_column(String(100), default="Inter")
    border_radius: Mapped[int] = mapped_column(Integer, default=12)
    theme_mode: Mapped[str] = mapped_column(String(10), default="light")

    logo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    shop_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cover_image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    header_style: Mapped[str] = mapped_column(String(50), default="standard")
    button_style: Mapped[str] = mapped_column(String(50), default="rounded")
    product_card_style: Mapped[str] = mapped_column(String(50), default="default")

    whatsapp_button_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    whatsapp_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    order_button_text: Mapped[str] = mapped_column(String(100), default="Send Order via WhatsApp")
    order_button_color: Mapped[str] = mapped_column(String(7), default="#25D366")
    floating_button: Mapped[bool] = mapped_column(Boolean, default=False)
    confirmation_dialog: Mapped[bool] = mapped_column(Boolean, default=True)
    share_slug: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, unique=True)
    custom_domain: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BusinessProductCategory(Base):
    __tablename__ = "business_product_categories"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Donation(Base):
    __tablename__ = "donations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    stripe_session_id: Mapped[Optional[str]] = mapped_column(String(190), unique=True, index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True) # pending, paid, failed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─── My Vehicle ───────────────────────────────────────────────────────────────

class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    household_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=False, index=True)
    created_by_user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    vehicle_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # car / motorcycle / van / other
    registration_number: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    brand: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    variant: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    fuel_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # petrol / diesel / hybrid / ev
    engine_capacity: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    purchase_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    purchase_price: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    current_odometer: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 1), nullable=True)
    image_object_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)  # active / maintenance / sold / inactive
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    fuel_logs: Mapped[List["VehicleFuelLog"]] = relationship(back_populates="vehicle", cascade="all, delete-orphan")
    expenses: Mapped[List["VehicleExpense"]] = relationship(back_populates="vehicle", cascade="all, delete-orphan")
    maintenance_records: Mapped[List["VehicleMaintenance"]] = relationship(back_populates="vehicle", cascade="all, delete-orphan")
    documents: Mapped[List["VehicleDocument"]] = relationship(back_populates="vehicle", cascade="all, delete-orphan")
    reminders: Mapped[List["VehicleReminder"]] = relationship(back_populates="vehicle", cascade="all, delete-orphan")
    attachments: Mapped[List["VehicleAttachment"]] = relationship(back_populates="vehicle", cascade="all, delete-orphan")
    odometer_readings: Mapped[List["VehicleOdometerReading"]] = relationship(back_populates="vehicle", cascade="all, delete-orphan")


class VehicleFuelLog(Base):
    __tablename__ = "vehicle_fuel_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    vehicle_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    household_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=False, index=True)
    log_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    odometer: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 1), nullable=True)
    price_per_litre: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 3), nullable=True)
    litres: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 3), nullable=True)
    total_amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    is_full_tank: Mapped[bool] = mapped_column(Boolean, default=True)
    station: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    payment_wallet: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    receipt_attachment_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    distance_travelled: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 1), nullable=True)
    km_per_litre: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 3), nullable=True)
    cost_per_km: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 4), nullable=True)
    wallet_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("wallets.id"), nullable=True, index=True)
    transaction_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("transactions.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="fuel_logs")


class VehicleExpense(Base):
    __tablename__ = "vehicle_expenses"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    vehicle_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    household_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount: Mapped[float] = mapped_column(DECIMAL(12, 2), nullable=False)
    odometer: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 1), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    wallet_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("wallets.id"), nullable=True, index=True)
    transaction_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("transactions.id"), nullable=True, index=True)
    receipt_attachment_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="expenses")


class VehicleMaintenance(Base):
    __tablename__ = "vehicle_maintenance"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    vehicle_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    household_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=False, index=True)
    service_type: Mapped[str] = mapped_column(String(120), nullable=False)
    service_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    odometer: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 1), nullable=True)
    workshop: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    labour_cost: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    parts_cost: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    total_cost: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    replaced_items: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    next_service_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    next_service_odometer: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 1), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="completed", index=True)  # upcoming / due_soon / overdue / completed
    receipt_attachment_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    wallet_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("wallets.id"), nullable=True, index=True)
    transaction_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("transactions.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="maintenance_records")


class VehicleDocument(Base):
    __tablename__ = "vehicle_documents"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    vehicle_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    household_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=False, index=True)
    doc_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)  # road_tax / insurance / other
    title: Mapped[str] = mapped_column(String(190), nullable=False)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    amount: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    provider: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    reference_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    coverage_info: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)  # active / expired / archived
    file_attachment_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="documents")


class VehicleReminder(Base):
    __tablename__ = "vehicle_reminders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    vehicle_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    household_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=False, index=True)
    reminder_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)  # service / road_tax / insurance / custom / odometer
    title: Mapped[str] = mapped_column(String(190), nullable=False)
    due_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    due_odometer: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 1), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending / completed / dismissed
    source_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # maintenance / document / manual
    source_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="reminders")


class VehicleAttachment(Base):
    __tablename__ = "vehicle_attachments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    vehicle_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    household_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=False, index=True)
    parent_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)  # vehicle_image / fuel / expense / maintenance / document
    parent_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, index=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    object_key: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    uploaded_by_user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="attachments")


class VehicleOdometerReading(Base):
    __tablename__ = "vehicle_odometer_readings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    vehicle_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True)
    household_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=False, index=True)
    reading_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    odometer: Mapped[float] = mapped_column(DECIMAL(12, 1), nullable=False)
    source: Mapped[str] = mapped_column(String(30), default="manual")  # manual / fuel / maintenance
    source_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="odometer_readings")


# ─── My Places ────────────────────────────────────────────────────────────────

class PlaceCategory(Base):
    __tablename__ = "place_categories"
    __table_args__ = (
        UniqueConstraint("user_id", "name_key", name="uq_place_category_user_name"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    name_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    places: Mapped[List["Place"]] = relationship(back_populates="category")


class Place(Base):
    __tablename__ = "places"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    category_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("place_categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(190), nullable=False)
    latitude: Mapped[float] = mapped_column(DECIMAL(10, 7), nullable=False)
    longitude: Mapped[float] = mapped_column(DECIMAL(11, 8), nullable=False)
    location_name: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    source_channel: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category: Mapped[Optional["PlaceCategory"]] = relationship(back_populates="places")


class PlaceShareGroup(Base):
    """Named phone list for convoy / multi-friend WhatsApp share."""

    __tablename__ = "place_share_groups"
    __table_args__ = (
        UniqueConstraint("user_id", "name_key", name="uq_place_share_group_user_name"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    name_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    # JSON array of E.164-ish digits strings, e.g. ["60123456789","60198765432"]
    phones_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ─── Warranty Tracker (Waranti Saya) ─────────────────────────────────────────

class WarrantyDevice(Base):
    __tablename__ = "warranty_devices"
    __table_args__ = (
        UniqueConstraint("user_id", "serial_number", name="uq_warranty_device_user_serial"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    household_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=True, index=True)
    device_name: Mapped[str] = mapped_column(String(190), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    brand: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    serial_number: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    purchase_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    purchase_price: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    store_or_seller: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    receipt_or_order_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    warranty_start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    warranty_duration_months: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    warranty_expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_object_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    receipt_attachment_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    claims: Mapped[List["WarrantyClaim"]] = relationship(back_populates="device", cascade="all, delete-orphan")
    attachments: Mapped[List["WarrantyAttachment"]] = relationship(back_populates="device", cascade="all, delete-orphan")


class WarrantyClaim(Base):
    __tablename__ = "warranty_claims"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    device_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("warranty_devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    claim_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    problem_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    service_centre: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    reference_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    date_sent: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expected_completion_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    date_received: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    resolution: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # repaired / replaced / rejected / other
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attachment_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    device: Mapped["WarrantyDevice"] = relationship(back_populates="claims")


class WarrantyAttachment(Base):
    __tablename__ = "warranty_attachments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    device_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("warranty_devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    parent_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)  # device_image / receipt / claim
    parent_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, index=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    object_key: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    device: Mapped["WarrantyDevice"] = relationship(back_populates="attachments")


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    household_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    icon_name: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    image_object_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, index=True)
    currency: Mapped[str] = mapped_column(String(10), default="RM")
    wallet_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("wallets.id"), nullable=True, index=True)
    budget: Mapped[Optional[float]] = mapped_column(DECIMAL(14, 2), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="upcoming", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SplitBill(Base):
    __tablename__ = "split_bills"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    household_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=True, index=True)
    transaction_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("transactions.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(190), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="RM")
    total_amount: Mapped[Optional[float]] = mapped_column(DECIMAL(14, 2), nullable=True)
    people_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    share_amount: Mapped[Optional[float]] = mapped_column(DECIMAL(14, 2), nullable=True)
    collect_amount: Mapped[Optional[float]] = mapped_column(DECIMAL(14, 2), nullable=True)
    amount_received: Mapped[float] = mapped_column(DECIMAL(14, 2), default=0.0)
    balance_amount: Mapped[float] = mapped_column(DECIMAL(14, 2), default=0.0)
    am_i_included: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    original_txn_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    payments: Mapped[List["SplitBillPayment"]] = relationship(
        back_populates="split", cascade="all, delete-orphan", order_by="SplitBillPayment.payment_date.desc(), SplitBillPayment.id.desc()"
    )


class SplitBillPayment(Base):
    __tablename__ = "split_bill_payments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    household_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("households.id"), nullable=True, index=True)
    split_bill_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("split_bills.id"), nullable=False, index=True)
    wallet_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("wallets.id"), nullable=True, index=True)
    transaction_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("transactions.id"), nullable=True, index=True)
    amount: Mapped[float] = mapped_column(DECIMAL(14, 2), nullable=False)
    payment_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    payment_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    media_object_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    split: Mapped["SplitBill"] = relationship(back_populates="payments")

# ─── Barang Saya (Personal Inventory) ────────────────────────────────────────

class InventoryLocation(Base):
    __tablename__ = "inventory_locations"
    __table_args__ = (
        Index("ix_inventory_locations_user_parent", "user_id", "parent_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    parent_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("inventory_locations.id"), nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class InventoryContainer(Base):
    __tablename__ = "inventory_containers"
    __table_args__ = (
        UniqueConstraint("user_id", "code", name="uq_inventory_container_user_code"),
        Index("ix_inventory_containers_user_location", "user_id", "location_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    location_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("inventory_locations.id"), nullable=True, index=True)
    code: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # reserved for future QR
    image_object_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class InventoryItem(Base):
    __tablename__ = "inventory_items"
    __table_args__ = (
        Index("ix_inventory_items_user_updated", "user_id", "updated_at"),
        Index("ix_inventory_items_user_status", "user_id", "status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit: Mapped[str] = mapped_column(String(20), nullable=False, default="unit")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="available", index=True)
    brand: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    purchase_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    purchase_price: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    image_object_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    location_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("inventory_locations.id"), nullable=True, index=True)
    container_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("inventory_containers.id"), nullable=True, index=True)
    transaction_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True, index=True)
    warranty_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("warranty_devices.id", ondelete="SET NULL"), nullable=True, index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    __table_args__ = (
        Index("ix_inventory_movements_item_created", "inventory_item_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    inventory_item_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False)
    movement_type: Mapped[str] = mapped_column(String(30), nullable=False)  # created|moved|quantity_changed|status_changed
    from_location_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    from_container_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    to_location_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    to_container_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    quantity_before: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    quantity_after: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status_before: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status_after: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_channel: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    moved_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

class InventoryConversationState(Base):
    """Barang Saya conversation state for bot channels (whatsapp/telegram/chat)."""
    __tablename__ = "inventory_conversation_states"
    __table_args__ = (
        UniqueConstraint("user_id", "channel", name="uq_inventory_state_user_channel"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False)  # whatsapp|telegram|chat
    active_intent: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    pending_action: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    draft_data: Mapped[str] = mapped_column(Text, nullable=False, default="{}")  # JSON
    candidate_ids: Mapped[Optional[str]] = mapped_column(Text, nullable=True)    # JSON list
    confirmation_token_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SupportTicket(Base):
    """Feature request & support tickets submitted by users, managed by admins in Mastermind."""
    __tablename__ = "support_tickets"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # feature | support | bug
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="new")  # new | in_progress | resolved | closed
    priority: Mapped[str] = mapped_column(String(20), default="medium")  # low | medium | high
    admin_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class SupportTicketReply(Base):
    """A single reply on a support ticket — 2-way conversation (user or admin)."""
    __tablename__ = "support_ticket_replies"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ticket_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("support_tickets.id"), nullable=False, index=True)
    sender: Mapped[str] = mapped_column(String(20), nullable=False, default="user")  # user | admin
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


# ════════════════════════════════════════════════════════════════════════════
# Income Tax Module
# ════════════════════════════════════════════════════════════════════════════

class TaxRule(Base):
    """Versioned, per-assessment-year tax rules (brackets, reliefs, rebates).
    Global table — not per-user. Seeded from tax_rules_data."""
    __tablename__ = "tax_rules"
    __table_args__ = (
        UniqueConstraint("assessment_year", "rule_type", "rule_code", name="uq_tax_rules_year_type_code"),
        Index("ix_tax_rules_year_active", "assessment_year", "active"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    assessment_year: Mapped[int] = mapped_column(Integer, nullable=False)
    rule_type: Mapped[str] = mapped_column(String(20), nullable=False)  # bracket | relief | rebate | residency
    rule_code: Mapped[str] = mapped_column(String(60), nullable=False)  # e.g. 'relief_lifestyle', 'rebate_zakat'
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    limit_amount: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)  # max claimable
    calculation_rule: Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # JSON (brackets)
    eligibility_rule: Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # JSON / text
    document_requirement: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_reference: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)  # e.g. HASiL LHDN
    effective_from: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    effective_to: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TaxProfile(Base):
    """Per-user, per-assessment-year tax situation."""
    __tablename__ = "tax_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", "assessment_year", name="uq_tax_profile_user_year"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    assessment_year: Mapped[int] = mapped_column(Integer, nullable=False)
    residency_status: Mapped[str] = mapped_column(String(20), default="resident")  # resident | non_resident
    marital_status: Mapped[str] = mapped_column(String(20), default="single")      # single | married | divorced | widowed
    income_source: Mapped[str] = mapped_column(String(20), default="employment")   # employment | business | both
    disabled_status: Mapped[bool] = mapped_column(Boolean, default=False)
    spouse_income_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # has_income | no_income
    assessment_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)       # separate | joint
    tax_identifier_encrypted: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # TIN (encrypted)
    zakat_tracking_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    review_status: Mapped[str] = mapped_column(String(20), default="incomplete")  # incomplete | in_review | complete
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TaxEmployer(Base):
    """Employer for a given assessment year (supports multiple employers)."""
    __tablename__ = "tax_employers"
    __table_args__ = (Index("ix_tax_employers_user_year", "user_id", "assessment_year"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    assessment_year: Mapped[int] = mapped_column(Integer, nullable=False)
    employer_name: Mapped[str] = mapped_column(String(190), nullable=False)
    employer_tax_number: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    employment_start: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    employment_end: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TaxEAForm(Base):
    """An EA/EC form — raw OCR extraction must be reviewed/confirmed before use."""
    __tablename__ = "tax_ea_forms"
    __table_args__ = (Index("ix_tax_ea_user_year", "user_id", "assessment_year"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    assessment_year: Mapped[int] = mapped_column(Integer, nullable=False)
    employer_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("tax_employers.id"), nullable=True)
    document_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("tax_documents.id"), nullable=True)
    document_type: Mapped[str] = mapped_column(String(10), default="EA")  # EA | EC
    ocr_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | extracting | extracted | failed
    review_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | in_review | confirmed
    confidence: Mapped[Optional[float]] = mapped_column(DECIMAL(5, 2), nullable=True)
    employer_name: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    employer_tax_number: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    employee_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    employee_ic: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    salary: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    bonus: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    commission: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    allowances: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    benefits: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    perquisites: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    benefit_in_kind: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    living_accommodation: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    total_employment_income: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    pcb_amount: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    cp38_amount: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    epf_amount: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    socso_amount: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    zakat_amount: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    raw_extraction_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confirmed_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TaxIncome(Base):
    """Income record (employment / business) linked to EA, manual entry or transaction."""
    __tablename__ = "tax_income"
    __table_args__ = (Index("ix_tax_income_user_year", "user_id", "assessment_year"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    tax_profile_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("tax_profiles.id"), nullable=True)
    assessment_year: Mapped[int] = mapped_column(Integer, nullable=False)
    income_type: Mapped[str] = mapped_column(String(20), nullable=False)  # employment | business
    source_type: Mapped[str] = mapped_column(String(20), default="manual")  # ea | manual | transaction
    source_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)  # ea_form_id / transaction id
    employer_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("tax_employers.id"), nullable=True)
    employer_name: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    gross_amount: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    taxable_amount: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    business_name: Mapped[Optional[str]] = mapped_column(String(190), nullable=True)
    business_expenses: Mapped[Optional[float]] = mapped_column(DECIMAL(12, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | confirmed
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TaxDependant(Base):
    """Child/dependant record for children relief (privacy-first, no names needed)."""
    __tablename__ = "tax_dependants"
    __table_args__ = (Index("ix_tax_dependants_profile", "tax_profile_id"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tax_profile_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tax_profiles.id", ondelete="CASCADE"), nullable=False)
    dependant_type: Mapped[str] = mapped_column(String(30), nullable=False)  # under18 | education18plus | disabled_child | disabled_education
    relief_percentage: Mapped[int] = mapped_column(Integer, default=100)  # 50 | 100
    eligibility_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | eligible | not_eligible
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TaxRelief(Base):
    """A relief claim for a user+year, tied to a relief rule."""
    __tablename__ = "tax_reliefs"
    __table_args__ = (Index("ix_tax_reliefs_user_year", "user_id", "assessment_year"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    assessment_year: Mapped[int] = mapped_column(Integer, nullable=False)
    relief_rule_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("tax_rules.id"), nullable=True)
    relief_code: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    claimed_amount: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)
    eligible_amount: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual | transaction | ea
    status: Mapped[str] = mapped_column(String(20), default="claimed")  # suggested | claimed | reviewed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TaxReliefItem(Base):
    """A supporting item (transaction/document) under a relief claim."""
    __tablename__ = "tax_relief_items"
    __table_args__ = (Index("ix_tax_relief_items_relief", "tax_relief_id"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tax_relief_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tax_reliefs.id", ondelete="CASCADE"), nullable=False)
    transaction_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True)
    document_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("tax_documents.id", ondelete="SET NULL"), nullable=True)
    amount: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)
    eligible_amount: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | eligible | not_eligible
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TaxRebate(Base):
    """Tax rebate (reduces tax, not chargeable income) — e.g. Zakat."""
    __tablename__ = "tax_rebates"
    __table_args__ = (Index("ix_tax_rebates_user_year", "user_id", "assessment_year"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    assessment_year: Mapped[int] = mapped_column(Integer, nullable=False)
    rebate_rule_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("tax_rules.id"), nullable=True)
    rebate_code: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    amount: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual | transaction | ea
    transaction_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True)
    document_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("tax_documents.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="claimed")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TaxDocument(Base):
    """Supporting document stored securely (EA, receipts, statements)."""
    __tablename__ = "tax_documents"
    __table_args__ = (Index("ix_tax_documents_user_year", "user_id", "assessment_year"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    assessment_year: Mapped[int] = mapped_column(Integer, nullable=False)
    document_type: Mapped[str] = mapped_column(String(40), nullable=False)  # ea | receipt | insurance | epf | education | medical | zakat | business | other
    storage_reference: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # object key
    original_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    mime_type: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    document_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    linked_entity_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # ea_form | relief | rebate | transaction
    linked_entity_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    ocr_status: Mapped[str] = mapped_column(String(20), default="none")  # none | pending | done
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TaxCalculation(Base):
    """Persisted estimate result for a user+year."""
    __tablename__ = "tax_calculations"
    __table_args__ = (Index("ix_tax_calculations_user_year", "user_id", "assessment_year"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    assessment_year: Mapped[int] = mapped_column(Integer, nullable=False)
    rule_version: Mapped[str] = mapped_column(String(20), default="2026")
    income_total: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)
    relief_total: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)
    chargeable_income: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)
    gross_tax: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)
    rebate_total: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)
    net_tax: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)
    pcb_total: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)
    estimated_balance: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)  # + = overpayment, - = tax to pay
    calculation_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    calculated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TaxTransactionLink(Base):
    """Links an existing MyPeribadi transaction to a tax item.
    claim_amount may differ from transaction amount."""
    __tablename__ = "tax_transaction_links"
    __table_args__ = (
        Index("ix_tax_txn_links_user_year", "user_id", "tax_year"),
        UniqueConstraint("transaction_id", "tax_year", "tax_type", "tax_category_id", name="uq_tax_txn_link"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    transaction_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False)
    tax_year: Mapped[int] = mapped_column(Integer, nullable=False)
    tax_type: Mapped[str] = mapped_column(String(20), nullable=False)  # relief | rebate | income
    tax_category_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    claim_amount: Mapped[float] = mapped_column(DECIMAL(12, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="suggested")  # suggested | reviewed | accepted | rejected
    document_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("tax_documents.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ── Health Monitor & Medication Reminder ──────────────────────────────────────

class HealthReading(Base):
    """A single health measurement. BMI is computed from latest height+weight."""
    __tablename__ = "health_readings"
    __table_args__ = (
        Index("ix_health_readings_user_metric_date", "user_id", "metric_type", "measured_at"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    household_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    metric_type: Mapped[str] = mapped_column(String(30), nullable=False)  # weight | height | bp | glucose | pulse | spo2 | temperature
    value: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2), nullable=True)
    systolic: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2), nullable=True)  # BP only
    diastolic: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2), nullable=True)  # BP only
    unit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    measured_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Medication(Base):
    """A medication with one or more reminder times."""
    __tablename__ = "medications"
    __table_args__ = (
        Index("ix_medications_user_created", "user_id", "created_at"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    household_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    name: Mapped[str] = mapped_column(String(190), nullable=False)
    dosage: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)  # e.g. "500mg"
    frequency: Mapped[int] = mapped_column(Integer, default=1)  # times per day
    timing: Mapped[str] = mapped_column(String(20), default="anytime")  # before_meal | after_meal | anytime
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    schedules: Mapped[List["MedicationSchedule"]] = relationship(
        back_populates="medication", cascade="all, delete-orphan"
    )
    dose_logs: Mapped[List["MedicationDoseLog"]] = relationship(
        back_populates="medication", cascade="all, delete-orphan"
    )


class MedicationSchedule(Base):
    """A reminder time slot for a medication (e.g. 8:00 AM)."""
    __tablename__ = "medication_schedules"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    medication_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("medications.id", ondelete="CASCADE"), nullable=False, index=True
    )
    time: Mapped[time] = mapped_column(Time, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    position: Mapped[int] = mapped_column(Integer, default=0)  # display order
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    medication: Mapped["Medication"] = relationship(back_populates="schedules")


class MedicationDoseLog(Base):
    """Daily dose status for a medication schedule slot."""
    __tablename__ = "medication_dose_logs"
    __table_args__ = (
        Index("ix_dose_logs_med_date", "medication_id", "dose_date"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    medication_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("medications.id", ondelete="CASCADE"), nullable=False, index=True
    )
    schedule_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("medication_schedules.id", ondelete="CASCADE"), nullable=True, index=True
    )
    user_id: Mapped[str] = mapped_column(String(16), ForeignKey("users.id"), nullable=False, index=True)
    dose_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    scheduled_time: Mapped[time] = mapped_column(Time, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | taken | skipped | missed
    taken_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    medication: Mapped["Medication"] = relationship(back_populates="dose_logs")
