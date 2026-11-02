/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Multi-Tender Payment & Split-Bill Modal
 * Supports both individual Orders and Consolidated Table Sessions
 */

import React, { useState } from 'react';
import { Order, TableSession, PaymentMethod } from '../../types';
import { useRestaurantStore } from '../../services/store';
import { translations, formatCurrency } from '../../lib/i18n';
import {
  X,
  Banknote,
  CreditCard,
  Smartphone,
  Split,
  CheckCircle2,
  Receipt,
  ArrowRight,
  Utensils,
} from 'lucide-react';

interface PaymentModalProps {
  order?: Order;
  session?: TableSession;
  onClose: () => void;
  onPaymentSuccess: (invoiceNumber: string) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  order,
  session,
  onClose,
  onPaymentSuccess,
}) => {
  const { state, finalizeOrderAndPay, finalizeSessionPayment } = useRestaurantStore();
  const t = translations[state.language];

  // Resolve active session or order
  const activeSession = session || (order?.sessionId ? state.tableSessions.find((s) => s.id === order.sessionId) : undefined);

  const payableTotal = activeSession
    ? activeSession.consolidatedGrandTotal
    : order
    ? order.grandTotal
    : 0;

  const payableTax = activeSession
    ? activeSession.consolidatedTax
    : order
    ? order.taxAmount
    : 0;

  const orderNumberOrTable = activeSession
    ? `Table ${activeSession.tableNumber}`
    : order?.tableName
    ? `Table ${order.tableName}`
    : order?.orderNumber || '001';

  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [tenderedInput, setTenderedInput] = useState<string>(payableTotal.toString());
  const [splitCount, setSplitCount] = useState<number>(2);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tenderedAmount = parseFloat(tenderedInput) || 0;
  const changeAmount = Math.max(0, tenderedAmount - payableTotal);
  const isCashSufficient = method !== 'CASH' || tenderedAmount >= payableTotal;

  // Quick denomination adders in Egyptian Pounds
  const addCash = (amount: number) => {
    const current = parseFloat(tenderedInput) || 0;
    setTenderedInput((current + amount).toString());
  };

  const handlePay = () => {
    if (!isCashSufficient) return;
    setIsSubmitting(true);

    let result: { success: boolean; invoiceNumber: string; error?: string };

    if (activeSession) {
      result = finalizeSessionPayment(
        activeSession.id,
        method,
        tenderedAmount,
        changeAmount
      );
    } else if (order) {
      result = finalizeOrderAndPay(
        order.id,
        method,
        tenderedAmount,
        changeAmount
      );
    } else {
      result = { success: false, invoiceNumber: '', error: 'No order or session provided' };
    }

    setIsSubmitting(false);
    if (result.success) {
      onPaymentSuccess(result.invoiceNumber);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-in fade-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white">
                {activeSession
                  ? state.language === 'ar'
                    ? `سداد حساب طاولة ${activeSession.tableNumber}`
                    : `Pay Table ${activeSession.tableNumber} Session`
                  : t.payNow}
              </h3>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-800/80">
                {orderNumberOrTable}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {activeSession
                ? `${state.language === 'ar' ? 'جلسة طعام موحدة' : 'Unified Table Session'} · ${activeSession.orderIds.length} ${state.language === 'ar' ? 'طلبات' : 'orders'}`
                : order?.tableName
                ? `${t.tableNumber}: ${order.tableName} · ${order.items.length} ${t.item}`
                : `${order?.orderType || 'ORDER'} · ${order?.items.length || 0} ${t.item}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Total Payable Summary Card */}
          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/80 flex items-center justify-between shadow-inner">
            <div>
              <span className="text-xs text-slate-400 block font-bold uppercase">
                {state.language === 'ar' ? 'إجمالي المبلغ المستحق للدفع' : 'Total Payable'}
              </span>
              <span className="text-xs text-slate-400">
                ({t.vat14}: {formatCurrency(payableTax, state.language, state.tenant.currency)})
              </span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black font-mono tabular-nums text-emerald-400">
                {formatCurrency(payableTotal, state.language, state.tenant.currency)}
              </span>
            </div>
          </div>

          {/* Payment Method Tabs */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">
              {state.language === 'ar' ? 'طريقة السداد' : 'Tender Method'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMethod('CASH');
                  setTenderedInput(payableTotal.toString());
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition-all ${
                  method === 'CASH'
                    ? 'bg-emerald-950/80 border-emerald-500 text-white shadow-sm ring-1 ring-emerald-500'
                    : 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Banknote className="w-5 h-5 mb-1.5 text-emerald-400" />
                <span>{t.cash}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMethod('CARD');
                  setTenderedInput(payableTotal.toString());
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition-all ${
                  method === 'CARD'
                    ? 'bg-blue-950/80 border-blue-500 text-white shadow-sm ring-1 ring-blue-500'
                    : 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <CreditCard className="w-5 h-5 mb-1.5 text-blue-400" />
                <span>{t.card}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMethod('INSTAPAY');
                  setTenderedInput(payableTotal.toString());
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition-all ${
                  method === 'INSTAPAY'
                    ? 'bg-purple-950/80 border-purple-500 text-white shadow-sm ring-1 ring-purple-500'
                    : 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Smartphone className="w-5 h-5 mb-1.5 text-purple-400" />
                <span>{t.instapay}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMethod('SPLIT');
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-medium transition-all ${
                  method === 'SPLIT'
                    ? 'bg-amber-950/80 border-amber-500 text-white shadow-sm ring-1 ring-amber-500'
                    : 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Split className="w-5 h-5 mb-1.5 text-amber-400" />
                <span>{t.splitBill}</span>
              </button>
            </div>
          </div>

          {/* Cash Denomination & Tender Input */}
          {method === 'CASH' && (
            <div className="space-y-4 p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  {t.tendered}
                </span>
                <button
                  type="button"
                  onClick={() => setTenderedInput(payableTotal.toString())}
                  className="text-xs text-emerald-400 hover:underline font-bold"
                >
                  {t.exactAmount}
                </button>
              </div>

              {/* Number Input */}
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  value={tenderedInput}
                  onChange={(e) => setTenderedInput(e.target.value)}
                  className="w-full text-2xl font-bold font-mono tabular-nums px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 text-center"
                />
                <span className="absolute left-4 top-4 text-xs font-bold text-slate-400 font-mono">
                  {state.tenant.currency}
                </span>
              </div>

              {/* Quick EGP Bill Buttons */}
              <div className="grid grid-cols-4 gap-2">
                {[50, 100, 200, 500].map((denomination) => (
                  <button
                    key={denomination}
                    type="button"
                    onClick={() => addCash(denomination)}
                    className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono font-bold text-xs rounded-xl transition-colors active:scale-95"
                  >
                    +{denomination}
                  </button>
                ))}
              </div>

              {/* Change calculation */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-800">
                <span className="text-xs text-slate-400">{t.changeDue}</span>
                <span
                  className={`text-lg font-bold font-mono tabular-nums ${
                    changeAmount > 0 ? 'text-amber-400' : 'text-slate-400'
                  }`}
                >
                  {formatCurrency(changeAmount, state.language, state.tenant.currency)}
                </span>
              </div>

              {!isCashSufficient && (
                <p className="text-xs text-rose-400 text-center font-bold">
                  {state.language === 'ar'
                    ? 'المبلغ المستلم أقل من قيمة الفاتورة المستحقة'
                    : 'Tendered amount is less than total payable'}
                </p>
              )}
            </div>
          )}

          {/* Split Bill Calculator */}
          {method === 'SPLIT' && (
            <div className="space-y-4 p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-xs font-semibold text-slate-300 block">
                {state.language === 'ar' ? 'تقسيم بالتساوي بين الضيوف' : 'Split Equally Between Guests'}
              </span>
              <div className="flex items-center justify-center gap-3">
                {[2, 3, 4, 5, 6].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setSplitCount(count)}
                    className={`w-12 h-10 rounded-xl font-bold font-mono text-sm border transition-all ${
                      splitCount === count
                        ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-md'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <div className="p-3 bg-slate-900 rounded-xl text-center border border-slate-800">
                <span className="text-xs text-slate-400 block">
                  {state.language === 'ar' ? 'نصيب كل ضيف' : 'Amount per Guest'}
                </span>
                <span className="text-xl font-black font-mono tabular-nums text-amber-400">
                  {formatCurrency(payableTotal / splitCount, state.language, state.tenant.currency)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold transition-colors"
          >
            {t.cancel}
          </button>

          <button
            type="button"
            disabled={!isCashSufficient || isSubmitting}
            onClick={handlePay}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg active:scale-95 ${
              isCashSufficient && !isSubmitting
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {state.language === 'ar'
                ? 'تأكيد السداد وإصدار الفاتورة وتفريغ الطاولة'
                : 'Confirm Payment & Close Table'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
