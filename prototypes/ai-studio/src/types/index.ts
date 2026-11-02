/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Domain Types & Invariant Contracts
 */

export type Language = 'ar' | 'en';
export type Direction = 'rtl' | 'ltr';

// ==========================================
// 1. Tenancy, Subscriptions & Auth
// ==========================================
export interface TenantSettings {
  defaultTaxRate: number; // e.g. 0.15
  taxCalculation: 'EXCLUDED' | 'INCLUDED';
  defaultServiceCharge: number; // e.g. 0.12 or 0
  defaultOrderType: OrderType;
  enableGuestCountPrompt: boolean;
  autoPrintReceipt: boolean;
  autoSendToKitchen: boolean;
  allowManualDiscount: boolean;
  maxDiscountPercent: number;
  receiptHeaderAr: string;
  receiptHeaderEn: string;
  receiptFooterAr: string;
  receiptFooterEn: string;
  showZatcaQrCode: boolean;
  receiptPaperWidth: '80mm' | '58mm';
  enableOfflineOutbox: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  tradeNameAr: string;
  tradeNameEn: string;
  subdomain: string;
  taxRegistrationNumber: string;
  commercialRegister: string;
  currency: string; // 'SAR', 'EGP', 'AED', 'USD', etc.
  timezone: string; // 'Asia/Riyadh', 'Africa/Cairo', etc.
  planTier: 'STARTER' | 'PRO' | 'ENTERPRISE';
  subscriptionStatus: 'ACTIVE' | 'TRIAL' | 'GRACE_PERIOD' | 'SUSPENDED';
  subscriptionExpiresAt: string;
  createdAt: string;
  settings?: TenantSettings;
}

export interface Plan {
  id: string;
  tierCode: 'STARTER' | 'PRO' | 'ENTERPRISE';
  nameAr: string;
  nameEn: string;
  priceMonthlyEGP: number;
  priceAnnualEGP: number;
  maxBranches: number;
  maxDevices: number;
  features: string[];
}

export interface Branch {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  addressAr: string;
  addressEn: string;
  phone: string;
  defaultWarehouseId: string;
  isActive: boolean;
}

export interface Warehouse {
  id: string;
  tenantId: string;
  branchId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  isCentral: boolean;
}

export interface Device {
  id: string;
  tenantId: string;
  branchId: string;
  deviceCode: string;
  name: string;
  deviceType: 'POS_TERMINAL' | 'KDS_STATION' | 'WAITER_TABLET';
  isPaired: boolean;
  lastSyncAt: string;
}

export type UserRole = 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'CASHIER' | 'CHEF' | 'ACCOUNTANT';

export interface User {
  id: string;
  tenantId: string;
  branchId?: string;
  fullNameAr: string;
  fullNameEn: string;
  email: string;
  role: UserRole;
  pinCode: string;
  isActive: boolean;
}

// ==========================================
// 2. Menu, Recipes & Modifiers
// ==========================================
export interface Category {
  id: string;
  tenantId: string;
  nameAr: string;
  nameEn: string;
  iconName: string;
  color: string;
  displayOrder: number;
  taxRate: number; // e.g. 0.14 or 0.15 for VAT
  imageUrl?: string;
}

export interface ModifierOption {
  id: string;
  nameAr: string;
  nameEn: string;
  priceDelta: number;
  costDelta: number;
}

export interface ModifierGroup {
  id: string;
  nameAr: string;
  nameEn: string;
  minSelections: number;
  maxSelections: number;
  isRequired: boolean;
  options: ModifierOption[];
}

export interface Product {
  id: string;
  tenantId: string;
  categoryId: string;
  sku: string;
  barcode?: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  basePrice: number;
  costPrice: number; // Target theoretical recipe cost
  prepStation: 'GRILL' | 'COLD' | 'BEVERAGE';
  isAvailable: boolean;
  modifierGroups?: ModifierGroup[];
  recipeId?: string;
  imageUrl?: string;
}

