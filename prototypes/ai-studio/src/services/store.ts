/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Central Reactive Store & Invariant Engine
 */

import { useState, useEffect } from 'react';
import {
  Tenant,
  TenantSettings,
  Branch,
  Warehouse,
  User,
  Category,
  Product,
  Ingredient,
  Recipe,
  RestaurantTable,
  TableStatus,
  TableSession,
  TableSessionStatus,
  TableEvent,
  Order,
  OrderItem,
  PaymentMethod,
  PaymentRecord,
  CashSession,
  Supplier,
  Account,
  JournalEntry,
  JournalLine,
  StockBalance,
  StockMovement,
  SyncOutboxItem,
  Language,
  Invoice,
  InvoicePrintLog,
  InvoiceType,
  OrderSource,
  PaymentStatus,
} from '../types';
import { setActiveGlobalCurrency } from '../lib/i18n';
import {
  INITIAL_TENANT,
  INITIAL_BRANCHES,
  INITIAL_WAREHOUSES,
  INITIAL_USERS,
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_INGREDIENTS,
  INITIAL_RECIPES,
  INITIAL_TABLES,
  INITIAL_SUPPLIERS,
  INITIAL_ACCOUNTS,
  INITIAL_JOURNAL_ENTRIES,
  INITIAL_STOCK_BALANCES,
  INITIAL_STOCK_MOVEMENTS,
  INITIAL_CASH_SESSION,
  INITIAL_INVOICES,
  INITIAL_CALL_CENTER_ORDERS,
  INITIAL_INVOICE_PRINT_LOGS,
} from '../db/initialData';

const STORAGE_KEY = 'restaurant_os_foodics_v8';

export interface AppState {
  tenant: Tenant;
  branches: Branch[];
  activeBranchId: string;
  warehouses: Warehouse[];
  activeWarehouseId: string;
  currentUser: User;
  categories: Category[];
  products: Product[];
  ingredients: Ingredient[];
  recipes: Recipe[];
  tables: RestaurantTable[];
  tableSessions: TableSession[];
  tableEvents: TableEvent[];
  orders: Order[];
  invoices: Invoice[];
  invoicePrintLogs: InvoicePrintLog[];
  activeOrderId: string | null;
  cashSession: CashSession;
  suppliers: Supplier[];
  accounts: Account[];
  journalEntries: JournalEntry[];
  stockBalances: StockBalance[];
  stockMovements: StockMovement[];
  syncOutbox: SyncOutboxItem[];
  isOnline: boolean;
  language: Language;
}

export const INITIAL_TABLE_SESSION_8: TableSession = {
  id: 'session-tbl-08-init',
  tenantId: INITIAL_TENANT.id,
  branchId: 'branch-cairo-main',
  tableId: 'tbl-08',
  tableNumber: '8',
  waiterId: INITIAL_USERS[0].id,
  waiterName: INITIAL_USERS[0].fullNameEn,
  guestCount: 2,
  openedAt: new Date(Date.now() - 35 * 60000).toISOString(),
  status: 'ORDER_SENT',
  orderIds: ['order-showcase-tbl8'],
  consolidatedSubtotal: 97.0,
  consolidatedDiscount: 10.0,
  consolidatedTax: 13.05,
  consolidatedServiceCharge: 0,
  consolidatedGrandTotal: 100.05,
  isPaid: false,
  kitchenStatus: 'PREPARING',
};

const INITIAL_SHOWCASE_ORDER: Order = {
  id: 'order-showcase-tbl8',
  tenantId: INITIAL_TENANT.id,
  branchId: 'branch-cairo-main',
  orderNumber: '8',
  orderType: 'DINE_IN',
  tableId: 'tbl-08',
  tableName: '8',
  sessionId: 'session-tbl-08-init',
  orderSequence: 1,
  cashierId: INITIAL_USERS[0].id,
  cashierName: INITIAL_USERS[0].fullNameEn,
  guestCount: 2,
  status: 'SENT_TO_KITCHEN',
  notes: '',
  tags: [],
  items: [
    {
      id: 'item-1',
      productId: 'prod-foul-har',
      productNameAr: 'سندوتش فول بالزيت الحار',
      productNameEn: 'Ful with Flaxseed Oil',
      unitPrice: 8.0,
      quantity: 1,
      selectedModifiers: [
        { groupNameAr: 'نوع الخبز', groupNameEn: 'Bread Type', optionNameAr: 'بلدي مصري', optionNameEn: 'Baladi Bread', priceDelta: 0 },
        { groupNameAr: 'إضافات', groupNameEn: 'Add-ons', optionNameAr: '+ طحينة زيادة', optionNameEn: '+ Extra Tahini', priceDelta: 0 },
      ],
      prepStation: 'COLD',
      kitchenStatus: 'PENDING',
      totalPrice: 8.0,
    },
    {
      id: 'item-2',
      productId: 'prod-taameya-kiri',
      productNameAr: 'طعمية محشية جبنة كيري',
      productNameEn: 'Taameya Stuffed Kiri',
      unitPrice: 12.0,
      quantity: 1,
      selectedModifiers: [
        { groupNameAr: 'نوع الخبز', groupNameEn: 'Bread Type', optionNameAr: 'بلدي', optionNameEn: 'Baladi', priceDelta: 0 },
      ],
      prepStation: 'COLD',
      kitchenStatus: 'PENDING',
      totalPrice: 12.0,
    },
    {
      id: 'item-3',
      productId: 'prod-potato-cheddar',
      productNameAr: 'بطاطس صوص شيدر وهالبينو',
      productNameEn: 'Fries with Cheddar Melt',
      unitPrice: 14.0,
      quantity: 1,
      selectedModifiers: [],
      prepStation: 'COLD',
      kitchenStatus: 'PENDING',
      totalPrice: 14.0,
    },
    {
      id: 'item-4',
      productId: 'prod-egg-pastrami',
      productNameAr: 'سندوتش بيض بالبسطرمة',
      productNameEn: 'Eggs with Baladi Pastrami',
      unitPrice: 22.0,
      quantity: 1,
      selectedModifiers: [],
      prepStation: 'GRILL',
      kitchenStatus: 'PENDING',
      totalPrice: 22.0,
    },
    {
      id: 'item-5',
      productId: 'prod-crepe-crunchy',
      productNameAr: 'كريب كرانشي دجاج مقرمش',
      productNameEn: 'Crispy Crunchy Crepe',
      unitPrice: 35.0,
      quantity: 1,
      selectedModifiers: [
        { groupNameAr: 'النوع', groupNameEn: 'Type', optionNameAr: 'سوبر', optionNameEn: 'Super', priceDelta: 0 },
      ],
      prepStation: 'GRILL',
      kitchenStatus: 'PENDING',
      totalPrice: 35.0,
    },
    {
      id: 'item-6',
      productId: 'prod-tea-mint',
      productNameAr: 'شاي مصري بالنعناع الفريش',
      productNameEn: 'Egyptian Mint Tea',
      unitPrice: 6.0,
      quantity: 1,
      selectedModifiers: [],
      prepStation: 'BEVERAGE',
      kitchenStatus: 'PENDING',
      totalPrice: 6.0,
    },
  ],
  subtotal: 97.0,
  discountAmount: 10.0,
  taxRate: 0.15,
  taxAmount: 13.05,
  serviceCharge: 0,
  grandTotal: 100.05,
  createdAt: new Date().toISOString(),
};

function loadInitialState(): AppState {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure language, tableSessions, and essential arrays exist
        return {
          ...parsed,
          language: parsed.language || 'en',
          isOnline: parsed.isOnline !== undefined ? parsed.isOnline : true,
          tableSessions: parsed.tableSessions || [INITIAL_TABLE_SESSION_8],
          tableEvents: parsed.tableEvents || [],
          invoices: parsed.invoices || INITIAL_INVOICES,
          invoicePrintLogs: parsed.invoicePrintLogs || INITIAL_INVOICE_PRINT_LOGS,
          orders: parsed.orders || [INITIAL_SHOWCASE_ORDER, ...INITIAL_CALL_CENTER_ORDERS],
        };
      }
    }
  } catch (e) {
    console.warn('Failed to load saved state, using seeds', e);
  }

  const tablesWithOrder = INITIAL_TABLES.map((t) =>
    t.id === 'tbl-08'
      ? {
          ...t,
          status: 'OCCUPIED' as const,
          currentOrderId: 'order-showcase-tbl8',
          currentSessionId: 'session-tbl-08-init',
        }
      : t
  );

  return {
    tenant: INITIAL_TENANT,
    branches: INITIAL_BRANCHES,
    activeBranchId: 'branch-cairo-main',
    warehouses: INITIAL_WAREHOUSES,
    activeWarehouseId: 'wh-maadi-main',
    currentUser: INITIAL_USERS[0],
    categories: INITIAL_CATEGORIES,
    products: INITIAL_PRODUCTS,
    ingredients: INITIAL_INGREDIENTS,
    recipes: INITIAL_RECIPES,
    tables: tablesWithOrder,
    tableSessions: [INITIAL_TABLE_SESSION_8],
    tableEvents: [
      {
        id: 'evt-init-1',
        sessionId: 'session-tbl-08-init',
        tableId: 'tbl-08',
        eventType: 'SESSION_OPENED',
        descriptionAr: 'فتح جلسة طاولة 8 للضيوف (2 أفراد)',
        descriptionEn: 'Opened Table 8 dining session for 2 guests',
        actorName: INITIAL_USERS[0].fullNameEn,
        timestamp: new Date(Date.now() - 35 * 60000).toISOString(),
      },
      {
        id: 'evt-init-2',
        sessionId: 'session-tbl-08-init',
        tableId: 'tbl-08',
        eventType: 'SENT_TO_KITCHEN',
        descriptionAr: 'إرسال طلب رقم #8 للمطبخ (KDS)',
        descriptionEn: 'Sent Order #8 to Kitchen Display System',
        actorName: INITIAL_USERS[0].fullNameEn,
        timestamp: new Date(Date.now() - 32 * 60000).toISOString(),
      },
    ],
    orders: [INITIAL_SHOWCASE_ORDER, ...INITIAL_CALL_CENTER_ORDERS],
    invoices: INITIAL_INVOICES,
    invoicePrintLogs: INITIAL_INVOICE_PRINT_LOGS,
    activeOrderId: 'order-showcase-tbl8',
    cashSession: INITIAL_CASH_SESSION,
    suppliers: INITIAL_SUPPLIERS,
    accounts: INITIAL_ACCOUNTS,
    journalEntries: INITIAL_JOURNAL_ENTRIES,
    stockBalances: INITIAL_STOCK_BALANCES,
    stockMovements: INITIAL_STOCK_MOVEMENTS,
    syncOutbox: [],
    isOnline: true,
    language: 'en',
  };
}

// Global subscribers for reactive state updates
let state: AppState = loadInitialState();
if (state.tenant?.currency) {
  setActiveGlobalCurrency(state.tenant.currency);
}
const listeners = new Set<(s: AppState) => void>();

function notify() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    if (state.tenant?.currency) {
      setActiveGlobalCurrency(state.tenant.currency);
    }
  } catch (e) {
    console.error('Storage write error', e);
  }
  listeners.forEach((l) => l(state));
}

