/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Localization Engine & Dictionary (Arabic RTL & English LTR)
 */

import { Language } from '../types';

export const translations = {
  ar: {
    // Brand & System
    appName: 'RestaurantOS',
    appSubtitle: 'نظام إدارة المطاعم ونقاط البيع السحابية',
    systemTag: 'نظام تشغيل المطاعم الموحد',
    tenantDefault: 'مطعم قصر الشام والشواية',
    branchDefault: 'فرع القاهرة الرئيسي — المعادي',

    // Top Navigation & Workspaces
    workspacePos: 'نقطة البيع (POS)',
    workspaceCallCenter: 'الكول سنتر (Call Center)',
    workspaceKds: 'شاشة المطبخ (KDS)',
    workspaceHub: 'إدارة المطعم (Hub)',
    workspaceSaas: 'إدارة المنصة (SaaS)',
    online: 'متصل بالسحابة',
    offline: 'وضع عدم الاتصال (محلي)',
    synced: 'مُحدث بالكامل',
    pendingSync: 'عمليات معلقة بالمخزن المحلي',
    syncNow: 'مزامنة الآن',
    simulateOffline: 'محاكاة انقطاع الإنترنت',
    simulateOnline: 'إعادة الاتصال بالسحابة',

    // POS & Cash Register
    cashSession: 'وردية الكاشير',
    openSession: 'فتح وردية جديدة',
    closeSession: 'إغلاق الوردية وتصفية النقدية',
    sessionStatusOpen: 'الوردية مفتوحة',
    sessionStatusClosed: 'الوردية مغلقة',
    openingFloat: 'رصيد العهدة الافتتاحية',
    totalCashSales: 'مبيعات النقد (كاش)',
    totalCardSales: 'مبيعات البطاقات (فيزا/ماستر)',
    totalInstaPaySales: 'مبيعات إنستاباي ومحافظ',
    expectedCash: 'النقدية المتوقعة بالدرج',
    countedCash: 'النقدية المحصية فعلياً',
    variance: 'الفارق (عجز / زيادة)',
    varianceShortage: 'عجز في الدرج',
    varianceSurplus: 'زيادة في الدرج',
    varianceExact: 'مطابقة تامة',
    closeSessionConfirm: 'تأكيد إغلاق الوردية وترحيل القيد المحاسبي',
    
    // Order Types & Tables
    dineIn: 'صالة طعام',
    takeaway: 'سفري / تيك أواي',
    delivery: 'توصيل منزلي',
    tableNumber: 'طاولة',
    tablesFloor: 'خريطة الصالة والطاولات',
    available: 'متاحة',
    occupied: 'مشغولة',
    billRequested: 'طلب الحساب',
    guests: 'أفراد',
    selectCategory: 'الأقسام الرئيسية',
    allCategories: 'كل الأصناف',
    searchMenu: 'بحث في قائمة الطعام أو الباركود...',
    emptyMenu: 'لم يتم العثور على وجبات مطابقة',

    // Cart & Ticket
    currentOrder: 'طلب الوجبات الحالي',
    orderNumber: 'رقم الفاتورة',
    item: 'الصنف',
    qty: 'الكمية',
    price: 'السعر',
    modifiers: 'الإضافات والملاحظات',
    addModifiers: 'تخصيص الإضافات',
    orderNotes: 'ملاحظات خاصة بالمطبخ',
    clearOrder: 'مسح الطلب',
    sendToKitchen: 'إرسال للمطبخ (KDS)',
    subtotal: 'المجموع قبل الضريبة',
    vat14: 'ضريبة القيمة المضافة (14%)',
    serviceCharge: 'خدمة الصالة (12%)',
    discount: 'خصم خاص',
    grandTotal: 'المبلغ الإجمالي المستحق',
    payNow: 'سداد الحساب وإصدار الفاتورة',
    splitBill: 'تقسيم الفاتورة',
    exactAmount: 'المبلغ كاملاً',
    tendered: 'المبلغ المستلم من العميل',
    changeDue: 'المتبقي للعميل (الفكة)',
    receiptThermal: 'الفاتورة الضريبية المبسطة',
    printReceipt: 'طباعة الفاتورة الحرارية',
    close: 'إغلاق',

    // Payment Methods
    cash: 'نقداً (كاش)',
    card: 'بطاقة مصرفية (POS)',
    instapay: 'إنستاباي / محفظة هاتف',
    vodafoneCash: 'فودافون كاش',

    // KDS
    kdsTitle: 'شاشة تشغيل المطبخ والتجهيز',
    stationAll: 'كل المحطات',
    stationGrill: 'شواية ولحوم',
    stationCold: 'مطبخ بارد وسلطات',
    stationBeverage: 'مشروبات وعصائر',
    ticketWaiting: 'قيد الانتظار',
    ticketPrep: 'جاري التحضير',
    ticketReady: 'جاهز للاستلام',
    bumpTicket: 'إتمام الطلب وتسليمه',
    elapsed: 'الوقت المنقضي',

    // Hub Tabs
    hubMenu: 'القائمة والأسعار',
    hubInventory: 'المخزون والمستودعات',
    hubRecipes: 'الوصفات وتكاليف الوجبات',
    hubPurchasing: 'المشتريات وفواتير الموردين',
    hubAccounting: 'المحاسبة العامة ودفتر الأستاذ',
    hubEmployees: 'فريق العمل والورديات',
    hubReports: 'التقارير التحليلية والمالية',

    // Inventory & Recipes
    ingredientsCatalog: 'دليل المواد الأولية الخام',
    ingredientName: 'اسم المادة الخام',
    code: 'الكود',
    stockOnHand: 'الرصيد المتاح بالمستودع',
    wacCost: 'متوسط التكلفة المرجح (WAC)',
    baseUnit: 'وحدة الصرف للوصفة',
    purchaseUnit: 'وحدة الشراء',
    minStockAlert: 'حد الأمان الأدنى',
    recipeTitle: 'بطاقة تركيبة الوجبة (Recipe)',
    theoreticalCost: 'تكلفة الوجبة المحسوبة',
    foodCostPercent: 'نسبة تكلفة الطعام (Food Cost %)',
    suggestedMargin: 'هامش الربح الإجمالي',
    recordWastage: 'تسجيل هدر / تلف مواد',
    wastageReason: 'سبب الإتلاف',
    stockMovements: 'سجل حركات المخزون المعياري',
    movementType: 'نوع الحركة',
    movementSale: 'صرف مبيعات تلقائي (وصفة)',
    movementPurchase: 'إضافة استلام مشتريات',
    movementWastage: 'إتلاف ومخلفات تصنيع',
    movementTransfer: 'تحويل بين المستودعات',

    // Purchasing & Suppliers
    suppliersList: 'دليل الموردين المعتمدين',
    supplierName: 'اسم المورد / الشركة',
    outstandingBalance: 'الرصيد المستحق للمورد',
    createPurchaseOrder: 'تسجيل فاتورة استلام بضاعة واردة',
    freightCost: 'مصاريف نقل وشحن إضافية (Landed Cost)',
    invoiceRef: 'رقم فاتورة المورد الضريبية',
    receiveStockSuccess: 'تم استلام البضاعة وتحديث تكلفة WAC وإنشاء القيد المحاسبي',

    // Accounting
    chartOfAccounts: 'دليل الحسابات (شجرة الحسابات العامة)',
    journalEntries: 'دفتر اليومية العامة والقيود المحاسبية',
    accountCode: 'رقم الحساب',
    accountName: 'اسم الحساب المحاسبي',
    accountType: 'نوع الحساب',
    debit: 'مدين (Debit)',
    credit: 'دائن (Credit)',
    balance: 'الرصيد الحالي',
    balancedRule: 'قاعدة التوازن المحاسبي: إجمالي المدين يجب أن يعادل الدائن تماماً',
    ledgerBalanced: 'دفتر اليومية متزن نظامياً (المدين = الدائن)',
    trialBalance: 'ميزان المراجعة بالأرصدة',
    incomeStatement: 'قائمة الأرباح والخسائر (الدخل)',
    balanceSheet: 'الميزانية العمومية والمركز المالي',
    revenue: 'إيرادات المبيعات',
    cogs: 'تكلفة البضاعة المباعة (COGS)',
    grossProfit: 'مجمل الربح التجاري',
    operatingExpenses: 'المصروفات التشغيلية والعمومية',
    netProfit: 'صافي الربح للفترة',
    totalAssets: 'إجمالي الأصول',
    totalLiabilitiesEquity: 'إجمالي الخصوم وحقوق الملكية',

    // SaaS Admin
    saasConsole: 'لوحة تحكم مشغل المنصة (SaaS Control Panel)',
    activeTenants: 'المشتركون والمطاعم الفعالة',
    subscriptionPlans: 'باقات الاشتراك وحدود الاستخدام',
    branchLimit: 'الحد الأقصى للفروع',
    deviceLimit: 'الحد الأقصى للأجهزة',
    healthStatus: 'حالة خوادم المزامنة والأمان',
    registeredDevices: 'الأجهزة المرتبطة ونقاط البيع',
    outboxDiagnostics: 'تشخيص طابور المزامنة المحلي (Transactional Outbox)',

    // Foodics POS Action Bar & Controls
    posPrint: 'طباعة',
    posKitchen: 'المطبخ',
    posVoid: 'إلغاء',
    posDiscount: 'خصم',
    posNotes: 'ملاحظات',
    posTags: 'وسوم',
    posMore: 'المزيد',
    addCustomer: 'إضافة عميل',
    addCourse: 'إضافة مرحلة تقديم (Add Course)',
    searchProducts: 'بحث في الأصناف والمنتجات...',
    backToCategories: 'الرجوع للأقسام',
    home: 'الرئيسية',
    orders: 'الطلبات',
    tables: 'الطاولات',
    newOrder: 'جديد',
    active: 'نشط',
    total: 'الإجمالي (TOTAL)',
    applyDiscount: 'تطبيق الخصم',
    discountAmount: 'قيمة الخصم',
    orderNotesTitle: 'ملاحظات الطلب للمطبخ',
    orderTagsTitle: 'وسوم وتصنيفات الطلب',
    taxes: 'الضريبة',
    save: 'حفظ التعديلات',
    cancel: 'إلغاء',
    actions: 'إجراءات',
    status: 'الحالة',
    date: 'التاريخ والوقت',
    notes: 'ملاحظات',
    confirm: 'تأكيد',
    success: 'تمت العملية بنجاح',
    currencyUnit: 'ر.س',
    workspaceSettings: 'الإعدادات والتهيئة',
    settingsTitle: 'إعدادات النظام والتحكم الشامل',
    settingsSubtitle: 'تخصيص بيانات المطعم، العملة، نسب الضرائب، قالب الفاتورة، والفروع',
    settingsGeneral: 'البيانات الأساسية',
    settingsCurrency: 'العملة والتهيئة',
    settingsTax: 'الضرائب والرسوم',
    settingsPos: 'نقطة البيع',
    settingsReceipt: 'قالب الفاتورة',
    settingsBranches: 'الفروع والمستودعات',
    settingsBackup: 'البيانات والنسخ',
  },
  en: {
    // Brand & System
    appName: 'RestaurantOS',
    appSubtitle: 'Cloud Restaurant Management & POS Engine',
    systemTag: 'Unified Restaurant Operating System',
    tenantDefault: 'Foodics Gourmet Burger & Grill',
    branchDefault: 'Riyadh Main Branch — Olaya',

    // Top Navigation & Workspaces
    workspacePos: 'Point of Sale (POS)',
    workspaceCallCenter: 'Call Center',
    workspaceKds: 'Kitchen Display (KDS)',
    workspaceHub: 'Restaurant Hub',
    workspaceSaas: 'SaaS Platform Admin',
    workspaceSettings: 'Settings & Control',
    online: 'Connected to Cloud',
    offline: 'Offline Mode (Local Engine)',
    synced: 'Fully Synchronized',
    pendingSync: 'Operations Pending in Local Outbox',
    syncNow: 'Sync Outbox Now',
    simulateOffline: 'Simulate Offline Disconnect',
    simulateOnline: 'Restore Cloud Connection',

    // Settings Workspace
    settingsTitle: 'System Settings & Configuration',
    settingsSubtitle: 'Customize restaurant profile, currency, tax rates, receipt templates, and branches',
    settingsGeneral: 'Restaurant Profile',
    settingsCurrency: 'Currency & Regional',
    settingsTax: 'Taxes & Surcharges',
    settingsPos: 'POS & Orders',
    settingsReceipt: 'Receipt & Printing',
    settingsBranches: 'Branches & Sites',
    settingsBackup: 'Data & Backup',

    // POS & Cash Register
    cashSession: 'Cashier Shift',
    openSession: 'Open New Shift',
    closeSession: 'Close Shift & Cash Count',
    sessionStatusOpen: 'Shift Active',
    sessionStatusClosed: 'Shift Closed',
    openingFloat: 'Opening Cash Float',
    totalCashSales: 'Cash Sales',
    totalCardSales: 'Card / POS Sales',
    totalInstaPaySales: 'Mada / Mobile Wallets',
    expectedCash: 'Expected Cash in Drawer',
    countedCash: 'Actual Counted Cash',
    variance: 'Cash Variance (Short / Over)',
    varianceShortage: 'Cash Shortage in Drawer',
    varianceSurplus: 'Cash Surplus in Drawer',
    varianceExact: 'Exact Match',
    closeSessionConfirm: 'Confirm Shift Close & Post Journal Voucher',

    // Order Types & Tables
    dineIn: 'Dine-In',
    takeaway: 'Takeaway / Counter',
    delivery: 'Home Delivery',
    tableNumber: 'Table',
    tablesFloor: 'Floor Layout & Tables',
    available: 'Available',
    occupied: 'Occupied',
    billRequested: 'Bill Requested',
    guests: 'Guests',
    selectCategory: 'Categories',
    allCategories: 'All Categories',
    searchMenu: 'Search menu items or SKU...',
    emptyMenu: 'No matching menu items found',

    // Cart & Ticket
    currentOrder: 'Active Order Ticket',
    orderNumber: 'Ticket #',
    item: 'Item',
    qty: 'Qty',
    price: 'Price',
    modifiers: 'Modifiers & Notes',
    addModifiers: 'Customize',
    orderNotes: 'Kitchen Special Notes',
    clearOrder: 'Clear Order',
    sendToKitchen: 'Send to Kitchen (KDS)',
    subtotal: 'Subtotal',
    vat14: 'Taxes (15% ZATCA / ETA)',
    serviceCharge: 'Dine-In Service',
    discount: 'Discount',
    grandTotal: 'Total Payable',
    payNow: 'Checkout & Issue Receipt',
    splitBill: 'Split Bill',
    exactAmount: 'Exact Total',
    tendered: 'Tendered Cash',
    changeDue: 'Change Due',
    receiptThermal: 'Simplified Tax Invoice',
    printReceipt: 'Print Thermal Receipt',
    close: 'Close',

    // Payment Methods
    cash: 'Cash',
    card: 'Credit / Mada Card',
    instapay: 'Apple Pay / Mobile Wallet',
    vodafoneCash: 'E-Wallet',

    // KDS
    kdsTitle: 'Kitchen Display & Order Line Station',
    stationAll: 'All Stations',
    stationGrill: 'Charcoal Grill & Meat',
    stationCold: 'Cold Kitchen & Salads',
    stationBeverage: 'Beverages & Bar',
    ticketWaiting: 'Pending',
    ticketPrep: 'Preparing',
    ticketReady: 'Ready for Pickup',
    bumpTicket: 'Complete & Bump Ticket',
    elapsed: 'Elapsed Time',

    // Hub Tabs
    hubMenu: 'Menu & Prices',
    hubInventory: 'Stock & Warehouses',
    hubRecipes: 'Recipes & Food Cost',
    hubPurchasing: 'Purchasing & Vendor Invoices',
    hubAccounting: 'Double-Entry Accounting & Ledger',
    hubEmployees: 'Staff & Shift Attendance',
    hubReports: 'Business Analytics & P&L',

    // Inventory & Recipes
    ingredientsCatalog: 'Raw Materials & Ingredients Catalog',
    ingredientName: 'Ingredient Name',
    code: 'Code',
    stockOnHand: 'Available On Hand',
    wacCost: 'Weighted Avg Cost (WAC)',
    baseUnit: 'Recipe Dispense Unit',
    purchaseUnit: 'Purchasing Unit',
    minStockAlert: 'Safety Par Level',
    recipeTitle: 'Recipe Formulation & Yield',
    theoreticalCost: 'Theoretical Food Cost',
    foodCostPercent: 'Food Cost %',
    suggestedMargin: 'Gross Profit Margin',
    recordWastage: 'Record Spoilage / Wastage',
    wastageReason: 'Wastage Reason',
    stockMovements: 'Stock Movements Audit Ledger',
    movementType: 'Movement Type',
    movementSale: 'Auto Recipe Depletion (Sale)',
    movementPurchase: 'Goods Receipt (Purchase)',
    movementWastage: 'Wastage & Spoilage Write-Off',
    movementTransfer: 'Warehouse Transfer',

    // Purchasing & Suppliers
    suppliersList: 'Approved Vendors Directory',
    supplierName: 'Vendor Name',
    outstandingBalance: 'Outstanding AP Balance',
    createPurchaseOrder: 'Receive Goods & Vendor Invoice',
    freightCost: 'Landed Freight Cost',
    invoiceRef: 'Supplier Invoice Number',
    receiveStockSuccess: 'Goods received, WAC cost updated, and AP journal entry posted',

    // Accounting
    chartOfAccounts: 'Chart of Accounts (COA)',
    journalEntries: 'General Journal & Balanced Vouchers',
    accountCode: 'Account Code',
    accountName: 'Account Title',
    accountType: 'Type',
    debit: 'Debit',
    credit: 'Credit',
    balance: 'Current Balance',
    balancedRule: 'Accounting Invariant: Total Debits must equal Total Credits',
    ledgerBalanced: 'Ledger Invariant Verified: Total Debits = Total Credits',
    trialBalance: 'Trial Balance',
    incomeStatement: 'Income Statement (P&L)',
    balanceSheet: 'Balance Sheet',
    revenue: 'Sales Revenue',
    cogs: 'Cost of Goods Sold (COGS)',
    grossProfit: 'Gross Profit',
    operatingExpenses: 'Operating & Admin Expenses',
    netProfit: 'Net Income for Period',
    totalAssets: 'Total Assets',
    totalLiabilitiesEquity: 'Total Liabilities & Equity',

    // SaaS Admin
    saasConsole: 'SaaS Platform Operator Console',
    activeTenants: 'Subscribed Restaurant Tenants',
    subscriptionPlans: 'Subscription Tiers & Quotas',
    branchLimit: 'Max Allowed Branches',
    deviceLimit: 'Max Allowed POS Devices',
    healthStatus: 'Sync Gateways & Isolation Health',
    registeredDevices: 'Registered Branch POS Devices',
    outboxDiagnostics: 'Transactional Outbox Diagnostics',

    // Foodics POS Action Bar & Controls
    posPrint: 'PRINT',
    posKitchen: 'KITCHEN',
    posVoid: 'VOID',
    posDiscount: 'DISCOUNT',
    posNotes: 'NOTES',
    posTags: 'TAGS',
    posMore: 'MORE',
    addCustomer: 'ADD CUSTOMER',
    addCourse: 'Add Course',
    searchProducts: 'Search products',
    backToCategories: 'All Categories',
    home: 'HOME',
    orders: 'ORDERS',
    tables: 'TABLES',
    newOrder: 'NEW',
    active: 'ACTIVE',
    total: 'TOTAL',
    applyDiscount: 'Apply Discount',
    discountAmount: 'Discount Amount',
    orderNotesTitle: 'Order & Kitchen Notes',
    orderTagsTitle: 'Order Tags',
    taxes: 'Taxes',

    // Common
    save: 'Save Changes',
    cancel: 'Cancel',
    actions: 'Actions',
    status: 'Status',
    date: 'Date & Time',
    notes: 'Notes',
    confirm: 'Confirm',
    success: 'Operation completed successfully',
    currencyUnit: 'SAR',
  },
};

