"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import { APP_VERSION_LABEL } from "@/lib/app-version"
import { getAccessToken } from "@/lib/auth-session"

export type Lang = "EN" | "BM"

export const translations = {
  EN: {
    // Navigation
    home: "Home",
    stats: "Stats",
    wallet: "Wallet",
    welcome: "Welcome",
    more: "Settings",
    dashboard: "Dashboard",
    transactions: "Transactions",
    mapView: "Map",
    debt: "Debt",
    budget: "Budget",
    categories: "Categories",
    chat: "Chat",
    whatsapp: "WhatsApp",
    receipts: "Receipts Gallery",
    loginLogs: "Login Logs",
    loginLogsDesc: "Recent sign-ins to your account",
    openMenu: "Open menu",
    headerDashboardSubtitle: "Your balance, trends, and recent activity.",
    headerTransactionsSubtitle: "Search, filter, and review every record.",
    headerMapSubtitle: "Pinned transaction locations by month.",
    headerDebtSubtitle: "Track IOUs, repayments, and open balances.",
    headerBudgetSubtitle: "Monthly category budgets and alerts.",
    headerCategoriesSubtitle: "Organize categories and smart keyword rules.",
    headerWhatsappSubtitle: "Connect your bot and control automations.",
    headerSettingsSubtitle: "Preferences, profile, and portal tools.",
    headerAccountSubtitle: "Update your personal details and contact info.",
    headerWalletSubtitle: "Manage wallets, currency, and account structure.",
    headerNotificationsSubtitle: "Choose which alerts reach your device.",
    headerSecuritySubtitle: "Password, privacy, and sign-in protection.",
    headerHelpSubtitle: "WhatsApp & Telegram bot command guide.",
    headerAboutSubtitle: "Product info, version notes, and platform details.",
    headerChangelogSubtitle: "Latest updates and release notes.",
    headerLoginLogsSubtitle: "Recent access history for your account.",
    headerTransactionDetailTitle: "Transaction Details",
    headerTransactionDetailSubtitle: "Review, edit, or remove this record.",
    headerHouseholdsTitle: "Legacy",
    headerHouseholdsSubtitle: "Legacy compatibility module.",

    // Dashboard
    balanceOverview: "Balance",
    liveUpdate: "Live update from database",
    totalIncome: "Total Income",
    totalExpense: "Total Expense",
    totalBudget: "Total Budget",
    totalUsed: "Total Used",
    remaining: "Remaining",
    addRecord: "Add Record",
    exportData: "Export Data",
    recentTransactions: "Recent Transactions",
    viewAll: "View All",
    topCategories: "Top Categories",
    trend7Days: "Trend (7 Days)",
    other: "Other",
    noTransactions: "No transactions",
    ofIncome: "OF INCOME",
    noAnalytics: "No analytical data",

    // Add Record Modal
    addNewRecord: "Add New Record",
    expense: "Expense",
    income: "Income",
    description: "Description",
    descPlaceholder: "e.g. Lunch",
    amount: "Amount (RM)",
    date: "Date",
    time: "Time",
    category: "Category",
    saveRecord: "Save",
    recordSaved: "Record saved successfully!",

    // Lagi Page
    lagiTitle: "Settings",
    profile: "Profile",
    myAccount: "My Account",
    language: "Language",
    switchLang: "Switch Language",
    notifications: "Notifications",
    security: "Security & Privacy",
    helpSupport: "Bot Command Guide",
    changelog: "What's New",
    about: "About Apps",
    logout: "Log Out",
    version: APP_VERSION_LABEL,
    walletSettings: "Wallet",
    linkedWhatsApp: "Linked WhatsApp",
    theme: "Theme",
    themeDesc: "Choose the visual mode for your portal.",
    darkMode: "Dark",
    lightMode: "Light",
    timezone: "Timezone",
    timezoneDesc: "Set your preferred time zone for transactions.",
    timezoneNote: "Default is Asia/Kuala_Lumpur (GMT+8).",
    timeFormat: "Time Format",
    timeFormat12: "12-Hour",
    timeFormat24: "24-Hour",
    timeFormatDesc: "Choose how time is displayed across the app.",
    system: "System",
    activeStatus: "Active",
    langActive: "English is active",
    balanceHeader: "Total Balance",
    preferences: "App Preferences",
    dangerZone: "Account Security",

    // Login / Register
    login: "Log In",
    register: "Create Account",
    email: "Email",
    password: "Password",
    fullName: "Short Name",
    phone: "Phone (WhatsApp)",
    phonePlaceholder: "e.g. 60123456789",
    forgotPassword: "Forgot?",
    dontHaveAccount: "Don't have an account?",
    alreadyHaveAccount: "Already have an account?",
    signUpNow: "Sign Up Now",
    signInHere: "Sign In Here",
    loginDesc: "Log in to your portal",
    loginSuccess: "Login successful! Redirecting to dashboard...",
    loginFailed: "Invalid email or password.",
    serverError: "Failed to connect to server.",
    fillEmailPass: "Please fill in email and password.",
    registerTitle: "Join MyPeribadi",
    registerDesc: "Start tracking with your Personal WhatsApp Bot",
    registerSuccess: "Registration successful! Redirecting to login...",
    creatingAccount: "Creating account...",
    backToLogin: "Back to login",

    // Categories
    categories_title: "Categories",
    addCategory: "Add Category",
    searchCategory: "Search categories...",
    updateDetails: "Update Details",
    archive: "Archive",
    addKeyword: "Add Keyword",
    phrase: "Phrase",
    type: "Type",
    status: "Status",
    action: "Action",
    noKeywords: "No Keywords Found",
    noKeywordsDesc: "Add mapping phrases to auto-categorize WhatsApp messages.",
    categoryName: "Category Name",
    kind: "Type",
    save: "Save",
    saveChanges: "Save",
    cancel: "Cancel",
    delete: "Delete",
    archiveCategory: "Archive Category?",
    archiveDesc: "This category will be archived and no longer active for WhatsApp auto-mapping.",
    deleteKeyword: "Delete Keyword?",
    deleteKeywordDesc: "This keyword will be deleted and no longer used for auto-mapping.",
    selectCategory: "Select Category",
    selectCategoryPlaceholder: "Select a category...",
    noCategories: "No categories",
    autoMapKeywords: "Auto-Map Keywords",
    mappingConfig: "Mapping Config",
    mappingConfigDesc: "System will auto-assign transactions to this category based on the keywords below.",
    categoryIcon: "Category Icon",
    keywordList: "Keywords",
    keywordCountLabel: "Keywords",
    categoryInformation: "Category Icon",
    existingKeywords: "Active Keywords",
    addNewKeywordLong: "Add New Keyword",
    keywordPlaceholder: "Enter keyword...",
    add: "Add",
    exampleCategoryName: "e.g. Starbucks",
    exampleKeyword: "e.g. starbucks",
    matchContains: "Contains",
    matchExact: "Exact",
    matchStartsWith: "Starts With",
    addNew: "ADD NEW",
    addKeywordButton: "+ ADD KEYWORD",
    addNewCategoryButton: "+ Add New Category",
    selectCategoryToView: "Select a category to view configuration",

    // Transactions Page
    allTransactions: "All Transactions",
    searchTransactions: "Search transactions...",
    all: "All",
    startDate: "Start Date",
    endDate: "End Date",
    clear: "Clear",
    previous: "Previous",
    next: "Next",
    page: "Page",
    expenseBreakdown: "Expenses",
    transactionList: "Transactions",
    loadingTransactions: "Loading Transactions...",
    noMatchingRecords: "No records matching filters",
    totalRecords: "Total",
    clearFilters: "Clear all filters",
    noDate: "No Date",
    uncategorized: "Uncategorized",
    noDescription: "No description",
    previousMonth: "Previous Month",
    nextMonth: "Next Month",
    exportNoRecords: "No records to export.",
    errorLabel: "Error",
    csvDate: "Date",
    csvDescription: "Description",
    csvCategory: "Category",
    csvType: "Type",
    csvAmount: "Amount",
    previousPeriod: "Previous Period",
    noArchivedData: "No archived data",
    download: "Download",
    back: "Back",
    edit: "Edit",
    walletLabel: "Wallet",
    sourceLabel: "Source",
    createdLabel: "Created",
    notesLabel: "Notes",
    view: "View",
    walletCash: "Cash",
    transactionNotFound: "Transaction not found",
    transactionLoadError: "Error loading transaction",
    transactionBackToList: "Please return to the transactions list.",
    sourceWebChat: "Web Chat",
    sourceWhatsappBot: "WhatsApp Bot",
    sourceWhatsappGroupBot: "WhatsApp Group Bot",
    sourcePortalWeb: "Web Portal",
    sourceUnknown: "Unknown",
    incomingFunds: "Incoming Funds",
    outgoingFlow: "Outgoing Flow",
    receiptAttachments: "Receipt Attachments",
    viewReceipt: "View Receipt",
    loadingImage: "Loading image...",
    openAttachmentError: "Unable to open attachment. Please try again.",
    downloadAttachmentError: "Unable to download attachment. Please try again.",
    deleteTransactionTitle: "Delete Transaction?",
    deleteTransactionDesc: "This action cannot be undone. The transaction \"{description}\" for RM {amount} will be permanently deleted.",
    editTransaction: "Edit Transaction",
    preview: "Preview",
    recordUpdated: "Record updated successfully!",
    uploadReceiptOptional: "Upload Receipt (Optional)",
    notesPlaceholder: "Additional notes...",
    updateRecord: "Update Record",
    walletTransferLocked: "This record is an internal wallet transfer. It is locked so incoming and outgoing amounts remain matched.",
    downloadDesc: "Get the CSV file for your financial records.",
    pleaseWait: "Please wait",
    monthlyExpenseTrend: "Monthly Expenses",
    monthlyTab: "Monthly",
    dailyTab: "Daily",
    last6Months: "Last 6 Months",
    moreThanLastMonth: "higher",
    lessThanLastMonth: "lower",
    expenseTrendEmpty: "No monthly expense data",
    expenseTrendDailyEmpty: "No daily expense data",
    mapNoLocations: "No pinned transactions for this month.",
    mapPinsLabel: "Pins",
    mapIncomePins: "Income",
    mapExpensePins: "Expense",
    mapOpenInMaps: "Open Maps",
    mapLocationUnknown: "Unknown location",
    mapNoDescription: "No description",
    mapEmptyHint: "Send a WhatsApp location pin, then record with `@here`.",
    mapTwoFingerHint: "Use 2 fingers to move map",
    mapTapToClose: "Tap map to close card",
    debtTitle: "Debt Tracker",
    debtSubtitle: "Keep lending and borrowing separate from normal income and expense reports.",
    debtReceivable: "Collect",
    debtPayable: "To pay",
    debtPeople: "Active People",
    debtNewEntry: "New Entry",
    debtCounterparty: "Name",
    debtCounterpartyPlaceholder: "e.g. Ali",
    debtEventType: "Type",
    debtLendOut: "Lend",
    debtBorrowed: "Borrow",
    debtPaymentIn: "Receive",
    debtPaymentOut: "Pay Back",
    debtOpeningReceivable: "Collect",
    debtOpeningPayable: "To pay",
    debtAmount: "Amount",
    debtWallet: "Wallet",
    debtDefaultWallet: "Use bot default wallet",
    debtNoWalletImpact: "No wallet impact",
    debtDate: "Date",
    debtNotes: "Notes",
    debtNotesPlaceholder: "Optional note",
    debtSaveEntry: "Save Debt Entry",
    debtSaving: "Saving...",
    debtShowSettled: "Show settled",
    debtHideSettled: "Hide settled",
    debtSearchPlaceholder: "Search people...",
    debtNoRecords: "No debt records",
    debtNoRecordsHint: "Create one here or send `lend Ali 50` in WhatsApp.",
    debtTheyOweYou: "They owe you",
    debtYouOweThem: "You owe them",
    debtSettled: "Settled",
    debtTimeline: "Timeline",
    debtSelectPerson: "Select a person",
    debtNoEntries: "No entries yet",
    debtTotalLent: "Lent",
    debtTotalBorrowed: "Borrowed",
    debtPaidIn: "Received",
    debtPaidOut: "Paid",
    debtEntrySaved: "Debt entry saved.",
    debtEntryDeleted: "Debt entry deleted.",
    debtDeleteConfirm: "Delete debt entry for {name} ({amount})? This will also remove the linked wallet transaction.",
    debtDeleteError: "Unable to delete debt entry.",
    debtLoadError: "Unable to load debt records.",
    debtEntryError: "Unable to save debt entry.",
    debtWaPantas: "Fast with WhatsApp",
    debtWaCommandDesc: "Type command directly to bot",
    debtWaDiaHutang: "They Owe",
    debtWaDiaBayar: "They Pay",
    debtWaKitaHutang: "We Owe",
    debtWaKitaBayar: "We Pay",
    debtWaCheckList: "Check List",
    debtWaGuide: "Guide",

    // WhatsApp Page
    waTitle: "Personal Bot",
    waDesc: "Scan the QR code to link your own WhatsApp account for full expense control",
    waConnected: "WhatsApp Connected",
    waConnectedDesc: "You can now use self-chat, and optionally selected groups with a trigger prefix",
    waDisconnectedDesc: "Scan the QR code to use the bot in your self-chat",
    notConnected: "Not Connected",
    linkAccount: "Link Account",
    waGroupsTab: "Groups Ws",
    recentMessages: "Recent Messages",
    botGuide: "Guide",
    scanQR: "Scan This QR Code",
    waInstructions: "Open WhatsApp on your phone, tap Menu > Linked Devices > Link a Device.",
    generatingQR: "Generating QR Code...",
    connectedSuccess: "Successfully Connected",
    connError: "Connection Error",
    yourPairingCode: "Your Pairing Code",
    generatingCode: "Generating code...",
    pairingCodeDesc: "Enter this code on your phone under Linked Devices > Link with phone number.",
    linkViaPhone: "Or link using phone number",
    getCode: "Get Code",
    clearingSession: "Clearing session...",
    clearSessionBtn: "Clear Session & Generate New QR",
    securityPrivacy: "Security & Privacy Guaranteed",
    securityDesc: "We do not store or read all your personal messages. MyPeribadi Bot only captures messages from your self-chat, plus selected groups that you explicitly allow with a trigger prefix.",
    waPrivacyTitle: "WhatsApp Privacy Notice",
    waPrivacyDesc: "Please DO NOT use your personal WhatsApp number to connect with the bot. Use a separate/dedicated WhatsApp number instead. This is to protect your privacy — all personal data on your WhatsApp account remains private. Connecting with your personal account is done entirely at your own risk and responsibility.",
    waPrivacyNotice: "Before connecting WhatsApp, please review this notice.\n\nWe recommend using a dedicated WhatsApp number for the bot instead of your personal number. This helps keep your private chats separate from bot activity.\n\nWhen connected, the bot may receive messages from your own chat and from groups that you enable. MyPeribadi only processes messages needed for budget features such as expenses, receipts, wallets, summaries, and allowed group commands.\n\nRecommended setup:\n1. Use a separate prepaid SIM or secondary WhatsApp number\n2. Add that number to the groups where you want the bot to work\n3. Make it group admin if group reading is required\n4. Connect the number here and enable only the groups you trust\n\nBy continuing, you confirm that you understand how WhatsApp access works and you are responsible for choosing which number and groups to connect.",
    waPrivacyAgree: "I Understand",
    waPrivacyDisagree: "Cancel",
    recentIncomingMessages: "Recent Incoming Messages",
    noWaRecords: "No WhatsApp Records",
    noWaRecordsDesc: "Send expenses to the bot now to start recording at lightning speed.",
    noAmountDetected: "Amount not detected in message",
    howToUse: "How It Works",
    guideStep1: "Connect Bot",
    guideStep1Desc: "Complete the WhatsApp linking in the 'Link Account' tab to start recording.",
    guideStep2: "Message Yourself",
    guideStep2Desc: "Open your self-chat and send a message like 'lunch 10', 'summary', or 'list'. Optional: in selected groups, start with a trigger like 'bd lunch 10'.",
    guideStep3: "Auto-Catalog",
    guideStep3Desc: "The bot will auto-detect the amount and category based on your defined keywords.",
    commandExamples: "Command Examples",
    smartCategory: "Smart Category Mapping",
    smartCategoryDesc: "Each expense message from your self-chat, or from an allowed group with the correct trigger prefix, will be matched with the keywords you set in the Categories tab.",
    autoFormat: "AUTO-DETECTION FORMAT",
    manageCategories: "Manage Categories",
    waExample3Desc: "Check your current month summary",
    allow: "Allow",
    summary: "Summary",

    // Email verification
    verifyEmail: "Verify your email address to secure your account.",
    verifyEmailAction: "Resend email",
    verifySending: "Sending...",
    verifyEmailTitle: "Email Verified",
    verifyEmailSuccess: "Thanks! Your email address has been verified.",
    verifyEmailFailedTitle: "Verification Failed",
    verifyEmailInvalid: "Invalid or expired verification link.",
    verifyEmailLoading: "Verifying email...",
    verifyEmailGoBack: "Go to sign in",
    verifyEmailBackHome: "Back",
    verifyEmailDisableWarning: "Your account will be disabled if you don't verify your email within",
    verifyEmailDisableWarningLegacy: "Verify your email to keep your account active.",
  },

  BM: {
    // Navigation
    home: "Utama",
    stats: "Statistik",
    wallet: "Dompet",
    welcome: "Selamat Datang",
    more: "Tetapan",
    dashboard: "Dashboard",
    transactions: "Transaksi",
    mapView: "Peta",
    debt: "Hutang",
    budget: "Budget",
    categories: "Kategori",
    chat: "Chat",
    whatsapp: "WhatsApp",
    receipts: "Galeri Resit",
    loginLogs: "Log Login",
    loginLogsDesc: "Senarai login terbaru akaun anda",
    openMenu: "Buka menu",
    headerDashboardSubtitle: "Ringkasan baki, trend, dan aktiviti terkini anda.",
    headerTransactionsSubtitle: "Cari, tapis, dan semak semua rekod dengan cepat.",
    headerMapSubtitle: "Lokasi transaksi bertanda ikut bulan.",
    headerDebtSubtitle: "Jejak hutang, bayaran balik, dan baki terbuka.",
    headerBudgetSubtitle: "Bajet bulanan kategori dan amaran semasa.",
    headerCategoriesSubtitle: "Urus kategori dan keyword pintar untuk auto-map.",
    headerWhatsappSubtitle: "Sambung bot anda dan kawal automasi dengan mudah.",
    headerSettingsSubtitle: "Keutamaan, profil, dan alat portal anda.",
    headerAccountSubtitle: "Kemaskini maklumat peribadi dan butiran hubungan.",
    headerWalletSubtitle: "Urus wallet, mata wang, dan struktur akaun.",
    headerNotificationsSubtitle: "Pilih notifikasi yang anda mahu terima.",
    headerSecuritySubtitle: "Kata laluan, privasi, dan perlindungan log masuk.",
    headerHelpSubtitle: "Panduan command bot untuk WhatsApp & Telegram.",
    headerAboutSubtitle: "Maklumat produk, versi, dan butiran platform.",
    headerChangelogSubtitle: "Kemaskini terkini dan nota keluaran.",
    headerLoginLogsSubtitle: "Sejarah akses terkini untuk akaun anda.",
    headerTransactionDetailTitle: "Butiran Transaksi",
    headerTransactionDetailSubtitle: "Semak, kemaskini, atau padam rekod ini.",
    headerHouseholdsTitle: "Legacy",
    headerHouseholdsSubtitle: "Modul keserasian legacy.",
    navDashboard: "Papan Pemuka",
    navTransactions: "Transaksi",
    navCategories: "Kategori",
    navWhatsApp: "WhatsApp Bot",
    navSettings: "Lagi",
    menu: "MENU UTAMA",
    langLabel: "BAHASA",

    // Dashboard
    balanceOverview: "Baki",
    liveUpdate: "Kemaskini langsung dari pangkalan data",
    totalIncome: "Jumlah Pendapatan",
    totalExpense: "Jumlah Perbelanjaan",
    totalBudget: "Jumlah Budget",
    totalUsed: "Jumlah Digunakan",
    remaining: "Baki",
    addRecord: "Tambah Rekod",
    exportData: "Eksport Data",
    recentTransactions: "Transaksi Terkini",
    viewAll: "Lihat Semua",
    topCategories: "Kategori Utama",
    trend7Days: "Trend (7 Hari)",
    other: "Lain-lain",
    noTransactions: "Tiada transaksi",
    ofIncome: "DARI GAJI",
    noAnalytics: "Tiada data analitik",

    // Add Record Modal
    addNewRecord: "Tambah Rekod Baru",
    expense: "Perbelanjaan",
    income: "Pendapatan",
    description: "Penerangan",
    descPlaceholder: "cth. Makan tengah hari",
    amount: "Jumlah (RM)",
    date: "Tarikh",
    time: "Masa",
    category: "Kategori",
    saveRecord: "Save",
    recordSaved: "Rekod berjaya disimpan!",
    placeholderVendor: "cth. Nasi Lemak, Grab, Gaji",

    // Lagi Page
    lagiTitle: "Tetapan",
    profile: "Profil",
    myAccount: "Akaun Saya",
    language: "Bahasa",
    switchLang: "Tukar Bahasa",
    notifications: "Pemberitahuan",
    security: "Keselamatan & Privasi",
    helpSupport: "Bot Command Guide",
    changelog: "Apa Baru",
    about: "Tentang Apps",
    logout: "Log Keluar",
    version: APP_VERSION_LABEL,
    walletSettings: "Dompet",
    linkedWhatsApp: "WhatsApp Bersambung",
    theme: "Tema",
    themeDesc: "Pilih mod paparan untuk portal anda.",
    darkMode: "Gelap",
    lightMode: "Cerah",
    timezone: "Zon Masa",
    timezoneDesc: "Tetapkan zon masa pilihan anda untuk transaksi.",
    timezoneNote: "Default adalah Asia/Kuala_Lumpur (GMT+8).",
    timeFormat: "Format Masa",
    timeFormat12: "12-Jam",
    timeFormat24: "24-Jam",
    timeFormatDesc: "Pilih cara masa dipaparkan dalam aplikasi.",
    system: "Sistem",
    activeStatus: "AKTIF",
    langActive: "Bahasa Melayu aktif",
    balanceHeader: "Jumlah Baki",
    preferences: "Keutamaan Aplikasi",
    dangerZone: "Keselamatan Akaun",

    // Login / Register
    login: "Log Masuk",
    register: "Cipta Akaun",
    email: "E-mel",
    password: "Kata Laluan",
    fullName: "Nama Pendek",
    phone: "No. Telefon (WhatsApp)",
    phonePlaceholder: "cth: 60123456789",
    forgotPassword: "Lupa?",
    dontHaveAccount: "Belum ada akaun?",
    alreadyHaveAccount: "Dah ada akaun?",
    signUpNow: "Daftar Sekarang",
    signInHere: "Masuk Sini",
    loginDesc: "Log masuk ke portal anda",
    loginSuccess: "Log masuk berjaya! Menghala ke dashboard...",
    loginFailed: "E-mel atau kata laluan tidak sah.",
    serverError: "Gagal menyambung ke pelayan (Server Error).",
    fillEmailPass: "Sila isi e-mel dan kata laluan.",
    registerTitle: "Sertai MyPeribadi",
    registerDesc: "Mula rekod dengan Personal WhatsApp Bot anda",
    registerSuccess: "Pendaftaran berjaya! Menghala ke log masuk...",
    creatingAccount: "Mencipta akaun...",
    backToLogin: "Kembali ke log masuk",

    // Categories
    categories_title: "Kategori",
    addCategory: "Tambah Kategori",
    searchCategory: "Cari kategori...",
    updateDetails: "Kemaskini Butiran",
    archive: "Arkib",
    addKeyword: "Tambah Keyword",
    phrase: "Frasa",
    type: "Jenis",
    status: "Status",
    action: "Tindakan",
    noKeywords: "Tiada Keyword",
    noKeywordsDesc: "Tambah frasa pemetaan untuk auto-kategorikan mesej WhatsApp.",
    categoryName: "Nama Kategori",
    kind: "Jenis",
    save: "Save",
    saveChanges: "Save",
    cancel: "Batal",
    delete: "Padam",
    archiveCategory: "Arkibkan Kategori?",
    archiveDesc: "Kategori ini akan diarkibkan dan tidak lagi aktif untuk pemetaan auto WhatsApp.",
    deleteKeyword: "Padam Keyword?",
    deleteKeywordDesc: "Keyword ini akan dipadam dan tidak lagi digunakan untuk pemetaan auto.",
    selectCategory: "Pilih Kategori",
    selectCategoryPlaceholder: "Pilih kategori...",
    noCategories: "Tiada kategori",
    autoMapKeywords: "Auto-Map Keywords",
    mappingConfig: "Konfigurasi Pemetaan",
    mappingConfigDesc: "Sistem akan auto-assign transaksi ke kategori ini berdasarkan keyword di bawah.",
    categoryIcon: "Ikon Kategori",
    keywordList: "Keyword",
    keywordCountLabel: "Keyword",
    categoryInformation: "Ikon Kategori",
    existingKeywords: "Keyword Aktif",
    addNewKeywordLong: "Tambah Keyword Baru",
    keywordPlaceholder: "Taip keyword...",
    add: "Tambah",
    exampleCategoryName: "cth. Starbucks",
    exampleKeyword: "cth. starbucks",
    matchContains: "Mengandungi",
    matchExact: "Tepat",
    matchStartsWith: "Bermula Dengan",
    addNew: "TAMBAH BARU",
    addKeywordButton: "+ TAMBAH KEYWORD",
    addNewCategoryButton: "+ Tambah Kategori Baru",
    selectCategoryToView: "Pilih kategori untuk melihat konfigurasi",

    // Transactions Page
    allTransactions: "Semua Transaksi",
    searchTransactions: "Cari transaksi...",
    all: "Semua",
    startDate: "Tarikh Mula",
    endDate: "Tarikh Akhir",
    clear: "Padam",
    previous: "Sebelumnya",
    next: "Seterusnya",
    page: "Muka",
    expenseBreakdown: "Perbelanjaan",
    transactionList: "Transaksi",
    loadingTransactions: "Memuatkan Transaksi...",
    noMatchingRecords: "Tiada rekod padan dengan tapisan",
    totalRecords: "Jumlah",
    clearFilters: "Padam semua tapisan",
    noDate: "Tiada Tarikh",
    uncategorized: "Tanpa kategori",
    noDescription: "Tiada keterangan",
    previousMonth: "Bulan Sebelumnya",
    nextMonth: "Bulan Seterusnya",
    exportNoRecords: "Tiada rekod untuk dieksport.",
    errorLabel: "Ralat",
    csvDate: "Tarikh",
    csvDescription: "Penerangan",
    csvCategory: "Kategori",
    csvType: "Jenis",
    csvAmount: "Jumlah",
    previousPeriod: "Tempoh Sebelumnya",
    noArchivedData: "Tiada data arkib",
    download: "Muat Turun",
    back: "Kembali",
    edit: "Edit",
    walletLabel: "Dompet",
    sourceLabel: "Sumber",
    createdLabel: "Dicipta",
    notesLabel: "Nota",
    view: "Lihat",
    walletCash: "Cash",
    transactionNotFound: "Transaksi tidak dijumpai",
    transactionLoadError: "Ralat memuatkan transaksi",
    transactionBackToList: "Sila kembali ke senarai transaksi.",
    sourceWebChat: "Web Chat",
    sourceWhatsappBot: "WhatsApp Bot",
    sourceWhatsappGroupBot: "WhatsApp Group Bot",
    sourcePortalWeb: "Portal Web",
    sourceUnknown: "Tidak diketahui",
    incomingFunds: "Dana Masuk",
    outgoingFlow: "Aliran Keluar",
    receiptAttachments: "Lampiran Resit",
    viewReceipt: "Lihat Resit",
    loadingImage: "Memuatkan imej...",
    openAttachmentError: "Tak dapat buka attachment. Sila cuba lagi.",
    downloadAttachmentError: "Tak dapat download attachment. Sila cuba lagi.",
    deleteTransactionTitle: "Padam Transaksi?",
    deleteTransactionDesc: "Tindakan ini tidak boleh dibatalkan. Transaksi \"{description}\" sebanyak RM {amount} akan dipadam selama-lamanya.",
    editTransaction: "Edit Transaksi",
    preview: "Pratonton",
    recordUpdated: "Rekod berjaya dikemaskini!",
    uploadReceiptOptional: "Muat Naik Resit (Pilihan)",
    notesPlaceholder: "Nota tambahan...",
    updateRecord: "Kemaskini Rekod",
    walletTransferLocked: "Rekod ini ialah transfer wallet dalaman. Ia dikunci supaya jumlah masuk dan keluar kekal sepadan.",
    downloadDesc: "Dapatkan fail CSV untuk rekod kewangan anda.",
    pleaseWait: "Sila tunggu",
    monthlyExpenseTrend: "Perbelanjaan Bulanan",
    monthlyTab: "Bulanan",
    dailyTab: "Harian",
    last6Months: "6 Bulan Terakhir",
    moreThanLastMonth: "lebih tinggi",
    lessThanLastMonth: "lebih rendah",
    expenseTrendEmpty: "Tiada data perbelanjaan bulanan",
    expenseTrendDailyEmpty: "Tiada data perbelanjaan harian",

    // WhatsApp Page
    waTitle: "Personal Bot",
    waDesc: "Imbas kod QR untuk memautkan akaun WhatsApp anda bagi kawalan perbelanjaan penuh",
    waConnected: "WhatsApp Disambung",
    waConnectedDesc: "Anda boleh guna chat diri sendiri, dan optional group terpilih dengan prefix trigger",
    waDisconnectedDesc: "Imbas kod QR untuk guna bot dalam chat diri sendiri",
    notConnected: "Belum Disambung",
    linkAccount: "Sambung Akaun",
    waGroupsTab: "Groups Ws",
    recentMessages: "Mesej Terkini",
    botGuide: "Panduan",
    scanQR: "Imbas Kod QR Ini",
    waInstructions: "Buka WhatsApp di telefon anda, pergi ke butang Menu > Linked Devices > Link a Device.",
    generatingQR: "Menjana QR Code...",
    connectedSuccess: "Berjaya Disambung",
    connError: "Ralat Koneksi",
    yourPairingCode: "Kod Pautan Anda",
    generatingCode: "Menjana kod...",
    pairingCodeDesc: "Masukkan kod ini pada telefon anda di bahagian Linked Devices > Link with phone number.",
    linkViaPhone: "Atau paut guna nombor telefon",
    getCode: "Dapatkan Kod",
    clearingSession: "Membersih sesi...",
    clearSessionBtn: "Bersih Sesi & Jana QR Baru",
    securityPrivacy: "Keselamatan & Privasi Terjamin",
    securityDesc: "Kami tidak menyimpan atau membaca semua mesej peribadi anda. Bot MyPeribadi hanya menangkap mesej dari chat diri sendiri, serta group terpilih yang anda benarkan dengan prefix trigger.",
    waPrivacyTitle: "Notis Privasi WhatsApp",
    waPrivacyDesc: "JANGAN gunakan nombor WhatsApp peribadi anda untuk sambung dengan bot. Sila guna nombor WhatsApp berasingan/dedikasi. Ini untuk melindungi privasi anda — semua data peribadi dalam akaun WhatsApp anda kekal peribadi. Sebarang sambungan menggunakan akaun peribadi adalah atas tanggungjawab dan risiko anda sendiri.",
    waPrivacyNotice: "Sebelum sambungkan WhatsApp, sila baca notis ini.\n\nKami sarankan anda guna nombor WhatsApp khas untuk bot, bukan nombor peribadi utama. Ini membantu asingkan chat peribadi daripada aktiviti bot.\n\nApabila disambungkan, bot mungkin menerima mesej daripada chat diri sendiri dan group yang anda aktifkan. MyPeribadi hanya memproses mesej yang diperlukan untuk fungsi bajet seperti perbelanjaan, resit, wallet, ringkasan, dan arahan group yang dibenarkan.\n\nCadangan tetapan:\n1. Guna SIM prabayar atau nombor WhatsApp kedua\n2. Masukkan nombor itu ke group yang anda mahu bot berfungsi\n3. Jadikan nombor itu admin jika bacaan mesej group diperlukan\n4. Sambungkan nombor tersebut di halaman ini dan aktifkan group yang anda percaya sahaja\n\nDengan meneruskan, anda mengesahkan bahawa anda faham cara akses WhatsApp berfungsi dan anda bertanggungjawab memilih nombor serta group yang disambungkan.",
    waPrivacyAgree: "Saya Faham",
    waPrivacyDisagree: "Batal",
    recentIncomingMessages: "Mesej Masuk Terkini",
    noWaRecords: "Tiada Rekod WhatsApp",
    noWaRecordsDesc: "Hantar perbelanjaan ke bot sekarang untuk mula merekod kelajuan cahaya.",
    noAmountDetected: "Jumlah tidak dikesan dalam mesej",
    howToUse: "Cara Penggunaan",
    guideStep1: "Sambungkan Bot",
    guideStep1Desc: "Selesaikan pautan WhatsApp di tab 'Sambung Akaun' untuk mula merekod.",
    guideStep2: "Mesej Diri Sendiri",
    guideStep2Desc: "Buka chat dengan nombor anda sendiri di WhatsApp dan hantar mesej seperti 'nasi lemak 10', 'summary', atau 'list'. Optional: dalam group terpilih, mulakan dengan trigger seperti 'bd nasi lemak 10'.",
    guideStep3: "Auto-Katalog",
    guideStep3Desc: "Bot akan auto-kesan jumlah dan kategori berdasarkan keyword yang anda tetapkan.",
    commandExamples: "Contoh Arahan",
    smartCategory: "Kategori Pintar",
    smartCategoryDesc: "Setiap mesej belanja dari chat diri sendiri, atau dari group dibenarkan dengan prefix trigger yang betul, akan dipadankan dengan keyword yang anda tetapkan di tab Kategori.",
    autoFormat: "FORMAT AUTO-PENGESANAN",
    manageCategories: "Urus Kategori",
    waExample3Desc: "Semak ringkasan bulan semasa",
    allow: "Benarkan",
    summary: "Rumusan",
    mapNoLocations: "Tiada transaksi berlokasi untuk bulan ini.",
    mapPinsLabel: "Pin",
    mapIncomePins: "Masuk",
    mapExpensePins: "Belanja",
    mapOpenInMaps: "Buka Maps",
    mapLocationUnknown: "Lokasi tidak diketahui",
    mapNoDescription: "Tiada keterangan",
    mapEmptyHint: "Hantar location pin di WhatsApp, kemudian rekod dengan `@here`.",
    mapTwoFingerHint: "Guna 2 jari untuk gerak peta",
    mapTapToClose: "Tap pada peta untuk tutup kad",
    debtTitle: "Penjejak Hutang",
    debtSubtitle: "Asingkan pinjaman dan bayaran balik daripada laporan pendapatan/perbelanjaan biasa.",
    debtReceivable: "Perlu kutip",
    debtPayable: "Perlu bayar",
    debtPeople: "Orang Aktif",
    debtNewEntry: "Rekod Baru",
    debtCounterparty: "Nama",
    debtCounterpartyPlaceholder: "cth. Ali",
    debtEventType: "Jenis",
    debtLendOut: "Beri pinjam",
    debtBorrowed: "Pinjam",
    debtPaymentIn: "Terima bayaran",
    debtPaymentOut: "Bayar balik",
    debtOpeningReceivable: "Perlu kutip",
    debtOpeningPayable: "Perlu bayar",
    debtAmount: "Jumlah",
    debtWallet: "Dompet",
    debtDefaultWallet: "Guna bot default wallet",
    debtNoWalletImpact: "Tidak ubah wallet",
    debtDate: "Tarikh",
    debtNotes: "Nota",
    debtNotesPlaceholder: "Nota optional",
    debtSaveEntry: "Simpan",
    debtSaving: "Menyimpan...",
    debtShowSettled: "Tunjuk selesai",
    debtHideSettled: "Sembunyi selesai",
    debtSearchPlaceholder: "Cari nama...",
    debtNoRecords: "Tiada rekod hutang",
    debtNoRecordsHint: "Tambah di sini atau hantar `lend Ali 50` di WhatsApp.",
    debtTheyOweYou: "Orang hutang kita",
    debtYouOweThem: "Kita hutang orang",
    debtSettled: "Selesai",
    debtTimeline: "Timeline transaksi",
    debtSelectPerson: "Pilih nama",
    debtNoEntries: "Belum ada rekod",
    debtTotalLent: "Diberi",
    debtTotalBorrowed: "Dipinjam",
    debtPaidIn: "Diterima",
    debtPaidOut: "Dibayar",
    debtEntrySaved: "Rekod hutang disimpan.",
    debtEntryDeleted: "Rekod hutang dipadam.",
    debtDeleteConfirm: "Padam rekod hutang untuk {name} ({amount})? Transaksi dompet berkaitan juga akan dipadam.",
    debtDeleteError: "Tak dapat padam rekod hutang.",
    debtLoadError: "Tak dapat muatkan rekod hutang.",
    debtEntryError: "Tak dapat simpan rekod hutang.",
    debtWaPantas: "Pantas dengan WhatsApp",
    debtWaCommandDesc: "Taip command terus ke bot",
    debtWaDiaHutang: "Dia Hutang",
    debtWaDiaBayar: "Dia Bayar",
    debtWaKitaHutang: "Kita Hutang",
    debtWaKitaBayar: "Kita Bayar",
    debtWaCheckList: "Check Senarai",
    debtWaGuide: "Panduan",

    // Email verification
    verifyEmail: "Sahkan alamat e-mel anda untuk melindungi akaun.",
    verifyEmailAction: "Hantar e-mel",
    verifySending: "Menghantar...",
    verifyEmailTitle: "E-mel Disahkan",
    verifyEmailSuccess: "Terima kasih! Alamat e-mel anda telah disahkan.",
    verifyEmailFailedTitle: "Pengesahan Gagal",
    verifyEmailInvalid: "Pautan tidak sah atau telah tamat tempoh.",
    verifyEmailLoading: "Mengesahkan e-mel...",
    verifyEmailGoBack: "Ke halaman log masuk",
    verifyEmailBackHome: "Kembali",
    verifyEmailDisableWarning: "Akaun anda akan dilumpuhkan jika tidak sahkan e-mel dalam tempoh",
    verifyEmailDisableWarningLegacy: "Sahkan e-mel anda untuk pastikan akaun kekal aktif.",
  },
}