const storeActions = {
    // Language & Direction
    setLanguage: (lang: Language) => {
      state = { ...state, language: lang };
      if (typeof document !== 'undefined') {
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      }
      notify();
    },

    // Connectivity & Outbox
    toggleNetworkMode: () => {
      state = { ...state, isOnline: !state.isOnline };
      notify();
    },

    syncOutboxNow: () => {
      if (state.syncOutbox.length === 0) return;
      // Mark all pending operations as synced
      state = {
        ...state,
        syncOutbox: state.syncOutbox.map((item) => ({
          ...item,
          status: 'SYNCED',
        })),
      };
      notify();
    },

    // Branch Switching & Multi-Branch Access
    switchActiveBranch: (branchId: string) => {
      const branch = state.branches.find((b) => b.id === branchId);
      if (!branch) return;
      const branchUser = INITIAL_USERS.find((u) => u.branchId === branchId) || {
        ...state.currentUser,
        branchId: branch.id,
      };
      state = {
        ...state,
        activeBranchId: branch.id,
        activeWarehouseId: branch.defaultWarehouseId,
        currentUser: branchUser,
      };
      notify();
    },

    // Call Center Orders & Invoices (Branch-Scoped)
    getCallCenterOrdersForBranch: (targetBranchId?: string) => {
      const branchId = targetBranchId || state.activeBranchId;
      const branchOrders = state.orders.filter(
        (o) => o.orderSource === 'CALL_CENTER' && (o.fulfillingBranchId === branchId || o.branchId === branchId)
      );
      const branchInvoices = state.invoices.filter((inv) => inv.branchId === branchId);
      return {
        orders: branchOrders,
        invoices: branchInvoices,
      };
    },

    createCallCenterOrder: (params: {
      fulfillingBranchId: string;
      agentId: string;
      agentName: string;
      customerName: string;
      customerPhone: string;
      deliveryAddress: string;
      deliveryNotes?: string;
      deliveryFee: number;
      items: OrderItem[];
      paymentMethod: PaymentMethod;
      invoiceType?: InvoiceType;
    }): { order: Order; invoice: Invoice } => {
      const branch = state.branches.find((b) => b.id === params.fulfillingBranchId);
      if (!branch) throw new Error('Fulfilling branch not found');

      const now = new Date().toISOString();
      const orderNum = `CC-${String(Date.now()).slice(-4)}`;
      const branchCode = branch.code.replace(/[^A-Z0-9]/gi, '');
      const invoiceSeq = state.invoices.filter((inv) => inv.branchId === branch.id).length + 1;
      const invoiceNum = `INV-${branchCode}-2026-${String(invoiceSeq).padStart(4, '0')}`;

      const subtotal = Number(params.items.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2));
      const taxRate = state.tenant.settings?.defaultTaxRate || 0.15;
      const taxableBase = subtotal + (params.deliveryFee || 0);
      const taxAmount = Number((taxableBase * taxRate).toFixed(2));
      const grandTotal = Number((taxableBase + taxAmount).toFixed(2));

      const invoiceId = `inv-${Date.now()}`;
      const orderId = `ord-cc-${Date.now()}`;

      const newOrder: Order = {
        id: orderId,
        tenantId: state.tenant.id,
        branchId: branch.id,
        fulfillingBranchId: branch.id,
        orderSource: 'CALL_CENTER',
        callCenterAgentId: params.agentId,
        callCenterAgentName: params.agentName,
        deliveryAddress: params.deliveryAddress,
        deliveryNotes: params.deliveryNotes,
        deliveryFee: params.deliveryFee,
        orderNumber: orderNum,
        orderType: 'DELIVERY',
        cashierId: params.agentId,
        cashierName: params.agentName,
        customerName: params.customerName,
        customerPhone: params.customerPhone,
        guestCount: 1,
        status: 'SENT_TO_KITCHEN',
        paymentStatus: 'UNPAID', // Cash on delivery is unpaid until collected!
        paymentMethod: params.paymentMethod,
        items: params.items.map((i) => ({ ...i, kitchenStatus: 'PREPARING' })),
        subtotal,
        discountAmount: 0,
        taxRate,
        taxAmount,
        serviceCharge: 0,
        grandTotal,
        createdAt: now,
        invoiceNumber: invoiceNum,
        invoiceId,
        kitchenSentAt: now,
      };

      const qrData = `ETA|${state.tenant.taxRegistrationNumber}|${now}|${grandTotal.toFixed(2)}|${taxAmount.toFixed(2)}`;

      const newInvoice: Invoice = {
        id: invoiceId,
        tenantId: state.tenant.id,
        branchId: branch.id,
        branchNameAr: branch.nameAr,
        branchNameEn: branch.nameEn,
        orderId,
        orderNumber: orderNum,
        orderSource: 'CALL_CENTER',
        invoiceNumber: invoiceNum,
        invoiceType: params.invoiceType || 'TAX_INVOICE',
        status: 'INVOICE_ISSUED',
        paymentStatus: 'UNPAID',
        paymentMethod: params.paymentMethod,
        issuedAt: now,
        agentId: params.agentId,
        agentName: params.agentName,
        customerName: params.customerName,
        customerPhone: params.customerPhone,
        deliveryAddress: params.deliveryAddress,
        deliveryNotes: params.deliveryNotes,
        deliveryFee: params.deliveryFee,
        serviceCharge: 0,
        items: params.items,
        subtotal,
        discountAmount: 0,
        taxRate,
        taxAmount,
        grandTotal,
        amountPaid: 0,
        createdAt: now,
        legalEntityInfo: {
          tradeNameAr: state.tenant.tradeNameAr,
          tradeNameEn: state.tenant.tradeNameEn,
          taxRegistrationNumber: state.tenant.taxRegistrationNumber,
          commercialRegister: state.tenant.commercialRegister,
          branchNameAr: branch.nameAr,
          branchNameEn: branch.nameEn,
          branchAddressAr: branch.addressAr,
          branchAddressEn: branch.addressEn,
          branchPhone: branch.phone,
        },
        legalEntity: {
          tradeNameAr: state.tenant.tradeNameAr,
          tradeNameEn: state.tenant.tradeNameEn,
          taxRegistrationNumber: state.tenant.taxRegistrationNumber,
          commercialRegister: state.tenant.commercialRegister,
          branchNameAr: branch.nameAr,
          branchNameEn: branch.nameEn,
          branchAddressAr: branch.addressAr,
          branchAddressEn: branch.addressEn,
          branchPhone: branch.phone,
        },
        qrCodeData: qrData,
        reprintCount: 0,
      };

      // 1. Inventory Depletion from Fulfilling Branch Warehouse
      const targetWarehouseId = branch.defaultWarehouseId;
      let totalCogs = 0;
      const newMovements: StockMovement[] = [];
      const updatedStockBalances = [...state.stockBalances];

      params.items.forEach((item) => {
        const product = state.products.find((p) => p.id === item.productId);
        if (product && product.recipeId) {
          const recipe = state.recipes.find((r) => r.id === product.recipeId);
          if (recipe) {
            recipe.items.forEach((rItem) => {
              const qtyToDeduct = item.quantity * rItem.quantityBaseUnit;
              const ing = state.ingredients.find((i) => i.id === rItem.ingredientId);
              const unitCost = ing ? ing.currentCostPerBaseUnit : 0;
              const costTotal = Number((qtyToDeduct * unitCost).toFixed(2));
              totalCogs += costTotal;

              const bIdx = updatedStockBalances.findIndex(
                (b) => b.warehouseId === targetWarehouseId && b.ingredientId === rItem.ingredientId
              );
              if (bIdx >= 0) {
                updatedStockBalances[bIdx] = {
                  ...updatedStockBalances[bIdx],
                  quantityOnHand: Math.max(0, updatedStockBalances[bIdx].quantityOnHand - qtyToDeduct),
                };
              }

              newMovements.push({
                id: `sm-cc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                tenantId: state.tenant.id,
                warehouseId: targetWarehouseId,
                ingredientId: rItem.ingredientId,
                ingredientNameAr: ing?.nameAr || '',
                ingredientNameEn: ing?.nameEn || '',
                movementType: 'SALE_DEPLETION',
                quantityBaseUnit: -qtyToDeduct,
                unitCostEGP: unitCost,
                totalCostEGP: costTotal,
                referenceType: 'POS_ORDER',
                referenceId: orderNum,
                occurredAt: now,
                notes: `صرف مقادير طلب كول سنتر ${orderNum} لفرع ${branch.nameAr}`,
              });
            });
          }
        }
      });

      // 2. Double-Entry Accounting Journal Entry strictly attributed to fulfilling branch
      const jeNumber = `JV-2026-${String(state.journalEntries.length + 1).padStart(4, '0')}`;
      const journalLines: JournalLine[] = [
        {
          id: `jl-${Date.now()}-1`,
          accountId: 'acc-1130',
          accountCode: '1130',
          accountNameAr: 'الذمم المدينة — تحصيلات التوصيل وسائقي الدليفري (COD)',
          accountNameEn: 'Accounts Receivable - Delivery Collections',
          debit: grandTotal,
          credit: 0,
          memo: `استحقاق مبيعات دليفري كول سنتر ${orderNum} (${invoiceNum}) لفرع ${branch.nameEn}`,
        },
        {
          id: `jl-${Date.now()}-2`,
          accountId: 'acc-4010',
          accountCode: '4010',
          accountNameAr: 'إيرادات مبيعات الأطعمة والمشروبات',
          accountNameEn: 'Food & Beverage Sales Revenue',
          debit: 0,
          credit: subtotal,
          memo: `إيراد مبيعات طلب كول سنتر ${orderNum} منسوب لفرع ${branch.nameEn}`,
        },
        {
          id: `jl-${Date.now()}-3`,
          accountId: 'acc-2100',
          accountCode: '2100',
          accountNameAr: 'أمانات ضريبة القيمة المضافة المحصلة (Output VAT)',
          accountNameEn: 'VAT Payable (Output VAT)',
          debit: 0,
          credit: taxAmount,
          memo: `ضريبة القيمة المضافة لفاتورة ${invoiceNum}`,
        },
      ];

      if (params.deliveryFee > 0) {
        journalLines.push({
          id: `jl-${Date.now()}-4`,
          accountId: 'acc-4020',
          accountCode: '4020',
          accountNameAr: 'إيرادات خدمات الشحن والتوصيل (Delivery Fees)',
          accountNameEn: 'Delivery Service Revenue',
          debit: 0,
          credit: params.deliveryFee,
          memo: `إيراد خدمة توصيل طلب ${orderNum}`,
        });
      }

      if (totalCogs > 0) {
        journalLines.push(
          {
            id: `jl-${Date.now()}-5`,
            accountId: 'acc-5010',
            accountCode: '5010',
            accountNameAr: 'تكلفة البضاعة المباعة - الأغذية (Food Cost)',
            accountNameEn: 'Cost of Goods Sold (COGS)',
            debit: totalCogs,
            credit: 0,
            memo: `تكلفة وجبات طلب كول سنتر ${orderNum} مستودع ${targetWarehouseId}`,
          },
          {
            id: `jl-${Date.now()}-6`,
            accountId: 'acc-1200',
            accountCode: '1200',
            accountNameAr: 'مخزون المواد الأولية والأغذية بالمستودع',
            accountNameEn: 'Raw Material Inventory Asset',
            debit: 0,
            credit: totalCogs,
            memo: `صرف مخزون لمستودع فرع ${branch.nameEn}`,
          }
        );
      }

      const totalDebit = Number(journalLines.reduce((acc, l) => acc + l.debit, 0).toFixed(2));
      const totalCredit = Number(journalLines.reduce((acc, l) => acc + l.credit, 0).toFixed(2));

      const newJournalEntry: JournalEntry = {
        id: `je-${Date.now()}`,
        tenantId: state.tenant.id,
        branchId: branch.id, // Strictly attributed to fulfilling branch!
        entryNumber: jeNumber,
        date: now,
        sourceType: 'POS_SALE',
        sourceId: invoiceNum,
        memoAr: `فاتورة مبيعات كول سنتر ${invoiceNum} — منسوبة لفرع ${branch.nameAr}`,
        memoEn: `Call Center Sales Invoice ${invoiceNum} — Attributed to ${branch.nameEn}`,
        lines: journalLines,
        totalDebit,
        totalCredit,
        isPosted: true,
        postedAt: now,
      };

      newInvoice.journalEntryId = newJournalEntry.id;

      const updatedAccounts = state.accounts.map((acc) => {
        const linesForAccount = journalLines.filter((l) => l.accountId === acc.id);
        if (linesForAccount.length === 0) return acc;
        let delta = 0;
        linesForAccount.forEach((l) => {
          if (acc.normalBalance === 'DEBIT') {
            delta += l.debit - l.credit;
          } else {
            delta += l.credit - l.debit;
          }
        });
        return { ...acc, currentBalance: Number((acc.currentBalance + delta).toFixed(2)) };
      });

      const outboxItem: SyncOutboxItem = {
        operationId: `op-cc-${Date.now()}`,
        tenantId: state.tenant.id,
        branchId: branch.id,
        deviceId: 'call-center-01',
        operationType: 'SYNC_ORDER',
        payload: { order: newOrder, invoice: newInvoice },
        occurredAt: now,
        status: state.isOnline ? 'SYNCED' : 'PENDING',
        retryCount: 0,
      };

      state = {
        ...state,
        orders: [newOrder, ...state.orders],
        invoices: [newInvoice, ...state.invoices],
        stockBalances: updatedStockBalances,
        stockMovements: [...newMovements, ...state.stockMovements],
        journalEntries: [newJournalEntry, ...state.journalEntries],
        accounts: updatedAccounts,
        syncOutbox: [outboxItem, ...state.syncOutbox],
      };
      notify();
      return { order: newOrder, invoice: newInvoice };
    },

    logInvoicePrint: (
      invoiceId: string,
      cashierId: string,
      cashierName: string,
      format: '80mm' | '58mm' | 'A4',
      isReprint: boolean,
      reason?: string
    ) => {
      const invoice = state.invoices.find((inv) => inv.id === invoiceId);
      if (!invoice) return;

      const now = new Date().toISOString();
      const printLog: InvoicePrintLog = {
        id: `print-log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        branchId: invoice.branchId,
        printedByUserId: cashierId,
        printedByUserName: cashierName,
        format,
        isReprint,
        reprintReason: reason,
        printedAt: now,
      };

      const updatedInvoice: Invoice = {
        ...invoice,
        reprintCount: isReprint ? invoice.reprintCount + 1 : invoice.reprintCount,
        lastPrintedAt: now,
      };

      state = {
        ...state,
        invoices: state.invoices.map((inv) => (inv.id === invoice.id ? updatedInvoice : inv)),
        invoicePrintLogs: [printLog, ...state.invoicePrintLogs],
      };
      notify();
    },

    registerCallCenterOrderPayment: (
      invoiceId: string,
      cashierId: string,
      cashierName: string,
      method: PaymentMethod,
      tenderedAmount: number,
      changeAmount: number
    ): { success: boolean; invoice?: Invoice; error?: string } => {
      const invoice = state.invoices.find((inv) => inv.id === invoiceId);
      if (!invoice) return { success: false, error: 'Invoice not found' };

      // Prevent duplicate payment
      if (invoice.paymentStatus === 'PAID') {
        return { success: false, error: 'Invoice is already paid' };
      }

      const now = new Date().toISOString();

      const updatedInvoice: Invoice = {
        ...invoice,
        paymentStatus: 'PAID',
        status: 'PAID',
        paymentMethod: method,
        amountPaid: invoice.grandTotal,
        changeAmount,
        paidAt: now,
        cashierId,
        cashierName,
      };

      const updatedOrders = state.orders.map((o) =>
        o.id === invoice.orderId || o.orderNumber === invoice.orderNumber
          ? {
              ...o,
              status: 'COMPLETED' as const,
              paymentStatus: 'PAID' as const,
              paymentMethod: method,
              completedAt: now,
            }
          : o
      );

      // Settle Accounts Receivable: Debit Cash/Bank, Credit AR Delivery Collections
      const jeNumber = `JV-2026-${String(state.journalEntries.length + 1).padStart(4, '0')}`;
      const cashOrBankAccountId = method === 'CASH' ? 'acc-1010' : 'acc-1020';
      const cashOrBankAccount = state.accounts.find((a) => a.id === cashOrBankAccountId)!;

      const journalLines: JournalLine[] = [
        {
          id: `jl-${Date.now()}-pay1`,
          accountId: cashOrBankAccountId,
          accountCode: cashOrBankAccount.code,
          accountNameAr: cashOrBankAccount.nameAr,
          accountNameEn: cashOrBankAccount.nameEn,
          debit: invoice.grandTotal,
          credit: 0,
          memo: `تحصيل نقدي/بنكي لفاتورة دليفري ${invoice.invoiceNumber} عبر ${method}`,
        },
        {
          id: `jl-${Date.now()}-pay2`,
          accountId: 'acc-1130',
          accountCode: '1130',
          accountNameAr: 'الذمم المدينة — تحصيلات التوصيل وسائقي الدليفري (COD)',
          accountNameEn: 'Accounts Receivable - Delivery Collections',
          debit: 0,
          credit: invoice.grandTotal,
          memo: `إقفال ذمة تحصيل دليفري فاتورة ${invoice.invoiceNumber}`,
        },
      ];

      const settlementJE: JournalEntry = {
        id: `je-${Date.now()}`,
        tenantId: state.tenant.id,
        branchId: invoice.branchId, // Attributed strictly to fulfilling branch!
        entryNumber: jeNumber,
        date: now,
        sourceType: 'POS_SALE',
        sourceId: invoice.invoiceNumber,
        memoAr: `سداد فاتورة دليفري كول سنتر ${invoice.invoiceNumber} (${method})`,
        memoEn: `Call Center Delivery Invoice Payment ${invoice.invoiceNumber} (${method})`,
        lines: journalLines,
        totalDebit: invoice.grandTotal,
        totalCredit: invoice.grandTotal,
        isPosted: true,
        postedAt: now,
      };

      const updatedAccounts = state.accounts.map((acc) => {
        const linesForAccount = journalLines.filter((l) => l.accountId === acc.id);
        if (linesForAccount.length === 0) return acc;
        let delta = 0;
        linesForAccount.forEach((l) => {
          if (acc.normalBalance === 'DEBIT') {
            delta += l.debit - l.credit;
          } else {
            delta += l.credit - l.debit;
          }
        });
        return { ...acc, currentBalance: Number((acc.currentBalance + delta).toFixed(2)) };
      });

      const updatedCashSession = { ...state.cashSession };
      if (method === 'CASH') {
        updatedCashSession.totalSalesCash += invoice.grandTotal;
        updatedCashSession.expectedCash += invoice.grandTotal;
      } else if (method === 'CARD') {
        updatedCashSession.totalSalesCard += invoice.grandTotal;
      } else {
        updatedCashSession.totalSalesInstaPay += invoice.grandTotal;
      }

      state = {
        ...state,
        invoices: state.invoices.map((inv) => (inv.id === invoice.id ? updatedInvoice : inv)),
        orders: updatedOrders,
        journalEntries: [settlementJE, ...state.journalEntries],
        accounts: updatedAccounts,
        cashSession: updatedCashSession,
      };
      notify();
      return { success: true, invoice: updatedInvoice };
    },

    // POS & Orders
    // POS & Orders (Order-First Workflow)
    createOrder: (order: Order) => {
      const outboxItem: SyncOutboxItem = {
        operationId: `op-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        tenantId: state.tenant.id,
        branchId: state.activeBranchId,
        deviceId: 'dev-pos-01',
        operationType: 'SYNC_ORDER',
        payload: order,
        occurredAt: new Date().toISOString(),
        status: state.isOnline ? 'SYNCED' : 'PENDING',
        retryCount: 0,
      };

      // In Order-First workflow, an order may be unassigned to a table at creation.
      // If table is assigned, link order
      let updatedTables = state.tables;
      if (order.tableId) {
        updatedTables = state.tables.map((t) =>
          t.id === order.tableId
            ? {
                ...t,
                status: (t.status === 'AVAILABLE' ? 'ORDER_STARTED' : t.status) as TableStatus,
                currentOrderId: order.id,
              }
            : t
        );
      }

      state = {
        ...state,
        orders: [order, ...state.orders],
        tables: updatedTables,
        activeOrderId: order.id,
        syncOutbox: [outboxItem, ...state.syncOutbox],
      };
      notify();
    },

    createTableSession: (tableId: string, guestCount = 2): TableSession => {
      const table = state.tables.find((t) => t.id === tableId);
      const sessionId = `sess-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      const now = new Date().toISOString();
      const session: TableSession = {
        id: sessionId,
        tenantId: state.tenant.id,
        branchId: state.activeBranchId,
        tableId: table?.id || tableId,
        tableNumber: table?.tableNumber || '?',
        waiterId: state.currentUser.id,
        waiterName: state.currentUser.fullNameEn,
        guestCount,
        openedAt: now,
        status: 'ORDER_STARTED',
        orderIds: [],
        consolidatedSubtotal: 0,
        consolidatedDiscount: 0,
        consolidatedTax: 0,
        consolidatedServiceCharge: 0,
        consolidatedGrandTotal: 0,
        isPaid: false,
        kitchenStatus: 'PENDING',
      };

      const updatedTables = state.tables.map((t) =>
        t.id === tableId
          ? { ...t, status: 'ORDER_STARTED' as TableStatus, currentSessionId: sessionId }
          : t
      );

      state = {
        ...state,
        tableSessions: [session, ...state.tableSessions],
        tables: updatedTables,
        tableEvents: [
          {
            id: `evt-${Date.now()}`,
            sessionId,
            tableId,
            eventType: 'SESSION_OPENED',
            descriptionAr: `بدء جلسة جديدة للطاولة ${table?.tableNumber || ''} (${guestCount} أفراد)`,
            descriptionEn: `Started new dining session for Table ${table?.tableNumber || ''} (${guestCount} guests)`,
            actorName: state.currentUser.fullNameEn,
            timestamp: now,
          },
          ...state.tableEvents,
        ],
      };
      notify();
      return session;
    },

    assignTableToOrder: (orderId: string, tableId: string): { order: Order; session: TableSession } | null => {
      const order = state.orders.find((o) => o.id === orderId);
      const table = state.tables.find((t) => t.id === tableId);
      if (!order || !table) return null;

      const now = new Date().toISOString();
      let session = state.tableSessions.find(
        (s) => s.id === table.currentSessionId && !s.isPaid && s.status !== 'CLOSED'
      );

      let updatedSessions = [...state.tableSessions];
      let isNewSession = false;

      if (!session) {
        session = {
          id: `sess-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          tenantId: state.tenant.id,
          branchId: state.activeBranchId,
          tableId: table.id,
          tableNumber: table.tableNumber,
          waiterId: state.currentUser.id,
          waiterName: state.currentUser.fullNameEn,
          guestCount: order.guestCount || table.capacity,
          openedAt: now,
          status: 'ORDER_STARTED',
          orderIds: [order.id],
          consolidatedSubtotal: order.subtotal,
          consolidatedDiscount: order.discountAmount,
          consolidatedTax: order.taxAmount,
          consolidatedServiceCharge: order.serviceCharge,
          consolidatedGrandTotal: order.grandTotal,
          isPaid: false,
          kitchenStatus: 'PENDING',
        };
        updatedSessions.unshift(session);
        isNewSession = true;
      } else {
        const orderIds = session.orderIds.includes(order.id)
          ? session.orderIds
          : [...session.orderIds, order.id];
        session = {
          ...session,
          orderIds,
          status: 'ADDITIONAL_ORDER',
        };
        updatedSessions = updatedSessions.map((s) => (s.id === session!.id ? session! : s));
      }

      const seq = session.orderIds.indexOf(order.id) + 1;
      const orderNumber = seq > 1 ? `${table.tableNumber}-${seq}` : table.tableNumber;

      const updatedOrder: Order = {
        ...order,
        tableId: table.id,
        tableName: table.tableNumber,
        orderNumber,
        sessionId: session.id,
        orderSequence: seq,
        isAdditionalOrder: seq > 1,
      };

      const updatedTables = state.tables.map((t) =>
        t.id === table.id
          ? {
              ...t,
              status: (order.status === 'SENT_TO_KITCHEN' ? 'OCCUPIED' : 'ORDER_STARTED') as TableStatus,
              currentSessionId: session!.id,
              currentOrderId: order.id,
            }
          : t
      );

      state = {
        ...state,
        orders: state.orders.map((o) => (o.id === order.id ? updatedOrder : o)),
        tables: updatedTables,
        tableSessions: updatedSessions,
        tableEvents: [
          {
            id: `evt-${Date.now()}`,
            sessionId: session.id,
            tableId: table.id,
            eventType: isNewSession ? 'SESSION_OPENED' : 'ORDER_ADDED',
            descriptionAr: `تخصيص الطلب #${orderNumber} للطاولة ${table.tableNumber}`,
            descriptionEn: `Assigned Order #${orderNumber} to Table ${table.tableNumber}`,
            actorName: state.currentUser.fullNameEn,
            timestamp: now,
          },
          ...state.tableEvents,
        ],
      };
      notify();
      return { order: updatedOrder, session };
    },

    createAdditionalOrderForTable: (tableId: string): Order => {
      const table = state.tables.find((t) => t.id === tableId);
      if (!table) throw new Error('Table not found');

      const now = new Date().toISOString();
      let session = state.tableSessions.find(
        (s) => s.id === table.currentSessionId && !s.isPaid && s.status !== 'CLOSED'
      );

      let updatedSessions = [...state.tableSessions];

      if (!session) {
        session = {
          id: `sess-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          tenantId: state.tenant.id,
          branchId: state.activeBranchId,
          tableId: table.id,
          tableNumber: table.tableNumber,
          waiterId: state.currentUser.id,
          waiterName: state.currentUser.fullNameEn,
          guestCount: table.capacity,
          openedAt: now,
          status: 'ORDER_STARTED',
          orderIds: [],
          consolidatedSubtotal: 0,
          consolidatedDiscount: 0,
          consolidatedTax: 0,
          consolidatedServiceCharge: 0,
          consolidatedGrandTotal: 0,
          isPaid: false,
          kitchenStatus: 'PENDING',
        };
        updatedSessions.unshift(session);
      }

      const seq = session.orderIds.length + 1;
      const newOrderNumber = `${table.tableNumber}-${seq}`;
      const newOrder: Order = {
        id: `ord-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        tenantId: state.tenant.id,
        branchId: state.activeBranchId,
        orderNumber: newOrderNumber,
        orderType: 'DINE_IN',
        tableId: table.id,
        tableName: table.tableNumber,
        sessionId: session.id,
        isAdditionalOrder: true,
        orderSequence: seq,
        cashierId: state.currentUser.id,
        cashierName: state.currentUser.fullNameEn,
        guestCount: session.guestCount,
        status: 'DRAFT',
        items: [],
        subtotal: 0,
        discountAmount: 0,
        taxRate: 0.15,
        taxAmount: 0,
        serviceCharge: 0,
        grandTotal: 0,
        createdAt: now,
      };

      session = {
        ...session,
        orderIds: [...session.orderIds, newOrder.id],
        status: 'ADDITIONAL_ORDER',
      };

      updatedSessions = updatedSessions.map((s) => (s.id === session!.id ? session! : s));

      const updatedTables = state.tables.map((t) =>
        t.id === table.id
          ? {
              ...t,
              status: 'ADDITIONAL_ORDER' as TableStatus,
              currentSessionId: session!.id,
              currentOrderId: newOrder.id,
            }
          : t
      );

      state = {
        ...state,
        orders: [newOrder, ...state.orders],
        tables: updatedTables,
        tableSessions: updatedSessions,
        activeOrderId: newOrder.id,
        tableEvents: [
          {
            id: `evt-${Date.now()}`,
            sessionId: session.id,
            tableId: table.id,
            eventType: 'ADDITIONAL_ORDER_ADDED',
            descriptionAr: `إضافة طلب إضافي جديد #${newOrderNumber} لطاولة ${table.tableNumber}`,
            descriptionEn: `Added new additional order #${newOrderNumber} for Table ${table.tableNumber}`,
            actorName: state.currentUser.fullNameEn,
            timestamp: now,
          },
          ...state.tableEvents,
        ],
      };
      notify();
      return newOrder;
    },

    setActiveOrderId: (orderId: string | null) => {
      state = { ...state, activeOrderId: orderId };
      notify();
    },

    updateOrder: (order: Order) => {
      state = {
        ...state,
        orders: state.orders.map((o) => (o.id === order.id ? order : o)),
      };
      notify();
    },

    applyOrderDiscount: (orderId: string, amount: number) => {
      state = {
        ...state,
        orders: state.orders.map((o) => {
          if (o.id !== orderId) return o;
          const discountAmount = Math.max(0, amount);
          const taxableBase = Math.max(0, o.subtotal - discountAmount + o.serviceCharge);
          const taxAmount = Number((taxableBase * (o.taxRate || 0.15)).toFixed(2));
          const grandTotal = Number((taxableBase + taxAmount).toFixed(2));
          return {
            ...o,
            discountAmount,
            taxAmount,
            grandTotal,
          };
        }),
      };
      notify();
    },

    setOrderNotes: (orderId: string, notes: string) => {
      state = {
        ...state,
        orders: state.orders.map((o) => (o.id === orderId ? { ...o, notes } : o)),
      };
      notify();
    },

    setOrderTags: (orderId: string, tags: string[]) => {
      state = {
        ...state,
        orders: state.orders.map((o) => (o.id === orderId ? { ...o, tags } : o)),
      };
      notify();
    },

    setCustomerInfo: (orderId: string, customerName: string, customerPhone?: string) => {
      state = {
        ...state,
        orders: state.orders.map((o) =>
          o.id === orderId ? { ...o, customerName, customerPhone } : o
        ),
      };
      notify();
    },

    sendOrderToKitchen: (orderId: string): boolean => {
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return false;

      // In order-first workflow, Dine-In orders MUST be assigned to a table before kitchen dispatch
      if (order.orderType === 'DINE_IN' && !order.tableId) {
        return false;
      }

      const now = new Date().toISOString();
      const updatedOrder: Order = {
        ...order,
        status: 'SENT_TO_KITCHEN',
        kitchenSentAt: now,
        items: order.items.map((i) => ({ ...i, kitchenStatus: 'PREPARING' })),
      };

      let updatedSessions = state.tableSessions;
      let updatedTables = state.tables;

      if (order.sessionId) {
        const session = state.tableSessions.find((s) => s.id === order.sessionId);
        if (session) {
          const sessionOrders = state.orders
            .map((o) => (o.id === order.id ? updatedOrder : o))
            .filter((o) => session.orderIds.includes(o.id) && o.status !== 'CANCELLED');

          const consolidatedSubtotal = Number(sessionOrders.reduce((acc, o) => acc + o.subtotal, 0).toFixed(2));
          const consolidatedDiscount = Number(sessionOrders.reduce((acc, o) => acc + o.discountAmount, 0).toFixed(2));
          const consolidatedTax = Number(sessionOrders.reduce((acc, o) => acc + o.taxAmount, 0).toFixed(2));
          const consolidatedGrandTotal = Number(sessionOrders.reduce((acc, o) => acc + o.grandTotal, 0).toFixed(2));

          const newSessionStatus: TableSessionStatus =
            sessionOrders.length > 1 ? 'ADDITIONAL_ORDER' : 'ORDER_SENT';

          updatedSessions = state.tableSessions.map((s) =>
            s.id === session.id
              ? {
                  ...s,
                  status: newSessionStatus,
                  kitchenStatus: 'PREPARING',
                  consolidatedSubtotal,
                  consolidatedDiscount,
                  consolidatedTax,
                  consolidatedGrandTotal,
                }
              : s
          );

          updatedTables = state.tables.map((t) =>
            t.id === session.tableId
              ? { ...t, status: (newSessionStatus === 'ADDITIONAL_ORDER' ? 'ADDITIONAL_ORDER' : 'OCCUPIED') as TableStatus }
              : t
          );
        }
      } else if (order.tableId) {
        updatedTables = state.tables.map((t) =>
          t.id === order.tableId ? { ...t, status: 'OCCUPIED' as TableStatus } : t
        );
      }

      // KDS Outbox record
      const outboxItem: SyncOutboxItem = {
        operationId: `op-kds-${Date.now()}`,
        tenantId: state.tenant.id,
        branchId: state.activeBranchId,
        deviceId: 'dev-pos-01',
        operationType: 'SYNC_ORDER',
        payload: {
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          sessionId: updatedOrder.sessionId,
          tableName: updatedOrder.tableName,
          items: updatedOrder.items,
          sentAt: now,
        },
        occurredAt: now,
        status: state.isOnline ? 'SYNCED' : 'PENDING',
        retryCount: 0,
      };

      state = {
        ...state,
        orders: state.orders.map((o) => (o.id === order.id ? updatedOrder : o)),
        tables: updatedTables,
        tableSessions: updatedSessions,
        syncOutbox: [outboxItem, ...state.syncOutbox],
        tableEvents: order.sessionId
          ? [
              {
                id: `evt-${Date.now()}`,
                sessionId: order.sessionId,
                tableId: order.tableId || '',
                eventType: 'SENT_TO_KITCHEN',
                descriptionAr: `إرسال الطلب #${order.orderNumber} للمطبخ للتجهيز`,
                descriptionEn: `Sent Order #${order.orderNumber} to kitchen line`,
                actorName: state.currentUser.fullNameEn,
                timestamp: now,
              },
              ...state.tableEvents,
            ]
          : state.tableEvents,
      };
      notify();
      return true;
    },

    voidOrder: (orderId: string, reason?: string) => {
      const order = state.orders.find((o) => o.id === orderId);
      let updatedTables = state.tables;
      let updatedSessions = state.tableSessions;

      if (order?.tableId) {
        // Check if there are other active orders for this table
        const otherOrders = state.orders.filter(
          (o) => o.tableId === order.tableId && o.id !== orderId && o.status !== 'CANCELLED' && o.status !== 'COMPLETED'
        );
        if (otherOrders.length === 0) {
          updatedTables = state.tables.map((t) =>
            t.id === order.tableId ? { ...t, status: 'AVAILABLE' as TableStatus, currentOrderId: undefined, currentSessionId: undefined } : t
          );
        }
      }

      if (order?.sessionId) {
        updatedSessions = state.tableSessions.map((s) => {
          if (s.id !== order.sessionId) return s;
          const remainingOrderIds = s.orderIds.filter((id) => id !== orderId);
          return {
            ...s,
            orderIds: remainingOrderIds,
            status: remainingOrderIds.length === 0 ? ('CLOSED' as TableSessionStatus) : s.status,
          };
        });
      }

      state = {
        ...state,
        orders: state.orders.map((o) =>
          o.id === orderId ? { ...o, status: 'CANCELLED' as const, notes: reason ? `VOID: ${reason}` : o.notes } : o
        ),
        tables: updatedTables,
        tableSessions: updatedSessions,
        activeOrderId: null,
      };
      notify();
    },

    cancelOrderItem: (orderId: string, itemId: string, reason?: string) => {
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return;

      const updatedItems = order.items.filter((i) => i.id !== itemId);
      const subtotal = Number(updatedItems.reduce((acc, i) => acc + i.totalPrice, 0).toFixed(2));
      const taxableBase = Math.max(0, subtotal - (order.discountAmount || 0));
      const taxAmount = Number((taxableBase * (order.taxRate || 0.15)).toFixed(2));
      const grandTotal = Number((taxableBase + taxAmount).toFixed(2));

      const updatedOrder: Order = {
        ...order,
        items: updatedItems,
        subtotal,
        taxAmount,
        grandTotal,
      };

      state = {
        ...state,
        orders: state.orders.map((o) => (o.id === orderId ? updatedOrder : o)),
        tableEvents: order.sessionId
          ? [
              {
                id: `evt-${Date.now()}`,
                sessionId: order.sessionId,
                tableId: order.tableId || '',
                eventType: 'ITEM_CANCELLED',
                descriptionAr: `إلغاء صنف من الطلب #${order.orderNumber}: ${reason || ''}`,
                descriptionEn: `Cancelled item from Order #${order.orderNumber}: ${reason || ''}`,
                actorName: state.currentUser.fullNameEn,
                timestamp: new Date().toISOString(),
              },
              ...state.tableEvents,
            ]
          : state.tableEvents,
      };
      notify();
    },

    requestTableBill: (sessionId: string): { invoiceNumber: string; session: TableSession } => {
      const session = state.tableSessions.find((s) => s.id === sessionId);
      if (!session) throw new Error('Session not found');

      const sessionOrders = state.orders.filter(
        (o) => session.orderIds.includes(o.id) && o.status !== 'CANCELLED'
      );

      const consolidatedSubtotal = Number(sessionOrders.reduce((acc, o) => acc + o.subtotal, 0).toFixed(2));
      const consolidatedDiscount = Number(sessionOrders.reduce((acc, o) => acc + o.discountAmount, 0).toFixed(2));
      const consolidatedTax = Number(sessionOrders.reduce((acc, o) => acc + o.taxAmount, 0).toFixed(2));
      const consolidatedServiceCharge = Number(sessionOrders.reduce((acc, o) => acc + o.serviceCharge, 0).toFixed(2));
      const consolidatedGrandTotal = Number(sessionOrders.reduce((acc, o) => acc + o.grandTotal, 0).toFixed(2));

      const invoiceNum = session.invoiceNumber || `INV-TBL${session.tableNumber}-${String(Date.now()).slice(-5)}`;
      const now = new Date().toISOString();

      const updatedSession: TableSession = {
        ...session,
        status: 'BILL_REQUESTED',
        billRequestedAt: now,
        billPrintedAt: now,
        invoiceNumber: invoiceNum,
        consolidatedSubtotal,
        consolidatedDiscount,
        consolidatedTax,
        consolidatedServiceCharge,
        consolidatedGrandTotal,
      };

      const updatedTables = state.tables.map((t) =>
        t.id === session.tableId ? { ...t, status: 'BILL_REQUESTED' as TableStatus } : t
      );

      state = {
        ...state,
        tableSessions: state.tableSessions.map((s) => (s.id === sessionId ? updatedSession : s)),
        tables: updatedTables,
        tableEvents: [
          {
            id: `evt-${Date.now()}`,
            sessionId,
            tableId: session.tableId,
            eventType: 'BILL_REQUESTED',
            descriptionAr: `طلب حساب الطاولة ${session.tableNumber} وإصدار فاتورة مبدئية #${invoiceNum}`,
            descriptionEn: `Bill requested for Table ${session.tableNumber}. Consolidated pre-invoice #${invoiceNum}`,
            actorName: state.currentUser.fullNameEn,
            timestamp: now,
          },
          ...state.tableEvents,
        ],
      };
      notify();
      return { invoiceNumber: invoiceNum, session: updatedSession };
    },

    finalizeSessionPayment: (
      sessionId: string,
      paymentMethod: PaymentMethod,
      tenderedAmount: number,
      changeAmount: number
    ): { success: boolean; invoiceNumber: string } => {
      const session = state.tableSessions.find((s) => s.id === sessionId);
      if (!session) return { success: false, invoiceNumber: '' };

      const sessionOrders = state.orders.filter(
        (o) => session.orderIds.includes(o.id) && o.status !== 'CANCELLED'
      );

      const invoiceNum = session.invoiceNumber || `INV-TBL${session.tableNumber}-${String(Date.now()).slice(-5)}`;
      const now = new Date().toISOString();

      // 1. Calculate Recipe Depletions & COGS across all orders in session
      let totalCogs = 0;
      const newMovements: StockMovement[] = [];
      const updatedBalances = [...state.stockBalances];

      sessionOrders.forEach((ord) => {
        ord.items.forEach((item) => {
          const product = state.products.find((p) => p.id === item.productId);
          if (product && product.recipeId) {
            const recipe = state.recipes.find((r) => r.id === product.recipeId);
            if (recipe) {
              recipe.items.forEach((rItem) => {
                const qtyToDeduct = item.quantity * rItem.quantityBaseUnit;
                const ing = state.ingredients.find((i) => i.id === rItem.ingredientId);
                const unitCost = ing ? ing.currentCostPerBaseUnit : 0;
                const costTotal = qtyToDeduct * unitCost;
                totalCogs += costTotal;

                const bIdx = updatedBalances.findIndex(
                  (b) =>
                    b.warehouseId === state.activeWarehouseId &&
                    b.ingredientId === rItem.ingredientId
                );
                if (bIdx >= 0) {
                  updatedBalances[bIdx] = {
                    ...updatedBalances[bIdx],
                    quantityOnHand: Math.max(0, updatedBalances[bIdx].quantityOnHand - qtyToDeduct),
                  };
                }

                newMovements.push({
                  id: `sm-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                  tenantId: state.tenant.id,
                  warehouseId: state.activeWarehouseId,
                  ingredientId: rItem.ingredientId,
                  ingredientNameAr: ing?.nameAr || '',
                  ingredientNameEn: ing?.nameEn || '',
                  movementType: 'SALE_DEPLETION',
                  quantityBaseUnit: -qtyToDeduct,
                  unitCostEGP: unitCost,
                  totalCostEGP: costTotal,
                  referenceType: 'POS_ORDER',
                  referenceId: ord.orderNumber,
                  occurredAt: now,
                  notes: `صرف مقادير طاولة ${session.tableNumber}: ${item.productNameAr} × ${item.quantity}`,
                });
              });
            }
          }
        });
      });

      // 2. Double-Entry Balanced Accounting Journal Entry
      const jeNumber = `JV-2026-${String(state.journalEntries.length + 1).padStart(4, '0')}`;
      const cashOrBankAccountId = paymentMethod === 'CASH' ? 'acc-1010' : 'acc-1020';
      const cashOrBankAccount = state.accounts.find((a) => a.id === cashOrBankAccountId)!;

      const journalLines: JournalLine[] = [
        {
          id: `jl-${Date.now()}-1`,
          accountId: cashOrBankAccountId,
          accountCode: cashOrBankAccount.code,
          accountNameAr: cashOrBankAccount.nameAr,
          accountNameEn: cashOrBankAccount.nameEn,
          debit: session.consolidatedGrandTotal,
          credit: 0,
          memo: `تحصيل فاتورة مبيعات جلسة طاولة ${session.tableNumber} (${invoiceNum}) عبر ${paymentMethod}`,
        },
        {
          id: `jl-${Date.now()}-2`,
          accountId: 'acc-4010',
          accountCode: '4010',
          accountNameAr: 'إيرادات مبيعات الأطعمة والمشروبات',
          accountNameEn: 'Food & Beverage Sales Revenue',
          debit: 0,
          credit: session.consolidatedSubtotal,
          memo: `إيراد مبيعات فاتورة طاولة ${session.tableNumber}`,
        },
        {
          id: `jl-${Date.now()}-3`,
          accountId: 'acc-2100',
          accountCode: '2100',
          accountNameAr: 'أمانات ضريبة القيمة المضافة المحصلة 14%',
          accountNameEn: 'VAT Payable (14% ETA)',
          debit: 0,
          credit: session.consolidatedTax,
          memo: `ضريبة قيمة مضافة فاتورة طاولة ${session.tableNumber}`,
        },
      ];

      if (totalCogs > 0) {
        journalLines.push(
          {
            id: `jl-${Date.now()}-4`,
            accountId: 'acc-5010',
            accountCode: '5010',
            accountNameAr: 'تكلفة البضاعة المباعة - الأغذية (COGS)',
            accountNameEn: 'Cost of Goods Sold (COGS)',
            debit: totalCogs,
            credit: 0,
            memo: `تكلفة المقادير المستهلكة لطاولة ${session.tableNumber}`,
          },
          {
            id: `jl-${Date.now()}-5`,
            accountId: 'acc-1200',
            accountCode: '1200',
            accountNameAr: 'مخزون المواد الأولية والأغذية بالمستودع',
            accountNameEn: 'Raw Material Inventory Asset',
            debit: 0,
            credit: totalCogs,
            memo: `صرف مخزون المواد المستهلكة لطاولة ${session.tableNumber}`,
          }
        );
      }

      const totalDebit = journalLines.reduce((acc, l) => acc + l.debit, 0);
      const totalCredit = journalLines.reduce((acc, l) => acc + l.credit, 0);

      const newJournalEntry: JournalEntry = {
        id: `je-${Date.now()}`,
        tenantId: state.tenant.id,
        branchId: state.activeBranchId,
        entryNumber: jeNumber,
        date: now,
        sourceType: 'POS_SALE',
        sourceId: invoiceNum,
        memoAr: `فاتورة مبيعات طاولة ${session.tableNumber} (${invoiceNum}) — ${paymentMethod}`,
        memoEn: `Table ${session.tableNumber} Sales Invoice (${invoiceNum}) — ${paymentMethod}`,
        lines: journalLines,
        totalDebit,
        totalCredit,
        isPosted: true,
        postedAt: now,
      };

      // 3. Update Account Balances
      const updatedAccounts = state.accounts.map((acc) => {
        const linesForAccount = journalLines.filter((l) => l.accountId === acc.id);
        if (linesForAccount.length === 0) return acc;
        let delta = 0;
        linesForAccount.forEach((l) => {
          if (acc.normalBalance === 'DEBIT') {
            delta += l.debit - l.credit;
          } else {
            delta += l.credit - l.debit;
          }
        });
        return { ...acc, currentBalance: acc.currentBalance + delta };
      });

      // 4. Update Cash Register
      const updatedCashSession = { ...state.cashSession };
      if (paymentMethod === 'CASH') {
        updatedCashSession.totalSalesCash += session.consolidatedGrandTotal;
        updatedCashSession.expectedCash += session.consolidatedGrandTotal;
      } else if (paymentMethod === 'CARD') {
        updatedCashSession.totalSalesCard += session.consolidatedGrandTotal;
      } else {
        updatedCashSession.totalSalesInstaPay += session.consolidatedGrandTotal;
      }

      // 5. Update All Orders in the Session to COMPLETED
      const updatedOrders = state.orders.map((o) =>
        session.orderIds.includes(o.id)
          ? {
              ...o,
              status: 'COMPLETED' as const,
              completedAt: now,
              paymentMethod,
              invoiceNumber: invoiceNum,
            }
          : o
      );

      // 6. Update Session to PAID and CLOSED
      const updatedSession: TableSession = {
        ...session,
        status: 'PAID',
        closedAt: now,
        isPaid: true,
        paidAt: now,
        paymentMethod,
        invoiceNumber: invoiceNum,
      };

      // 7. Make Table AVAILABLE for next guests!
      const updatedTables = state.tables.map((t) =>
        t.id === session.tableId
          ? { ...t, status: 'AVAILABLE' as TableStatus, currentOrderId: undefined, currentSessionId: undefined }
          : t
      );

      // 8. Outbox record
      const outboxItem: SyncOutboxItem = {
        operationId: `op-pay-sess-${Date.now()}`,
        tenantId: state.tenant.id,
        branchId: state.activeBranchId,
        deviceId: 'dev-pos-01',
        operationType: 'SYNC_PAYMENT',
        payload: {
          sessionId,
          tableNumber: session.tableNumber,
          invoiceNumber: invoiceNum,
          paymentMethod,
          grandTotal: session.consolidatedGrandTotal,
        },
        occurredAt: now,
        status: state.isOnline ? 'SYNCED' : 'PENDING',
        retryCount: 0,
      };

      state = {
        ...state,
        orders: updatedOrders,
        tables: updatedTables,
        tableSessions: state.tableSessions.map((s) => (s.id === sessionId ? updatedSession : s)),
        cashSession: updatedCashSession,
        stockBalances: updatedBalances,
        stockMovements: [...newMovements, ...state.stockMovements],
        journalEntries: [newJournalEntry, ...state.journalEntries],
        accounts: updatedAccounts,
        syncOutbox: [outboxItem, ...state.syncOutbox],
        activeOrderId: null,
        tableEvents: [
          {
            id: `evt-${Date.now()}`,
            sessionId,
            tableId: session.tableId,
            eventType: 'PAYMENT_RECORDED',
            descriptionAr: `سداد فاتورة طاولة ${session.tableNumber} بالكامل عبر ${paymentMethod} (${session.consolidatedGrandTotal} ج.م)`,
            descriptionEn: `Full payment recorded for Table ${session.tableNumber} via ${paymentMethod}`,
            actorName: state.currentUser.fullNameEn,
            timestamp: now,
          },
          {
            id: `evt-${Date.now()}-2`,
            sessionId,
            tableId: session.tableId,
            eventType: 'SESSION_CLOSED',
            descriptionAr: `إغلاق جلسة طاولة ${session.tableNumber} وجعل الطاولة متاحة لاستقبال عملاء جدد`,
            descriptionEn: `Closed session for Table ${session.tableNumber}. Table marked AVAILABLE.`,
            actorName: state.currentUser.fullNameEn,
            timestamp: now,
          },
          ...state.tableEvents,
        ],
      };
      notify();
      return { success: true, invoiceNumber: invoiceNum };
    },

    // Standard standalone or session payment router
    finalizeOrderAndPay: (
      orderId: string,
      paymentMethod: PaymentMethod,
      tenderedAmount: number,
      changeAmount: number
    ): { success: boolean; invoiceNumber: string } => {
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return { success: false, invoiceNumber: '' };

      // If this order is part of a TableSession, delegate to finalizeSessionPayment
      if (order.sessionId) {
        const session = state.tableSessions.find((s) => s.id === order.sessionId);
        if (session && !session.isPaid) {
          // Calculate session totals before finalizing
          return state.tableSessions.find((s) => s.id === order.sessionId)
            ? (useRestaurantStore as any)().finalizeSessionPayment(order.sessionId, paymentMethod, tenderedAmount, changeAmount)
            : { success: false, invoiceNumber: '' };
        }
      }

      const invoiceNum = `INV-2026-${String(state.orders.length + 1001).padStart(5, '0')}`;
      const now = new Date().toISOString();

      let totalCogs = 0;
      const newMovements: StockMovement[] = [];
      const updatedBalances = [...state.stockBalances];

      order.items.forEach((item) => {
        const product = state.products.find((p) => p.id === item.productId);
        if (product && product.recipeId) {
          const recipe = state.recipes.find((r) => r.id === product.recipeId);
          if (recipe) {
            recipe.items.forEach((rItem) => {
              const qtyToDeduct = item.quantity * rItem.quantityBaseUnit;
              const ing = state.ingredients.find((i) => i.id === rItem.ingredientId);
              const unitCost = ing ? ing.currentCostPerBaseUnit : 0;
              const costTotal = qtyToDeduct * unitCost;
              totalCogs += costTotal;

              const bIdx = updatedBalances.findIndex(
                (b) =>
                  b.warehouseId === state.activeWarehouseId &&
                  b.ingredientId === rItem.ingredientId
              );
              if (bIdx >= 0) {
                updatedBalances[bIdx] = {
                  ...updatedBalances[bIdx],
                  quantityOnHand: Math.max(0, updatedBalances[bIdx].quantityOnHand - qtyToDeduct),
                };
              }

              newMovements.push({
                id: `sm-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                tenantId: state.tenant.id,
                warehouseId: state.activeWarehouseId,
                ingredientId: rItem.ingredientId,
                ingredientNameAr: ing?.nameAr || '',
                ingredientNameEn: ing?.nameEn || '',
                movementType: 'SALE_DEPLETION',
                quantityBaseUnit: -qtyToDeduct,
                unitCostEGP: unitCost,
                totalCostEGP: costTotal,
                referenceType: 'POS_ORDER',
                referenceId: order.orderNumber,
                occurredAt: now,
                notes: `صرف وصفة: ${item.productNameAr} × ${item.quantity}`,
              });
            });
          }
        }
      });

      const jeNumber = `JV-2026-${String(state.journalEntries.length + 1).padStart(4, '0')}`;
      const cashOrBankAccountId = paymentMethod === 'CASH' ? 'acc-1010' : 'acc-1020';
      const cashOrBankAccount = state.accounts.find((a) => a.id === cashOrBankAccountId)!;

      const journalLines: JournalLine[] = [
        {
          id: `jl-${Date.now()}-1`,
          accountId: cashOrBankAccountId,
          accountCode: cashOrBankAccount.code,
          accountNameAr: cashOrBankAccount.nameAr,
          accountNameEn: cashOrBankAccount.nameEn,
          debit: order.grandTotal,
          credit: 0,
          memo: `تحصيل فاتورة مبيعات ${invoiceNum} عبر ${paymentMethod}`,
        },
        {
          id: `jl-${Date.now()}-2`,
          accountId: 'acc-4010',
          accountCode: '4010',
          accountNameAr: 'إيرادات مبيعات الأطعمة والمشروبات',
          accountNameEn: 'Food & Beverage Sales Revenue',
          debit: 0,
          credit: order.subtotal,
          memo: `صافي إيراد مبيعات فاتورة ${invoiceNum}`,
        },
        {
          id: `jl-${Date.now()}-3`,
          accountId: 'acc-2100',
          accountCode: '2100',
          accountNameAr: 'أمانات ضريبة القيمة المضافة المحصلة 14%',
          accountNameEn: 'VAT Payable (14% ETA)',
          debit: 0,
          credit: order.taxAmount,
          memo: `ضريبة قيمة مضافة 14% فاتورة ${invoiceNum}`,
        },
      ];

      if (totalCogs > 0) {
        journalLines.push(
          {
            id: `jl-${Date.now()}-4`,
            accountId: 'acc-5010',
            accountCode: '5010',
            accountNameAr: 'تكلفة البضاعة المباعة - الأغذية (COGS)',
            accountNameEn: 'Cost of Goods Sold (COGS)',
            debit: totalCogs,
            credit: 0,
            memo: `تكلفة المواد الأولية المستهلكة لفاتورة ${invoiceNum}`,
          },
          {
            id: `jl-${Date.now()}-5`,
            accountId: 'acc-1200',
            accountCode: '1200',
            accountNameAr: 'مخزون المواد الأولية والأغذية بالمستودع',
            accountNameEn: 'Raw Material Inventory Asset',
            debit: 0,
            credit: totalCogs,
            memo: `صرف مخزون المواد الأولية لفاتورة ${invoiceNum}`,
          }
        );
      }

      const totalDebit = journalLines.reduce((acc, l) => acc + l.debit, 0);
      const totalCredit = journalLines.reduce((acc, l) => acc + l.credit, 0);

      const newJournalEntry: JournalEntry = {
        id: `je-${Date.now()}`,
        tenantId: state.tenant.id,
        branchId: state.activeBranchId,
        entryNumber: jeNumber,
        date: now,
        sourceType: 'POS_SALE',
        sourceId: invoiceNum,
        memoAr: `فاتورة مبيعات نقدية ${invoiceNum} — ${order.orderType}`,
        memoEn: `POS Sales Invoice ${invoiceNum} — ${order.orderType}`,
        lines: journalLines,
        totalDebit,
        totalCredit,
        isPosted: true,
        postedAt: now,
      };

      const updatedAccounts = state.accounts.map((acc) => {
        const linesForAccount = journalLines.filter((l) => l.accountId === acc.id);
        if (linesForAccount.length === 0) return acc;
        let delta = 0;
        linesForAccount.forEach((l) => {
          if (acc.normalBalance === 'DEBIT') {
            delta += l.debit - l.credit;
          } else {
            delta += l.credit - l.debit;
          }
        });
        return { ...acc, currentBalance: acc.currentBalance + delta };
      });

      const updatedCashSession = { ...state.cashSession };
      if (paymentMethod === 'CASH') {
        updatedCashSession.totalSalesCash += order.grandTotal;
        updatedCashSession.expectedCash += order.grandTotal;
      } else if (paymentMethod === 'CARD') {
        updatedCashSession.totalSalesCard += order.grandTotal;
      } else {
        updatedCashSession.totalSalesInstaPay += order.grandTotal;
      }

      const updatedOrders = state.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: 'COMPLETED' as const,
              completedAt: now,
              paymentMethod,
              invoiceNumber: invoiceNum,
            }
          : o
      );

      let updatedTables = state.tables;
      if (order.tableId) {
        updatedTables = state.tables.map((t) =>
          t.id === order.tableId ? { ...t, status: 'AVAILABLE' as TableStatus, currentOrderId: undefined } : t
        );
      }

      const outboxItem: SyncOutboxItem = {
        operationId: `op-pay-${Date.now()}`,
        tenantId: state.tenant.id,
        branchId: state.activeBranchId,
        deviceId: 'dev-pos-01',
        operationType: 'SYNC_PAYMENT',
        payload: { orderId, invoiceNum, paymentMethod, grandTotal: order.grandTotal },
        occurredAt: now,
        status: state.isOnline ? 'SYNCED' : 'PENDING',
        retryCount: 0,
      };

      state = {
        ...state,
        orders: updatedOrders,
        tables: updatedTables,
        cashSession: updatedCashSession,
        stockBalances: updatedBalances,
        stockMovements: [...newMovements, ...state.stockMovements],
        journalEntries: [newJournalEntry, ...state.journalEntries],
        accounts: updatedAccounts,
        syncOutbox: [outboxItem, ...state.syncOutbox],
      };
      notify();

      return { success: true, invoiceNumber: invoiceNum };
    },

    transferTable: (sessionId: string, targetTableId: string): boolean => {
      const session = state.tableSessions.find((s) => s.id === sessionId);
      const targetTable = state.tables.find((t) => t.id === targetTableId);
      if (!session || !targetTable) return false;

      if (targetTable.status !== 'AVAILABLE') return false;

      const oldTableId = session.tableId;
      const oldTableNumber = session.tableNumber;
      const now = new Date().toISOString();

      const updatedSession: TableSession = {
        ...session,
        tableId: targetTable.id,
        tableNumber: targetTable.tableNumber,
      };

      const updatedOrders = state.orders.map((o) =>
        session.orderIds.includes(o.id)
          ? { ...o, tableId: targetTable.id, tableName: targetTable.tableNumber }
          : o
      );

      const updatedTables = state.tables.map((t) => {
        if (t.id === oldTableId) {
          return { ...t, status: 'AVAILABLE' as TableStatus, currentOrderId: undefined, currentSessionId: undefined };
        }
        if (t.id === targetTable.id) {
          return {
            ...t,
            status: session.status as TableStatus,
            currentSessionId: session.id,
            currentOrderId: session.orderIds[session.orderIds.length - 1],
          };
        }
        return t;
      });

      state = {
        ...state,
        tableSessions: state.tableSessions.map((s) => (s.id === sessionId ? updatedSession : s)),
        orders: updatedOrders,
        tables: updatedTables,
        tableEvents: [
          {
            id: `evt-${Date.now()}`,
            sessionId,
            tableId: targetTable.id,
            eventType: 'TABLE_TRANSFERRED',
            descriptionAr: `نقل الجلسة بالكامل من طاولة ${oldTableNumber} إلى طاولة ${targetTable.tableNumber}`,
            descriptionEn: `Transferred session from Table ${oldTableNumber} to Table ${targetTable.tableNumber}`,
            actorName: state.currentUser.fullNameEn,
            timestamp: now,
          },
          ...state.tableEvents,
        ],
      };
      notify();
      return true;
    },

    mergeTableSessions: (sourceSessionId: string, targetSessionId: string): boolean => {
      const source = state.tableSessions.find((s) => s.id === sourceSessionId);
      const target = state.tableSessions.find((s) => s.id === targetSessionId);
      if (!source || !target || source.id === target.id) return false;

      const now = new Date().toISOString();
      const combinedOrderIds = [...target.orderIds, ...source.orderIds];

      const allOrders = state.orders.filter((o) => combinedOrderIds.includes(o.id) && o.status !== 'CANCELLED');
      const consolidatedSubtotal = Number(allOrders.reduce((acc, o) => acc + o.subtotal, 0).toFixed(2));
      const consolidatedDiscount = Number(allOrders.reduce((acc, o) => acc + o.discountAmount, 0).toFixed(2));
      const consolidatedTax = Number(allOrders.reduce((acc, o) => acc + o.taxAmount, 0).toFixed(2));
      const consolidatedGrandTotal = Number(allOrders.reduce((acc, o) => acc + o.grandTotal, 0).toFixed(2));

      const updatedTargetSession: TableSession = {
        ...target,
        orderIds: combinedOrderIds,
        status: 'ADDITIONAL_ORDER',
        consolidatedSubtotal,
        consolidatedDiscount,
        consolidatedTax,
        consolidatedGrandTotal,
        guestCount: target.guestCount + source.guestCount,
      };

      const updatedOrders = state.orders.map((o) =>
        source.orderIds.includes(o.id)
          ? { ...o, sessionId: target.id, tableId: target.tableId, tableName: target.tableNumber }
          : o
      );

      const updatedTables = state.tables.map((t) =>
        t.id === source.tableId
          ? { ...t, status: 'AVAILABLE' as TableStatus, currentOrderId: undefined, currentSessionId: undefined }
          : t
      );

      const updatedSourceSession: TableSession = {
        ...source,
        status: 'CLOSED',
        closedAt: now,
        notes: `تم الدمج مع طاولة ${target.tableNumber}`,
      };

      state = {
        ...state,
        orders: updatedOrders,
        tables: updatedTables,
        tableSessions: state.tableSessions.map((s) => {
          if (s.id === target.id) return updatedTargetSession;
          if (s.id === source.id) return updatedSourceSession;
          return s;
        }),
        tableEvents: [
          {
            id: `evt-${Date.now()}`,
            sessionId: target.id,
            tableId: target.tableId,
            eventType: 'TABLE_MERGED',
            descriptionAr: `تم دمج طلبات طاولة ${source.tableNumber} في طاولة ${target.tableNumber}`,
            descriptionEn: `Merged orders from Table ${source.tableNumber} into Table ${target.tableNumber}`,
            actorName: state.currentUser.fullNameEn,
            timestamp: now,
          },
          ...state.tableEvents,
        ],
      };
      notify();
      return true;
    },

    splitSessionBill: (sessionId: string, splitCount: number): number[] => {
      const session = state.tableSessions.find((s) => s.id === sessionId);
      if (!session || splitCount <= 0) return [];
      const perGuest = Number((session.consolidatedGrandTotal / splitCount).toFixed(2));
      return Array(splitCount).fill(perGuest);
    },

    reprintKitchenTicket: (orderId: string) => {
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return;
      const now = new Date().toISOString();
      const outboxItem: SyncOutboxItem = {
        operationId: `op-reprint-${Date.now()}`,
        tenantId: state.tenant.id,
        branchId: state.activeBranchId,
        deviceId: 'dev-pos-01',
        operationType: 'SYNC_ORDER',
        payload: { ...order, isReprint: true, reprintedAt: now },
        occurredAt: now,
        status: state.isOnline ? 'SYNCED' : 'PENDING',
        retryCount: 0,
      };
      state = {
        ...state,
        syncOutbox: [outboxItem, ...state.syncOutbox],
      };
      notify();
    },

    // Cash Sessions: Open / Close / Variance Entry
    openCashSession: (openingFloat: number) => {
      const newSession: CashSession = {
        id: `session-${Date.now()}`,
        tenantId: state.tenant.id,
        branchId: state.activeBranchId,
        deviceId: 'dev-pos-01',
        cashierId: state.currentUser.id,
        cashierName: state.currentUser.fullNameAr,
        openedAt: new Date().toISOString(),
        openingFloat,
        totalSalesCash: 0,
        totalSalesCard: 0,
        totalSalesInstaPay: 0,
        cashIn: 0,
        cashOut: 0,
        expectedCash: openingFloat,
        status: 'OPEN',
      };
      state = { ...state, cashSession: newSession };
      notify();
    },

    closeCashSession: (countedCash: number) => {
      const now = new Date().toISOString();
      const variance = countedCash - state.cashSession.expectedCash;
      const closedSession: CashSession = {
        ...state.cashSession,
        closedAt: now,
        countedCash,
        variance,
        status: 'CLOSED',
      };

      // If there is a variance, post an audited journal entry
      let updatedEntries = state.journalEntries;
      let updatedAccounts = state.accounts;

      if (Math.abs(variance) > 0.01) {
        const jeNum = `JV-VAR-${Date.now().toString().slice(-4)}`;
        const isShortage = variance < 0;
        const absVariance = Math.abs(variance);

        const lines: JournalLine[] = isShortage
          ? [
              // Shortage: Debit Expense (5030), Credit Cash (1010)
              {
                id: `jl-var-1`,
                accountId: 'acc-5030',
                accountCode: '5030',
                accountNameAr: 'عجز وزيادة صندوق الكاشير',
                accountNameEn: 'Cash Register Variance Expense',
                debit: absVariance,
                credit: 0,
                memo: `تسوية عجز صندوق وردية الكاشير ${closedSession.cashierName}`,
              },
              {
                id: `jl-var-2`,
                accountId: 'acc-1010',
                accountCode: '1010',
                accountNameAr: 'نقدية الصندوق ونقاط البيع (درج الكاشير)',
                accountNameEn: 'Cash on Hand - Register',
                debit: 0,
                credit: absVariance,
                memo: `تخفيض عهدة الصندوق بقيمة العجز الفعلي`,
              },
            ]
          : [
              // Surplus: Debit Cash (1010), Credit Variance (5030/Revenue)
              {
                id: `jl-var-1`,
                accountId: 'acc-1010',
                accountCode: '1010',
                accountNameAr: 'نقدية الصندوق ونقاط البيع (درج الكاشير)',
                accountNameEn: 'Cash on Hand - Register',
                debit: absVariance,
                credit: 0,
                memo: `إيداع زيادة غير مبررة بالصندوق`,
              },
              {
                id: `jl-var-2`,
                accountId: 'acc-5030',
                accountCode: '5030',
                accountNameAr: 'عجز وزيادة صندوق الكاشير',
                accountNameEn: 'Cash Register Variance Expense',
                debit: 0,
                credit: absVariance,
                memo: `تسجيل زيادة بصندوق الكاشير كإيراد تسوية`,
              },
            ];

        const je: JournalEntry = {
          id: `je-var-${Date.now()}`,
          tenantId: state.tenant.id,
          branchId: state.activeBranchId,
          entryNumber: jeNum,
          date: now,
          sourceType: 'CASH_VARIANCE',
          sourceId: closedSession.id,
          memoAr: isShortage ? `قيد إثبات عجز درج الكاشير (${absVariance} ج.م)` : `قيد إثبات زيادة درج الكاشير (${absVariance} ج.م)`,
          memoEn: isShortage ? `Cash register shortage entry (${absVariance} EGP)` : `Cash register surplus entry (${absVariance} EGP)`,
          lines,
          totalDebit: absVariance,
          totalCredit: absVariance,
          isPosted: true,
          postedAt: now,
        };

        updatedEntries = [je, ...updatedEntries];

        // Update accounts
        updatedAccounts = state.accounts.map((a) => {
          if (a.id === 'acc-1010') {
            return { ...a, currentBalance: isShortage ? a.currentBalance - absVariance : a.currentBalance + absVariance };
          }
          if (a.id === 'acc-5030') {
            return { ...a, currentBalance: isShortage ? a.currentBalance + absVariance : a.currentBalance - absVariance };
          }
          return a;
        });
      }

      state = {
        ...state,
        cashSession: closedSession,
        journalEntries: updatedEntries,
        accounts: updatedAccounts,
      };
      notify();
    },

    // KDS Bump state
    bumpKitchenItem: (orderId: string, itemId: string) => {
      const updatedOrders = state.orders.map((o) => {
        if (o.id !== orderId) return o;
        const updatedItems = o.items.map((i) => {
          if (i.id !== itemId) return i;
          const nextStatus =
            i.kitchenStatus === 'PENDING'
              ? ('PREPARING' as const)
              : i.kitchenStatus === 'PREPARING'
              ? ('READY' as const)
              : ('READY' as const);
          return { ...i, kitchenStatus: nextStatus };
        });
        const allReady = updatedItems.every((i) => i.kitchenStatus === 'READY');
        return {
          ...o,
          items: updatedItems,
          status: allReady ? ('READY' as const) : o.status,
        };
      });

      state = { ...state, orders: updatedOrders };
      notify();
    },

    bumpEntireOrder: (orderId: string) => {
      const updatedOrders = state.orders.map((o) => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          status: 'READY' as const,
          items: o.items.map((i) => ({ ...i, kitchenStatus: 'READY' as const })),
        };
      });
      state = { ...state, orders: updatedOrders };
      notify();
    },

    // Purchasing & Goods Receipt: updates WAC, stock, and double-entry AP voucher
    receivePurchaseOrder: (
      supplierId: string,
      items: { ingredientId: string; quantityKg: number; unitPriceEGP: number }[],
      freightCostEGP: number,
      invoiceRef: string
    ) => {
      const supplier = state.suppliers.find((s) => s.id === supplierId);
      if (!supplier) return;

      const now = new Date().toISOString();
      let subtotal = 0;
      const updatedIngredients = [...state.ingredients];
      const updatedBalances = [...state.stockBalances];
      const newMovements: StockMovement[] = [];

      items.forEach((item) => {
        const lineTotal = item.quantityKg * item.unitPriceEGP;
        subtotal += lineTotal;

        const ingIndex = updatedIngredients.findIndex((i) => i.id === item.ingredientId);
        if (ingIndex >= 0) {
          const ing = updatedIngredients[ingIndex];
          const incomingBaseQty = item.quantityKg * ing.conversionFactor; // e.g. 50 kg * 1000 = 50,000 g
          const incomingCostPerBaseUnit = item.unitPriceEGP / ing.conversionFactor; // 400 EGP / 1000 = 0.40 EGP/g

          // Existing stock on hand
          const bIdx = updatedBalances.findIndex(
            (b) => b.warehouseId === state.activeWarehouseId && b.ingredientId === item.ingredientId
          );
          const currentQtyOnHand = bIdx >= 0 ? updatedBalances[bIdx].quantityOnHand : 0;
          const currentWac = ing.currentCostPerBaseUnit;

          // New Weighted Average Cost = (Q1*C1 + Q2*C2) / (Q1 + Q2)
          const newQtyOnHand = currentQtyOnHand + incomingBaseQty;
          const newWac =
            newQtyOnHand > 0
              ? (currentQtyOnHand * currentWac + incomingBaseQty * incomingCostPerBaseUnit) / newQtyOnHand
              : incomingCostPerBaseUnit;

          // Update ingredient WAC
          updatedIngredients[ingIndex] = {
            ...ing,
            currentCostPerBaseUnit: Number(newWac.toFixed(4)),
          };

          // Update warehouse balance
          if (bIdx >= 0) {
            updatedBalances[bIdx] = {
              ...updatedBalances[bIdx],
              quantityOnHand: newQtyOnHand,
              weightedAverageCost: Number(newWac.toFixed(4)),
            };
          } else {
            updatedBalances.push({
              warehouseId: state.activeWarehouseId,
              ingredientId: item.ingredientId,
              quantityOnHand: newQtyOnHand,
              weightedAverageCost: Number(newWac.toFixed(4)),
            });
          }

          // Stock movement log
          newMovements.push({
            id: `sm-po-${Date.now()}-${item.ingredientId}`,
            tenantId: state.tenant.id,
            warehouseId: state.activeWarehouseId,
            ingredientId: item.ingredientId,
            ingredientNameAr: ing.nameAr,
            ingredientNameEn: ing.nameEn,
            movementType: 'PURCHASE_RECEIPT',
            quantityBaseUnit: incomingBaseQty,
            unitCostEGP: Number(newWac.toFixed(4)),
            totalCostEGP: lineTotal,
            referenceType: 'PURCHASE_ORDER',
            referenceId: invoiceRef,
            occurredAt: now,
            notes: `استلام مشتريات من ${supplier.nameAr} فاتورة #${invoiceRef}`,
          });
        }
      });

      const taxAmount = Number((subtotal * 0.14).toFixed(2));
      const grandTotal = subtotal + taxAmount + freightCostEGP;

      // Double-entry Balanced Journal Entry:
      // Debit: 1200 Raw Material Inventory (subtotal + freightCost)
      // Debit: 2110 VAT Input Deductible (taxAmount)
      // Credit: 2010 Accounts Payable - Supplier (grandTotal)
      const jeNumber = `JV-PUR-${Date.now().toString().slice(-4)}`;
      const journalLines: JournalLine[] = [
        {
          id: `jl-p-1`,
          accountId: 'acc-1200',
          accountCode: '1200',
          accountNameAr: 'مخزون المواد الأولية والأغذية بالمستودع',
          accountNameEn: 'Raw Material Inventory Asset',
          debit: subtotal + freightCostEGP,
          credit: 0,
          memo: `إضافة مخزون مشتريات بضاعة واردة فاتورة ${invoiceRef}`,
        },
        {
          id: `jl-p-2`,
          accountId: 'acc-2110',
          accountCode: '2110',
          accountNameAr: 'ضريبة القيمة المضافة المدفوعة على المشتريات (Input VAT)',
          accountNameEn: 'VAT Input Deductible',
          debit: taxAmount,
          credit: 0,
          memo: `ضريبة قيمة مضافة مدخلات 14% فاتورة مورد ${invoiceRef}`,
        },
        {
          id: `jl-p-3`,
          accountId: 'acc-2010',
          accountCode: '2010',
          accountNameAr: 'الموردون وحسابات الدائنين التجاريين',
          accountNameEn: 'Accounts Payable - Suppliers (AP)',
          debit: 0,
          credit: grandTotal,
          memo: `استحقاق فاتورة توريد لصالح ${supplier.nameAr}`,
        },
      ];

      const je: JournalEntry = {
        id: `je-po-${Date.now()}`,
        tenantId: state.tenant.id,
        branchId: state.activeBranchId,
        entryNumber: jeNumber,
        date: now,
        sourceType: 'PURCHASE_RECEIPT',
        sourceId: invoiceRef,
        memoAr: `استلام بضاعة وفاتورة شراء من ${supplier.nameAr} (#${invoiceRef})`,
        memoEn: `Goods receipt & purchase invoice from ${supplier.nameEn} (#${invoiceRef})`,
        lines: journalLines,
        totalDebit: grandTotal,
        totalCredit: grandTotal,
        isPosted: true,
        postedAt: now,
      };

      // Update supplier balance
      const updatedSuppliers = state.suppliers.map((s) =>
        s.id === supplierId ? { ...s, outstandingBalanceEGP: s.outstandingBalanceEGP + grandTotal } : s
      );

      // Update accounts
      const updatedAccounts = state.accounts.map((acc) => {
        if (acc.id === 'acc-1200') return { ...acc, currentBalance: acc.currentBalance + subtotal + freightCostEGP };
        if (acc.id === 'acc-2110') return { ...acc, currentBalance: acc.currentBalance + taxAmount };
        if (acc.id === 'acc-2010') return { ...acc, currentBalance: acc.currentBalance + grandTotal };
        return acc;
      });

      state = {
        ...state,
        ingredients: updatedIngredients,
        stockBalances: updatedBalances,
        stockMovements: [...newMovements, ...state.stockMovements],
        suppliers: updatedSuppliers,
        journalEntries: [je, ...state.journalEntries],
        accounts: updatedAccounts,
      };
      notify();
    },

    // Record Spoilage & Wastage
    recordWastage: (ingredientId: string, quantityKg: number, reason: string) => {
      const ing = state.ingredients.find((i) => i.id === ingredientId);
      if (!ing) return;

      const baseQty = quantityKg * ing.conversionFactor;
      const unitCost = ing.currentCostPerBaseUnit;
      const totalCost = Number((baseQty * unitCost).toFixed(2));
      const now = new Date().toISOString();

      // Decrement stock balance
      const updatedBalances = state.stockBalances.map((b) =>
        b.warehouseId === state.activeWarehouseId && b.ingredientId === ingredientId
          ? { ...b, quantityOnHand: Math.max(0, b.quantityOnHand - baseQty) }
          : b
      );

      // Add movement
      const movement: StockMovement = {
        id: `sm-wst-${Date.now()}`,
        tenantId: state.tenant.id,
        warehouseId: state.activeWarehouseId,
        ingredientId,
        ingredientNameAr: ing.nameAr,
        ingredientNameEn: ing.nameEn,
        movementType: 'WASTAGE',
        quantityBaseUnit: -baseQty,
        unitCostEGP: unitCost,
        totalCostEGP: totalCost,
        referenceType: 'WASTAGE_NOTE',
        referenceId: `WST-${Date.now().toString().slice(-4)}`,
        occurredAt: now,
        notes: `إتلاف وهدر: ${reason}`,
      };

      // Balanced Journal Entry:
      // Debit: 5020 Inventory Spoilage & Wastage Expense (totalCost)
      // Credit: 1200 Raw Material Inventory Asset (totalCost)
      const jeNumber = `JV-WST-${Date.now().toString().slice(-4)}`;
      const je: JournalEntry = {
        id: `je-wst-${Date.now()}`,
        tenantId: state.tenant.id,
        branchId: state.activeBranchId,
        entryNumber: jeNumber,
        date: now,
        sourceType: 'STOCK_WASTAGE',
        sourceId: movement.id,
        memoAr: `إثبات هدر وتالف مخزون: ${ing.nameAr} (${quantityKg} كجم) — ${reason}`,
        memoEn: `Inventory spoilage write-off: ${ing.nameEn} (${quantityKg} kg) — ${reason}`,
        lines: [
          {
            id: `jl-w-1`,
            accountId: 'acc-5020',
            accountCode: '5020',
            accountNameAr: 'مصروف هدر وتالف المواد الغذائية',
            accountNameEn: 'Inventory Spoilage & Wastage Expense',
            debit: totalCost,
            credit: 0,
            memo: `إتلاف ${ing.nameAr}: ${reason}`,
          },
          {
            id: `jl-w-2`,
            accountId: 'acc-1200',
            accountCode: '1200',
            accountNameAr: 'مخزون المواد الأولية والأغذية بالمستودع',
            accountNameEn: 'Raw Material Inventory Asset',
            debit: 0,
            credit: totalCost,
            memo: `تخفيض المخزون بتكلفة الهدر الفعلي`,
          },
        ],
        totalDebit: totalCost,
        totalCredit: totalCost,
        isPosted: true,
        postedAt: now,
      };

      const updatedAccounts = state.accounts.map((acc) => {
        if (acc.id === 'acc-5020') return { ...acc, currentBalance: acc.currentBalance + totalCost };
        if (acc.id === 'acc-1200') return { ...acc, currentBalance: acc.currentBalance - totalCost };
        return acc;
      });

      state = {
        ...state,
        stockBalances: updatedBalances,
        stockMovements: [movement, ...state.stockMovements],
        journalEntries: [je, ...state.journalEntries],
        accounts: updatedAccounts,
      };
      notify();
    },

    // Restaurant & System Configuration
    updateTenant: (tenantUpdates: Partial<Tenant>) => {
      state = {
        ...state,
        tenant: {
          ...state.tenant,
          ...tenantUpdates,
        },
      };
      notify();
    },

    updateTenantSettings: (settingsUpdates: Partial<TenantSettings>) => {
      const currentSettings = state.tenant.settings || {
        defaultTaxRate: 0.15,
        taxCalculation: 'EXCLUDED',
        defaultServiceCharge: 0,
        defaultOrderType: 'DINE_IN',
        enableGuestCountPrompt: true,
        autoPrintReceipt: true,
        autoSendToKitchen: false,
        allowManualDiscount: true,
        maxDiscountPercent: 30,
        receiptHeaderAr: 'أهلاً بكم في فودكس — برجر ومشاوي فاخرة',
        receiptHeaderEn: 'Welcome to Foodics Gourmet Burger & Grill',
        receiptFooterAr: 'شكراً لزيارتكم! الرقم الضريبي: SA-310-984-219',
        receiptFooterEn: 'Thank you for dining with us! Tax No: SA-310-984-219',
        showZatcaQrCode: true,
        receiptPaperWidth: '80mm',
        enableOfflineOutbox: true,
      };

      state = {
        ...state,
        tenant: {
          ...state.tenant,
          settings: {
            ...currentSettings,
            ...settingsUpdates,
          },
        },
      };
      notify();
    },

    // Branch Management
    setActiveBranch: (branchId: string) => {
      state = { ...state, activeBranchId: branchId };
      notify();
    },

    addBranch: (branch: Branch) => {
      state = {
        ...state,
        branches: [...state.branches, branch],
      };
      notify();
    },

    updateBranch: (branch: Branch) => {
      state = {
        ...state,
        branches: state.branches.map((b) => (b.id === branch.id ? branch : b)),
      };
      notify();
    },

    deleteBranch: (branchId: string) => {
      if (state.branches.length <= 1) return; // Keep at least one branch
      state = {
        ...state,
        branches: state.branches.filter((b) => b.id !== branchId),
        activeBranchId: state.activeBranchId === branchId ? state.branches[0].id : state.activeBranchId,
      };
      notify();
    },

    // Product & Menu Management
    addProduct: (product: Product) => {
      state = {
        ...state,
        products: [product, ...state.products],
      };
      notify();
    },

    updateProduct: (product: Product) => {
      state = {
        ...state,
        products: state.products.map((p) => (p.id === product.id ? product : p)),
      };
      notify();
    },

    deleteProduct: (productId: string) => {
      state = {
        ...state,
        products: state.products.filter((p) => p.id !== productId),
      };
      notify();
    },

    // Category Management
    addCategory: (category: Category) => {
      state = {
        ...state,
        categories: [...state.categories, category],
      };
      notify();
    },

    updateCategory: (category: Category) => {
      state = {
        ...state,
        categories: state.categories.map((c) => (c.id === category.id ? category : c)),
      };
      notify();
    },

    deleteCategory: (categoryId: string) => {
      state = {
        ...state,
        categories: state.categories.filter((c) => c.id !== categoryId),
      };
      notify();
    },

    // Backup & Restore
    exportDatabaseJson: (): string => {
      return JSON.stringify(state, null, 2);
    },

    importDatabaseJson: (jsonStr: string): boolean => {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed && parsed.tenant && Array.isArray(parsed.products)) {
          state = {
            ...parsed,
            isOnline: true,
          };
          notify();
          return true;
        }
        return false;
      } catch (e) {
        console.error('Import database JSON error', e);
        return false;
      }
    },

    // Reset database to initial seed
    resetToDefault: () => {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
      state = loadInitialState();
      notify();
    },
};

export function useRestaurantStore() {
  const [snapshot, setSnapshot] = useState<AppState>(state);

  useEffect(() => {
    listeners.add(setSnapshot);
    return () => {
      listeners.delete(setSnapshot);
    };
  }, []);

  return {
    state: snapshot,
    ...storeActions,
  };
}

export function getRestaurantStore() {
  return {
    get state() {
      return state;
    },
    ...storeActions,
  };
}

useRestaurantStore.getState = getRestaurantStore;

