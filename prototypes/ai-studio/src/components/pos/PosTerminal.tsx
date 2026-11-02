/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Foodics iPad POS Terminal
 * Order-First Table Management, Multi-Course Dining Sessions, and Unified Billing
 */

import React, { useState, useEffect } from 'react';
import {
  Product,
  OrderItem,
  OrderType,
  Order,
  RestaurantTable,
  TableSession,
} from '../../types';
import { useRestaurantStore } from '../../services/store';
import { translations, formatCurrency } from '../../lib/i18n';
import { FoodVisual } from './FoodVisual';
import { ModifierModal } from './ModifierModal';
import { PaymentModal } from './PaymentModal';
import { ThermalReceiptModal } from './ThermalReceiptModal';
import { CashSessionModal } from './CashSessionModal';
import { DiscountModal } from './DiscountModal';
import { NotesModal } from './NotesModal';
import { TagsModal } from './TagsModal';
import { VoidModal } from './VoidModal';
import { CustomerModal } from './CustomerModal';
import { TableSelectorModal } from './TableSelectorModal';
import { ActiveTablesModal } from './ActiveTablesModal';
import { TableSessionDetailsModal } from './TableSessionDetailsModal';
import { CallCenterOrdersModal } from './CallCenterOrdersModal';
import {
  Printer,
  ChefHat,
  Ban,
  Percent,
  FileText,
  Tag,
  MoreHorizontal,
  Search,
  Wifi,
  Battery,
  Plus,
  Minus,
  Trash2,
  ChevronLeft,
  Clock,
  LayoutGrid,
  Home,
  CheckCircle2,
  DollarSign,
  AlertCircle,
  X,
  UserPlus,
  Settings,
  UtensilsCrossed,
  Receipt,
  Eye,
  PhoneCall,
  Building2,
} from 'lucide-react';

interface PosTerminalProps {
  onOpenSettings?: () => void;
}