export interface Ingredient {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  baseUnit: 'g' | 'ml' | 'piece';
  purchaseUnit: 'kg' | 'liter' | 'carton' | 'piece';
  conversionFactor: number; // e.g., 1000 g per 1 kg
  currentCostPerBaseUnit: number; // WAC in EGP
  minimumAlertStock: number;
}

export interface RecipeItem {
  ingredientId: string;
  quantityBaseUnit: number;
}

export interface Recipe {
  id: string;
  tenantId: string;
  productId: string;
  version: number;
  yieldQuantity: number;
  items: RecipeItem[];
  instructions?: string;
}

// ==========================================
// 3. POS, Tables, Orders & Cash Sessions
// ==========================================
export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type OrderStatus =
  | 'DRAFT'
  | 'SENT_TO_KITCHEN'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED';

export type TableStatus =
  | 'AVAILABLE'
  | 'ORDER_STARTED'
  | 'ORDER_SENT'
  | 'OCCUPIED'
  | 'ADDITIONAL_ORDER'
  | 'BILL_REQUESTED'
  | 'BILL_PRINTED';

export type TableSessionStatus =
  | 'AVAILABLE'
  | 'ORDER_STARTED'
  | 'ORDER_SENT'
  | 'ADDITIONAL_ORDER'
  | 'BILL_REQUESTED'
  | 'BILL_PRINTED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'CLOSED';

export interface TableSession {
  id: string; // unique table_session_id
  tenantId: string;
  branchId: string;
  tableId: string;
  tableNumber: string;
  waiterId: string;
  waiterName: string;
  guestCount: number;
  openedAt: string;
  closedAt?: string;
  status: TableSessionStatus;
  orderIds: string[]; // List of order IDs in this dining session
  billRequestedAt?: string;
  billPrintedAt?: string;
  invoiceNumber?: string;
  consolidatedSubtotal: number;
  consolidatedDiscount: number;
  consolidatedTax: number;
  consolidatedServiceCharge: number;
  consolidatedGrandTotal: number;
  isPaid: boolean;
  paidAt?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
  kitchenStatus?: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED';
}