let activeGlobalCurrency = 'SAR';

export function setActiveGlobalCurrency(currency: string) {
  if (currency) {
    activeGlobalCurrency = currency;
  }
}

export function getActiveGlobalCurrency(): string {
  return activeGlobalCurrency;
}

export function formatCurrency(amount: number, lang: Language, currency?: string): string {
  const curr = currency || activeGlobalCurrency || 'SAR';
  const is3Decimals = curr === 'KWD' || curr === 'BHD' || curr === 'OMR';
  const formatted = amount.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', {
    minimumFractionDigits: is3Decimals ? 3 : 2,
    maximumFractionDigits: is3Decimals ? 3 : 2,
  });

  switch (curr) {
    case 'SAR':
      return lang === 'ar' ? `${formatted} ر.س` : `SAR ${formatted}`;
    case 'EGP':
      return lang === 'ar' ? `${formatted} ج.م` : `${formatted} EGP`;
    case 'AED':
      return lang === 'ar' ? `${formatted} د.إ` : `AED ${formatted}`;
    case 'KWD':
      return lang === 'ar' ? `${formatted} د.ك` : `KWD ${formatted}`;
    case 'QAR':
      return lang === 'ar' ? `${formatted} ر.ق` : `QAR ${formatted}`;
    case 'BHD':
      return lang === 'ar' ? `${formatted} د.ب` : `BHD ${formatted}`;
    case 'OMR':
      return lang === 'ar' ? `${formatted} ر.ع` : `OMR ${formatted}`;
    case 'USD':
      return `$${formatted}`;
    case 'EUR':
      return `€${formatted}`;
    case 'GBP':
      return `£${formatted}`;
    default:
      return `${formatted} ${curr}`;
  }
}

export function formatNumber(num: number, lang: Language): string {
  return num.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US');
}
