/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Call Center & Branch Invoice Print Modal
 * Multi-format printing: 80mm Thermal, 58mm Mobile Thermal, and A4 Corporate Tax Invoice
 * Supports ETA/ZATCA E-Invoice QR Code, Reprint Audit Logging, and Local Printer Settings
 * CRITICAL RULE: Printing an invoice must NEVER mark it as paid.
 */

import React, { useState } from 'react';
import { Invoice, Order, InvoiceType, InvoiceLegalEntityInfo } from '../../types';
import { useRestaurantStore } from '../../services/store';
import { translations, formatCurrency } from '../../lib/i18n';
import { generateQrMatrix } from '../../lib/qrCode';
import {
  Printer,
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  Building2,
  Phone,
  MapPin,
  Clock,
  User,
  ShieldCheck,
  RotateCcw,
  Settings,
  Eye,
  Check,
  Receipt,
  DollarSign,
  AlertTriangle,
  QrCode,
} from 'lucide-react';

interface InvoicePrintModalProps {
  invoice: Invoice;
  order?: Order;
  onClose: () => void;
  onPaymentRequested?: () => void;
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  invoice,
  order,
  onClose,
  onPaymentRequested,
}) => {
  const { state, logInvoicePrint } = useRestaurantStore();
  const t = translations[state.language];

  // Active print format: 80mm thermal, 58mm thermal, or A4 corporate invoice
  const [printFormat, setPrintFormat] = useState<'80mm' | '58mm' | 'A4'>('80mm');
  const [activeInvoiceType, setActiveInvoiceType] = useState<InvoiceType>(invoice.invoiceType || 'CUSTOMER_INVOICE');

  // Reprint management
  const isReprint = (invoice.reprintCount || 0) > 0;
  const [reprintReason, setReprintReason] = useState('Customer requested duplicate copy');
  const [showReprintDialog, setShowReprintDialog] = useState(false);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);

  // Local printer settings state
  const [printerConfig, setPrinterConfig] = useState({
    connectionType: 'BROWSER_DIALOG', // 'BROWSER_DIALOG' | 'NETWORK_ESCPOS' | 'USB'
    networkIp: '192.168.1.180',
    networkPort: '9100',
    autoCut: true,
    cashDrawerKick: false,
    copiesCount: 1,
  });

  const [printSuccessFeedback, setPrintSuccessFeedback] = useState(false);

  // Fulfilling branch details
  const branch = state.branches.find((b) => b.id === invoice.branchId) || state.branches[0];

  // Guaranteed safe legal entity information
  const legal: InvoiceLegalEntityInfo = invoice.legalEntity || invoice.legalEntityInfo || {
    tradeNameAr: state.tenant.tradeNameAr,
    tradeNameEn: state.tenant.tradeNameEn,
    legalEntityNameAr: state.tenant.tradeNameAr,
    legalEntityNameEn: state.tenant.tradeNameEn,
    taxRegistrationNumber: state.tenant.taxRegistrationNumber,
    commercialRegister: state.tenant.commercialRegister,
    branchNameAr: branch.nameAr,
    branchNameEn: branch.nameEn,
    branchAddressAr: branch.addressAr,
    branchAddressEn: branch.addressEn,
    branchPhone: branch.phone,
  };

  const invoiceDate = invoice.createdAt || invoice.issuedAt || new Date().toISOString();
  const agentName = invoice.callCenterAgentName || invoice.agentName || 'Mai Hossam';
  const agentId = invoice.callCenterAgentId || invoice.agentId || 'user-callcenter-01';

  // QR Code payload (ETA / ZATCA e-invoicing standard)
  const qrData =
    invoice.qrCodeData ||
    `ETA|${legal.taxRegistrationNumber}|${invoiceDate}|${invoice.grandTotal}|${invoice.taxAmount}`;
  const qrMatrix = generateQrMatrix(qrData, 25);

  const handleExecutePrint = () => {
    // If it's a reprint and reason wasn't confirmed, trigger reprint reason dialog
    if (isReprint && !showReprintDialog) {
      setShowReprintDialog(true);
      return;
    }

    // Audit log the print event
    logInvoicePrint(
      invoice.id,
      state.currentUser.id,
      state.currentUser.fullNameEn,
      printFormat,
      isReprint,
      isReprint ? reprintReason : undefined
    );

    setShowReprintDialog(false);
    setPrintSuccessFeedback(true);
    setTimeout(() => setPrintSuccessFeedback(false), 3000);

    // Call browser print
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const isRtl = state.language === 'ar';

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh]">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  {state.language === 'ar' ? 'طباعة ومعاينة فاتورة المبيعات' : 'Invoice Preview & Printing'}
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-purple-900/60 text-purple-200 border border-purple-700/50">
                  {invoice.invoiceNumber}
                </span>
                {invoice.orderSource === 'CALL_CENTER' && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {state.language === 'ar' ? 'طلب كول سنتر' : 'Call Center Order'}
                  </span>
                )}
                {isReprint && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {state.language === 'ar' ? `نسخة مكررة (${invoice.reprintCount})` : `Reprint (${invoice.reprintCount})`}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {state.language === 'ar'
                  ? `الفرع المنفذ والمسؤول عن الفاتورة: ${legal.branchNameAr} — العميل: ${invoice.customerName || 'عميل نقدي'}`
                  : `Fulfilling & Attributed Branch: ${legal.branchNameEn} — Customer: ${invoice.customerName || 'Walk-in'}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPrinterSettings(!showPrinterSettings)}
              className={`p-2 rounded-xl border transition-colors ${
                showPrinterSettings
                  ? 'bg-purple-600 text-white border-purple-500'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
              }`}
              title="إعدادات الطابعة المحلية"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Format & Invoice Type Controls */}
        <div className="px-6 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* Format selector tabs */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setPrintFormat('80mm')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                printFormat === '80mm'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🧾 80mm {state.language === 'ar' ? 'حراري قياسي' : 'Standard Thermal'}
            </button>
            <button
              onClick={() => setPrintFormat('58mm')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                printFormat === '58mm'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📱 58mm {state.language === 'ar' ? 'حراري مدمج' : 'Compact POS'}
            </button>
            <button
              onClick={() => setPrintFormat('A4')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                printFormat === 'A4'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📄 A4 {state.language === 'ar' ? 'فاتورة ضريبية رسمية' : 'Corporate Invoice'}
            </button>
          </div>

          {/* Invoice Type Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              {state.language === 'ar' ? 'نوع المستند:' : 'Doc Type:'}
            </span>
            <select
              value={activeInvoiceType}
              onChange={(e) => setActiveInvoiceType(e.target.value as InvoiceType)}
              className="bg-slate-950 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-500"
            >
              <option value="CUSTOMER_INVOICE">
                {state.language === 'ar' ? 'فاتورة مبيعات عميل (Sales Invoice)' : 'Customer Sales Invoice'}
              </option>
              <option value="TAX_INVOICE">
                {state.language === 'ar' ? 'فاتورة ضريبية رسمية (Tax Invoice)' : 'Tax Invoice (ETA Compliant)'}
              </option>
              <option value="ORDER_CONFIRMATION">
                {state.language === 'ar' ? 'إيصال تأكيد استلام (Order Confirmation)' : 'Order Confirmation Receipt'}
              </option>
              <option value="CREDIT_NOTE">
                {state.language === 'ar' ? 'إشعار دائن (Credit Note)' : 'Credit Note'}
              </option>
            </select>
          </div>
        </div>

        {/* Crucial Business Rule Warning Banner */}
        <div className="px-6 py-2.5 bg-amber-950/40 border-b border-amber-800/40 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>{state.language === 'ar' ? 'قاعدة محاسبية هامة:' : 'Strict Accounting Invariant:'}</strong>{' '}
              {state.language === 'ar'
                ? 'طباعة الفاتورة لا تُسجل السداد تلقائياً. يظل الطلب ذمة معلقة (غير مدفوع) حتى يقوم السائق أو المحاسب بتأكيد التحصيل.'
                : 'Printing an invoice does NOT mark it as paid. COD remains an open receivable until cash/card collection is confirmed.'}
            </span>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
              invoice.paymentStatus === 'PAID'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}
          >
            {invoice.paymentStatus === 'PAID'
              ? state.language === 'ar'
                ? '✓ مسدد بالكامل'
                : 'PAID'
              : state.language === 'ar'
              ? '⏳ غير مسدد (قيد التحصيل)'
              : 'UNPAID (Pending)'}
          </span>
        </div>

        {/* Local Printer Settings Drawer (collapsible) */}
        {showPrinterSettings && (
          <div className="p-4 bg-slate-950 border-b border-slate-800 text-xs text-slate-300 animate-in slide-in-from-top-2">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <h3 className="font-bold text-white flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-purple-400" />
                {state.language === 'ar' ? 'إعدادات الطابعة المحلية ونقطة البيع' : 'Local POS Printer Configuration'}
              </h3>
              <span className="text-[11px] text-slate-400">
                {state.language === 'ar' ? 'منفذ الربط المباشر بفرع الكاشير' : 'Direct Cashier Branch Connection'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  {state.language === 'ar' ? 'بروتوكول الطابعة:' : 'Printer Connection:'}
                </label>
                <select
                  value={printerConfig.connectionType}
                  onChange={(e) => setPrinterConfig({ ...printerConfig, connectionType: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-white"
                >
                  <option value="BROWSER_DIALOG">System Dialog (Vite / Browser)</option>
                  <option value="NETWORK_ESCPOS">ESC/POS Network (LAN / WiFi)</option>
                  <option value="USB">USB Direct (WebUSB / HID)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  {state.language === 'ar' ? 'عنوان IP الطابعة:' : 'Printer IP Address:'}
                </label>
                <input
                  type="text"
                  value={printerConfig.networkIp}
                  onChange={(e) => setPrinterConfig({ ...printerConfig, networkIp: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-white font-mono"
                  disabled={printerConfig.connectionType !== 'NETWORK_ESCPOS'}
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  {state.language === 'ar' ? 'المنفذ (Port):' : 'Port:'}
                </label>
                <input
                  type="text"
                  value={printerConfig.networkPort}
                  onChange={(e) => setPrinterConfig({ ...printerConfig, networkPort: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-xs text-white font-mono"
                  disabled={printerConfig.connectionType !== 'NETWORK_ESCPOS'}
                />
              </div>
              <div className="flex items-center gap-4 pt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printerConfig.autoCut}
                    onChange={(e) => setPrinterConfig({ ...printerConfig, autoCut: e.target.checked })}
                    className="rounded border-slate-700 text-purple-600 focus:ring-0"
                  />
                  <span>{state.language === 'ar' ? 'قص تلقائي للورق' : 'Auto Cut Paper'}</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Main Printable / Preview Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950/60 flex justify-center items-start">
          {/* 1. 80mm Standard Thermal Receipt */}
          {printFormat === '80mm' && (
            <div
              id="printable-invoice-80mm"
              className="w-full max-w-[360px] bg-white text-slate-900 p-6 rounded-xl font-mono text-[11px] leading-relaxed shadow-2xl border border-slate-300 select-text"
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              {/* Reprint Watermark Banner */}
              {isReprint && (
                <div className="mb-3 py-1 px-2 bg-rose-50 border-2 border-dashed border-rose-400 rounded text-center text-rose-800 font-bold text-[10px]">
                  ⚠️ {state.language === 'ar' ? 'نسخة مكررة — REPRINT DUPLICATE COPY' : 'REPRINT DUPLICATE COPY'}
                  <div className="text-[9px] font-normal text-rose-700">
                    {state.language === 'ar' ? `رقم الطباعة: ${(invoice.reprintCount || 0) + 1}` : `Print count: ${(invoice.reprintCount || 0) + 1}`}
                  </div>
                </div>
              )}

              {/* Fulfilling Branch Header */}
              <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
                <h1 className="text-base font-black text-slate-950">
                  {legal.legalEntityNameAr || legal.tradeNameAr}
                </h1>
                <p className="text-[11px] text-slate-600 font-bold">
                  {legal.branchNameAr}
                </p>
                <p className="text-[10px] text-slate-500">
                  {legal.branchAddressAr}
                </p>
                <p className="text-[10px] text-slate-500">
                  📞 {legal.branchPhone || branch.phone}
                </p>
                <div className="pt-1 text-[10px] text-slate-600 flex justify-center gap-2">
                  <span>س.ت: {legal.commercialRegister}</span>
                  <span>|</span>
                  <span>ت.ض: {legal.taxRegistrationNumber}</span>
                </div>
                <div className="inline-block mt-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-300 font-bold text-[10px]">
                  {activeInvoiceType === 'TAX_INVOICE'
                    ? 'فاتورة ضريبية مبسطة (Tax Invoice)'
                    : activeInvoiceType === 'ORDER_CONFIRMATION'
                    ? 'إيصال تأكيد طلب (Confirmation)'
                    : 'فاتورة مبيعات عميل (Sales Invoice)'}
                </div>
              </div>

              {/* Invoice Metadata */}
              <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">رقم الفاتورة:</span>
                  <span className="font-bold text-slate-900">{invoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">رقم الطلب:</span>
                  <span className="font-bold text-slate-900">#{invoice.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">التاريخ والوقت:</span>
                  <span className="text-slate-800">
                    {new Date(invoiceDate).toLocaleDateString()} {new Date(invoiceDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">مصدر الطلب:</span>
                  <span className="font-bold text-purple-700 bg-purple-50 px-1 rounded">
                    {invoice.orderSource === 'CALL_CENTER' ? 'كول سنتر مركزي (Call Center)' : 'POS المباشر'}
                  </span>
                </div>
                {agentName && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">موظف الكول سنتر:</span>
                    <span className="text-slate-800">{agentName} ({agentId})</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">الفرع المنفذ (الفوترة والمخزون):</span>
                  <span className="font-bold text-slate-800">{legal.branchNameAr}</span>
                </div>
              </div>

              {/* Customer & Delivery Section */}
              <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-[10px] bg-slate-50/70 p-2 rounded my-1.5">
                <div className="font-bold text-slate-900 pb-1 border-b border-slate-200">
                  📍 بيانات العميل والتوصيل:
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">اسم العميل:</span>
                  <span className="font-bold text-slate-900">{invoice.customerName || 'عميل نقدي'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الهاتف:</span>
                  <span className="font-mono text-slate-800">{invoice.customerPhone || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-500">عنوان التوصيل:</span>
                  <div className="font-medium text-slate-800 mt-0.5 leading-snug">
                    {invoice.deliveryAddress || 'عنوان العميل المعتمد'}
                  </div>
                </div>
                {invoice.deliveryNotes && (
                  <div className="text-amber-800 bg-amber-50 p-1 rounded mt-1 text-[9px]">
                    <strong>ملاحظات السائق:</strong> {invoice.deliveryNotes}
                  </div>
                )}
              </div>

              {/* Line Items Table */}
              <div className="py-2 border-b border-dashed border-slate-300">
                <table className="w-full text-right text-[10px]">
                  <thead>
                    <tr className="border-b border-slate-300 text-slate-500 font-bold">
                      <th className="pb-1 text-right">الصنف</th>
                      <th className="pb-1 text-center">الكمية</th>
                      <th className="pb-1 text-left">السعر</th>
                      <th className="pb-1 text-left">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoice.items.map((item) => (
                      <tr key={item.id} className="py-1">
                        <td className="py-1 text-slate-800 font-medium">
                          {item.productNameAr}
                          {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                            <div className="text-[9px] text-slate-500 pr-1">
                              {item.selectedModifiers.map((m) => m.optionNameAr).join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="py-1 text-center font-bold text-slate-700">{item.quantity}</td>
                        <td className="py-1 text-left text-slate-600 font-mono">
                          {item.unitPrice.toFixed(2)}
                        </td>
                        <td className="py-1 text-left font-bold text-slate-900 font-mono">
                          {item.totalPrice.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals & Tax Breakdown */}
              <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-[10px]">
                <div className="flex justify-between text-slate-600">
                  <span>المجموع الفرعي:</span>
                  <span className="font-mono">{invoice.subtotal.toFixed(2)} {state.tenant.currency}</span>
                </div>
                {invoice.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>الخصم المطبق:</span>
                    <span className="font-mono">-{invoice.discountAmount.toFixed(2)} {state.tenant.currency}</span>
                  </div>
                )}
                {invoice.deliveryFee > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>رسوم خدمة التوصيل:</span>
                    <span className="font-mono">{invoice.deliveryFee.toFixed(2)} {state.tenant.currency}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>ضريبة القيمة المضافة (15%):</span>
                  <span className="font-mono">{invoice.taxAmount.toFixed(2)} {state.tenant.currency}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-black text-slate-950 pt-1.5 border-t border-slate-300">
                  <span>الإجمالي النهائي المستحق:</span>
                  <span className="font-mono text-purple-700 text-base">
                    {invoice.grandTotal.toFixed(2)} {state.tenant.currency}
                  </span>
                </div>
              </div>

              {/* Payment Status & Instructions */}
              <div className="py-2.5 border-b border-dashed border-slate-300 text-[10px] space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">طريقة الدفع:</span>
                  <span className="font-bold text-slate-800">
                    {invoice.paymentMethod === 'CASH_ON_DELIVERY' || invoice.paymentMethod === 'CASH'
                      ? 'دفع نقدًا عند الاستلام (COD)'
                      : invoice.paymentMethod === 'CARD'
                      ? 'بطاقة دفع إلكتروني (Card)'
                      : invoice.paymentMethod || 'COD'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">حالة السداد:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                      invoice.paymentStatus === 'PAID'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {invoice.paymentStatus === 'PAID' ? '✓ مسدد بالكامل' : '⏳ معلق — غير مدفوع'}
                  </span>
                </div>
                {invoice.paymentStatus !== 'PAID' && (
                  <div className="text-[9px] text-amber-700 bg-amber-50 p-1.5 rounded mt-1 border border-amber-200">
                    ⚠️ تنبيه السائق: يُرجى تحصيل مبلغ{' '}
                    <strong>
                      {invoice.grandTotal.toFixed(2)} {state.tenant.currency}
                    </strong>{' '}
                    من العميل وتوريده لصندوق الفرع.
                  </div>
                )}
              </div>

              {/* ETA / ZATCA Compliant QR Code */}
              <div className="pt-3 pb-2 text-center flex flex-col items-center">
                <div className="p-2 bg-white border border-slate-200 rounded-lg inline-block">
                  <svg width="100" height="100" viewBox="0 0 25 25" className="shape-rendering-crispEdges">
                    {qrMatrix.map((row, rIdx) =>
                      row.map((cell, cIdx) =>
                        cell ? <rect key={`${rIdx}-${cIdx}`} x={cIdx} y={rIdx} width="1" height="1" fill="#000" /> : null
                      )
                    )}
                  </svg>
                </div>
                <p className="text-[9px] text-slate-500 mt-1">
                  رمز التحقق الضريبي الإلكتروني المعتمد (ETA / ZATCA)
                </p>
                <p className="text-[8px] text-slate-400 mt-0.5">
                  شكراً لطلبكم من {legal.branchNameAr}
                </p>
              </div>
            </div>
          )}

          {/* 2. 58mm Mobile Thermal Receipt */}
          {printFormat === '58mm' && (
            <div
              id="printable-invoice-58mm"
              className="w-full max-w-[270px] bg-white text-slate-900 p-4 rounded-xl font-mono text-[10px] leading-tight shadow-2xl border border-slate-300 select-text"
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              {isReprint && (
                <div className="mb-2 py-0.5 bg-rose-50 border border-rose-300 rounded text-center text-rose-700 font-bold text-[9px]">
                  نسخة مكررة ({(invoice.reprintCount || 0) + 1})
                </div>
              )}
              <div className="text-center pb-2 border-b border-dashed border-slate-300">
                <h1 className="text-sm font-black">{legal.branchNameAr}</h1>
                <p className="text-[9px] text-slate-500">{legal.branchPhone || branch.phone}</p>
                <p className="text-[8px] text-slate-400">ت.ض: {legal.taxRegistrationNumber}</p>
              </div>

              <div className="py-1.5 border-b border-dashed border-slate-300 text-[9px] space-y-0.5">
                <div className="flex justify-between font-bold">
                  <span>طلب: #{invoice.orderNumber}</span>
                  <span>{invoice.invoiceNumber}</span>
                </div>
                <div className="text-slate-500 text-[8px]">{new Date(invoiceDate).toLocaleString()}</div>
                <div className="text-purple-700 font-bold">مصدر: كول سنتر ({agentName})</div>
                <div className="bg-slate-50 p-1 rounded font-bold text-slate-900">
                  عميل: {invoice.customerName || 'عميل نقدي'} ({invoice.customerPhone || '—'})
                </div>
                <div className="text-[8px] text-slate-600 line-clamp-2">
                  {invoice.deliveryAddress || 'عنوان العميل'}
                </div>
              </div>

              <div className="py-1.5 border-b border-dashed border-slate-300">
                <table className="w-full text-right text-[9px]">
                  <tbody>
                    {invoice.items.map((i) => (
                      <tr key={i.id}>
                        <td className="py-0.5">{i.productNameAr} ×{i.quantity}</td>
                        <td className="py-0.5 text-left font-mono">{i.totalPrice.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="py-1.5 border-b border-dashed border-slate-300 text-[9px] space-y-0.5">
                <div className="flex justify-between">
                  <span>المجموع:</span>
                  <span className="font-mono">{invoice.subtotal.toFixed(2)}</span>
                </div>
                {invoice.deliveryFee > 0 && (
                  <div className="flex justify-between">
                    <span>توصيل:</span>
                    <span className="font-mono">{invoice.deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>ضريبة (15%):</span>
                  <span className="font-mono">{invoice.taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs font-black text-slate-950 pt-1 border-t border-slate-200">
                  <span>الإجمالي:</span>
                  <span className="font-mono text-purple-700">{invoice.grandTotal.toFixed(2)} {state.tenant.currency}</span>
                </div>
                <div className="flex justify-between font-bold text-[9px] pt-1">
                  <span>الحالة:</span>
                  <span className={invoice.paymentStatus === 'PAID' ? 'text-emerald-700' : 'text-rose-700'}>
                    {invoice.paymentStatus === 'PAID' ? 'مسدد' : 'غير مسدد (COD)'}
                  </span>
                </div>
              </div>

              <div className="pt-2 text-center flex flex-col items-center">
                <svg width="70" height="70" viewBox="0 0 25 25" className="shape-rendering-crispEdges">
                  {qrMatrix.map((row, rIdx) =>
                    row.map((cell, cIdx) =>
                      cell ? <rect key={`${rIdx}-${cIdx}`} x={cIdx} y={rIdx} width="1" height="1" fill="#000" /> : null
                    )
                  )}
                </svg>
              </div>
            </div>
          )}

          {/* 3. A4 Corporate Tax Invoice (Formal Enterprise Layout) */}
          {printFormat === 'A4' && (
            <div
              id="printable-invoice-a4"
              className="w-full max-w-3xl bg-white text-slate-900 p-8 rounded-xl shadow-2xl border border-slate-300 select-text text-xs"
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              {/* Top Header with Corporate Logos and Legal Registration */}
              <div className="flex items-start justify-between pb-6 border-b-2 border-slate-800">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-purple-600 text-white font-black flex items-center justify-center text-sm">
                      FO
                    </span>
                    <h1 className="text-xl font-black tracking-tight text-slate-950">
                      {legal.legalEntityNameAr || legal.tradeNameAr}
                    </h1>
                  </div>
                  <p className="text-xs text-slate-500 font-bold">{legal.legalEntityNameEn || legal.tradeNameEn}</p>
                  <p className="text-xs text-purple-700 font-bold mt-1">
                    {state.language === 'ar' ? 'الفرع المنفذ للمبيعات والتحصيل:' : 'Fulfilling & Sales Branch:'}{' '}
                    {legal.branchNameAr} ({legal.branchNameEn})
                  </p>
                  <p className="text-xs text-slate-600">{legal.branchAddressAr}</p>
                  <p className="text-xs text-slate-600">📞 {legal.branchPhone || branch.phone}</p>
                </div>

                <div className="text-left space-y-1 bg-slate-50 p-4 rounded-xl border border-slate-200 min-w-[240px]">
                  <div className="text-xs font-black uppercase text-purple-900 border-b border-slate-200 pb-1 mb-1">
                    {activeInvoiceType === 'TAX_INVOICE'
                      ? 'فاتورة ضريبية رسمية / Tax Invoice'
                      : activeInvoiceType === 'ORDER_CONFIRMATION'
                      ? 'إيصال تأكيد طلب / Confirmation'
                      : 'فاتورة مبيعات عميل / Sales Invoice'}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">رقم الفاتورة:</span>
                    <span className="font-bold text-slate-900 font-mono">{invoice.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">رقم الطلب:</span>
                    <span className="font-bold font-mono">#{invoice.orderNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">التاريخ:</span>
                    <span className="text-slate-800">{new Date(invoiceDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">السجل التجاري (CR):</span>
                    <span className="font-mono text-slate-800">{legal.commercialRegister}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">الرقم الضريبي (TRN):</span>
                    <span className="font-mono text-purple-700 font-bold">{legal.taxRegistrationNumber}</span>
                  </div>
                </div>
              </div>

              {/* Attribution & Customer Two-Column Box */}
              <div className="grid grid-cols-2 gap-4 my-6">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
                  <h3 className="font-bold text-slate-950 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-purple-600" />
                    بيانات العميل والتسليم (Customer & Delivery)
                  </h3>
                  <div className="flex justify-between">
                    <span className="text-slate-500">اسم العميل:</span>
                    <span className="font-bold text-slate-900">{invoice.customerName || 'عميل نقدي'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">رقم الهاتف:</span>
                    <span className="font-mono font-medium">{invoice.customerPhone || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">عنوان التوصيل:</span>
                    <p className="font-medium text-slate-800 mt-0.5 leading-snug">{invoice.deliveryAddress || 'عنوان العميل المعتمد'}</p>
                  </div>
                  {invoice.deliveryNotes && (
                    <div className="text-[11px] bg-amber-50 text-amber-900 p-2 rounded border border-amber-200 mt-1">
                      <strong>ملاحظات التسليم:</strong> {invoice.deliveryNotes}
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
                  <h3 className="font-bold text-slate-950 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-purple-600" />
                    بيانات الإسناد ومصدر الطلب (Attribution & Source)
                  </h3>
                  <div className="flex justify-between">
                    <span className="text-slate-500">مصدر الطلب:</span>
                    <span className="font-bold text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded">
                      CALL_CENTER (مركز الاتصال الموحد)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">موظف الكول سنتر:</span>
                    <span className="font-medium text-slate-800">{agentName} ({agentId})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">فرع التحضير والفوترة:</span>
                    <span className="font-bold text-slate-900">{legal.branchNameAr}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">حالة السداد المحاسبي:</span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded ${
                        invoice.paymentStatus === 'PAID'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {invoice.paymentStatus === 'PAID' ? 'مسدد بالكامل (PAID)' : 'ذمة معلقة قيد التحصيل (UNPAID)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">طريقة الدفع المتفق عليها:</span>
                    <span className="font-medium text-slate-800">{invoice.paymentMethod || 'COD'}</span>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="my-6">
                <table className="w-full text-right border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100 text-slate-700 font-bold text-xs">
                    <tr>
                      <th className="p-3 text-right">#</th>
                      <th className="p-3 text-right">الصنف / الوصف</th>
                      <th className="p-3 text-center">الكمية</th>
                      <th className="p-3 text-left">سعر الوحدة</th>
                      <th className="p-3 text-left">الضريبة (15%)</th>
                      <th className="p-3 text-left">الإجمالي الصافي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {invoice.items.map((item, idx) => {
                      const itemTax = item.totalPrice * 0.15;
                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="p-3 text-slate-400 font-mono text-center">{idx + 1}</td>
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{item.productNameAr}</div>
                            <div className="text-slate-500 text-[11px]">{item.productNameEn}</div>
                            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                              <div className="text-purple-700 text-[11px] mt-0.5">
                                + {item.selectedModifiers.map((m) => m.optionNameAr).join(', ')}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center font-bold">{item.quantity}</td>
                          <td className="p-3 text-left font-mono">{item.unitPrice.toFixed(2)}</td>
                          <td className="p-3 text-left font-mono text-slate-600">{itemTax.toFixed(2)}</td>
                          <td className="p-3 text-left font-mono font-bold text-slate-900">{item.totalPrice.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Bottom Summary & Signatures */}
              <div className="grid grid-cols-2 gap-8 items-start pt-4 border-t border-slate-200">
                {/* QR Code and Legal Notes */}
                <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="p-2 bg-white border border-slate-300 rounded-lg shrink-0">
                    <svg width="84" height="84" viewBox="0 0 25 25" className="shape-rendering-crispEdges">
                      {qrMatrix.map((row, rIdx) =>
                        row.map((cell, cIdx) =>
                          cell ? <rect key={`${rIdx}-${cIdx}`} x={cIdx} y={rIdx} width="1" height="1" fill="#000" /> : null
                        )
                      )}
                    </svg>
                  </div>
                  <div className="text-[11px] space-y-1 text-slate-600">
                    <p className="font-bold text-slate-900">التحقق الضريبي الإلكتروني (ETA E-Invoice)</p>
                    <p>هذه الفاتورة منشأة ومسجلة نظامياً وتخضع لأحكام الفوترة الإلكترونية.</p>
                    <p className="text-[10px] text-slate-400 font-mono">UUID: {invoice.id}</p>
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>المجموع الفرعي الخاضع للضريبة:</span>
                    <span className="font-mono font-bold">{invoice.subtotal.toFixed(2)} {state.tenant.currency}</span>
                  </div>
                  {invoice.deliveryFee > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>رسوم خدمة الشحن والتوصيل:</span>
                      <span className="font-mono font-bold">{invoice.deliveryFee.toFixed(2)} {state.tenant.currency}</span>
                    </div>
                  )}
                  {invoice.discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>إجمالي الخصم التجاري:</span>
                      <span className="font-mono font-bold">-{invoice.discountAmount.toFixed(2)} {state.tenant.currency}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>ضريبة القيمة المضافة المحصلة (15%):</span>
                    <span className="font-mono font-bold">{invoice.taxAmount.toFixed(2)} {state.tenant.currency}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-black text-slate-950 pt-2 border-t-2 border-slate-300">
                    <span>الإجمالي الكلي النهائي:</span>
                    <span className="font-mono text-purple-700 text-lg">
                      {invoice.grandTotal.toFixed(2)} {state.tenant.currency}
                    </span>
                  </div>
                </div>
              </div>

              {/* Signatures Footer */}
              <div className="grid grid-cols-3 gap-6 pt-10 text-center text-[11px] text-slate-500">
                <div className="border-t border-slate-300 pt-2">
                  <span>توقيع أمين الصندوق / الكاشير</span>
                  <div className="font-bold text-slate-800 mt-1">{invoice.cashierName || state.currentUser.fullNameEn}</div>
                </div>
                <div className="border-t border-slate-300 pt-2">
                  <span>توقيع سائق التوصيل المستلم</span>
                  <div className="font-bold text-slate-800 mt-1">.......................</div>
                </div>
                <div className="border-t border-slate-300 pt-2">
                  <span>ختم الفرع المعتمد</span>
                  <div className="font-bold text-slate-800 mt-1">{legal.branchNameAr}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Actions Bar */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {printSuccessFeedback && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-emerald-950/60 px-3 py-1.5 rounded-lg border border-emerald-800 animate-in fade-in">
                <Check className="w-4 h-4" />
                {state.language === 'ar' ? 'تم إرسال أمر الطباعة وتسجيل السجل بنجاح!' : 'Print command logged successfully!'}
              </div>
            )}
            <span className="text-xs text-slate-400">
              {state.language === 'ar'
                ? `مرات الطباعة السابقة: ${invoice.reprintCount || 0}`
                : `Prior reprints: ${invoice.reprintCount || 0}`}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {invoice.paymentStatus !== 'PAID' && onPaymentRequested && (
              <button
                onClick={onPaymentRequested}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all"
              >
                <DollarSign className="w-4 h-4" />
                {state.language === 'ar' ? 'تسجيل تحصيل وسداد الفاتورة' : 'Register Payment'}
              </button>
            )}

            <button
              onClick={handleExecutePrint}
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-2 shadow-lg shadow-purple-900/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Printer className="w-4 h-4" />
              {isReprint
                ? state.language === 'ar'
                  ? 'إعادة طباعة نسخة طبق الأصل'
                  : 'Reprint Duplicate'
                : state.language === 'ar'
                ? 'طباعة الفاتورة الآن'
                : 'Print Invoice Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Reprint Reason Prompt Dialog (if reprint) */}
      {showReprintDialog && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-400 font-bold">
              <RotateCcw className="w-5 h-5" />
              <h3>{state.language === 'ar' ? 'تسجيل سبب إعادة طباعة الفاتورة' : 'Invoice Reprint Audit Reason'}</h3>
            </div>
            <p className="text-xs text-slate-300">
              {state.language === 'ar'
                ? 'وفقاً لسياسة الرقابة المالية، يتم تسجيل كل عملية إعادة طباعة للمستندات الضريبية مع هوية الموظف والسبب.'
                : 'According to financial audit policy, every reprint of finalized sales documents must be logged with employee ID and reason.'}
            </p>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                {state.language === 'ar' ? 'سبب إعادة الطباعة:' : 'Reason for Reprint:'}
              </label>
              <select
                value={reprintReason}
                onChange={(e) => setReprintReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white"
              >
                <option value="Customer requested duplicate copy">
                  طلب العميل نسخة إضافية (Customer requested duplicate)
                </option>
                <option value="Printer paper jam or damaged receipt">
                  انحشار الورق أو تلف النسخة المطبوعة (Paper jam / Damaged)
                </option>
                <option value="Delivery driver copy for dispatch">
                  نسخة لسائق التوصيل (Driver dispatch copy)
                </option>
                <option value="Accounting & branch archive copy">
                  أرشيف ومراجعة حسابات الفرع (Branch archive)
                </option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowReprintDialog(false)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white"
              >
                {state.language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleExecutePrint}
                className="px-5 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white"
              >
                {state.language === 'ar' ? 'تأكيد وإتمام الطباعة' : 'Confirm & Print'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