type Translations = typeof translations.EN

export const LANG_STORAGE_KEY = "lang"
export const LANG_COOKIE_KEY = "lang"

const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isLang(value: unknown): value is Lang {
  return value === "EN" || value === "BM"
}

function isBrowser(): boolean {
  return typeof window !== "undefined"
}

function getCookie(name: string): string | null {
  if (!isBrowser()) return null
  const target = `${name}=`
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(target))
  if (!cookie) return null
  return decodeURIComponent(cookie.slice(target.length))
}

function setCookie(name: string, value: string) {
  if (!isBrowser()) return
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax`
}

function getLocalStorageLang(): Lang | null {
  if (!isBrowser()) return null
  const savedLang = localStorage.getItem(LANG_STORAGE_KEY)
  return isLang(savedLang) ? savedLang : null
}

function getCookieLang(): Lang | null {
  const savedLang = getCookie(LANG_COOKIE_KEY)
  return isLang(savedLang) ? savedLang : null
}

function isPublicAuthPath(pathname: string): boolean {
  return pathname === "/login"
    || pathname === "/register"
    || pathname === "/forgot-password"
    || pathname === "/offline"
    || pathname.startsWith("/reset-password")
    || pathname.startsWith("/public/cart/")
}

export function storeLanguagePreference(nextLang: Lang) {
  if (!isBrowser()) return
  localStorage.setItem(LANG_STORAGE_KEY, nextLang)
  setCookie(LANG_COOKIE_KEY, nextLang)
  document.documentElement.lang = nextLang === "BM" ? "ms" : "en"
  document.documentElement.dataset.lang = nextLang
}

async function saveLanguageToServer(nextLang: Lang) {
  if (!isBrowser() || isPublicAuthPath(window.location.pathname)) return
  const token = getAccessToken()

  try {
    await fetch("/api/users/me", {
      method: "PATCH",
      credentials: "include",
      headers: {
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ language: nextLang }),
    })
  } catch (err) {
    console.error("Failed to update language on backend:", err)
  }
}

interface LangContextType {
  lang: Lang
  timezone: string
  timeFormat: "12h" | "24h"
  setLang: (l: Lang) => void
  setTimezone: (tz: string) => void
  setTimeFormat: (fmt: "12h" | "24h") => void
  t: Translations
}

interface LangProviderProps {
  children: React.ReactNode
  initialLang?: Lang
}

const LangContext = createContext<LangContextType>({
  lang: "BM",
  timezone: "Asia/Kuala_Lumpur",
  timeFormat: "24h",
  setLang: () => {},
  setTimezone: () => {},
  setTimeFormat: () => {},
  t: translations.BM,
})

export function LangProvider({ children, initialLang = "BM" }: LangProviderProps) {
  const [lang, setLangState] = useState<Lang>(getCookieLang() || initialLang)
  const [timezone, setTimezoneState] = useState<string>("Asia/Kuala_Lumpur")
  const [timeFormat, setTimeFormatState] = useState<"12h" | "24h">("24h")

  useEffect(() => {
    const savedLang = getLocalStorageLang()
    const savedTimezone = localStorage.getItem("timezone")
    const savedFormat = localStorage.getItem("timeFormat") as "12h" | "24h" | null

    React.startTransition(() => {
      if (savedLang) setLangState(savedLang)
      if (savedTimezone) setTimezoneState(savedTimezone)
      if (savedFormat === "12h" || savedFormat === "24h") setTimeFormatState(savedFormat)
    })

    if (savedLang) {
      storeLanguagePreference(savedLang)
    } else {
      storeLanguagePreference(getCookieLang() || initialLang)
    }
  }, [initialLang])

  useEffect(() => {
    // Fetch latest preferences from backend if logged in.
    const syncWithBackend = async () => {
      if (isPublicAuthPath(window.location.pathname)) return
      const token = getAccessToken()
      const localLang = getLocalStorageLang()

      try {
        const res = await fetch("/api/users/me", {
          credentials: "include",
          headers: token ? { "Authorization": `Bearer ${token}` } : undefined,
        })
        if (!res.ok) return

        const user = await res.json()
        if (!isLang(user.language)) return

        if (localLang && localLang !== user.language) {
          await saveLanguageToServer(localLang)
          return
        }

        React.startTransition(() => {
          setLangState(user.language)
        })
        storeLanguagePreference(user.language)
      } catch (err) {
        console.error("Failed to sync language with backend:", err)
      }
    }
    syncWithBackend()
  }, [])

  function setLang(l: Lang) {
    setLangState(l)
    storeLanguagePreference(l)
    void saveLanguageToServer(l)
  }

  function setTimezone(tz: string) {
    setTimezoneState(tz)
    localStorage.setItem("timezone", tz)
  }

  function setTimeFormat(fmt: "12h" | "24h") {
    setTimeFormatState(fmt)
    localStorage.setItem("timeFormat", fmt)
  }

  return (
    <LangContext.Provider value={{ lang, timezone, timeFormat, setLang, setTimezone, setTimeFormat, t: translations[lang] }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}
