/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Kitchen Display System (KDS) & Bump Station
 * Supports separate additional order tickets, course indicators, and station routing
 */

import React, { useState, useEffect } from 'react';
import { useRestaurantStore } from '../../services/store';
import { translations } from '../../lib/i18n';
import {
  Flame,
  Salad,
  CupSoda,
  Check,
  CheckCheck,
  Clock,
  Utensils,
  AlertCircle,
  Bell,
  Plus,
} from 'lucide-react';

export const KitchenDisplay: React.FC = () => {
  const { state, bumpKitchenItem, bumpEntireOrder } = useRestaurantStore();
  const t = translations[state.language];

  const [activeStation, setActiveStation] = useState<string>('ALL');
  const [nowTimestamp, setNowTimestamp] = useState(Date.now());

  // Clock tick every 10 seconds for ticket timers
  useEffect(() => {
    const timer = setInterval(() => setNowTimestamp(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // Filter orders that are active in kitchen (SENT_TO_KITCHEN or READY)
  const activeOrders = state.orders.filter(
    (o) => o.status === 'SENT_TO_KITCHEN' || o.status === 'READY'
  );

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-60px)] bg-slate-950 text-slate-100 select-none overflow-hidden">
      {/* Top Station Selector & Stats */}
      <div className="p-3.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-600/20 border border-amber-600/40 flex items-center justify-center text-amber-400">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">{t.kdsTitle}</h2>
            <span className="text-[11px] text-slate-400">
              {activeOrders.length}{' '}
              {state.language === 'ar' ? 'تذاكر نشطة على خط التجهيز' : 'active orders in kitchen'}
            </span>
          </div>
        </div>

        {/* Station Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveStation('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeStation === 'ALL'
                ? 'bg-amber-600 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.stationAll}
          </button>

          <button
            onClick={() => setActiveStation('GRILL')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeStation === 'GRILL'
                ? 'bg-amber-600 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>{t.stationGrill}</span>
          </button>

          <button
            onClick={() => setActiveStation('COLD')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeStation === 'COLD'
                ? 'bg-amber-600 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Salad className="w-3.5 h-3.5" />
            <span>{t.stationCold}</span>
          </button>

          <button
            onClick={() => setActiveStation('BEVERAGE')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeStation === 'BEVERAGE'
                ? 'bg-amber-600 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CupSoda className="w-3.5 h-3.5" />
            <span>{t.stationBeverage}</span>
          </button>
        </div>
      </div>

      {/* Ticket Grid View */}
      <div className="flex-1 p-5 overflow-y-auto">
        {activeOrders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center">
            <CheckCheck className="w-12 h-12 mb-3 stroke-1 text-emerald-500/60" />
            <h3 className="text-base font-bold text-slate-300 mb-1">
              {state.language === 'ar' ? 'خط التجهيز مكتمل بالكامل' : 'All Kitchen Tickets Bumped'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm">
              {state.language === 'ar'
                ? 'لا توجد طلبات معلقة حالياً في المطبخ، ستظهر الطلبات فور تأكيدها من شاشة الكاشير.'
                : 'No pending orders in the kitchen. New orders will appear here in real time.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {activeOrders.map((order) => {
              // Calculate elapsed minutes
              const createdTime = new Date(order.createdAt).getTime();
              const elapsedMinutes = Math.floor((nowTimestamp - createdTime) / 60000);

              // SLA urgency color
              const headerColor =
                elapsedMinutes > 15
                  ? 'bg-rose-950/90 border-rose-800 text-rose-300'
                  : elapsedMinutes > 8
                  ? 'bg-amber-950/90 border-amber-800 text-amber-300'
                  : 'bg-slate-800 border-slate-700 text-slate-200';

              const filteredItems =
                activeStation === 'ALL'
                  ? order.items
                  : order.items.filter((i) => i.prepStation === activeStation);

              if (filteredItems.length === 0) return null;

              const isOrderReady = order.status === 'READY';

              return (
                <div
                  key={order.id}
                  className={`bg-slate-900 border rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between transition-all ${
                    isOrderReady
                      ? 'border-emerald-600/80 ring-1 ring-emerald-500'
                      : order.isAdditionalOrder
                      ? 'border-amber-600/70 ring-1 ring-amber-500/40'
                      : 'border-slate-800'
                  }`}
                >
                  <div>
                    {/* Ticket Header */}
                    <div className={`p-3.5 border-b flex items-center justify-between ${headerColor}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black font-mono tracking-tight">
                          #{order.orderNumber}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-950/40">
                          {order.tableName ? `${t.tableNumber} ${order.tableName}` : order.orderType}
                        </span>
                        {order.isAdditionalOrder && (
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 flex items-center gap-0.5">
                            <Plus className="w-2.5 h-2.5 stroke-[3]" />
                            <span>{state.language === 'ar' ? 'طلب إضافي' : 'ADDITIONAL'}</span>
                          </span>
                        )}
                      </div>

                      {/* Elapsed Timer Badge */}
                      <div className="flex items-center gap-1 font-mono text-xs font-bold tabular-nums">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{elapsedMinutes}m</span>
                      </div>
                    </div>

                    {/* Ticket Items */}
                    <div className="p-3.5 space-y-2.5">
                      {filteredItems.map((item) => {
                        const isReady = item.kitchenStatus === 'READY';
                        const isPrep = item.kitchenStatus === 'PREPARING';

                        return (
                          <div
                            key={item.id}
                            onClick={() => bumpKitchenItem(order.id, item.id)}
                            className={`p-3 rounded-xl border cursor-pointer transition-all ${
                              isReady
                                ? 'bg-emerald-950/40 border-emerald-800/80 opacity-70 line-through text-slate-400'
                                : isPrep
                                ? 'bg-amber-950/30 border-amber-600/60 text-white'
                                : 'bg-slate-950 border-slate-800 text-slate-200 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center font-mono font-black text-xs text-amber-400">
                                  {item.quantity}
                                </span>
                                <span className="font-bold text-xs">
                                  {state.language === 'ar' ? item.productNameAr : item.productNameEn}
                                </span>
                              </div>
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  isReady
                                    ? 'bg-emerald-900/60 text-emerald-300'
                                    : isPrep
                                    ? 'bg-amber-900/60 text-amber-300'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {isReady
                                  ? t.ticketReady
                                  : isPrep
                                  ? t.ticketPrep
                                  : t.ticketWaiting}
                              </span>
                            </div>

                            {/* Modifiers List */}
                            {item.selectedModifiers.length > 0 && (
                              <div className="mt-1 text-[11px] text-amber-300/80 ps-8">
                                {item.selectedModifiers
                                  .map((m) => (state.language === 'ar' ? m.optionNameAr : m.optionNameEn))
                                  .join(', ')}
                              </div>
                            )}

                            {/* Notes */}
                            {item.notes && (
                              <div className="mt-1 text-[11px] text-rose-300 ps-8 font-semibold">
                                * {item.notes}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bump Whole Order Button */}
                  <div className="p-3.5 bg-slate-950 border-t border-slate-800">
                    <button
                      onClick={() => bumpEntireOrder(order.id)}
                      className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 ${
                        isOrderReady
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950'
                      }`}
                    >
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      <span>{isOrderReady ? (state.language === 'ar' ? 'تم تسليم الطلب' : 'Order Ready') : t.bumpTicket}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
