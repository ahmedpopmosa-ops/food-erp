/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Thermal Receipt Modal with ETA/ZATCA E-Invoice QR Code
 * Supports both Single Orders & Multi-Order Consolidated Table Sessions (Pre-Bill & Final Paid Receipt)
 */

import React from 'react';
import { Order, TableSession } from '../../types';
import { useRestaurantStore } from '../../services/store';
import { translations, formatCurrency } from '../../lib/i18n';
import { generateQrMatrix } from '../../lib/qrCode';
import { Printer, X, CheckCircle2, AlertCircle, FileText } from 'lucide-react';

interface ThermalReceiptModalProps {
  order?: Order;
  session?: TableSession;
  orders?: Order[];
  invoiceNumber: string;
  isPreBill?: boolean;
  onClose: () => void;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  order,
  session,
  orders: propOrders,
  invoiceNumber,
  isPreBill = false,
  onClose,
}) => {
  const { state } = useRestaurantStore();
  const t = translations[state.language];

  // Resolve list of orders
  const allOrders: Order[] =
    propOrders ||
    (session
      ? state.orders.filter((o) => session.orderIds.includes(o.id) && o.status !== 'CANCELLED')
      : order
      ? [order]
      : []);

  const totalSubtotal = session
    ? session.consolidatedSubtotal
    : order
    ? order.subtotal
    : allOrders.reduce((sum, o) => sum + o.subtotal, 0);

  const totalDiscount = session
    ? session.consolidatedDiscount
    : order
    ? order.discountAmount
    : allOrders.reduce((sum, o) => sum + o.discountAmount, 0);

  const totalTax = session
    ? session.consolidatedTax
    : order
    ? order.taxAmount
    : allOrders.reduce((sum, o) => sum + o.taxAmount, 0);

  const totalServiceCharge = session
    ? session.consolidatedServiceCharge || 0
    : order
    ? order.serviceCharge || 0
    : allOrders.reduce((sum, o) => sum + (o.serviceCharge || 0), 0);

  const grandTotal = session
    ? session.consolidatedGrandTotal
    : order
    ? order.grandTotal
    : allOrders.reduce((sum, o) => sum + o.grandTotal, 0);

  const tableName = session?.tableNumber || order?.tableName || allOrders[0]?.tableName || '8';
  const cashierName = session?.waiterName || order?.cashierName || allOrders[0]?.cashierName || state.currentUser.fullNameEn;
  const paymentMethod = order?.paymentMethod || allOrders[0]?.paymentMethod || 'UNPAID';

  // Generate QR matrix for the receipt (ETA compliant)
  const qrData = `ETA|${state.tenant.taxRegistrationNumber}|${new Date().toISOString()}|${grandTotal}|${totalTax}`;
  const qrMatrix = generateQrMatrix(qrData, 25);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[95vh] animate-in fade-in duration-150">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2">
            {isPreBill ? (
              <>
                <FileText className="w-5 h-5 text-amber-400" />
                <span className="text-sm font-bold text-amber-300">
                  {state.language === 'ar' ? 'فاتورة ضيافة مبدئية (غير مدفوعة)' : 'Pre-Bill (Unpaid Invoice)'}
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-bold text-white">
                  {state.language === 'ar' ? 'تم إصدار الفاتورة الضريبية النهائية' : 'Final Tax Invoice Paid'}
                </span>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Thermal Receipt Container */}
        <div className="p-6 overflow-y-auto bg-slate-950/40 flex justify-center">
          <div
            id="thermal-receipt-printable"
            className="w-full max-w-[340px] bg-white text-slate-900 p-6 rounded-lg font-mono text-xs shadow-lg leading-relaxed select-text border border-slate-200"
            dir={state.language === 'ar' ? 'rtl' : 'ltr'}
          >
            {/* Pre-Bill Watermark Warning if unpaid */}
            {isPreBill && (
              <div className="mb-3 py-1.5 px-2 bg-amber-50 border-2 border-dashed border-amber-400 rounded text-center text-amber-900 font-bold text-[10px] uppercase">
                ⚠️ {state.language === 'ar' ? 'فاتورة مبدئية للمراجعة — غير مسددة' : 'PRE-BILL / UNPAID INVOICE'}
                <br />
                <span className="text-[9px] font-normal">
                  {state.language === 'ar'
                    ? 'لا تعتبر إيصال سداد ضريبي. الطاولة تظل مشغولة حتى الدفع.'
                    : 'Not a proof of payment. Table remains occupied.'}
                </span>
              </div>
            )}

            {/* Restaurant Brand Header */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-300">
              <h2 className="text-base font-black tracking-tight text-slate-950">
                {state.tenant.tradeNameAr}
              </h2>
              <p className="text-[11px] text-slate-600">{state.tenant.tradeNameEn}</p>
              <p className="text-[10px] text-slate-500">
                {state.language === 'ar' ? 'فرع المعادي الرئيسي — شارع 9' : 'Maadi Branch — Road 9, Cairo'}
              </p>
              <div className="pt-1 text-[10px] text-slate-600">
                <span>{state.language === 'ar' ? 'س.ت: ' : 'CR: '}{state.tenant.commercialRegister}</span>
                <span className="mx-1">·</span>
                <span>{state.language === 'ar' ? 'ت.ض: ' : 'TRN: '}{state.tenant.taxRegistrationNumber}</span>
              </div>
            </div>

            {/* Invoice Meta */}
            <div className="py-2.5 space-y-1 text-[11px] border-b border-dashed border-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">{state.language === 'ar' ? 'رقم الفاتورة:' : 'Invoice No:'}</span>
                <span className="font-bold">{invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{state.language === 'ar' ? 'التاريخ والوقت:' : 'Date & Time:'}</span>
                <span>{new Date().toLocaleTimeString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{state.language === 'ar' ? 'الكاشير/المضيف:' : 'Cashier/Waiter:'}</span>
                <span>{cashierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{state.language === 'ar' ? 'الطاولة / الجلسة:' : 'Table / Session:'}</span>
                <span className="font-bold text-purple-700">
                  {state.language === 'ar' ? `طاولة ${tableName}` : `Table ${tableName}`}
                  {allOrders.length > 1 && ` (${allOrders.length} orders)`}
                </span>
              </div>
            </div>

            {/* Multi-Order Breakdown Items */}
            <div className="py-3 border-b border-dashed border-slate-300 space-y-3">
              {allOrders.map((ord, oIdx) => (
                <div key={ord.id} className="space-y-1.5">
                  {allOrders.length > 1 && (
                    <div className="flex items-center justify-between text-[10px] font-bold text-[#5A24CA] bg-purple-50 px-2 py-0.5 rounded">
                      <span>
                        {state.language === 'ar' ? `الطلب #${ord.orderNumber}` : `Order #${ord.orderNumber}`}
                        {ord.isAdditionalOrder && ` (${state.language === 'ar' ? 'إضافي' : 'Additional'})`}
                      </span>
                      <span>
                        {formatCurrency(ord.grandTotal, state.language, state.tenant.currency)}
                      </span>
                    </div>
                  )}

                  <div className="space-y-1 pt-0.5">
                    {ord.items.map((item, idx) => (
                      <div key={idx} className="space-y-0.5">
                        <div className="flex justify-between font-medium">
                          <span>
                            {item.quantity} × {state.language === 'ar' ? item.productNameAr : item.productNameEn}
                          </span>
                          <span className="font-bold tabular-nums">
                            {formatCurrency(item.totalPrice, state.language, state.tenant.currency)}
                          </span>
                        </div>
                        {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                          <div className="text-[10px] text-slate-500 ps-3">
                            {item.selectedModifiers
                              .map((m) => (state.language === 'ar' ? m.optionNameAr : m.optionNameEn))
                              .join(' + ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Financial Summary */}
            <div className="py-2.5 space-y-1 text-[11px] border-b border-dashed border-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-600">{t.subtotal}</span>
                <span className="tabular-nums font-semibold">
                  {formatCurrency(totalSubtotal, state.language, state.tenant.currency)}
                </span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>{t.discount}</span>
                  <span className="tabular-nums">-{formatCurrency(totalDiscount, state.language, state.tenant.currency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">{t.vat14} (15%)</span>
                <span className="tabular-nums font-semibold">
                  {formatCurrency(totalTax, state.language, state.tenant.currency)}
                </span>
              </div>
              {totalServiceCharge > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">{state.language === 'ar' ? 'خدمة الصالة' : 'Service Charge'}</span>
                  <span className="tabular-nums font-semibold">
                    {formatCurrency(totalServiceCharge, state.language, state.tenant.currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black pt-1 border-t border-slate-200">
                <span>{state.language === 'ar' ? 'الإجمالي الموحد' : 'Unified Total'}</span>
                <span className="tabular-nums text-[#5A24CA]">
                  {formatCurrency(grandTotal, state.language, state.tenant.currency)}
                </span>
              </div>
              <div className="flex justify-between text-[10px] pt-1">
                <span className="text-slate-500">{state.language === 'ar' ? 'حالة السداد:' : 'Payment Status:'}</span>
                <span className={`font-bold ${isPreBill ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {isPreBill ? (state.language === 'ar' ? 'غير مسدد (ضيافة)' : 'UNPAID (Pre-Bill)') : (state.language === 'ar' ? 'مدفوع بالكامل' : 'PAID IN FULL')}
                </span>
              </div>
            </div>

            {/* QR Code & ETA Compliance */}
            <div className="pt-4 pb-2 flex flex-col items-center justify-center space-y-2">
              <div className="p-1.5 bg-white border border-slate-300 rounded shadow-xs inline-block">
                <svg
                  width="105"
                  height="105"
                  viewBox="0 0 25 25"
                  className="shape-rendering-crispEdges"
                >
                  {qrMatrix.map((row, y) =>
                    row.map((cell, x) =>
                      cell ? (
                        <rect
                          key={`${x}-${y}`}
                          x={x}
                          y={y}
                          width="1"
                          height="1"
                          fill="#0F172A"
                        />
                      ) : null
                    )
                  )}
                </svg>
              </div>
              <span className="text-[9px] text-slate-500 text-center leading-tight">
                {state.language === 'ar'
                  ? 'فاتورة إلكترونية معتمدة من مصلحة الضرائب المصرية'
                  : 'Egyptian Tax Authority (ETA) Compliant E-Invoice'}
              </span>
            </div>

            {/* Footer Blessing */}
            <div className="pt-2 text-center text-[10px] text-slate-500 border-t border-slate-200">
              <p>{state.language === 'ar' ? 'شكراً لزيارتكم ونتمنى لكم وجبة شهية!' : 'Thank you! Enjoy your meal!'}</p>
              <p className="text-[9px] text-slate-400 mt-0.5">Powered by RestaurantOS SaaS</p>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold transition-colors"
          >
            {t.close}
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-md active:scale-95 text-xs"
          >
            <Printer className="w-4 h-4" />
            <span>{isPreBill ? (state.language === 'ar' ? 'طباعة فاتورة الضيافة' : 'Print Pre-Bill') : t.printReceipt}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