export interface TableEvent {
  id: string;
  sessionId: string;
  tableId: string;
  eventType:
    | 'SESSION_OPENED'
    | 'ORDER_ADDED'
    | 'SENT_TO_KITCHEN'
    | 'ADDITIONAL_ORDER_ADDED'
    | 'TABLE_TRANSFERRED'
    | 'TABLE_MERGED'
    | 'BILL_REQUESTED'
    | 'BILL_PRINTED'
    | 'PAYMENT_RECORDED'
    | 'SESSION_CLOSED'
    | 'ITEM_CANCELLED';
  descriptionAr: string;
  descriptionEn: string;
  actorName: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface RestaurantTable {
  id: string;
  tenantId: string;
  branchId: string;
  tableNumber: string;
  sectionAr: string;
  sectionEn: string;
  capacity: number;
  status: TableStatus;
  currentOrderId?: string;
  currentSessionId?: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  productNameAr: string;
  productNameEn: string;
  unitPrice: number;
  quantity: number;
  selectedModifiers: {
    groupNameAr: string;
    groupNameEn?: string;
    optionNameAr: string;
    optionNameEn: string;
    priceDelta: number;
  }[];
  prepStation: 'GRILL' | 'COLD' | 'BEVERAGE';
  kitchenStatus: 'PENDING' | 'PREPARING' | 'READY';
  notes?: string;
  totalPrice: number;
}

export type OrderSource = 'POS' | 'CALL_CENTER' | 'ONLINE' | 'AGGREGATOR';

export type InvoiceType = 'ORDER_CONFIRMATION' | 'CUSTOMER_INVOICE' | 'TAX_INVOICE' | 'CREDIT_NOTE';

export type InvoiceLifecycleStatus =
  | 'ORDER_CREATED'
  | 'ORDER_ACCEPTED'
  | 'INVOICE_DRAFT'
  | 'INVOICE_ISSUED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'CLOSED'
  | 'CANCELLED';

export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';

export interface InvoiceLegalEntityInfo {
  tradeNameAr: string;
  tradeNameEn: string;
  legalEntityNameAr?: string;
  legalEntityNameEn?: string;
  taxRegistrationNumber: string;
  commercialRegister: string;
  branchNameAr: string;
  branchNameEn: string;
  branchAddressAr: string;
  branchAddressEn: string;
  branchPhone: string;
}

export interface InvoicePrintLog {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  branchId: string;
  printedByUserId: string;
  printedByUserName: string;
  format: '80mm' | '58mm' | 'A4';
  isReprint: boolean;
  reprintReason?: string;
  printedAt: string;
}

export interface Invoice {
  id: string;
  tenantId: string;
  branchId: string; // Fulfilling branch
  branchNameAr: string;
  branchNameEn: string;
  orderId: string;
  orderNumber: string;
  orderSource: OrderSource;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  status: InvoiceLifecycleStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  issuedAt: string;
  paidAt?: string;
  agentId?: string;
  agentName?: string;
  callCenterAgentId?: string;
  callCenterAgentName?: string;
  cashierId?: string;
  cashierName?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryNotes?: string;
  deliveryFee: number;
  serviceCharge: number;
  items: OrderItem[];
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  amountPaid: number;
  changeAmount?: number;
  legalEntityInfo: InvoiceLegalEntityInfo;
  legalEntity?: InvoiceLegalEntityInfo;
  createdAt?: string;
  qrCodeData?: string;
  reprintCount: number;
  lastPrintedAt?: string;
  journalEntryId?: string;
}

export interface Order {
  id: string;
  tenantId: string;
  branchId: string;
  fulfillingBranchId?: string;
  orderSource?: OrderSource;
  callCenterAgentId?: string;
  callCenterAgentName?: string;
  deliveryAddress?: string;
  deliveryNotes?: string;
  deliveryFee?: number;
  paymentStatus?: PaymentStatus;
  orderNumber: string;
  orderType: OrderType;
  tableId?: string;
  tableName?: string;
  sessionId?: string; // links order to TableSession
  isAdditionalOrder?: boolean;
  orderSequence?: number; // 1 = first order, 2 = second order, etc.
  cashierId: string;
  cashierName: string;
  customerName?: string;
  customerPhone?: string;
  guestCount?: number;
  notes?: string;
  tags?: string[];
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  discountAmount: number;
  taxRate: number; // 0.14 or 0.15
  taxAmount: number;
  serviceCharge: number;
  grandTotal: number;
  createdAt: string;
  completedAt?: string;
  paymentMethod?: PaymentMethod;
  invoiceNumber?: string;
  invoiceId?: string;
  kitchenSentAt?: string;
}

export type PaymentMethod =
  | 'CASH'
  | 'CARD'
  | 'INSTAPAY'
  | 'WALLET'
  | 'SPLIT'
  | 'CASH_ON_DELIVERY'
  | 'ONLINE';

export interface PaymentRecord {
  id: string;
  orderId: string;
  method: PaymentMethod;
  amount: number;
  tenderedAmount: number;
  changeAmount: number;
  referenceCode?: string;
  paidAt: string;
}

export interface CashSession {
  id: string;
  tenantId: string;
  branchId: string;
  deviceId: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  openingFloat: number;
  totalSalesCash: number;
  totalSalesCard: number;
  totalSalesInstaPay: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  countedCash?: number;
  variance?: number; // countedCash - expectedCash (negative = shortage, positive = surplus)
  status: 'OPEN' | 'CLOSED';
}

// ==========================================
// 4. Kitchen Display System (KDS)
// ==========================================
export interface KitchenTicket {
  orderId: string;
  orderNumber: string;
  orderType: OrderType;
  tableName?: string;
  createdAt: string;
  elapsedSeconds: number;
  items: OrderItem[];
  isCompleted: boolean;
}

// ==========================================
// 5. Inventory, Movements & Purchasing
// ==========================================
export type StockMovementType =
  | 'SALE_DEPLETION'
  | 'PURCHASE_RECEIPT'
  | 'WASTAGE'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'STOCK_COUNT_ADJUSTMENT';

export interface StockBalance {
  warehouseId: string;
  ingredientId: string;
  quantityOnHand: number; // in baseUnit
  weightedAverageCost: number; // per baseUnit
}

export interface StockMovement {
  id: string;
  tenantId: string;
  warehouseId: string;
  ingredientId: string;
  ingredientNameAr: string;
  ingredientNameEn: string;
  movementType: StockMovementType;
  quantityBaseUnit: number;
  unitCostEGP: number;
  totalCostEGP: number;
  referenceType: 'POS_ORDER' | 'PURCHASE_ORDER' | 'WASTAGE_NOTE' | 'TRANSFER_NOTE';
  referenceId: string;
  occurredAt: string;
  notes?: string;
}

export interface Supplier {
  id: string;
  tenantId: string;
  nameAr: string;
  nameEn: string;
  contactPerson: string;
  phone: string;
  taxNumber: string;
  outstandingBalanceEGP: number;
}

export interface PurchaseOrderItem {
  ingredientId: string;
  ingredientNameAr: string;
  quantityPurchaseUnit: number;
  unitPriceEGP: number;
  totalPriceEGP: number;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  warehouseId: string;
  supplierId: string;
  supplierNameAr: string;
  poNumber: string;
  items: PurchaseOrderItem[];
  subtotalEGP: number;
  taxRate: number; // 0.14
  taxAmountEGP: number;
  freightCostEGP: number;
  grandTotalEGP: number;
  status: 'RECEIVED' | 'PAID' | 'PENDING';
  receivedAt: string;
  invoiceReference: string;
}

export interface WastageRecord {
  id: string;
  tenantId: string;
  warehouseId: string;
  ingredientId: string;
  ingredientNameAr: string;
  quantityBaseUnit: number;
  unitCostEGP: number;
  totalCostEGP: number;
  reason: 'EXPIRED' | 'BURNT_SPOILED' | 'SPILLAGE' | 'DEFECTIVE_BATCH';
  recordedBy: string;
  occurredAt: string;
}

// ==========================================
// 6. Double-Entry Accounting
// ==========================================
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface Account {
  id: string;
  tenantId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: AccountType;
  normalBalance: 'DEBIT' | 'CREDIT';
  currentBalance: number;
  isHeader?: boolean;
}

export interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountNameAr: string;
  accountNameEn: string;
  debit: number;
  credit: number;
  memo?: string;
}

