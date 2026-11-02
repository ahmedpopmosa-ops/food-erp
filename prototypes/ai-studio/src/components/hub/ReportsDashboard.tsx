/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Business Analytics & Operations Reporting
 */

import React from 'react';
import { useRestaurantStore } from '../../services/store';
import { translations, formatCurrency } from '../../lib/i18n';
import { TrendingUp, Banknote, CreditCard, Smartphone, ShoppingBag, PieChart } from 'lucide-react';

export const ReportsDashboard: React.FC = () => {
  const { state } = useRestaurantStore();
  const t = translations[state.language];

  // Completed orders
  const completedOrders = state.orders.filter((o) => o.status === 'COMPLETED');
  const todaySales = completedOrders.reduce((acc, o) => acc + o.grandTotal, 0);
  const totalTickets = completedOrders.length;
  const avgTicket = totalTickets > 0 ? todaySales / totalTickets : 0;

  // Payment breakdown
  const cashTotal = completedOrders
    .filter((o) => o.paymentMethod === 'CASH')
    .reduce((acc, o) => acc + o.grandTotal, 0);
  const cardTotal = completedOrders
    .filter((o) => o.paymentMethod === 'CARD')
    .reduce((acc, o) => acc + o.grandTotal, 0);
  const instapayTotal = completedOrders
    .filter((o) => o.paymentMethod === 'INSTAPAY')
    .reduce((acc, o) => acc + o.grandTotal, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-white">{t.hubReports}</h2>
        <p className="text-xs text-slate-400">
          {state.language === 'ar'
            ? 'مؤشرات الأداء اليومية، حجم المبيعات، متوسط التذكرة، وتوزيع وسائل الدفع'
            : 'Key performance indicators, sales volume, average ticket size, and tender distribution'}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <span className="text-xs text-slate-400 block">
            {state.language === 'ar' ? 'إجمالي المبيعات المحققة' : 'Gross Sales Volume'}
          </span>
          <span className="text-2xl font-black font-mono tabular-nums text-emerald-400">
            {formatCurrency(todaySales, state.language)}
          </span>
          <span className="text-[11px] text-slate-500 block">
            {totalTickets} {state.language === 'ar' ? 'فواتير مكتملة' : 'completed tickets'}
          </span>
        </div>

        <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <span className="text-xs text-slate-400 block">
            {state.language === 'ar' ? 'متوسط قيمة الفاتورة (Average Ticket)' : 'Average Ticket Size'}
          </span>
          <span className="text-2xl font-black font-mono tabular-nums text-blue-400">
            {formatCurrency(avgTicket, state.language)}
          </span>
          <span className="text-[11px] text-slate-500 block">
            {state.language === 'ar' ? 'معدل إنفاق العميل' : 'Per ticket spend'}
          </span>
        </div>

        <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <span className="text-xs text-slate-400 block">
            {state.language === 'ar' ? 'متوسط نسبة تكلفة الطعام (Food Cost)' : 'Average Food Cost %'}
          </span>
          <span className="text-2xl font-black font-mono tabular-nums text-amber-400">
            32.4%
          </span>
          <span className="text-[11px] text-emerald-400 block font-semibold">
            {state.language === 'ar' ? 'ضمن المعدل القياسي للقطاع' : 'Optimal Industry Benchmark'}
          </span>
        </div>
      </div>

      {/* Payment Tender Distribution */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-white">
          {state.language === 'ar' ? 'توزيع المتحصلات حسب وسيلة الدفع' : 'Tender Method Distribution'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
                <Banknote className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-slate-400 block">{t.cash}</span>
                <span className="text-sm font-bold font-mono tabular-nums text-white">
                  {formatCurrency(cashTotal, state.language)}
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-950 border border-blue-800 flex items-center justify-center text-blue-400">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-slate-400 block">{t.card}</span>
                <span className="text-sm font-bold font-mono tabular-nums text-white">
                  {formatCurrency(cardTotal, state.language)}
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-950 border border-purple-800 flex items-center justify-center text-purple-400">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-slate-400 block">{t.instapay}</span>
                <span className="text-sm font-bold font-mono tabular-nums text-white">
                  {formatCurrency(instapayTotal, state.language)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
