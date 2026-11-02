/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Foodics Active Tables Management Modal
 * Real-time monitoring of all occupied tables, sessions, kitchen status, and bill states
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  Clock,
  DollarSign,
  UtensilsCrossed,
  ChefHat,
  Receipt,
  Plus,
  ArrowRight,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Flame,
  CreditCard,
  Eye,
} from 'lucide-react';
import { RestaurantTable, TableSession, TableStatus } from '../../types';
import { useRestaurantStore } from '../../services/store';
import { formatCurrency, translations } from '../../lib/i18n';

interface ActiveTablesModalProps {
  onClose: () => void;
  onSelectSession: (session: TableSession) => void;
  onAddAdditionalOrder: (tableId: string) => void;
  onRequestBill: (sessionId: string) => void;
  onPaySession: (session: TableSession) => void;
}

export const ActiveTablesModal: React.FC<ActiveTablesModalProps> = ({
  onClose,
  onSelectSession,
  onAddAdditionalOrder,
  onRequestBill,
  onPaySession,
}) => {
  const { state } = useRestaurantStore();
  const t = translations[state.language];

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ADDITIONAL' | 'KITCHEN' | 'BILL_REQUESTED'>('ALL');
  const [nowTime, setNowTime] = useState(Date.now());

  // Update timer every 15 seconds to refresh elapsed time
  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Helper to format elapsed time in minutes/hours
  const formatElapsed = (startedAt: string) => {
    const diffMs = nowTime - new Date(startedAt).getTime();
    if (diffMs < 0) return 'Just now';
    const totalMinutes = Math.floor(diffMs / 60000);
    if (totalMinutes < 60) {
      return `${totalMinutes} min`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}h ${mins}m`;
  };

  // Find active sessions that are not closed
  const activeSessions = state.tableSessions.filter(
    (s) => s.status !== 'CLOSED' && s.status !== 'PAID'
  );

  // Link tables to sessions
  const tableData = activeSessions.map((session) => {
    const table = state.tables.find((t) => t.id === session.tableId);
    const sessionOrders = state.orders.filter(
      (o) => session.orderIds.includes(o.id) && o.status !== 'CANCELLED'
    );
    const totalItemsCount = sessionOrders.reduce(
      (acc, ord) => acc + ord.items.reduce((sum, item) => sum + item.quantity, 0),
      0
    );

    return {
      session,
      table,
      orders: sessionOrders,
      totalItemsCount,
    };
  });

  // Filter based on search and status
  const filteredData = tableData.filter(({ session, table }) => {
    const matchesSearch =
      !search ||
      session.tableNumber.toLowerCase().includes(search.toLowerCase()) ||
      session.waiterName.toLowerCase().includes(search.toLowerCase()) ||
      (table && (table.sectionEn.toLowerCase().includes(search.toLowerCase()) || table.sectionAr.includes(search)));

    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'ACTIVE') return session.status === 'ORDER_SENT';
    if (statusFilter === 'ADDITIONAL') return session.status === 'ADDITIONAL_ORDER';
    if (statusFilter === 'KITCHEN') return session.kitchenStatus === 'PREPARING';
    if (statusFilter === 'BILL_REQUESTED') return session.status === 'BILL_REQUESTED';
    return true;
  });

  // Status visual indicator helper
  // Green: Active order
  // Orange: Additional order
  // Blue: Preparing / Ready
  // Red: Bill requested
  // Gray: Available
  const getStatusBadge = (session: TableSession) => {
    switch (session.status) {
      case 'BILL_REQUESTED':
        return {
          colorClass: 'bg-rose-500 text-white',
          borderClass: 'border-rose-400',
          bgCard: 'bg-rose-50/40 border-rose-200',
          dotClass: 'bg-rose-500 animate-pulse',
          labelEn: 'Bill Requested',
          labelAr: 'طلب الحساب',
          icon: Receipt,
        };
      case 'ADDITIONAL_ORDER':
        return {
          colorClass: 'bg-amber-500 text-white',
          borderClass: 'border-amber-400',
          bgCard: 'bg-amber-50/40 border-amber-200',
          dotClass: 'bg-amber-500',
          labelEn: 'Additional Order',
          labelAr: 'طلب إضافي',
          icon: Plus,
        };
      case 'ORDER_SENT':
      default:
        if (session.kitchenStatus === 'PREPARING') {
          return {
            colorClass: 'bg-blue-600 text-white',
            borderClass: 'border-blue-400',
            bgCard: 'bg-blue-50/40 border-blue-200',
            dotClass: 'bg-blue-500 animate-pulse',
            labelEn: 'Kitchen Preparing',
            labelAr: 'جاري التجهيز',
            icon: ChefHat,
          };
        }
        return {
          colorClass: 'bg-emerald-600 text-white',
          borderClass: 'border-emerald-400',
          bgCard: 'bg-emerald-50/40 border-emerald-200',
          dotClass: 'bg-emerald-500',
          labelEn: 'Active Order',
          labelAr: 'طلب نشط',
          icon: UtensilsCrossed,
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-5xl h-[88vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <div className="px-6 py-4 bg-[#5A24CA] text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <UtensilsCrossed className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-tight">
                  {state.language === 'ar' ? 'الطاولات النشطة' : 'Active Dining Tables'}
                </h2>
                <span className="bg-white/20 text-white px-2.5 py-0.5 rounded-full text-xs font-black">
                  {activeSessions.length} {state.language === 'ar' ? 'طاولة مشغولة' : 'Occupied'}
                </span>
              </div>
              <p className="text-xs text-white/75 mt-0.5">
                {state.language === 'ar'
                  ? 'متابعة مباشرة لجلسات الطاولات والطلبات الإضافية وفواتير الضيافة'
                  : 'Live monitoring of dining sessions, additional courses, and bills'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters and Search Bar */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          {/* Status Filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                statusFilter === 'ALL'
                  ? 'bg-[#5A24CA] text-white shadow'
                  : 'bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200'
              }`}
            >
              <span>{state.language === 'ar' ? 'الكل' : 'All'}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20">
                {activeSessions.length}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                statusFilter === 'ACTIVE'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-white text-emerald-800 hover:bg-emerald-50 border border-emerald-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>{state.language === 'ar' ? 'طلبات نشطة' : 'Active'}</span>
            </button>

            <button
              onClick={() => setStatusFilter('ADDITIONAL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                statusFilter === 'ADDITIONAL'
                  ? 'bg-amber-600 text-white shadow'
                  : 'bg-white text-amber-800 hover:bg-amber-50 border border-amber-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>{state.language === 'ar' ? 'طلبات إضافية' : 'Additional Orders'}</span>
            </button>

            <button
              onClick={() => setStatusFilter('KITCHEN')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                statusFilter === 'KITCHEN'
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-white text-blue-800 hover:bg-blue-50 border border-blue-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>{state.language === 'ar' ? 'في المطبخ' : 'In Kitchen'}</span>
            </button>

            <button
              onClick={() => setStatusFilter('BILL_REQUESTED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                statusFilter === 'BILL_REQUESTED'
                  ? 'bg-rose-600 text-white shadow'
                  : 'bg-white text-rose-800 hover:bg-rose-50 border border-rose-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span>{state.language === 'ar' ? 'مطلوب الحساب' : 'Bill Requested'}</span>
            </button>
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={state.language === 'ar' ? 'بحث برقم الطاولة أو الويتر...' : 'Search table or waiter...'}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-[#5A24CA] focus:outline-none"
            />
          </div>
        </div>

        {/* Cards Grid */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-100/50">
          {filteredData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <UtensilsCrossed className="w-16 h-16 stroke-1 text-slate-300 mb-3" />
              <h4 className="text-base font-bold text-slate-700">
                {state.language === 'ar' ? 'لا توجد طاولات نشطة مطابقة' : 'No Active Tables Found'}
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                {state.language === 'ar'
                  ? 'كل الطاولات شاغرة ومتاحة لاستقبال طلبات جديدة'
                  : 'All tables in this section are currently vacant and available'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredData.map(({ session, table, orders, totalItemsCount }) => {
                const badge = getStatusBadge(session);
                const BadgeIcon = badge.icon;

                return (
                  <div
                    key={session.id}
                    className={`rounded-2xl p-4.5 border-2 transition-all shadow-sm hover:shadow-md bg-white ${badge.borderClass} flex flex-col justify-between`}
                  >
                    <div>
                      {/* Top Header: Table # and Status Badge */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-11 h-11 rounded-xl bg-[#5A24CA] text-white flex items-center justify-center font-black text-xl shadow-sm">
                            {session.tableNumber}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 text-sm">
                                {state.language === 'ar' ? `طاولة ${session.tableNumber}` : `Table ${session.tableNumber}`}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-400">
                                ({table?.sectionEn || 'Main Hall'})
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                              <Users className="w-3 h-3 text-slate-400" />
                              <span>{session.guestCount} {state.language === 'ar' ? 'أفراد' : 'Guests'}</span>
                              <span className="mx-1 text-slate-300">·</span>
                              <span>{session.waiterName}</span>
                            </div>
                          </div>
                        </div>

                        {/* Visual Color + Text Badge */}
                        <div
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${badge.colorClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
                          <BadgeIcon className="w-3 h-3" />
                          <span>{state.language === 'ar' ? badge.labelAr : badge.labelEn}</span>
                        </div>
                      </div>

                      {/* Middle Stats: Time elapsed, Orders count, Items count */}
                      <div className="grid grid-cols-3 gap-2 py-3 border-b border-slate-100 text-center">
                        <div className="bg-slate-50 p-2 rounded-xl">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">
                            {state.language === 'ar' ? 'المدة' : 'Elapsed'}
                          </span>
                          <div className="flex items-center justify-center gap-1 text-xs font-bold text-slate-700 mt-0.5">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{formatElapsed(session.openedAt)}</span>
                          </div>
                        </div>

                        <div className="bg-slate-50 p-2 rounded-xl">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">
                            {state.language === 'ar' ? 'الطلبات' : 'Orders'}
                          </span>
                          <span className="text-xs font-bold text-slate-800 mt-0.5 block">
                            {orders.length} {state.language === 'ar' ? 'طلبات' : 'courses'}
                          </span>
                        </div>

                        <div className="bg-slate-50 p-2 rounded-xl">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">
                            {state.language === 'ar' ? 'الأصناف' : 'Items'}
                          </span>
                          <span className="text-xs font-bold text-slate-800 mt-0.5 block">
                            {totalItemsCount} {state.language === 'ar' ? 'صنف' : 'items'}
                          </span>
                        </div>
                      </div>

                      {/* Orders Preview List */}
                      <div className="py-2.5 space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {state.language === 'ar' ? 'تفاصيل الطلبات بالجلسة:' : 'Session Orders Breakdown:'}
                        </span>
                        {orders.map((ord) => (
                          <div
                            key={ord.id}
                            className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-50/80 hover:bg-slate-100 transition-colors"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-[#5A24CA]">
                                #{ord.orderNumber}
                              </span>
                              {ord.isAdditionalOrder && (
                                <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.2 rounded font-bold">
                                  {state.language === 'ar' ? 'إضافي' : 'Additional'}
                                </span>
                              )}
                              <span className="text-slate-500 text-[11px]">
                                ({ord.items.length} items)
                              </span>
                            </div>
                            <span className="font-mono font-bold text-slate-700">
                              {formatCurrency(ord.grandTotal, state.language, state.tenant.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bottom Unified Total & Quick Actions */}
                    <div className="pt-3 border-t border-slate-100 mt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase">
                            {state.language === 'ar' ? 'إجمالي الحساب الموحد' : 'Unified Session Total'}
                          </span>
                          {session.invoiceNumber && (
                            <span className="block text-[10px] font-mono text-slate-500 font-semibold">
                              {session.invoiceNumber}
                            </span>
                          )}
                        </div>
                        <span className="text-base font-black font-mono text-[#5A24CA]">
                          {formatCurrency(session.consolidatedGrandTotal, state.language, state.tenant.currency)}
                        </span>
                      </div>

                      {/* Quick Action Buttons */}
                      <div className="grid grid-cols-3 gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => onSelectSession(session)}
                          className="py-2 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                          title="View Full Session Details"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-600" />
                          <span>{state.language === 'ar' ? 'التفاصيل' : 'Details'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (table) {
                              onAddAdditionalOrder(table.id);
                              onClose();
                            }
                          }}
                          className="py-2 px-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                          title="Add Additional Order to this table"
                        >
                          <Plus className="w-3.5 h-3.5 text-amber-700" />
                          <span>{state.language === 'ar' ? '+ طلب إضافي' : '+ Add Order'}</span>
                        </button>

                        {session.status === 'BILL_REQUESTED' ? (
                          <button
                            type="button"
                            onClick={() => {
                              onPaySession(session);
                              onClose();
                            }}
                            className="py-2 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-colors shadow-sm"
                            title="Pay Unified Bill"
                          >
                            <CreditCard className="w-3.5 h-3.5 text-white" />
                            <span>{state.language === 'ar' ? 'دفع' : 'Pay'}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              onRequestBill(session.id);
                            }}
                            className="py-2 px-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                            title="Request Bill & Print Pre-invoice"
                          >
                            <Receipt className="w-3.5 h-3.5 text-rose-700" />
                            <span>{state.language === 'ar' ? 'طلب الحساب' : 'Bill'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Summary Bar */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="font-semibold text-slate-700">
                {state.language === 'ar' ? 'أخضر: طلب نشط' : 'Green: Active'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="font-semibold text-slate-700">
                {state.language === 'ar' ? 'برتقالي: طلب إضافي' : 'Orange: Additional Order'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="font-semibold text-slate-700">
                {state.language === 'ar' ? 'أزرق: تجهيز بالمطبخ' : 'Blue: Preparing'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
              <span className="font-semibold text-slate-700">
                {state.language === 'ar' ? 'أحمر: مطلوب الحساب' : 'Red: Bill Requested'}
              </span>
            </div>
          </div>

          <div className="font-bold text-slate-800">
            {state.language === 'ar' ? 'مجموع فواتير القاعة الحالية:' : 'Total Active Revenue:'}{' '}
            <span className="text-[#5A24CA] font-mono text-sm">
              {formatCurrency(
                activeSessions.reduce((acc, s) => acc + s.consolidatedGrandTotal, 0),
                state.language,
                state.tenant.currency
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