export const PosTerminal: React.FC<PosTerminalProps> = ({ onOpenSettings }) => {
  const {
    state,
    createOrder,
    updateOrder,
    setActiveOrderId,
    applyOrderDiscount,
    setOrderNotes,
    setOrderTags,
    setCustomerInfo,
    sendOrderToKitchen,
    voidOrder,
    assignTableToOrder,
    createAdditionalOrderForTable,
    requestTableBill,
    switchActiveBranch,
  } = useRestaurantStore();
  const t = translations[state.language];

  // Active Order selection
  const activeOrder =
    state.orders.find((o) => o.id === state.activeOrderId) ||
    state.orders[0] ||
    null;

  // Active table session for the currently viewed order
  const activeSession = activeOrder?.sessionId
    ? state.tableSessions.find((s) => s.id === activeOrder.sessionId)
    : activeOrder?.tableId
    ? state.tableSessions.find(
        (s) => s.tableId === activeOrder.tableId && s.status !== 'CLOSED' && s.status !== 'PAID'
      )
    : null;

  // Selected Category (null = show all 13 Foodics category cards)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [activeModifierProduct, setActiveModifierProduct] = useState<Product | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [receiptModalData, setReceiptModalData] = useState<{
    order?: Order;
    session?: TableSession;
    invoiceNumber: string;
    isPreBill?: boolean;
  } | null>(null);

  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [isCashSessionModalOpen, setIsCashSessionModalOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isOrdersListModalOpen, setIsOrdersListModalOpen] = useState(false);

  // New Table Workflow Modals
  const [isActiveTablesModalOpen, setIsActiveTablesModalOpen] = useState(false);
  const [selectedSessionForDetails, setSelectedSessionForDetails] = useState<TableSession | null>(null);
  const [sessionForPayment, setSessionForPayment] = useState<TableSession | null>(null);
  const [isCallCenterModalOpen, setIsCallCenterModalOpen] = useState(false);

  // Active Branch & Branch-Scoped Call Center orders
  const activeBranch =
    state.branches.find((b) => b.id === state.activeBranchId) || state.branches[0];
  const branchCallCenterOrders = state.orders.filter(
    (o) =>
      o.orderSource === 'CALL_CENTER' &&
      (o.fulfillingBranchId === state.activeBranchId || o.branchId === state.activeBranchId)
  );
  const unpaidCallCenterCount = branchCallCenterOrders.filter((o) => o.paymentStatus !== 'PAID').length;

  // Toast notification message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Clock for iPad header bar
  const [currentTime, setCurrentTime] = useState('12:41 AM  Tue 13 Jul');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dayStr = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
      setCurrentTime(`${timeStr}  ${dayStr}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // Filter products by category or search
  const filteredProducts = state.products.filter((p) => {
    const matchCategory = !selectedCategoryId || p.categoryId === selectedCategoryId;
    const matchSearch =
      !searchQuery.trim() ||
      p.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch && p.isAvailable;
  });

  // Handle adding product to active order
  const handleProductClick = (product: Product) => {
    if (product.modifierGroups && product.modifierGroups.length > 0) {
      setActiveModifierProduct(product);
    } else {
      addProductToActiveOrder(product, 1, [], product.basePrice);
    }
  };

  const addProductToActiveOrder = (
    product: Product,
    quantity: number,
    selectedModifiers: {
      groupNameAr: string;
      groupNameEn?: string;
      optionNameAr: string;
      optionNameEn: string;
      priceDelta: number;
    }[],
    unitPrice: number
  ) => {
    const currentOrder = activeOrder || createNewEmptyOrder();

    const newItem: OrderItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      productId: product.id,
      productNameAr: product.nameAr,
      productNameEn: product.nameEn,
      unitPrice,
      quantity,
      selectedModifiers: selectedModifiers.map((m) => ({
        groupNameAr: m.groupNameAr,
        optionNameAr: m.optionNameAr,
        optionNameEn: m.optionNameEn,
        priceDelta: m.priceDelta,
      })),
      prepStation: product.prepStation,
      kitchenStatus: 'PENDING',
      totalPrice: unitPrice * quantity,
    };

    const updatedItems = [...currentOrder.items, newItem];
    recalculateAndUpdateOrder(currentOrder, updatedItems);
  };

  /**
   * Order-First empty order creation:
   * Does NOT force upfront table selection. Waiter starts adding items immediately.
   */
  const createNewEmptyOrder = (tableNumber?: string, tableId?: string) => {
    const seq = state.orders.length + 1;
    const orderNum = tableNumber || String(100 + seq);
    const newOrd: Order = {
      id: `ord-${Date.now()}`,
      tenantId: state.tenant.id,
      branchId: state.activeBranchId,
      orderNumber: orderNum,
      orderType: 'DINE_IN',
      tableId: tableId,
      tableName: tableNumber,
      cashierId: state.currentUser.id,
      cashierName: state.currentUser.fullNameEn,
      guestCount: 2,
      status: 'DRAFT',
      notes: '',
      tags: [],
      items: [],
      subtotal: 0,
      discountAmount: 0,
      taxRate: 0.15,
      taxAmount: 0,
      serviceCharge: 0,
      grandTotal: 0,
      createdAt: new Date().toISOString(),
    };
    createOrder(newOrd);
    return newOrd;
  };

  const updateItemQuantity = (itemId: string, delta: number) => {
    if (!activeOrder) return;
    const updatedItems = activeOrder.items
      .map((item) => {
        if (item.id === itemId) {
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          return {
            ...item,
            quantity: newQty,
            totalPrice: item.unitPrice * newQty,
          };
        }
        return item;
      })
      .filter(Boolean) as OrderItem[];

    recalculateAndUpdateOrder(activeOrder, updatedItems);
  };

  const removeItem = (itemId: string) => {
    if (!activeOrder) return;
    const updatedItems = activeOrder.items.filter((i) => i.id !== itemId);
    recalculateAndUpdateOrder(activeOrder, updatedItems);
  };

  const recalculateAndUpdateOrder = (
    order: Order,
    items: OrderItem[],
    overrideDiscount?: number
  ) => {
    const subtotal = items.reduce((acc, item) => acc + item.totalPrice, 0);
    const discount = overrideDiscount !== undefined ? overrideDiscount : (order.discountAmount || 0);
    const effectiveDiscount = Math.min(subtotal, Math.max(0, discount));
    const taxableBase = Math.max(0, subtotal - effectiveDiscount);
    const taxRate = order.taxRate || 0.15;
    const taxAmount = Number((taxableBase * taxRate).toFixed(2));
    const grandTotal = Number((taxableBase + taxAmount).toFixed(2));

    const updated: Order = {
      ...order,
      items,
      subtotal: Number(subtotal.toFixed(2)),
      discountAmount: effectiveDiscount,
      taxAmount,
      grandTotal,
    };
    updateOrder(updated);
  };

  // Add course separator
  const handleAddCourse = () => {
    if (!activeOrder) return;
    const courseCount =
      activeOrder.items.filter((i) => i.productId.startsWith('course-')).length + 2;
    const courseItem: OrderItem = {
      id: `course-${Date.now()}`,
      productId: `course-${courseCount}`,
      productNameAr: `المرحلة ${courseCount} (Course ${courseCount})`,
      productNameEn: `Course ${courseCount}`,
      unitPrice: 0,
      quantity: 1,
      selectedModifiers: [],
      prepStation: 'COLD',
      kitchenStatus: 'PENDING',
      totalPrice: 0,
    };
    const updatedItems = [...activeOrder.items, courseItem];
    updateOrder({ ...activeOrder, items: updatedItems });
    showToast(`Added Course ${courseCount}`);
  };

  // 7 Top Action Handlers
  const handlePrint = () => {
    if (!activeOrder || activeOrder.items.length === 0) {
      showToast(state.language === 'ar' ? 'لا توجد أصناف في الطلب لطباعتها' : 'No active order items to print');
      return;
    }

    if (activeOrder.sessionId) {
      const res = requestTableBill(activeOrder.sessionId);
      setReceiptModalData({
        session: res.session,
        invoiceNumber: res.invoiceNumber,
        isPreBill: true,
      });
      showToast(state.language === 'ar' ? `تم إصدار فاتورة ضيافة مبدئية #${res.invoiceNumber}` : `Generated Pre-Bill #${res.invoiceNumber}`);
    } else {
      setReceiptModalData({
        order: activeOrder,
        invoiceNumber: `PRE-BILL-${activeOrder.orderNumber}`,
        isPreBill: true,
      });
      showToast(state.language === 'ar' ? 'طباعة تذكرة مبدئية' : 'Printing pre-bill');
    }
  };

  /**
   * Send Order to Kitchen KDS:
   * Order-First enforcement: If Dine-In and table is not assigned yet,
   * automatically prompt waiter to assign a table before dispatching.
   */
  const handleKitchen = () => {
    if (!activeOrder || activeOrder.items.length === 0) {
      showToast(state.language === 'ar' ? 'لا توجد أصناف في الطلب لإرسالها للمطبخ' : 'No items to send to kitchen');
      return;
    }

    if (activeOrder.orderType === 'DINE_IN' && !activeOrder.tableId) {
      showToast(
        state.language === 'ar'
          ? 'يرجى تحديد طاولة شاغرة للطلب قبل الإرسال للمطبخ'
          : 'Please assign an available table before sending to kitchen'
      );
      setIsTableModalOpen(true);
      return;
    }

    const ok = sendOrderToKitchen(activeOrder.id);
    if (ok) {
      showToast(
        state.language === 'ar'
          ? `تم إرسال الطلب للمطبخ بنجاح (طاولة ${activeOrder.tableName || activeOrder.orderNumber})`
          : `Order for Table ${activeOrder.tableName || activeOrder.orderNumber} sent to Kitchen KDS!`
      );
    }
  };

  const handleVoid = () => {
    if (!activeOrder) return;
    setIsVoidModalOpen(true);
  };

  const handleDiscount = () => {
    if (!activeOrder) return;
    setIsDiscountModalOpen(true);
  };

  const handleNotes = () => {
    if (!activeOrder) return;
    setIsNotesModalOpen(true);
  };

  const handleTags = () => {
    if (!activeOrder) return;
    setIsTagsModalOpen(true);
  };

  const handleTableSelect = (table: RestaurantTable) => {
    if (activeOrder) {
      assignTableToOrder(activeOrder.id, table.id);
      showToast(
        state.language === 'ar'
          ? `تم ربط الطلب بطاولة ${table.tableNumber}`
          : `Assigned order to Table ${table.tableNumber}`
      );
    } else {
      const newOrd = createNewEmptyOrder(table.tableNumber, table.id);
      showToast(
        state.language === 'ar'
          ? `بدء طلب جديد لطاولة ${table.tableNumber}`
          : `Started new order for Table ${table.tableNumber}`
      );
    }
  };

  const handleNewOrder = () => {
    // Order-First: Start draft with no table upfront
    const newOrd = createNewEmptyOrder();
    showToast(
      state.language === 'ar'
        ? `بدء طلب جديد #${newOrd.orderNumber} (اختر الطاولة قبل الإرسال للمطبخ)`
        : `Started New Order #${newOrd.orderNumber} (assign table before kitchen dispatch)`
    );
  };

  const activeSessionsCount = state.tableSessions.filter(
    (s) => s.status !== 'CLOSED' && s.status !== 'PAID'
  ).length;

  const hasBillRequested = state.tableSessions.some((s) => s.status === 'BILL_REQUESTED');

  const selectedCategory = state.categories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="flex-1 flex flex-col bg-[#EDEFF2] select-none overflow-hidden font-sans text-slate-800">
      {/* 1. iPad Status Bar with Branch Switcher */}
      <div className="h-7 bg-[#EDEFF2] px-4 flex items-center justify-between text-[11px] font-semibold text-slate-700 shrink-0 border-b border-slate-300/60">
        <div className="flex items-center gap-3">
          <span className="tracking-tight">{currentTime}</span>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5 bg-white/80 border border-slate-300/70 rounded-md px-2 py-0.5 text-[10px]">
            <Building2 className="w-3 h-3 text-[#5A24CA]" />
            <span className="font-bold text-slate-800">{activeBranch.nameAr}</span>
            <div className="flex items-center gap-1 mr-1.5 border-r border-slate-300 pr-1.5">
              {state.branches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => switchActiveBranch(b.id)}
                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold transition-all ${
                    b.id === state.activeBranchId
                      ? 'bg-[#5A24CA] text-white'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {b.id === 'branch-cairo-main' ? 'فرع A' : 'فرع B'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Wifi className="w-3.5 h-3.5 text-slate-700" />
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono">90%</span>
            <Battery className="w-4 h-4 text-slate-700 rotate-90" />
          </div>
        </div>
      </div>

      {/* Toast notification banner */}
      {toastMessage && (
        <div className="absolute top-9 left-1/2 -translate-x-1/2 z-50 bg-[#5A24CA] text-white px-5 py-2 rounded-full shadow-lg text-xs font-bold flex items-center gap-2 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Container: 2-Column Split */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3">
        {/* ========================================================= */}
        {/* LEFT COLUMN: ACTIVE ORDER TICKET CARD */}
        {/* ========================================================= */}
        <div className="w-[360px] lg:w-[390px] bg-white rounded-2xl shadow-sm border border-slate-200/80 flex flex-col shrink-0 overflow-hidden">
          {/* Header row 1: Table & Status & Session shortcut */}
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            {activeOrder?.tableId ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (activeSession) {
                      setSelectedSessionForDetails(activeSession);
                    } else {
                      setIsTableModalOpen(true);
                    }
                  }}
                  className="text-2xl font-black text-[#5A24CA] hover:opacity-85 transition-opacity flex items-center gap-1.5"
                  title="View Table Session Details"
                >
                  <span>{activeOrder.tableName || '8'}</span>
                  {activeOrder.isAdditionalOrder && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      #{activeOrder.orderNumber}
                    </span>
                  )}
                </button>

                {activeSession && (
                  <button
                    onClick={() => setSelectedSessionForDetails(activeSession)}
                    className="p-1 rounded-lg bg-purple-50 text-[#5A24CA] hover:bg-purple-100 transition-colors"
                    title="Open Table Session Details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setIsTableModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-dashed border-[#5A24CA] bg-purple-50 text-[#5A24CA] hover:bg-purple-100 transition-colors font-bold text-xs"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>{state.language === 'ar' ? 'تحديد طاولة' : 'Assign Table'}</span>
              </button>
            )}

            {/* Visual Status Indicator with Color + Text */}
            <div className="flex items-center gap-1.5">
              {activeSession?.status === 'BILL_REQUESTED' ? (
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  <span>{state.language === 'ar' ? 'طلب الحساب' : 'BILL REQUESTED'}</span>
                </span>
              ) : activeSession?.status === 'ADDITIONAL_ORDER' || activeOrder?.isAdditionalOrder ? (
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  <span>{state.language === 'ar' ? 'طلب إضافي' : 'ADDITIONAL'}</span>
                </span>
              ) : activeOrder?.status === 'SENT_TO_KITCHEN' ? (
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-600 text-white uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  <span>{state.language === 'ar' ? 'في المطبخ' : 'IN KITCHEN'}</span>
                </span>
              ) : activeOrder?.status === 'COMPLETED' ? (
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white uppercase">
                  <span>{state.language === 'ar' ? 'مدفوع' : 'PAID'}</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>{state.language === 'ar' ? 'نشط' : 'ACTIVE'}</span>
                </span>
              )}
            </div>
          </div>

          {/* Header row 2: Dine In & Customer */}
          <div className="px-5 pb-3 flex items-center justify-between text-xs font-bold">
            <button
              onClick={() => {
                if (!activeOrder) return;
                const nextType: OrderType =
                  activeOrder.orderType === 'DINE_IN'
                    ? 'TAKEAWAY'
                    : activeOrder.orderType === 'TAKEAWAY'
                    ? 'DELIVERY'
                    : 'DINE_IN';
                updateOrder({ ...activeOrder, orderType: nextType });
              }}
              className="text-[#5A24CA] hover:underline uppercase tracking-wide"
            >
              {activeOrder?.orderType === 'DINE_IN'
                ? `DINE IN (${activeOrder.guestCount || 2})`
                : activeOrder?.orderType === 'TAKEAWAY'
                ? 'TAKE AWAY'
                : 'DELIVERY'}
            </button>

            <button
              onClick={() => setIsCustomerModalOpen(true)}
              className="text-[#5A24CA] hover:underline uppercase tracking-wide flex items-center gap-1"
            >
              {activeOrder?.customerName ? (
                <span className="truncate max-w-[130px]">{activeOrder.customerName}</span>
              ) : (
                'ADD CUSTOMER'
              )}
            </button>
          </div>

          {/* Optional Notes or Tags badges */}
          {(activeOrder?.notes || (activeOrder?.tags && activeOrder.tags.length > 0)) && (
            <div className="px-5 pb-2 flex flex-wrap gap-1 border-b border-slate-100">
              {activeOrder.tags?.map((tg) => (
                <span
                  key={tg}
                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#5A24CA]/10 text-[#5A24CA]"
                >
                  #{tg}
                </span>
              ))}
              {activeOrder.notes && (
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200 truncate max-w-full">
                  Note: {activeOrder.notes}
                </span>
              )}
            </div>
          )}

          <div className="h-px bg-slate-100 w-full" />

          {/* Line Items List */}
          <div className="flex-1 overflow-y-auto px-5 py-2 divide-y divide-slate-100 space-y-1">
            {(!activeOrder || activeOrder.items.length === 0) ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <LayoutGrid className="w-10 h-10 stroke-1 text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-500">
                  {state.language === 'ar' ? 'ابدأ باختيار الأصناف من القائمة' : 'Order is empty'}
                </p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-[200px]">
                  {state.language === 'ar'
                    ? 'أضف الأصناف المطلوبة ثم حدد الطاولة لإرسالها للمطبخ'
                    : 'Select items, customize, and assign to table'}
                </p>
              </div>
            ) : (
              activeOrder.items.map((item) => {
                const isCourse = item.productId.startsWith('course-');

                if (isCourse) {
                  return (
                    <div
                      key={item.id}
                      className="py-2.5 flex items-center justify-between text-xs font-black text-[#5A24CA] bg-purple-50/60 -mx-5 px-5 my-1"
                    >
                      <span>{item.productNameEn}</span>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-slate-400 hover:text-rose-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={item.id} className="py-2.5 flex flex-col gap-1">
                    <div className="flex items-start justify-between">
                      {/* Qty & Item Name */}
                      <div className="flex items-start gap-2.5 flex-1 pr-2">
                        <span className="font-bold text-sm text-slate-900 mt-0.5">
                          {item.quantity} x
                        </span>
                        <div className="flex-1">
                          <h4 className="text-sm font-bold text-slate-800 leading-snug">
                            {item.productNameEn}
                          </h4>
                          {/* Modifiers display with Foodics indentation */}
                          {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                            <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                              {item.selectedModifiers.map((mod, midx) => (
                                <p key={midx} className="flex items-center gap-1 text-[11px]">
                                  <span className="text-slate-400">+</span>
                                  <span>{mod.optionNameEn}</span>
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Total Price & Delete */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900 font-mono">
                          {formatCurrency(item.totalPrice, state.language, state.tenant.currency)}
                        </span>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Quantity Adjustment buttons */}
                    <div className="flex items-center gap-2 pl-7 pt-1">
                      <button
                        onClick={() => updateItemQuantity(item.id, -1)}
                        className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-mono font-bold text-slate-800">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateItemQuantity(item.id, 1)}
                        className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Add Course Button */}
          <div className="px-5 py-2 border-t border-slate-100">
            <button
              onClick={handleAddCourse}
              className="text-xs font-bold text-[#5A24CA] hover:underline"
            >
              Add Course
            </button>
          </div>

          {/* Subtotal, Discount, Taxes Breakdown */}
          <div className="px-5 py-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-mono font-bold text-slate-900">
                {formatCurrency(activeOrder?.subtotal || 0, state.language, state.tenant.currency)}
              </span>
            </div>
            {(activeOrder?.discountAmount || 0) > 0 && (
              <div className="flex justify-between text-rose-600 font-semibold">
                <span>Discount</span>
                <span className="font-mono">
                  -{formatCurrency(activeOrder?.discountAmount || 0, state.language, state.tenant.currency)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Taxes</span>
              <span className="font-mono font-bold text-slate-900">
                {formatCurrency(activeOrder?.taxAmount || 0, state.language, state.tenant.currency)}
              </span>
            </div>
          </div>

          {/* Large Purple Total Button */}
          <button
            onClick={() => {
              if (activeSession) {
                setSessionForPayment(activeSession);
              } else {
                setIsPaymentModalOpen(true);
              }
            }}
            disabled={!activeOrder || activeOrder.items.length === 0}
            className="w-full bg-[#5A24CA] hover:bg-[#4d1fb0] disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-4 px-6 flex items-center justify-between font-black text-lg transition-colors shadow-inner"
          >
            <span className="tracking-wider">TOTAL</span>
            <span className="font-mono text-xl">
              {formatCurrency(
                activeSession ? activeSession.consolidatedGrandTotal : activeOrder?.grandTotal || 0,
                state.language,
                state.tenant.currency
              )}
            </span>
          </button>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: ACTION BUTTONS, SEARCH, AND CATALOG */}
        {/* ========================================================= */}
        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          {/* Top Row: 7 Purple Action Buttons */}
          <div className="grid grid-cols-7 gap-2 shrink-0">
            {/* 1. PRINT */}
            <button
              onClick={handlePrint}
              className="bg-[#5A24CA] hover:bg-[#4d1fb0] text-white rounded-xl py-3 flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 shadow-sm"
            >
              <Printer className="w-5 h-5 stroke-[2.2]" />
              <span className="text-[10px] font-black tracking-wider uppercase">PRINT</span>
            </button>

            {/* 2. KITCHEN */}
            <button
              onClick={handleKitchen}
              className="bg-[#5A24CA] hover:bg-[#4d1fb0] text-white rounded-xl py-3 flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 shadow-sm"
            >
              <ChefHat className="w-5 h-5 stroke-[2.2]" />
              <span className="text-[10px] font-black tracking-wider uppercase">KITCHEN</span>
            </button>

            {/* 3. VOID */}
            <button
              onClick={handleVoid}
              className="bg-[#5A24CA] hover:bg-[#4d1fb0] text-white rounded-xl py-3 flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 shadow-sm"
            >
              <Ban className="w-5 h-5 stroke-[2.2]" />
              <span className="text-[10px] font-black tracking-wider uppercase">VOID</span>
            </button>

            {/* 4. DISCOUNT */}
            <button
              onClick={handleDiscount}
              className="bg-[#5A24CA] hover:bg-[#4d1fb0] text-white rounded-xl py-3 flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 shadow-sm"
            >
              <Percent className="w-5 h-5 stroke-[2.2]" />
              <span className="text-[10px] font-black tracking-wider uppercase">DISCOUNT</span>
            </button>

            {/* 5. NOTES */}
            <button
              onClick={handleNotes}
              className="bg-[#5A24CA] hover:bg-[#4d1fb0] text-white rounded-xl py-3 flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 shadow-sm"
            >
              <FileText className="w-5 h-5 stroke-[2.2]" />
              <span className="text-[10px] font-black tracking-wider uppercase">NOTES</span>
            </button>

            {/* 6. TAGS */}
            <button
              onClick={handleTags}
              className="bg-[#5A24CA] hover:bg-[#4d1fb0] text-white rounded-xl py-3 flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 shadow-sm"
            >
              <Tag className="w-5 h-5 stroke-[2.2]" />
              <span className="text-[10px] font-black tracking-wider uppercase">TAGS</span>
            </button>

            {/* 7. MORE */}
            <div className="relative">
              <button
                onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                className="w-full h-full bg-[#5A24CA] hover:bg-[#4d1fb0] text-white rounded-xl py-3 flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 shadow-sm"
              >
                <MoreHorizontal className="w-5 h-5 stroke-[2.2]" />
                <span className="text-[10px] font-black tracking-wider uppercase">MORE</span>
              </button>

              {/* More Dropdown Menu */}
              {isMoreMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95">
                  <button
                    onClick={() => {
                      setIsCallCenterModalOpen(true);
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <PhoneCall className="w-4 h-4 text-[#5A24CA]" />
                      <span>Call Center Orders / الكول سنتر</span>
                    </div>
                    {branchCallCenterOrders.length > 0 && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#5A24CA] text-white">
                        {branchCallCenterOrders.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setIsCashSessionModalOpen(true);
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                  >
                    <DollarSign className="w-4 h-4 text-[#5A24CA]" />
                    <span>Cash Drawer / درج النقدية</span>
                  </button>

                  <button
                    onClick={() => {
                      if (onOpenSettings) onOpenSettings();
                      setIsMoreMenuOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4 text-[#5A24CA]" />
                    <span>POS Settings / إعدادات النظام</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Search Box */}
          <div className="relative shrink-0">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products"
              className="w-full bg-white rounded-xl py-3 pl-4 pr-11 text-sm font-medium text-slate-700 placeholder-slate-400 border border-slate-200/80 shadow-xs focus:outline-none focus:ring-2 focus:ring-[#5A24CA]/20 focus:border-[#5A24CA]"
            />
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#5A24CA]">
              <Search className="w-5 h-5 stroke-[2.5]" />
            </div>
          </div>

          {/* Main Catalog Area: Categories or Products */}
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-y-auto p-4 flex flex-col">
            {/* If Category is selected, show Breadcrumb Bar */}
            {selectedCategoryId && (
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 shrink-0">
                <button
                  onClick={() => setSelectedCategoryId(null)}
                  className="flex items-center gap-1.5 text-xs font-bold text-[#5A24CA] hover:underline"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>ALL CATEGORIES</span>
                </button>
                <span className="text-xs font-black uppercase text-slate-800">
                  {selectedCategory?.nameEn}
                </span>
              </div>
            )}

            {/* If NO category selected and NO search query: Show 13 Foodics Category Cards */}
            {!selectedCategoryId && !searchQuery.trim() ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
                {state.categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategoryId(category.id)}
                    className="group bg-white rounded-xl border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col overflow-hidden text-center cursor-pointer border-b-[3px] border-b-[#5A24CA]"
                  >
                    <div className="h-28 w-full bg-slate-100 overflow-hidden relative">
                      <FoodVisual id={category.id} name={category.nameEn} isCategory={true} imageUrl={category.imageUrl} />
                    </div>
                    <div className="py-2.5 px-2 bg-white">
                      <span className="font-black text-xs tracking-wider uppercase text-slate-900 group-hover:text-[#5A24CA] transition-colors">
                        {category.nameEn}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              /* Products Grid for selected category or active search */
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3.5">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleProductClick(product)}
                    className="group bg-white rounded-xl border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col overflow-hidden text-left cursor-pointer border-b-[3px] border-b-[#5A24CA]"
                  >
                    <div className="h-28 w-full bg-slate-100 overflow-hidden relative">
                      <FoodVisual
                        id={product.id}
                        name={product.nameEn}
                        imageUrl={product.imageUrl}
                      />
                    </div>
                    <div className="p-3 bg-white flex flex-col justify-between flex-1">
                      <div>
                        <h4 className="font-bold text-xs text-slate-900 group-hover:text-[#5A24CA] line-clamp-1">
                          {product.nameEn}
                        </h4>
                        <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                          {product.nameAr}
                        </p>
                      </div>
                      <div className="mt-2 pt-1 border-t border-slate-100 flex items-center justify-between">
                        <span className="font-black text-xs font-mono text-[#5A24CA]">
                          {formatCurrency(product.basePrice, state.language, state.tenant.currency)}
                        </span>
                        {product.modifierGroups && product.modifierGroups.length > 0 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-[#5A24CA]">
                            Options
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Navigation Bar */}
          <div className="h-14 bg-white rounded-2xl shadow-sm border border-slate-200/80 px-6 flex items-center justify-between shrink-0">
            {/* 1. HOME */}
            <button
              onClick={() => {
                setSelectedCategoryId(null);
                setSearchQuery('');
              }}
              className="flex items-center gap-2.5 font-black text-xs text-slate-700 hover:text-[#5A24CA] transition-colors uppercase tracking-wider"
            >
              <div className="w-6 h-6 rounded-lg bg-[#5A24CA] text-white flex items-center justify-center font-black text-sm">
                F
              </div>
              <span>{t.home}</span>
            </button>

            {/* 2. ORDERS */}
            <button
              onClick={() => setIsOrdersListModalOpen(true)}
              className="flex items-center gap-2 font-black text-xs text-slate-700 hover:text-[#5A24CA] transition-colors uppercase tracking-wider"
            >
              <Clock className="w-5 h-5 text-[#5A24CA]" />
              <span>{t.orders} ({state.orders.length})</span>
            </button>

            {/* 3. PERMANENT ACTIVE TABLES BUTTON */}
            <button
              onClick={() => setIsActiveTablesModalOpen(true)}
              className="relative flex items-center gap-2 font-black text-xs text-slate-700 hover:text-[#5A24CA] transition-colors uppercase tracking-wider px-3 py-1.5 rounded-xl hover:bg-purple-50"
            >
              <div className="relative">
                <UtensilsCrossed className="w-5 h-5 text-[#5A24CA]" />
                {activeSessionsCount > 0 && (
                  <span
                    className={`absolute -top-1.5 -right-2 px-1.5 py-0.2 rounded-full text-[9px] font-black text-white ${
                      hasBillRequested ? 'bg-rose-500 animate-pulse' : 'bg-emerald-600'
                    }`}
                  >
                    {activeSessionsCount}
                  </span>
                )}
              </div>
              <span>{state.language === 'ar' ? 'الطاولات النشطة' : 'Active Tables'}</span>
            </button>

            {/* 4. CALL CENTER ORDERS (Branch-Scoped) */}
            <button
              onClick={() => setIsCallCenterModalOpen(true)}
              className="relative flex items-center gap-2 font-black text-xs text-slate-700 hover:text-[#5A24CA] transition-colors uppercase tracking-wider px-3 py-1.5 rounded-xl hover:bg-purple-50"
            >
              <div className="relative">
                <PhoneCall className="w-5 h-5 text-[#5A24CA]" />
                {branchCallCenterOrders.length > 0 && (
                  <span
                    className={`absolute -top-1.5 -right-2 px-1.5 py-0.2 rounded-full text-[9px] font-black text-white ${
                      unpaidCallCenterCount > 0 ? 'bg-amber-500 animate-pulse' : 'bg-purple-600'
                    }`}
                  >
                    {branchCallCenterOrders.length}
                  </span>
                )}
              </div>
              <span>{state.language === 'ar' ? 'الكول سنتر' : 'Call Center'}</span>
            </button>

            {/* 5. TABLES (Floor Layout) */}
            <button
              onClick={() => setIsTableModalOpen(true)}
              className="flex items-center gap-2 font-black text-xs text-slate-700 hover:text-[#5A24CA] transition-colors uppercase tracking-wider"
            >
              <LayoutGrid className="w-5 h-5 text-[#5A24CA]" />
              <span>{t.tables}</span>
            </button>

            {/* 6. + NEW ORDER */}
            <button
              onClick={handleNewOrder}
              className="flex items-center gap-1.5 font-black text-xs text-[#5A24CA] hover:opacity-80 transition-opacity uppercase tracking-wider"
            >
              <Plus className="w-5 h-5 stroke-[3]" />
              <span>{t.newOrder}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODAL DIALOGS */}
      {/* ========================================================= */}

      {/* Product Customizer / Modifiers Modal */}
      {activeModifierProduct && (
        <ModifierModal
          product={activeModifierProduct}
          onClose={() => setActiveModifierProduct(null)}
          onConfirm={(quantity, selectedMods, notes, unitPrice) => {
            addProductToActiveOrder(
              activeModifierProduct,
              quantity,
              selectedMods,
              unitPrice
            );
            setActiveModifierProduct(null);
          }}
        />
      )}

      {/* Active Tables Overview Modal */}
      {isActiveTablesModalOpen && (
        <ActiveTablesModal
          onClose={() => setIsActiveTablesModalOpen(false)}
          onSelectSession={(session) => {
            setIsActiveTablesModalOpen(false);
            setSelectedSessionForDetails(session);
          }}
          onAddAdditionalOrder={(tableId) => {
            const newOrder = createAdditionalOrderForTable(tableId);
            setIsActiveTablesModalOpen(false);
            showToast(
              state.language === 'ar'
                ? `تم فتح طلب إضافي #${newOrder.orderNumber}`
                : `Opened additional order #${newOrder.orderNumber}`
            );
          }}
          onRequestBill={(sessionId) => {
            const res = requestTableBill(sessionId);
            setIsActiveTablesModalOpen(false);
            setReceiptModalData({
              session: res.session,
              invoiceNumber: res.invoiceNumber,
              isPreBill: true,
            });
            showToast(
              state.language === 'ar'
                ? `تم طلب الحساب وإصدار فاتورة مبدئية #${res.invoiceNumber}`
                : `Bill requested! Pre-bill invoice #${res.invoiceNumber}`
            );
          }}
          onPaySession={(session) => {
            setIsActiveTablesModalOpen(false);
            setSessionForPayment(session);
          }}
        />
      )}

      {/* Table Session Details Modal */}
      {selectedSessionForDetails && (
        <TableSessionDetailsModal
          session={selectedSessionForDetails}
          onClose={() => setSelectedSessionForDetails(null)}
          onAddAdditionalOrder={(tableId) => {
            const newOrder = createAdditionalOrderForTable(tableId);
            setSelectedSessionForDetails(null);
            showToast(
              state.language === 'ar'
                ? `تم فتح طلب إضافي جديد #${newOrder.orderNumber}`
                : `Opened new additional order #${newOrder.orderNumber}`
            );
          }}
          onEditOrder={(orderId) => {
            setActiveOrderId(orderId);
            setSelectedSessionForDetails(null);
          }}
          onRequestBill={(sessionId) => {
            const res = requestTableBill(sessionId);
            setSelectedSessionForDetails(null);
            setReceiptModalData({
              session: res.session,
              invoiceNumber: res.invoiceNumber,
              isPreBill: true,
            });
            showToast(
              state.language === 'ar'
                ? `تم إصدار فاتورة الضيافة #${res.invoiceNumber}`
                : `Issued pre-bill invoice #${res.invoiceNumber}`
            );
          }}
          onPaySession={(session) => {
            setSelectedSessionForDetails(null);
            setSessionForPayment(session);
          }}
        />
      )}

      {/* Payment / Multi-Tender Modal */}
      {(isPaymentModalOpen || sessionForPayment) && (
        <PaymentModal
          order={sessionForPayment ? undefined : activeOrder || undefined}
          session={sessionForPayment || undefined}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSessionForPayment(null);
          }}
          onPaymentSuccess={(invoiceNumber) => {
            const s = sessionForPayment;
            setIsPaymentModalOpen(false);
            setSessionForPayment(null);
            setReceiptModalData({
              order: s ? undefined : activeOrder || undefined,
              session: s || undefined,
              invoiceNumber,
              isPreBill: false,
            });
            showToast(
              state.language === 'ar'
                ? `تم السداد بنجاح وإخلاء الطاولة! فاتورة #${invoiceNumber}`
                : `Paid successfully! Table freed. Invoice #${invoiceNumber}`
            );
          }}
        />
      )}

      {/* Thermal Receipt Modal (Pre-Bill or Paid Invoice) */}
      {receiptModalData && (
        <ThermalReceiptModal
          order={receiptModalData.order}
          session={receiptModalData.session}
          invoiceNumber={receiptModalData.invoiceNumber}
          isPreBill={receiptModalData.isPreBill}
          onClose={() => setReceiptModalData(null)}
        />
      )}

      {/* Discount Modal */}
      {isDiscountModalOpen && activeOrder && (
        <DiscountModal
          currentDiscount={activeOrder.discountAmount || 0}
          subtotal={activeOrder.subtotal}
          currency={t.currencyUnit}
          onApply={(discountAmount) => {
            applyOrderDiscount(activeOrder.id, discountAmount);
            showToast(`Discount of ${formatCurrency(discountAmount, state.language, state.tenant.currency)} applied`);
          }}
          onClose={() => setIsDiscountModalOpen(false)}
        />
      )}

      {/* Notes Modal */}
      {isNotesModalOpen && activeOrder && (
        <NotesModal
          currentNotes={activeOrder.notes || ''}
          onSave={(notes) => {
            setOrderNotes(activeOrder.id, notes);
            showToast('Order note updated');
          }}
          onClose={() => setIsNotesModalOpen(false)}
        />
      )}

      {/* Tags Modal */}
      {isTagsModalOpen && activeOrder && (
        <TagsModal
          currentTags={activeOrder.tags || []}
          onSave={(tags) => {
            setOrderTags(activeOrder.id, tags);
            showToast('Order tags updated');
          }}
          onClose={() => setIsTagsModalOpen(false)}
        />
      )}

      {/* Void Modal */}
      {isVoidModalOpen && activeOrder && (
        <VoidModal
          orderNumber={activeOrder.tableName || activeOrder.orderNumber}
          onConfirmVoid={(reason) => {
            voidOrder(activeOrder.id, reason);
            showToast(`Order #${activeOrder.orderNumber} voided`);
          }}
          onClose={() => setIsVoidModalOpen(false)}
        />
      )}

      {/* Customer Modal */}
      {isCustomerModalOpen && activeOrder && (
        <CustomerModal
          currentCustomerName={activeOrder.customerName}
          currentCustomerPhone={activeOrder.customerPhone}
          onSave={(name, phone) => {
            setCustomerInfo(activeOrder.id, name, phone);
            showToast(`Customer ${name} linked to Table ${activeOrder.tableName || activeOrder.orderNumber}`);
          }}
          onClose={() => setIsCustomerModalOpen(false)}
        />
      )}

      {/* Table Selector Modal */}
      {isTableModalOpen && (
        <TableSelectorModal
          tables={state.tables}
          selectedTableId={activeOrder?.tableId}
          orderNumber={activeOrder?.orderNumber}
          onSelectTable={handleTableSelect}
          onClose={() => setIsTableModalOpen(false)}
        />
      )}

      {/* Cash Session Drawer Modal */}
      {isCashSessionModalOpen && (
        <CashSessionModal onClose={() => setIsCashSessionModalOpen(false)} />
      )}

      {/* Orders Switcher List Modal */}
      {isOrdersListModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#5A24CA] text-white">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                <h3 className="font-bold text-lg">Active Restaurant Orders</h3>
              </div>
              <button
                onClick={() => setIsOrdersListModalOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
              {state.orders.map((ord) => (
                <button
                  key={ord.id}
                  onClick={() => {
                    setActiveOrderId(ord.id);
                    setIsOrdersListModalOpen(false);
                    showToast(`Switched to Table ${ord.tableName || ord.orderNumber}`);
                  }}
                  className={`w-full p-3.5 text-left flex items-center justify-between hover:bg-slate-50 transition-colors rounded-xl ${
                    ord.id === activeOrder?.id ? 'bg-purple-50 border border-purple-200' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-[#5A24CA] text-base">
                        Table {ord.tableName || ord.orderNumber}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-700">
                        {ord.orderType}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {ord.items.length} items · {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black font-mono text-slate-900 block">
                      {formatCurrency(ord.grandTotal, state.language, state.tenant.currency)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                      {ord.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Call Center Orders & Invoices Modal */}
      {isCallCenterModalOpen && (
        <CallCenterOrdersModal onClose={() => setIsCallCenterModalOpen(false)} />
      )}
    </div>
  );
};
