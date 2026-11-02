/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Call Center Orders Section in POS Terminal
 * Enforces strict branch scoping: Cashiers only see and print orders assigned to their branch.
 * Includes invoice preview, 80mm/58mm/A4 printing, reprint tracking, payment settlement, and branch switching for multi-branch testing.
 */

import React, { useState } from 'react';
import { Order, Invoice, PaymentMethod } from '../../types';
import { useRestaurantStore } from '../../services/store';
import { translations, formatCurrency } from '../../lib/i18n';
import { InvoicePrintModal } from './InvoicePrintModal';
import {
  PhoneCall,
  Search,
  Printer,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Building2,
  ChevronRight,
  User,
  MapPin,
  FileText,
  RotateCcw,
  Check,
  Plus,
  ShieldAlert,
  ArrowRightLeft,
  Truck,
  ChefHat,
  Filter,
} from 'lucide-react';

interface CallCenterOrdersModalProps {
  onClose: () => void;
}

export const CallCenterOrdersModal: React.FC<CallCenterOrdersModalProps> = ({ onClose }) => {
  const {
    state,
    switchActiveBranch,
    registerCallCenterOrderPayment,
    createCallCenterOrder,
    updateOrder,
  } = useRestaurantStore();
  const t = translations[state.language];

  // Active branch
  const activeBranch = state.branches.find((b) => b.id === state.activeBranchId) || state.branches[0];

  // Strict Branch Scoping: Only retrieve orders assigned to the active branch
  const branchOrders = state.orders.filter(
    (o) =>
      o.orderSource === 'CALL_CENTER' &&
      (o.fulfillingBranchId === state.activeBranchId || o.branchId === state.activeBranchId)
  );

  const branchInvoices = state.invoices.filter((inv) => inv.branchId === state.activeBranchId);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNPAID' | 'PREPARING' | 'DELIVERED'>('ALL');

  // Selected Order / Invoice for Printing
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<{
    invoice: Invoice;
    order?: Order;
  } | null>(null);

  // Payment Settlement Dialog State
  const [paymentTargetInvoice, setPaymentTargetInvoice] = useState<Invoice | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('CASH');
  const [tenderedAmount, setTenderedAmount] = useState<number>(0);
  const [paymentSuccessToast, setPaymentSuccessToast] = useState<string | null>(null);

  // New Call Center Order Dialog (for rapid testing & order creation)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('سلطان الشمري');
  const [newCustomerPhone, setNewCustomerPhone] = useState('0551122334');
  const [newDeliveryAddress, setNewDeliveryAddress] = useState('حي الياسمين، شارع أنس بن مالك، عمارة 12، شقة 4');
  const [newDeliveryNotes, setNewDeliveryNotes] = useState('الاتصال عند الوصول للبوابة');
  const [newDeliveryFee, setNewDeliveryFee] = useState(15.0);
  const [newPaymentMethod, setNewPaymentMethod] = useState<PaymentMethod>('CASH_ON_DELIVERY');

  // Filter orders
  const filteredOrders = branchOrders.filter((ord) => {
    // Status filter
    if (statusFilter === 'UNPAID' && ord.paymentStatus === 'PAID') return false;
    if (statusFilter === 'PREPARING' && ord.status !== 'SENT_TO_KITCHEN') return false;
    if (statusFilter === 'DELIVERED' && ord.status !== 'COMPLETED' && ord.status !== 'DELIVERED') return false;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNum = ord.orderNumber.toLowerCase().includes(q);
      const matchCust = (ord.customerName || '').toLowerCase().includes(q);
      const matchPhone = (ord.customerPhone || '').toLowerCase().includes(q);
      const matchInvoice = (ord.invoiceNumber || '').toLowerCase().includes(q);
      return matchNum || matchCust || matchPhone || matchInvoice;
    }
    return true;
  });

  const handleOpenPrintModal = (ord: Order) => {
    // Find matching invoice for this order
    const invoice =
      branchInvoices.find((inv) => inv.id === ord.invoiceId || inv.orderNumber === ord.orderNumber) ||
      state.invoices.find((inv) => inv.orderNumber === ord.orderNumber);

    if (invoice) {
      setSelectedInvoiceForPrint({ invoice, order: ord });
    } else {
      // Create fallback invoice if missing
      const fallbackInvoice: Invoice = {
        id: `inv-${Date.now()}`,
        tenantId: state.tenant.id,
        branchId: ord.branchId,
        orderId: ord.id,
        orderNumber: ord.orderNumber,
        invoiceNumber: ord.invoiceNumber || `INV-${ord.orderNumber}`,
        invoiceType: 'CUSTOMER_INVOICE',
        status: ord.paymentStatus === 'PAID' ? 'PAID' : 'INVOICE_ISSUED',
        createdAt: ord.createdAt,
        orderSource: 'CALL_CENTER',
        callCenterAgentId: ord.callCenterAgentId,
        callCenterAgentName: ord.callCenterAgentName,
        customerName: ord.customerName || 'Customer',
        customerPhone: ord.customerPhone || '',
        deliveryAddress: ord.deliveryAddress,
        deliveryNotes: ord.deliveryNotes,
        items: ord.items,
        subtotal: ord.subtotal,
        discountAmount: ord.discountAmount || 0,
        taxRate: ord.taxRate ?? 0.14,
        taxAmount: ord.taxAmount,
        deliveryFee: ord.deliveryFee || 0,
        grandTotal: ord.grandTotal,
        paymentMethod: ord.paymentMethod || 'CASH_ON_DELIVERY',
        paymentStatus: ord.paymentStatus || 'UNPAID',
        amountPaid: 0,
        issuedAt: ord.createdAt,
        legalEntityInfo: {
          tradeNameAr: state.tenant.tradeNameAr,
          tradeNameEn: state.tenant.tradeNameEn,
          legalEntityNameAr: state.tenant.tradeNameAr,
          legalEntityNameEn: state.tenant.tradeNameEn,
          taxRegistrationNumber: state.tenant.taxRegistrationNumber,
          commercialRegister: state.tenant.commercialRegister,
          branchNameAr: activeBranch.nameAr,
          branchNameEn: activeBranch.nameEn,
          branchAddressAr: activeBranch.addressAr,
          branchAddressEn: activeBranch.addressEn,
          branchPhone: activeBranch.phone,
        },
        legalEntity: {
          tradeNameAr: state.tenant.tradeNameAr,
          tradeNameEn: state.tenant.tradeNameEn,
          legalEntityNameAr: state.tenant.tradeNameAr,
          legalEntityNameEn: state.tenant.tradeNameEn,
          taxRegistrationNumber: state.tenant.taxRegistrationNumber,
          commercialRegister: state.tenant.commercialRegister,
          branchNameAr: activeBranch.nameAr,
          branchNameEn: activeBranch.nameEn,
          branchAddressAr: activeBranch.addressAr,
          branchAddressEn: activeBranch.addressEn,
          branchPhone: activeBranch.phone,
        },
        branchNameAr: activeBranch.nameAr,
        branchNameEn: activeBranch.nameEn,
        serviceCharge: 0,
        reprintCount: 0,
      };
      setSelectedInvoiceForPrint({ invoice: fallbackInvoice, order: ord });
    }
  };

  const handleExecutePayment = () => {
    if (!paymentTargetInvoice) return;

    const res = registerCallCenterOrderPayment(
      paymentTargetInvoice.id,
      state.currentUser.id,
      state.currentUser.fullNameEn,
      selectedPaymentMethod,
      tenderedAmount || paymentTargetInvoice.grandTotal,
      Math.max(0, (tenderedAmount || paymentTargetInvoice.grandTotal) - paymentTargetInvoice.grandTotal)
    );

    if (res.success) {
      setPaymentSuccessToast(
        state.language === 'ar'
          ? `تم تحصيل الفاتورة #${paymentTargetInvoice.invoiceNumber} بنجاح وترحيل القيد المحاسبي!`
          : `Invoice #${paymentTargetInvoice.invoiceNumber} paid & journal entry posted!`
      );
      setPaymentTargetInvoice(null);
      setTimeout(() => setPaymentSuccessToast(null), 4000);
    }
  };

  const handleCreateTestCallCenterOrder = () => {
    const defaultProduct1 = state.products[0];
    const defaultProduct2 = state.products[1] || state.products[0];

    const items = [
      {
        id: `item-${Date.now()}-1`,
        productId: defaultProduct1.id,
        productNameAr: defaultProduct1.nameAr,
        productNameEn: defaultProduct1.nameEn,
        unitPrice: defaultProduct1.basePrice,
        quantity: 2,
        selectedModifiers: [],
        prepStation: defaultProduct1.prepStation,
        kitchenStatus: 'PENDING' as const,
        totalPrice: defaultProduct1.basePrice * 2,
      },
      {
        id: `item-${Date.now()}-2`,
        productId: defaultProduct2.id,
        productNameAr: defaultProduct2.nameAr,
        productNameEn: defaultProduct2.nameEn,
        unitPrice: defaultProduct2.basePrice,
        quantity: 1,
        selectedModifiers: [],
        prepStation: defaultProduct2.prepStation,
        kitchenStatus: 'PENDING' as const,
        totalPrice: defaultProduct2.basePrice,
      },
    ];

    const result = createCallCenterOrder({
      fulfillingBranchId: state.activeBranchId,
      agentId: 'user-callcenter-01',
      agentName: 'Mai Hossam',
      customerName: newCustomerName,
      customerPhone: newCustomerPhone,
      deliveryAddress: newDeliveryAddress,
      deliveryNotes: newDeliveryNotes,
      deliveryFee: newDeliveryFee,
      items,
      paymentMethod: newPaymentMethod,
      invoiceType: 'CUSTOMER_INVOICE',
    });

    setShowCreateModal(false);
    setPaymentSuccessToast(
      state.language === 'ar'
        ? `تم إنشاء طلب كول سنتر جديد #${result.order.orderNumber} وفاتورة #${result.invoice.invoiceNumber} منسوبة لفرع ${activeBranch.nameAr}!`
        : `Created new Call Center Order #${result.order.orderNumber} with invoice #${result.invoice.invoiceNumber}!`
    );
    setTimeout(() => setPaymentSuccessToast(null), 4000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col h-[90vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <PhoneCall className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-white">
                  {state.language === 'ar' ? 'طلبات الكول سنتر والفواتير' : 'Call Center Orders & Invoices'}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {branchOrders.length} {state.language === 'ar' ? 'طلب' : 'Orders'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {state.language === 'ar'
                  ? 'إدارة وطباعة فواتير طلبات التوصيل المسندة للفرع المنفذ مع الرقابة المحاسبية'
                  : 'Manage and print sales invoices for Call Center orders strictly assigned to fulfilling branch'}
              </p>
            </div>
          </div>

          {/* Branch Switcher & Close button */}
          <div className="flex items-center gap-3">
            {/* Branch Switcher widget for testing Branch A vs Branch B permissions */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 p-1.5 rounded-2xl">
              <Building2 className="w-4 h-4 text-purple-400 shrink-0 ml-1" />
              <div className="text-right">
                <div className="text-[10px] text-slate-400 font-medium">
                  {state.language === 'ar' ? 'الفرع النشط (كاشير):' : 'Active Branch:'}
                </div>
                <div className="text-xs font-bold text-white leading-tight">
                  {activeBranch.nameAr}
                </div>
              </div>
              <div className="flex items-center gap-1 mr-2 border-r border-slate-700 pr-2">
                {state.branches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => switchActiveBranch(b.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      b.id === state.activeBranchId
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    {b.id === 'branch-cairo-main' ? 'فرع الرياض (A)' : 'فرع جدة (B)'}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 shadow-md shadow-purple-900/30 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{state.language === 'ar' ? 'طلب كول سنتر جديد' : 'New CC Order'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Security & Strict Branch Authorization Badge */}
        <div className="px-6 py-2 bg-purple-950/40 border-b border-purple-800/40 flex items-center justify-between text-xs text-purple-200">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-purple-400 shrink-0" />
            <span>
              <strong>{state.language === 'ar' ? 'عزل الفروع مشدد (Branch Security Scoping):' : 'Strict Branch Scoping:'}</strong>{' '}
              {state.language === 'ar'
                ? `الكاشير مسجل في ${activeBranch.nameAr} — يرى ويطبع فقط طلبات وفواتير هذا الفرع. لا يمكن الاطلاع على فروع أخرى.`
                : `Cashier authorized at ${activeBranch.nameEn} — Can ONLY access, print, and settle orders for this branch.`}
            </span>
          </div>
          <span className="text-[11px] font-mono font-bold text-purple-300">
            Warehouse: {activeBranch.defaultWarehouseId}
          </span>
        </div>

        {/* Success toast if payment was settled */}
        {paymentSuccessToast && (
          <div className="mx-6 mt-3 p-3 bg-emerald-950/80 border border-emerald-500 text-emerald-200 rounded-xl text-xs flex items-center justify-between animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{paymentSuccessToast}</span>
            </div>
            <button
              onClick={() => setPaymentSuccessToast(null)}
              className="text-emerald-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Search & Filter Toolbar */}
        <div className="px-6 py-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-purple-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {state.language === 'ar' ? 'جميع الطلبات' : 'All Orders'} ({branchOrders.length})
            </button>
            <button
              onClick={() => setStatusFilter('UNPAID')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                statusFilter === 'UNPAID'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {state.language === 'ar' ? 'غير مسدد (COD)' : 'Unpaid COD'} (
              {branchOrders.filter((o) => o.paymentStatus !== 'PAID').length})
            </button>
            <button
              onClick={() => setStatusFilter('PREPARING')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                statusFilter === 'PREPARING'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {state.language === 'ar' ? 'جاري التحضير بالمطبخ' : 'In Kitchen'} (
              {branchOrders.filter((o) => o.status === 'SENT_TO_KITCHEN').length})
            </button>
            <button
              onClick={() => setStatusFilter('DELIVERED')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                statusFilter === 'DELIVERED'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {state.language === 'ar' ? 'مسدد / مكتمل' : 'Paid / Delivered'} (
              {branchOrders.filter((o) => o.paymentStatus === 'PAID').length})
            </button>
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder={
                state.language === 'ar'
                  ? 'بحث برقم الطلب، الفاتورة، العميل، الهاتف...'
                  : 'Search by order #, invoice #, customer...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* Orders List Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {filteredOrders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-slate-950/40 rounded-2xl border border-dashed border-slate-800">
              <div className="w-14 h-14 rounded-2xl bg-purple-900/20 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-3">
                <PhoneCall className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">
                {state.language === 'ar'
                  ? `لا توجد طلبات كول سنتر لهذا الفرع (${activeBranch.nameAr})`
                  : `No Call Center Orders found for this branch (${activeBranch.nameEn})`}
              </h3>
              <p className="text-xs text-slate-400 max-w-md mb-4">
                {state.language === 'ar'
                  ? 'الطلبات المسندة للفروع الأخرى معزولة تماماً ولا تظهر هنا لحماية البيانات المحاسبية والإيرادات.'
                  : 'Orders assigned to other branches are strictly isolated and not accessible from this cashier station.'}
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                {state.language === 'ar' ? 'إنشاء طلب كول سنتر جديد للفرع' : 'Create Call Center Order for Branch'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredOrders.map((ord) => {
                const inv =
                  branchInvoices.find((i) => i.id === ord.invoiceId || i.orderNumber === ord.orderNumber) ||
                  state.invoices.find((i) => i.orderNumber === ord.orderNumber);

                const isPaid = ord.paymentStatus === 'PAID' || inv?.paymentStatus === 'PAID';
                const reprintCount = inv?.reprintCount || 0;

                return (
                  <div
                    key={ord.id}
                    className="bg-slate-950/80 border border-slate-800 hover:border-purple-600/50 rounded-2xl p-5 shadow-lg flex flex-col justify-between transition-all group"
                  >
                    <div>
                      {/* Order & Invoice Title Row */}
                      <div className="flex items-start justify-between pb-3 border-b border-slate-800">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black text-white font-mono">
                              #{ord.orderNumber}
                            </span>
                            {inv && (
                              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-800 text-purple-300 border border-slate-700">
                                {inv.invoiceNumber}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              {state.language === 'ar' ? 'كول سنتر' : 'Call Center'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <span>•</span>
                            <User className="w-3.5 h-3.5 text-purple-400" />
                            <span>
                              {state.language === 'ar' ? 'الموظف: ' : 'Agent: '}
                              {ord.callCenterAgentName || 'Mai Hossam'}
                            </span>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="flex flex-col items-end gap-1.5">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              isPaid
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {isPaid
                              ? state.language === 'ar'
                                ? '✓ مسدد بالكامل'
                                : 'PAID'
                              : state.language === 'ar'
                              ? '⏳ غير مسدد (تحصيل سائق COD)'
                              : 'UNPAID (Pending COD)'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {reprintCount > 0
                              ? state.language === 'ar'
                                ? `مطبوع (${reprintCount + 1}) مرات`
                                : `Printed (${reprintCount + 1}x)`
                              : state.language === 'ar'
                              ? 'جاهز للطباعة'
                              : 'Ready to print'}
                          </span>
                        </div>
                      </div>

                      {/* Customer & Address Details */}
                      <div className="py-3 border-b border-slate-800/80 text-xs space-y-1 bg-slate-900/60 p-3 rounded-xl mt-3">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-white flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            {ord.customerName}
                          </span>
                          <span className="font-mono text-slate-300">{ord.customerPhone}</span>
                        </div>
                        <div className="flex items-start gap-1.5 text-slate-300 pt-1">
                          <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                          <span className="leading-snug">{ord.deliveryAddress || 'عنوان العميل المعتمد'}</span>
                        </div>
                        {ord.deliveryNotes && (
                          <div className="text-[11px] text-amber-300 bg-amber-950/40 p-1.5 rounded border border-amber-800/40 mt-1">
                            <strong>ملاحظات السائق:</strong> {ord.deliveryNotes}
                          </div>
                        )}
                      </div>

                      {/* Items Preview */}
                      <div className="py-3 border-b border-slate-800/80">
                        <div className="text-[11px] text-slate-400 mb-1.5 font-bold">
                          {state.language === 'ar' ? 'الأصناف المطلوبة:' : 'Ordered Items:'}
                        </div>
                        <div className="space-y-1">
                          {ord.items.map((item) => (
                            <div key={item.id} className="flex justify-between text-xs">
                              <span className="text-slate-200">
                                <span className="font-bold text-purple-400 ml-1">{item.quantity}×</span>{' '}
                                {item.productNameAr}
                              </span>
                              <span className="font-mono text-slate-300">
                                {item.totalPrice.toFixed(2)} {state.tenant.currency}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Financial Totals Row */}
                      <div className="py-2.5 flex items-center justify-between text-xs">
                        <div className="text-slate-400 space-x-2">
                          <span>
                            {state.language === 'ar' ? 'توصيل: ' : 'Delivery: '}
                            {ord.deliveryFee ? ord.deliveryFee.toFixed(2) : '0.00'}
                          </span>
                          <span>•</span>
                          <span>
                            {state.language === 'ar' ? 'الضريبة 15%: ' : 'Tax: '}
                            {ord.taxAmount.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-sm font-black text-white">
                          <span className="text-slate-400 text-xs font-normal ml-1">
                            {state.language === 'ar' ? 'الإجمالي: ' : 'Total: '}
                          </span>
                          <span className="text-purple-400 font-mono text-base">
                            {ord.grandTotal.toFixed(2)} {state.tenant.currency}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            const newStatus =
                              ord.status === 'SENT_TO_KITCHEN'
                                ? 'DELIVERED'
                                : ord.status === 'DELIVERED'
                                ? 'COMPLETED'
                                : 'SENT_TO_KITCHEN';
                            updateOrder({ ...ord, status: newStatus as any });
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1"
                        >
                          <ChefHat className="w-3.5 h-3.5 text-amber-400" />
                          <span>
                            {ord.status === 'SENT_TO_KITCHEN'
                              ? state.language === 'ar'
                                ? 'جاري التحضير'
                                : 'Preparing'
                              : ord.status === 'DELIVERED'
                              ? state.language === 'ar'
                                ? 'خرج للتوصيل'
                                : 'Out for delivery'
                              : state.language === 'ar'
                              ? 'مكتمل'
                              : 'Delivered'}
                          </span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isPaid && (
                          <button
                            onClick={() => {
                              if (inv) {
                                setPaymentTargetInvoice(inv);
                                setTenderedAmount(inv.grandTotal);
                              }
                            }}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 shadow-sm transition-all"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            <span>{state.language === 'ar' ? 'تسجيل السداد' : 'Pay'}</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenPrintModal(ord)}
                          className="px-4 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1.5 shadow-md shadow-purple-900/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>{state.language === 'ar' ? 'معاينة وطباعة الفاتورة' : 'Print Invoice'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Invoice Print & Preview Modal */}
      {selectedInvoiceForPrint && (
        <InvoicePrintModal
          invoice={selectedInvoiceForPrint.invoice}
          order={selectedInvoiceForPrint.order}
          onClose={() => setSelectedInvoiceForPrint(null)}
          onPaymentRequested={() => {
            setPaymentTargetInvoice(selectedInvoiceForPrint.invoice);
            setTenderedAmount(selectedInvoiceForPrint.invoice.grandTotal);
            setSelectedInvoiceForPrint(null);
          }}
        />
      )}

      {/* Payment Settlement Modal */}
      {paymentTargetInvoice && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <DollarSign className="w-5 h-5" />
                <h3>{state.language === 'ar' ? 'تسجيل تحصيل طلب الدليفري' : 'Register Delivery Collection'}</h3>
              </div>
              <button
                onClick={() => setPaymentTargetInvoice(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs space-y-2">
              <div className="flex justify-between text-slate-400">
                <span>رقم الفاتورة:</span>
                <span className="font-mono text-white font-bold">{paymentTargetInvoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>العميل:</span>
                <span className="text-white font-bold">{paymentTargetInvoice.customerName}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>الفرع المستفيد (تسوية نقدية):</span>
                <span className="text-purple-300 font-bold">
                  {(paymentTargetInvoice.legalEntity || paymentTargetInvoice.legalEntityInfo)?.branchNameAr || activeBranch.nameAr}
                </span>
              </div>
              <div className="flex justify-between text-base font-black text-white pt-2 border-t border-slate-800">
                <span>المبلغ المطلوب تحصيله:</span>
                <span className="font-mono text-emerald-400 text-lg">
                  {paymentTargetInvoice.grandTotal.toFixed(2)} {state.tenant.currency}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                {state.language === 'ar' ? 'طريقة السداد المستلمة من السائق:' : 'Payment Method Collected:'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['CASH', 'CARD', 'INSTAPAY'] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setSelectedPaymentMethod(m)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      selectedPaymentMethod === m
                        ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    {m === 'CASH' ? 'نقداً (Cash)' : m === 'CARD' ? 'بطاقة (Card)' : 'محفظة (Wallet)'}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              📌 <strong>الأثر المحاسبي التلقائي:</strong> سيتم إقفال حساب الذمم المدينة (AR Delivery COD) وإيداع المبلغ في حساب الخزينة/البنك الخاص بفرع {activeBranch.nameAr}، وتحديث درج الكاشير.
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setPaymentTargetInvoice(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                {state.language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleExecutePayment}
                className="px-6 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30"
              >
                {state.language === 'ar' ? 'تأكيد السداد وترحيل القيد' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Call Center Order Modal (for testing & simulation) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-purple-400 font-bold">
                <PhoneCall className="w-5 h-5" />
                <h3>{state.language === 'ar' ? 'إنشاء طلب كول سنتر جديد للفرع' : 'Create New Call Center Order'}</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-purple-950/40 p-2.5 rounded-xl border border-purple-800/40 text-purple-200">
                <strong>الفرع المنفذ للطلب:</strong> {activeBranch.nameAr} — سيتم خصم المخزون من مستودع {activeBranch.defaultWarehouseId} ونسبة الإيراد والضريبة لهذا الفرع.
              </div>

              <div>
                <label className="block text-slate-400 mb-1">اسم العميل:</label>
                <input
                  type="text"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">رقم هاتف العميل:</label>
                <input
                  type="text"
                  value={newCustomerPhone}
                  onChange={(e) => setNewCustomerPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">عنوان التوصيل:</label>
                <textarea
                  rows={2}
                  value={newDeliveryAddress}
                  onChange={(e) => setNewDeliveryAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">رسوم التوصيل:</label>
                  <input
                    type="number"
                    value={newDeliveryFee}
                    onChange={(e) => setNewDeliveryFee(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">طريقة الدفع:</label>
                  <select
                    value={newPaymentMethod}
                    onChange={(e) => setNewPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white"
                  >
                    <option value="CASH_ON_DELIVERY">نقدًا عند الاستلام (COD)</option>
                    <option value="CARD">بطاقة إلكترونية (Card)</option>
                    <option value="INSTAPAY">محفظة إلكترونية (Wallet)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreateTestCallCenterOrder}
                className="px-6 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/30"
              >
                تأكيد وإنشاء الطلب والفاتورة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