export interface JournalEntry {
  id: string;
  tenantId: string;
  branchId: string;
  entryNumber: string;
  date: string;
  sourceType: 'POS_SALE' | 'PURCHASE_RECEIPT' | 'SUPPLIER_PAYMENT' | 'STOCK_WASTAGE' | 'CASH_VARIANCE';
  sourceId: string;
  memoAr: string;
  memoEn: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  isPosted: boolean;
  postedAt: string;
}

// ==========================================
// 7. Employees & Shifts
// ==========================================
export interface Employee {
  id: string;
  tenantId: string;
  branchId: string;
  fullNameAr: string;
  fullNameEn: string;
  jobTitleAr: string;
  jobTitleEn: string;
  role: UserRole;
  salaryEGP: number;
  shiftStatus: 'ON_DUTY' | 'OFF_DUTY' | 'BREAK';
  phone: string;
  hireDate: string;
}

// ==========================================
// 8. Offline Transactional Outbox
// ==========================================
export interface SyncOutboxItem {
  operationId: string;
  tenantId: string;
  branchId: string;
  deviceId: string;
  operationType:
    | 'SYNC_ORDER'
    | 'SYNC_PAYMENT'
    | 'SYNC_CASH_SESSION'
    | 'SYNC_STOCK_MOVEMENT'
    | 'SYNC_JOURNAL_ENTRY'
    | 'SYNC_PURCHASE';
  payload: any;
  occurredAt: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  retryCount: number;
  errorMessage?: string;
}
