/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Dedicated Central Call Center Workspace
 * Allows Call Center agents to take customer orders, customize items with modifiers,
 * assign fulfillment to a specific branch, deduct branch warehouse stock,
 * and dispatch directly to the branch's kitchen line and cashier.
 */

import React, { useState } from 'react';
import {
  Product,
  OrderItem,
  PaymentMethod,
  Branch,
  Order,
  Invoice,
  InvoiceType,
} from '../../types';
import { useRestaurantStore } from '../../services/store';
import { translations, formatCurrency } from '../../lib/i18n';
import { FoodVisual } from '../pos/FoodVisual';
import { ModifierModal } from '../pos/ModifierModal';
import { InvoicePrintModal } from '../pos/InvoicePrintModal';
import {
  PhoneCall,
  PhoneForwarded,
  User,
  MapPin,
  Building2,
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  Truck,
  Sparkles,
  ChefHat,
  RotateCcw,
  Eye,
  Check,
  ShieldCheck,
  Navigation,
  FileText,
  X,
  Phone,
  ArrowRight,
} from 'lucide-react';

interface MockCustomer {
  name: string;
  phone: string;
  address: string;
  zone: string;
  recommendedBranchId: string;
  notes: string;
}

const PRESET_CUSTOMERS: MockCustomer[] = [
  {
    name: 'سلطان الشمري',
    phone: '0551122334',
    address: 'حي الياسمين، شارع أنس بن مالك، عمارة 14، شقة 5',
    zone: 'شمال الرياض',
    recommendedBranchId: 'branch-cairo-main',
    notes: 'الاتصال عند الوصول للبوابة، الجرس رقم 5',
  },
  {
    name: 'طارق الغامدي',
    phone: '0501234567',
    address: 'حي العليا، شارع موسى بن نصير، برج الأمل 2، شقة 102',
    zone: 'وسط الرياض',
    recommendedBranchId: 'branch-cairo-main',
    notes: 'يرجى وضع الصوصات خارج السندوتشات',
  },
  {
    name: 'ريم العتيبي',
    phone: '0569876543',
    address: 'حي الروضة، شارع الأمير سلطان، فيلا 28',
    zone: 'شمال جدة',
    recommendedBranchId: 'branch-giza-dokki',
    notes: 'توصيل هادئ للأطفال الرضع نائمين',
  },
  {
    name: 'عمر خالد السليمان',
    phone: '0543322110',
    address: 'حي الزهراء، شارع البترجي، مجمع الواحة شقة 8',
    zone: 'شمال جدة',
    recommendedBranchId: 'branch-giza-dokki',
    notes: 'الدفع ببطاقة مدى عند السائق',
  },
];

export const CallCenterHub: React.FC = () => {
  const { state, createCallCenterOrder, updateOrder } = useRestaurantStore();
  const t = translations[state.language];

  // Active Tab: 'NEW_ORDER' or 'ORDERS_MONITOR'
  const [activeTab, setActiveTab] = useState<'NEW_ORDER' | 'ORDERS_MONITOR'>('NEW_ORDER');

  // Agent State
  const [agentStatus, setAgentStatus] = useState<'AVAILABLE' | 'ON_CALL' | 'BREAK'>('AVAILABLE');
  const agentName = 'مي حسام (Mai Hossam)';
  const agentId = 'user-callcenter-01';

  // Caller ID Simulator banner
  const [incomingCallSim, setIncomingCallSim] = useState<MockCustomer | null>(null);

  // Customer Form State
  const [customerName, setCustomerName] = useState('سلطان الشمري');
  const [customerPhone, setCustomerPhone] = useState('0551122334');
  const [customerZone, setCustomerZone] = useState('شمال الرياض');
  const [deliveryAddress, setDeliveryAddress] = useState('حي الياسمين، شارع أنس بن مالك، عمارة 14، شقة 5');
  const [deliveryNotes, setDeliveryNotes] = useState('الاتصال عند الوصول للبوابة');
  const [deliveryFee, setDeliveryFee] = useState<number>(15.0);

  // Fulfilling Branch Selection (Core Feature: Allocating order to specific branch)
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    state.branches[0]?.id || 'branch-cairo-main'
  );

  // Cart & Order Items
  const [cartItems, setCartItems] = useState<OrderItem[]>([
    {
      id: 'cc-init-1',
      productId: state.products[0]?.id || 'prod-foul-har',
      productNameAr: state.products[0]?.nameAr || 'سندوتش فول بالزيت الحار',
      productNameEn: state.products[0]?.nameEn || 'Ful with Flaxseed Oil',
      unitPrice: state.products[0]?.basePrice || 8.0,
      quantity: 2,
      selectedModifiers: [
        { groupNameAr: 'نوع الخبز', groupNameEn: 'Bread Type', optionNameAr: 'بلدي مصري', optionNameEn: 'Baladi', priceDelta: 0 },
      ],
      prepStation: 'COLD',
      kitchenStatus: 'PENDING',
      totalPrice: (state.products[0]?.basePrice || 8.0) * 2,
    },
    {
      id: 'cc-init-2',
      productId: state.products[1]?.id || 'prod-taameya-kiri',
      productNameAr: state.products[1]?.nameAr || 'طعمية محشية جبنة كيري',
      productNameEn: state.products[1]?.nameEn || 'Taameya Stuffed Kiri',
      unitPrice: state.products[1]?.basePrice || 12.0,
      quantity: 2,
      selectedModifiers: [],
      prepStation: 'COLD',
      kitchenStatus: 'PENDING',
      totalPrice: (state.products[1]?.basePrice || 12.0) * 2,
    },
  ]);

  // Payment method & Invoice type
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH_ON_DELIVERY');
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('CUSTOMER_INVOICE');

  // Menu Catalog Filter
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeModifierProduct, setActiveModifierProduct] = useState<Product | null>(null);

  // Success Confirmation State
  const [dispatchedSuccess, setDispatchedSuccess] = useState<{
    order: Order;
    invoice: Invoice;
    branchNameAr: string;
  } | null>(null);

  // Modal for Invoice Printing
  const [invoiceForPrinting, setInvoiceForPrinting] = useState<{
    invoice: Invoice;
    order?: Order;
  } | null>(null);

  // Monitor filters
  const [monitorBranchFilter, setMonitorBranchFilter] = useState<string>('ALL');
  const [monitorSearch, setMonitorSearch] = useState('');

  // Selected branch entity
  const selectedBranch = state.branches.find((b) => b.id === selectedBranchId) || state.branches[0];

  // Calculation
  const subtotal = Number(cartItems.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2));
  const taxRate = state.tenant.settings?.defaultTaxRate ?? 0.14;
  const taxableBase = subtotal + deliveryFee;
  const taxAmount = Number((taxableBase * taxRate).toFixed(2));
  const grandTotal = Number((taxableBase + taxAmount).toFixed(2));

  // Add item to cart
  const handleAddItem = (
    product: Product,
    quantity: number,
    selectedMods: {
      groupNameAr: string;
      groupNameEn?: string;
      optionNameAr: string;
      optionNameEn: string;
      priceDelta: number;
    }[],
    unitPrice: number
  ) => {
    const newItem: OrderItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      productId: product.id,
      productNameAr: product.nameAr,
      productNameEn: product.nameEn,
      unitPrice,
      quantity,
      selectedModifiers: selectedMods,
      prepStation: product.prepStation,
      kitchenStatus: 'PENDING',
      totalPrice: unitPrice * quantity,
    };
    setCartItems((prev) => [...prev, newItem]);
  };

  const handleUpdateItemQty = (id: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
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
        .filter(Boolean) as OrderItem[]
    );
  };

  const handleRemoveItem = (id: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id));
  };

  // Simulate Inbound Call
  const triggerInboundCall = () => {
    const randomCustomer = PRESET_CUSTOMERS[Math.floor(Math.random() * PRESET_CUSTOMERS.length)];
    setIncomingCallSim(randomCustomer);
  };

  const acceptInboundCall = (customer: MockCustomer) => {
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
    setCustomerZone(customer.zone);
    setDeliveryAddress(customer.address);
    setDeliveryNotes(customer.notes);
    setSelectedBranchId(customer.recommendedBranchId);
    setIncomingCallSim(null);
    setAgentStatus('ON_CALL');
  };

  // Dispatch Order to Branch
  const handleDispatchOrder = () => {
    if (cartItems.length === 0) return;
    if (!customerName.trim() || !customerPhone.trim()) {
      alert(state.language === 'ar' ? 'يرجى إدخال اسم العميل ورقم الهاتف' : 'Please enter customer name and phone');
      return;
    }

    const result = createCallCenterOrder({
      fulfillingBranchId: selectedBranchId,
      agentId,
      agentName,
      customerName,
      customerPhone,
      deliveryAddress,
      deliveryNotes,
      deliveryFee,
      items: cartItems,
      paymentMethod,
      invoiceType,
    });

    setDispatchedSuccess({
      order: result.order,
      invoice: result.invoice,
      branchNameAr: selectedBranch.nameAr,
    });

    setAgentStatus('AVAILABLE');
  };

  // Filter products
  const filteredProducts = state.products.filter((p) => {
    const matchCat = !selectedCategoryId || p.categoryId === selectedCategoryId;
    const matchSearch =
      !searchQuery.trim() ||
      p.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch && p.isAvailable;
  });

  // All call center orders across all branches
  const allCallCenterOrders = state.orders.filter((o) => o.orderSource === 'CALL_CENTER');
  const filteredMonitorOrders = allCallCenterOrders.filter((ord) => {
    if (monitorBranchFilter !== 'ALL' && ord.fulfillingBranchId !== monitorBranchFilter && ord.branchId !== monitorBranchFilter) {
      return false;
    }
    if (monitorSearch.trim()) {
      const q = monitorSearch.toLowerCase();
      const matchNum = ord.orderNumber.toLowerCase().includes(q);
      const matchCust = (ord.customerName || '').toLowerCase().includes(q);
      const matchPhone = (ord.customerPhone || '').toLowerCase().includes(q);
      return matchNum || matchCust || matchPhone;
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden">
      {/* 1. Call Center Agent Top Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Agent Profile & Telephony Status */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <PhoneCall className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-white">
                {state.language === 'ar' ? 'مركز الاتصال واستقبال الطلبات المركزي' : 'Central Call Center & Order Dispatch'}
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {agentId}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span>{state.language === 'ar' ? 'موظف الاستقبال:' : 'Agent:'} {agentName}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span
                  className={`w-2 h-2 rounded-full ${
                    agentStatus === 'AVAILABLE'
                      ? 'bg-emerald-400'
                      : agentStatus === 'ON_CALL'
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-rose-400'
                  }`}
                />
                <span className="font-semibold text-slate-300">
                  {agentStatus === 'AVAILABLE'
                    ? state.language === 'ar'
                      ? 'متاح لاستقبال الطلبات'
                      : 'Available'
                    : agentStatus === 'ON_CALL'
                    ? state.language === 'ar'
                      ? 'جاري استقبال مكالمة عميل'
                      : 'On Call'
                    : state.language === 'ar'
                    ? 'في استراحة'
                    : 'Break'}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* View Mode Tabs & Inbound Call Simulator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('NEW_ORDER')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                activeTab === 'NEW_ORDER'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {state.language === 'ar' ? 'استقبال طلب جديد' : 'New Order'}
            </button>
            <button
              onClick={() => setActiveTab('ORDERS_MONITOR')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'ORDERS_MONITOR'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>{state.language === 'ar' ? 'سجل طلبات الفروع' : 'Dispatched Monitor'}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-indigo-300 font-bold">
                {allCallCenterOrders.length}
              </span>
            </button>
          </div>

          <button
            onClick={triggerInboundCall}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-md shadow-emerald-900/30 transition-all active:scale-95"
            title="محاكاة مكالمة هاتفية واردة من عميل مسجل"
          >
            <PhoneForwarded className="w-4 h-4" />
            <span>{state.language === 'ar' ? 'محاكاة اتصال وارد' : 'Simulate Call'}</span>
          </button>
        </div>
      </div>

      {/* Inbound Call Alert Banner (if simulated) */}
      {incomingCallSim && (
        <div className="bg-amber-950/80 border-b border-amber-500/60 px-6 py-2.5 flex items-center justify-between text-xs text-amber-200 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-amber-400 animate-bounce" />
            <span>
              <strong>{state.language === 'ar' ? '📞 مكالمة واردة الآن من العميل:' : 'Incoming Customer Call:'}</strong>{' '}
              {incomingCallSim.name} ({incomingCallSim.phone}) — {incomingCallSim.zone}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => acceptInboundCall(incomingCallSim)}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-sm"
            >
              {state.language === 'ar' ? 'الرد وبدء تسجيل الطلب' : 'Answer & Start Order'}
            </button>
            <button
              onClick={() => setIncomingCallSim(null)}
              className="px-2 py-1 bg-slate-800 text-slate-300 hover:text-white rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 1: NEW ORDER CREATION & BRANCH ALLOCATION WORKSPACE */}
      {/* ========================================================= */}
      {activeTab === 'NEW_ORDER' && (
        <div className="flex-1 flex overflow-hidden">
          {/* ========================================================= */}
          {/* LEFT COLUMN: CUSTOMER DATA & BRANCH ASSIGNMENT (تخصيص الفرع) */}
          {/* ========================================================= */}
          <div className="w-[340px] xl:w-[380px] bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 overflow-y-auto p-4 space-y-4">
            {/* 1. Branch Allocation Section (الميزة الجوهرية المطلوبة) */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-indigo-500/40 shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2 font-bold text-white text-xs">
                  <Building2 className="w-4 h-4 text-indigo-400" />
                  <span>{state.language === 'ar' ? 'تخصيص الفرع المنفذ للطلب:' : 'Fulfilling Branch Assignment:'}</span>
                </div>
                <span className="text-[10px] text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded font-mono">
                  {selectedBranch.code}
                </span>
              </div>

              <p className="text-[11px] text-slate-400 leading-snug">
                {state.language === 'ar'
                  ? 'حدد الفرع المسؤول عن تجهيز الطلب وخصم المقادير من مستودعه، ونسبة المبيعات والضرائب لصالحه:'
                  : 'Assign order fulfillment branch. Sales, taxes, and inventory depletion will be attributed directly to this branch:'}
              </p>

              {/* Branch Selection Cards */}
              <div className="space-y-2">
                {state.branches.map((b) => {
                  const isSelected = b.id === selectedBranchId;
                  const isRiyadh = b.id === 'branch-cairo-main';
                  return (
                    <button
                      key={b.id}
                      onClick={() => {
                        setSelectedBranchId(b.id);
                        if (isRiyadh) setDeliveryFee(15.0);
                        else setDeliveryFee(18.0);
                      }}
                      className={`w-full text-right p-3 rounded-xl border transition-all flex items-start justify-between cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-900/30 border-indigo-500 text-white shadow-md ring-1 ring-indigo-500/50'
                          : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-indigo-400' : 'bg-slate-600'}`} />
                          <span className="font-bold text-xs text-white">{b.nameAr}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 line-clamp-1">{b.addressAr}</p>
                        <div className="flex items-center gap-2 text-[10px] text-indigo-300 font-mono">
                          <span>Wh: {b.defaultWarehouseId}</span>
                          <span>•</span>
                          <span>📞 {b.phone}</span>
                        </div>
                      </div>

                      <div className="text-left shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {isSelected ? '✓ المختار' : 'اختر'}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-1">
                          {isRiyadh ? 'توصيل: 15 ر.س' : 'توصيل: 18 ر.س'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Branch Smart Attribution Notice */}
              <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-800/40 text-[11px] text-indigo-200">
                <strong>{state.language === 'ar' ? 'الإسناد المحاسبي المعتمد:' : 'Branch Attribution:'}</strong>{' '}
                {state.language === 'ar'
                  ? `الطلب سيصل مباشرة لطابعات ومطبخ فرع ${selectedBranch.nameAr} مع تسجيل فاتورة ضريبية رسمية.`
                  : `Dispatches directly to ${selectedBranch.nameEn}'s KDS and POS cashier queue.`}
              </div>
            </div>

            {/* 2. Customer Information Card */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2 font-bold text-white text-xs">
                  <User className="w-4 h-4 text-purple-400" />
                  <span>{state.language === 'ar' ? 'بيانات العميل والمتصل:' : 'Customer & Caller Profile:'}</span>
                </div>
                <div className="flex items-center gap-1">
                  {PRESET_CUSTOMERS.map((cust) => (
                    <button
                      key={cust.phone}
                      onClick={() => acceptInboundCall(cust)}
                      className="px-1.5 py-0.5 rounded text-[9px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700"
                      title={`تحميل بيانات ${cust.name}`}
                    >
                      {cust.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">
                    {state.language === 'ar' ? 'رقم الهاتف:' : 'Phone Number:'}
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-2.5" />
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl pr-9 pl-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                      placeholder="05xxxxxxxx"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">
                    {state.language === 'ar' ? 'اسم العميل:' : 'Customer Name:'}
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                    placeholder="الاسم الثلاثي"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">
                    {state.language === 'ar' ? 'منطقة التوصيل / الحي:' : 'Delivery Zone:'}
                  </label>
                  <select
                    value={customerZone}
                    onChange={(e) => {
                      const z = e.target.value;
                      setCustomerZone(z);
                      if (z.includes('الرياض')) {
                        setSelectedBranchId('branch-cairo-main');
                        setDeliveryFee(15.0);
                      } else if (z.includes('جدة')) {
                        setSelectedBranchId('branch-giza-dokki');
                        setDeliveryFee(18.0);
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="شمال الرياض">الرياض - شمال (الياسمين، الملقا، الصحافة)</option>
                    <option value="وسط الرياض">الرياض - وسط (العليا، السليمانية، الملك فهد)</option>
                    <option value="شرق الرياض">الرياض - شرق (الروضة، الحمراء، القدس)</option>
                    <option value="شمال جدة">جدة - شمال (الروضة، الزهراء، الشاطئ)</option>
                    <option value="وسط جدة">جدة - وسط (الحمراء، البلد، الجامعة)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">
                    {state.language === 'ar' ? 'عنوان التوصيل بالتفصيل:' : 'Detailed Delivery Address:'}
                  </label>
                  <textarea
                    rows={2}
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white text-xs focus:outline-none focus:border-indigo-500 leading-snug"
                    placeholder="الشارع، رقم المبنى، الدور، الشقة..."
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">
                    {state.language === 'ar' ? 'ملاحظات وتوجيهات السائق:' : 'Driver Delivery Notes:'}
                  </label>
                  <input
                    type="text"
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500"
                    placeholder="علامة مميزة، جرس الباب..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* CENTER COLUMN: INTERACTIVE PRODUCT CATALOG */}
          {/* ========================================================= */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 p-4 space-y-3">
            {/* Search and Category Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                <button
                  onClick={() => setSelectedCategoryId(null)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    selectedCategoryId === null
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  {state.language === 'ar' ? 'جميع الأقسام' : 'All Categories'}
                </button>
                {state.categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                      selectedCategoryId === cat.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat.nameAr}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div className="relative w-64 shrink-0">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  placeholder={state.language === 'ar' ? 'بحث عن وجبة بالاسم أو الرمز...' : 'Search meals...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Products Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pr-1">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => {
                    if (product.modifierGroups && product.modifierGroups.length > 0) {
                      setActiveModifierProduct(product);
                    } else {
                      handleAddItem(product, 1, [], product.basePrice);
                    }
                  }}
                  className="bg-slate-900 border border-slate-800 hover:border-indigo-500/70 rounded-2xl overflow-hidden shadow-sm hover:shadow-md flex flex-col text-right transition-all group cursor-pointer"
                >
                  <div className="h-28 w-full bg-slate-800 overflow-hidden relative">
                    <FoodVisual id={product.id} name={product.nameEn} imageUrl={product.imageUrl} />
                    {product.modifierGroups && product.modifierGroups.length > 0 && (
                      <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-600 text-white shadow-sm">
                        خيارات
                      </span>
                    )}
                  </div>
                  <div className="p-3 flex flex-col justify-between flex-1">
                    <div>
                      <h4 className="font-bold text-xs text-white group-hover:text-indigo-400 line-clamp-1">
                        {product.nameAr}
                      </h4>
                      <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                        {product.nameEn}
                      </p>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between">
                      <span className="font-mono font-black text-xs text-indigo-400">
                        {formatCurrency(product.basePrice, state.language, state.tenant.currency)}
                      </span>
                      <span className="w-6 h-6 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold text-xs group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ========================================================= */}
          {/* RIGHT COLUMN: CALL CENTER ORDER TICKET & DISPATCH ACTION */}
          {/* ========================================================= */}
          <div className="w-[360px] xl:w-[390px] bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 overflow-hidden shadow-2xl">
            {/* Ticket Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center justify-between pb-1">
                <span className="font-black text-sm text-white flex items-center gap-1.5">
                  <PhoneCall className="w-4 h-4 text-indigo-400" />
                  {state.language === 'ar' ? 'ملخص طلب العميل' : 'Customer Order Ticket'}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600/20 text-indigo-300 border border-indigo-500/30">
                  {cartItems.length} {state.language === 'ar' ? 'أصناف' : 'Items'}
                </span>
              </div>

              {/* Assigned Branch Banner */}
              <div className="mt-2 p-2 rounded-xl bg-indigo-950/70 border border-indigo-700/50 flex items-center justify-between text-xs text-indigo-200">
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>
                    <strong>{state.language === 'ar' ? 'الفرع المنفذ: ' : 'Assigned: '}</strong>
                    {selectedBranch.nameAr}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-indigo-300 font-bold">
                  {selectedBranch.code}
                </span>
              </div>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-4 divide-y divide-slate-800/80 space-y-2">
              {cartItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                  <PhoneCall className="w-10 h-10 stroke-1 mb-2 text-slate-600" />
                  <p className="text-xs font-bold text-slate-400">
                    {state.language === 'ar' ? 'سلة الطلب فارغة' : 'Ticket is empty'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {state.language === 'ar'
                      ? 'اختر وجبات العميل من القائمة لإضافتها للطلب'
                      : 'Select meals from catalog to add'}
                  </p>
                </div>
              ) : (
                cartItems.map((item) => (
                  <div key={item.id} className="pt-2 flex flex-col gap-1">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 pr-2">
                        <div className="font-bold text-xs text-white">{item.productNameAr}</div>
                        {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                          <div className="text-[10px] text-indigo-300 mt-0.5">
                            + {item.selectedModifiers.map((m) => m.optionNameAr).join(', ')}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-white">
                          {formatCurrency(item.totalPrice, state.language, state.tenant.currency)}
                        </span>
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleUpdateItemQty(item.id, -1)}
                        className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-xs"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-mono font-bold text-slate-300 px-1">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => handleUpdateItemQty(item.id, 1)}
                        className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-xs"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Financial Totals & Payment Method */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 space-y-3">
              {/* Payment Method Selector */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  {state.language === 'ar' ? 'طريقة الدفع المتفق عليها:' : 'Payment Method:'}
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => setPaymentMethod('CASH_ON_DELIVERY')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-all ${
                      paymentMethod === 'CASH_ON_DELIVERY'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    نقدًا (COD)
                  </button>
                  <button
                    onClick={() => setPaymentMethod('CARD')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-all ${
                      paymentMethod === 'CARD'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    بطاقة (Card)
                  </button>
                  <button
                    onClick={() => setPaymentMethod('INSTAPAY')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-all ${
                      paymentMethod === 'INSTAPAY'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                    }`}
                  >
                    محفظة (Wallet)
                  </button>
                </div>
              </div>

              {/* Amounts summary */}
              <div className="space-y-1 text-xs text-slate-400 border-t border-slate-800/80 pt-2">
                <div className="flex justify-between">
                  <span>المجموع الفرعي:</span>
                  <span className="font-mono text-slate-200">{subtotal.toFixed(2)} {state.tenant.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span>رسوم التوصيل لفرع {selectedBranch.nameAr}:</span>
                  <span className="font-mono text-slate-200">{deliveryFee.toFixed(2)} {state.tenant.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span>ضريبة القيمة المضافة 15%:</span>
                  <span className="font-mono text-slate-200">{taxAmount.toFixed(2)} {state.tenant.currency}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-black text-white pt-2 border-t border-slate-800">
                  <span>المجموع الإجمالي:</span>
                  <span className="font-mono text-indigo-400 text-base">
                    {grandTotal.toFixed(2)} {state.tenant.currency}
                  </span>
                </div>
              </div>

              {/* Final Dispatch Button */}
              <button
                onClick={handleDispatchOrder}
                disabled={cartItems.length === 0}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white py-3 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/40 transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                <ArrowRight className="w-4 h-4" />
                <span>
                  {state.language === 'ar'
                    ? `تأكيد وإرسال الطلب لفرع ${selectedBranch.nameAr}`
                    : `Confirm & Dispatch to ${selectedBranch.nameEn}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 2: DISPATCHED ORDERS MONITOR (سجل متابعة طلبات الفروع) */}
      {/* ========================================================= */}
      {activeTab === 'ORDERS_MONITOR' && (
        <div className="flex-1 flex flex-col p-6 space-y-4 overflow-hidden">
          {/* Filter Bar */}
          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-bold">
                {state.language === 'ar' ? 'تصفية حسب الفرع المنفذ:' : 'Filter by Branch:'}
              </span>
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setMonitorBranchFilter('ALL')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    monitorBranchFilter === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {state.language === 'ar' ? 'جميع الفروع' : 'All Branches'} ({allCallCenterOrders.length})
                </button>
                {state.branches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setMonitorBranchFilter(b.id)}
                    className={`px-3 py-1 rounded-lg font-bold transition-all ${
                      monitorBranchFilter === b.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {b.nameAr} (
                    {
                      allCallCenterOrders.filter(
                        (o) => o.fulfillingBranchId === b.id || o.branchId === b.id
                      ).length
                    }
                    )
                  </button>
                ))}
              </div>
            </div>

            <div className="relative w-72">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                placeholder={state.language === 'ar' ? 'بحث برقم الطلب، العميل، الهاتف...' : 'Search orders...'}
                value={monitorSearch}
                onChange={(e) => setMonitorSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Orders Table Container */}
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-y-auto">
            {filteredMonitorOrders.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
                <PhoneCall className="w-12 h-12 stroke-1 mb-2 text-slate-600" />
                <p className="text-sm font-bold text-slate-400">لا توجد طلبات كول سنتر مطابقة للتصفية</p>
                <p className="text-xs text-slate-500 mt-1">ابدأ بإنشاء وتوجيه طلب جديد لأحد الفروع</p>
              </div>
            ) : (
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold sticky top-0">
                  <tr>
                    <th className="p-3.5">رقم الطلب</th>
                    <th className="p-3.5">الفرع المنفذ</th>
                    <th className="p-3.5">العميل والتوصيل</th>
                    <th className="p-3.5">الأصناف</th>
                    <th className="p-3.5">الإجمالي</th>
                    <th className="p-3.5">حالة المطبخ</th>
                    <th className="p-3.5">حالة السداد</th>
                    <th className="p-3.5 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredMonitorOrders.map((ord) => {
                    const br = state.branches.find((b) => b.id === (ord.fulfillingBranchId || ord.branchId));
                    const inv = state.invoices.find((i) => i.id === ord.invoiceId || i.orderNumber === ord.orderNumber);
                    const isPaid = ord.paymentStatus === 'PAID' || inv?.paymentStatus === 'PAID';

                    return (
                      <tr key={ord.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="p-3.5">
                          <div className="font-bold text-white font-mono">#{ord.orderNumber}</div>
                          {inv && (
                            <div className="text-[10px] text-indigo-400 font-mono mt-0.5">
                              {inv.invoiceNumber}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-500">
                            {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>

                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-800">
                            {br?.nameAr || 'الفرع الرئيسي'}
                          </span>
                          <div className="text-[10px] text-slate-400 mt-1">
                            مستودع: {br?.defaultWarehouseId}
                          </div>
                        </td>

                        <td className="p-3.5">
                          <div className="font-bold text-white">{ord.customerName}</div>
                          <div className="text-[11px] font-mono text-slate-400">{ord.customerPhone}</div>
                          <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5 max-w-[200px]">
                            {ord.deliveryAddress}
                          </div>
                        </td>

                        <td className="p-3.5">
                          <div className="text-slate-300">
                            {ord.items.map((i) => (
                              <div key={i.id} className="line-clamp-1">
                                {i.quantity}× {i.productNameAr}
                              </div>
                            ))}
                          </div>
                        </td>

                        <td className="p-3.5">
                          <span className="font-mono font-bold text-white text-sm">
                            {ord.grandTotal.toFixed(2)} {state.tenant.currency}
                          </span>
                          <div className="text-[10px] text-slate-500">
                            توصيل: {ord.deliveryFee?.toFixed(2) || '0.00'}
                          </div>
                        </td>

                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              ord.status === 'SENT_TO_KITCHEN'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : ord.status === 'DELIVERED'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}
                          >
                            {ord.status === 'SENT_TO_KITCHEN'
                              ? 'قيد التجهيز بالمطبخ'
                              : ord.status === 'DELIVERED'
                              ? 'خرج مع السائق'
                              : 'تم التسليم'}
                          </span>
                        </td>

                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isPaid
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {isPaid ? '✓ مسدد' : '⏳ غير مسدد (COD)'}
                          </span>
                        </td>

                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => {
                              if (inv) {
                                setInvoiceForPrinting({ invoice: inv, order: ord });
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white inline-flex items-center gap-1 shadow-sm transition-all"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>معاينة الفاتورة</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* SUCCESS CONFIRMATION MODAL */}
      {/* ========================================================= */}
      {dispatchedSuccess && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 space-y-4 text-center animate-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-black text-white">
                {state.language === 'ar' ? 'تم إرسال الطلب للفرع وتوليد الفاتورة بنجاح!' : 'Order Dispatched to Branch!'}
              </h3>
              <p className="text-xs text-slate-400">
                {state.language === 'ar'
                  ? `تم توجيه الطلب إلى مطبخ وكاشير: ${dispatchedSuccess.branchNameAr}`
                  : `Dispatched to ${dispatchedSuccess.branchNameAr}`}
              </p>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-right space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">رقم الطلب:</span>
                <span className="font-mono font-bold text-white">#{dispatchedSuccess.order.orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">رقم الفاتورة المنسوبة:</span>
                <span className="font-mono font-bold text-indigo-400">{dispatchedSuccess.invoice.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">الفرع المنفذ:</span>
                <span className="font-bold text-white">{dispatchedSuccess.branchNameAr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">طريقة الدفع:</span>
                <span className="text-amber-300 font-bold">{dispatchedSuccess.invoice.paymentMethod} (غير مدفوع)</span>
              </div>
              <div className="flex justify-between text-sm font-black text-white pt-2 border-t border-slate-800">
                <span>المبلغ الكلي:</span>
                <span className="font-mono text-emerald-400 text-base">
                  {dispatchedSuccess.invoice.grandTotal.toFixed(2)} {state.tenant.currency}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  setInvoiceForPrinting({
                    invoice: dispatchedSuccess.invoice,
                    order: dispatchedSuccess.order,
                  });
                  setDispatchedSuccess(null);
                }}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-1.5 shadow-md shadow-indigo-900/40"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الفاتورة والإيصال</span>
              </button>
              <button
                onClick={() => setDispatchedSuccess(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Customizer / Modifiers Modal */}
      {activeModifierProduct && (
        <ModifierModal
          product={activeModifierProduct}
          onClose={() => setActiveModifierProduct(null)}
          onConfirm={(quantity, selectedMods, notes, unitPrice) => {
            handleAddItem(
              activeModifierProduct,
              quantity,
              selectedMods,
              unitPrice
            );
            setActiveModifierProduct(null);
          }}
        />
      )}

      {/* Invoice Printing & Preview Modal */}
      {invoiceForPrinting && (
        <InvoicePrintModal
          invoice={invoiceForPrinting.invoice}
          order={invoiceForPrinting.order}
          onClose={() => setInvoiceForPrinting(null)}
        />
      )}
    </div>
  );
};
