/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Foodics Table Dining Session Details & Management Modal
 * Complete breakdown of multi-order sessions, financial summaries, and operations
 */

import React, { useState } from 'react';
import {
  X,
  Plus,
  Receipt,
  CreditCard,
  Printer,
  ArrowRightLeft,
  GitMerge,
  Split,
  Trash2,
  Edit,
  History,
  ChefHat,
  Users,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { TableSession, Order, OrderItem, RestaurantTable } from '../../types';
import { useRestaurantStore } from '../../services/store';
import { formatCurrency, translations } from '../../lib/i18n';

interface TableSessionDetailsModalProps {
  session: TableSession;
  onClose: () => void;
  onAddAdditionalOrder: (tableId: string) => void;
  onEditOrder: (orderId: string) => void;
  onRequestBill: (sessionId: string) => void;
  onPaySession: (session: TableSession) => void;
}

export const TableSessionDetailsModal: React.FC<TableSessionDetailsModalProps> = ({
  session,
  onClose,
  onAddAdditionalOrder,
  onEditOrder,
  onRequestBill,
  onPaySession,
}) => {
  const {
    state,
    cancelOrderItem,
    transferTable,
    mergeTableSessions,
    splitSessionBill,
    reprintKitchenTicket,
  } = useRestaurantStore();
  const t = translations[state.language];

  // Modals for sub-actions
  const [activeTab, setActiveTab] = useState<'ORDERS' | 'TIMELINE' | 'SPLIT'>('ORDERS');
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [selectedTargetTableId, setSelectedTargetTableId] = useState<string>('');
  const [selectedMergeSessionId, setSelectedMergeSessionId] = useState<string>('');
  const [splitGuestCount, setSplitGuestCount] = useState<number>(session.guestCount || 2);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const notifyAction = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3000);
  };

  // Pull latest session data from store
  const currentSession = state.tableSessions.find((s) => s.id === session.id) || session;
  const currentTable = state.tables.find((t) => t.id === currentSession.tableId);

  // All orders belonging to this dining session
  const sessionOrders = state.orders.filter(
    (o) => currentSession.orderIds.includes(o.id) && o.status !== 'CANCELLED'
  );

  // Session audit events
  const sessionEvents = state.tableEvents.filter((e) => e.sessionId === currentSession.id);

  // Available vacant tables for transfer
  const availableTables = state.tables.filter(
    (t) => t.status === 'AVAILABLE' && t.id !== currentSession.tableId
  );

  // Other active sessions for merging
  const mergeableSessions = state.tableSessions.filter(
    (s) => s.id !== currentSession.id && s.status !== 'CLOSED' && s.status !== 'PAID'
  );

  // Handle Transfer Table
  const handleConfirmTransfer = () => {
    if (!selectedTargetTableId) return;
    const ok = transferTable(currentSession.id, selectedTargetTableId);
    if (ok) {
      notifyAction(
        state.language === 'ar'
          ? 'تم تحويل الطاولة بنجاح'
          : 'Table transferred successfully'
      );
      setIsTransferModalOpen(false);
    } else {
      notifyAction(
        state.language === 'ar'
          ? 'فشل تحويل الطاولة: الطاولة المختارة غير متاحة'
          : 'Transfer failed: target table is occupied'
      );
    }
  };

  // Handle Merge Tables
  const handleConfirmMerge = () => {
    if (!selectedMergeSessionId) return;
    const ok = mergeTableSessions(selectedMergeSessionId, currentSession.id);
    if (ok) {
      notifyAction(
        state.language === 'ar'
          ? 'تم دمج الطاولات بنجاح في جلسة واحدة'
          : 'Tables merged into unified session successfully'
      );
      setIsMergeModalOpen(false);
    }
  };

  // Handle Cancel Item
  const handleCancelItem = (orderId: string, itemId: string, itemName: string) => {
    if (
      window.confirm(
        state.language === 'ar'
          ? `هل أنت متأكد من إلغاء ${itemName}؟`
          : `Are you sure you want to cancel ${itemName}?`
      )
    ) {
      cancelOrderItem(orderId, itemId, 'Customer request / إلغاء العميل');
      notifyAction(
        state.language === 'ar'
          ? `تم إلغاء ${itemName}`
          : `Item ${itemName} cancelled`
      );
    }
  };

  // Handle Reprint KDS
  const handleReprintKds = (orderId: string) => {
    reprintKitchenTicket(orderId);
    notifyAction(
      state.language === 'ar'
        ? 'تمت إعادة طباعة تذكرة المطبخ'
        : 'Kitchen order ticket reprinted'
    );
  };

  // Split calculations
  const splitAmounts = splitSessionBill(currentSession.id, splitGuestCount);
  const splitAmount = splitAmounts[0] || Number((currentSession.consolidatedGrandTotal / splitGuestCount).toFixed(2));

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-5xl h-[90vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Action Notice Toast */}
        {actionNotice && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-5 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{actionNotice}</span>
          </div>
        )}

        {/* Top Header */}
        <div className="px-6 py-4 bg-[#5A24CA] text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20 font-black text-2xl">
              {currentSession.tableNumber}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black">
                  {state.language === 'ar' ? `جلسة طاولة ${currentSession.tableNumber}` : `Table ${currentSession.tableNumber} Session`}
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase ${
                    currentSession.status === 'BILL_REQUESTED'
                      ? 'bg-rose-500 text-white animate-pulse'
                      : currentSession.status === 'ADDITIONAL_ORDER'
                      ? 'bg-amber-400 text-slate-900'
                      : 'bg-emerald-400 text-slate-900'
                  }`}
                >
                  {currentSession.status === 'BILL_REQUESTED'
                    ? state.language === 'ar' ? 'طلب الحساب' : 'Bill Requested'
                    : currentSession.status === 'ADDITIONAL_ORDER'
                    ? state.language === 'ar' ? 'طلب إضافي' : 'Additional Order'
                    : state.language === 'ar' ? 'طلب نشط' : 'Active Order'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-white/80 mt-1">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {currentSession.guestCount} {state.language === 'ar' ? 'أفراد' : 'Guests'}
                </span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(currentSession.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span>·</span>
                <span>{state.language === 'ar' ? 'المضيف:' : 'Waiter:'} {currentSession.waiterName}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation & Fast Actions Bar */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('ORDERS')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'ORDERS'
                  ? 'bg-[#5A24CA] text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <span>{state.language === 'ar' ? 'الطلبات المرتبطة' : 'Linked Orders'}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20">
                {sessionOrders.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('SPLIT')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'SPLIT'
                  ? 'bg-[#5A24CA] text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <Split className="w-3.5 h-3.5" />
              <span>{state.language === 'ar' ? 'تقسيم الحساب' : 'Split Bill'}</span>
            </button>

            <button
              onClick={() => setActiveTab('TIMELINE')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'TIMELINE'
                  ? 'bg-[#5A24CA] text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>{state.language === 'ar' ? 'سجل التدقيق' : 'Audit Timeline'}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20">
                {sessionEvents.length}
              </span>
            </button>
          </div>

          {/* Operation Tools */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsTransferModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
              title="Transfer Session to another vacant table"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600" />
              <span>{state.language === 'ar' ? 'تحويل طاولة' : 'Transfer Table'}</span>
            </button>

            <button
              onClick={() => setIsMergeModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
              title="Merge with another active dining table"
            >
              <GitMerge className="w-3.5 h-3.5 text-purple-600" />
              <span>{state.language === 'ar' ? 'دمج طاولات' : 'Merge Tables'}</span>
            </button>

            <button
              onClick={() => {
                onAddAdditionalOrder(currentSession.tableId);
                onClose();
              }}
              className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
              title="Add an additional order to this table session"
            >
              <Plus className="w-3.5 h-3.5 text-amber-700" />
              <span>{state.language === 'ar' ? '+ طلب إضافي' : '+ Add Order'}</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {activeTab === 'ORDERS' && (
            <div className="space-y-6">
              {sessionOrders.map((ord, idx) => (
                <div
                  key={ord.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                >
                  {/* Order Card Header */}
                  <div className="px-5 py-3.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#5A24CA] text-white flex items-center justify-center font-black text-xs">
                        #{idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-[#5A24CA] text-sm">
                            {state.language === 'ar' ? `طلب رقم #${ord.orderNumber}` : `Order #${ord.orderNumber}`}
                          </span>
                          {ord.isAdditionalOrder && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                              {state.language === 'ar' ? 'طلب إضافي' : 'Additional Order'}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-200 text-slate-800">
                            {ord.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>
                            {state.language === 'ar' ? 'أنشئ في:' : 'Created:'}{' '}
                            {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {ord.kitchenSentAt && (
                            <>
                              <span>·</span>
                              <span className="flex items-center gap-1 text-blue-600 font-semibold">
                                <ChefHat className="w-3 h-3" />
                                {state.language === 'ar' ? 'أرسل للمطبخ:' : 'KDS Sent:'}{' '}
                                {new Date(ord.kitchenSentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Order Action Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleReprintKds(ord.id)}
                        className="p-1.5 px-2.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 flex items-center gap-1 transition-colors"
                        title="Reprint Kitchen Ticket"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-500" />
                        <span>{state.language === 'ar' ? 'إعادة طباعة المطبخ' : 'Reprint KDS'}</span>
                      </button>

                      {ord.status === 'DRAFT' && (
                        <button
                          onClick={() => {
                            onEditOrder(ord.id);
                            onClose();
                          }}
                          className="p-1.5 px-2.5 text-xs font-semibold rounded-lg bg-purple-50 border border-purple-200 hover:bg-purple-100 text-[#5A24CA] flex items-center gap-1 transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>{state.language === 'ar' ? 'تعديل المسودة' : 'Edit Draft'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div className="divide-y divide-slate-100">
                    {ord.items.map((item) => (
                      <div
                        key={item.id}
                        className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/60 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <span className="font-black text-sm text-[#5A24CA] mt-0.5">
                            {item.quantity}x
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">
                                {state.language === 'ar' ? item.productNameAr : item.productNameEn}
                              </span>
                              {item.kitchenStatus && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                  {item.kitchenStatus}
                                </span>
                              )}
                            </div>

                            {/* Modifiers */}
                            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                              <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                                {item.selectedModifiers.map((mod, midx) => (
                                  <div key={midx} className="flex items-center gap-1 text-[11px]">
                                    <span className="text-slate-400">+</span>
                                    <span>
                                      {state.language === 'ar' ? mod.optionNameAr : mod.optionNameEn}
                                    </span>
                                    {mod.priceDelta > 0 && (
                                      <span className="text-[#5A24CA] font-mono">
                                        (+{formatCurrency(mod.priceDelta, state.language, state.tenant.currency)})
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Special item note */}
                            {item.notes && (
                              <p className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded mt-1 inline-block">
                                {item.notes}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Price & Cancel button */}
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="font-mono font-bold text-slate-900 text-sm block">
                              {formatCurrency(item.totalPrice, state.language, state.tenant.currency)}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              @{formatCurrency(item.unitPrice, state.language, state.tenant.currency)}
                            </span>
                          </div>

                          <button
                            onClick={() =>
                              handleCancelItem(
                                ord.id,
                                item.id,
                                state.language === 'ar' ? item.productNameAr : item.productNameEn
                              )
                            }
                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Cancel item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Order Subtotal Bar */}
                  <div className="px-5 py-2.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-500">
                      {state.language === 'ar' ? `إجمالي الطلب #${ord.orderNumber}` : `Order #${ord.orderNumber} Total`}
                    </span>
                    <span className="font-mono font-black text-slate-800 text-sm">
                      {formatCurrency(ord.grandTotal, state.language, state.tenant.currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'SPLIT' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm max-w-xl mx-auto space-y-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-2xl bg-purple-50 text-[#5A24CA] flex items-center justify-center mx-auto mb-2">
                  <Split className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  {state.language === 'ar' ? 'تقسيم الحساب بالتساوي' : 'Evenly Split Dining Bill'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {state.language === 'ar'
                    ? 'تقسيم إجمالي الفاتورة الموحدة على عدد الضيوف بالتساوي'
                    : 'Divide the unified table session total evenly among diners'}
                </p>
              </div>

              {/* Number of guests selector */}
              <div className="flex items-center justify-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setSplitGuestCount(Math.max(2, splitGuestCount - 1))}
                  className="w-10 h-10 rounded-xl bg-white border border-slate-300 font-black text-lg text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  -
                </button>
                <div className="text-center px-4">
                  <span className="text-2xl font-black text-[#5A24CA] block font-mono">
                    {splitGuestCount}
                  </span>
                  <span className="text-xs font-bold text-slate-500 uppercase">
                    {state.language === 'ar' ? 'أفراد / ضيوف' : 'Guests / Diners'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSplitGuestCount(splitGuestCount + 1)}
                  className="w-10 h-10 rounded-xl bg-white border border-slate-300 font-black text-lg text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  +
                </button>
              </div>

              {/* Split Calculation Result */}
              <div className="bg-purple-50 border border-purple-200 p-5 rounded-2xl text-center space-y-2">
                <span className="text-xs font-bold text-purple-700 uppercase tracking-wider block">
                  {state.language === 'ar' ? 'المبلغ المستحق لكل فرد:' : 'Amount per Guest:'}
                </span>
                <span className="text-3xl font-black font-mono text-[#5A24CA] block">
                  {formatCurrency(splitAmount, state.language, state.tenant.currency)}
                </span>
                <p className="text-[11px] text-purple-600">
                  {splitGuestCount} x {formatCurrency(splitAmount, state.language, state.tenant.currency)} = {formatCurrency(currentSession.consolidatedGrandTotal, state.language, state.tenant.currency)}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'TIMELINE' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm max-w-2xl mx-auto">
              <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <History className="w-4 h-4 text-[#5A24CA]" />
                <span>{state.language === 'ar' ? 'سجل العمليات والتدقيق للجلسة' : 'Session Audit Event Log'}</span>
              </h4>

              {sessionEvents.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">
                  {state.language === 'ar' ? 'لا توجد أحداث مسجلة بعد' : 'No audit events logged yet'}
                </p>
              ) : (
                <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {sessionEvents.map((evt) => (
                    <div key={evt.id} className="relative">
                      <div className="absolute -left-6 sm:-left-8 top-1 w-5 h-5 rounded-full bg-[#5A24CA] text-white flex items-center justify-center ring-4 ring-white text-[10px]">
                        ✓
                      </div>
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                        <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-200/60">
                          <span className="font-extrabold text-[#5A24CA] uppercase text-[10px]">
                            {evt.eventType}
                          </span>
                          <span className="text-slate-400 text-[10px] font-mono">
                            {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                        <p className="font-medium text-slate-800">
                          {state.language === 'ar' ? evt.descriptionAr : evt.descriptionEn}
                        </p>
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          By: {evt.actorName}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Consolidated Financial Summary & Master Actions */}
        <div className="p-6 bg-white border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-6 shadow-lg">
          {/* Financial Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full md:w-auto text-xs">
            <div>
              <span className="text-slate-400 font-bold uppercase block text-[10px]">
                {state.language === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}
              </span>
              <span className="font-mono font-bold text-slate-800 text-sm">
                {formatCurrency(currentSession.consolidatedSubtotal, state.language, state.tenant.currency)}
              </span>
            </div>

            <div>
              <span className="text-slate-400 font-bold uppercase block text-[10px]">
                {state.language === 'ar' ? 'الخصومات' : 'Discounts'}
              </span>
              <span className="font-mono font-bold text-emerald-600 text-sm">
                -{formatCurrency(currentSession.consolidatedDiscount, state.language, state.tenant.currency)}
              </span>
            </div>

            <div>
              <span className="text-slate-400 font-bold uppercase block text-[10px]">
                {state.language === 'ar' ? 'ضريبة القيمة المضافة (15%)' : 'VAT (15%)'}
              </span>
              <span className="font-mono font-bold text-slate-800 text-sm">
                {formatCurrency(currentSession.consolidatedTax, state.language, state.tenant.currency)}
              </span>
            </div>

            <div>
              <span className="text-slate-400 font-bold uppercase block text-[10px]">
                {state.language === 'ar' ? 'خدمة الصالة' : 'Service Charge'}
              </span>
              <span className="font-mono font-bold text-slate-800 text-sm">
                {formatCurrency(currentSession.consolidatedServiceCharge || 0, state.language, state.tenant.currency)}
              </span>
            </div>
          </div>

          {/* Unified Grand Total & Action Buttons */}
          <div className="flex items-center gap-4 w-full md:w-auto justify-end">
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">
                {state.language === 'ar' ? 'إجمالي الحساب الموحد' : 'Unified Grand Total'}
              </span>
              <span className="text-2xl font-black font-mono text-[#5A24CA]">
                {formatCurrency(currentSession.consolidatedGrandTotal, state.language, state.tenant.currency)}
              </span>
            </div>

            {/* Request Bill vs Pay Bill */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onRequestBill(currentSession.id);
                }}
                className={`px-4 py-3 rounded-2xl font-black text-xs flex items-center gap-2 transition-all shadow-sm ${
                  currentSession.status === 'BILL_REQUESTED'
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : 'bg-rose-600 hover:bg-rose-700 text-white'
                }`}
              >
                <Receipt className="w-4 h-4" />
                <span>
                  {currentSession.status === 'BILL_REQUESTED'
                    ? state.language === 'ar' ? 'إعادة طباعة الفاتورة' : 'Reprint Pre-Bill'
                    : state.language === 'ar' ? 'طلب الحساب وطباعة' : 'Request & Print Bill'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onPaySession(currentSession);
                  onClose();
                }}
                className="px-6 py-3 rounded-2xl font-black text-xs bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 transition-all shadow-md"
              >
                <CreditCard className="w-4 h-4" />
                <span>{state.language === 'ar' ? 'دفع وإغلاق الطاولة' : 'Pay & Close Table'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Transfer Table Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {state.language === 'ar' ? 'تحويل الجلسة إلى طاولة أخرى' : 'Transfer Session to Another Table'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {state.language === 'ar'
                ? `سيتم نقل كافة الطلبات المرتبطة بطاولة ${currentSession.tableNumber} إلى الطاولة الجديدة الشاغرة`
                : `All orders for Table ${currentSession.tableNumber} will be safely moved to the new vacant table.`}
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {availableTables.length === 0 ? (
                <p className="text-xs text-rose-600 font-bold p-3 bg-rose-50 rounded-xl">
                  {state.language === 'ar' ? 'لا توجد طاولات شاغرة حالياً' : 'No vacant tables available'}
                </p>
              ) : (
                availableTables.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTargetTableId(t.id)}
                    className={`w-full p-3 rounded-xl border flex items-center justify-between text-xs font-bold transition-all ${
                      selectedTargetTableId === t.id
                        ? 'border-[#5A24CA] bg-[#5A24CA]/10 text-[#5A24CA]'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <span>Table {t.tableNumber} ({t.sectionEn})</span>
                    <span>{t.capacity} Seats</span>
                  </button>
                ))
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                {t.cancel}
              </button>
              <button
                disabled={!selectedTargetTableId}
                onClick={handleConfirmTransfer}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#5A24CA] hover:bg-[#4a1ca8] text-white disabled:opacity-50"
              >
                {state.language === 'ar' ? 'تأكيد التحويل' : 'Confirm Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Tables Modal */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {state.language === 'ar' ? 'دمج مع طاولة أخرى' : 'Merge with Another Table Session'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {state.language === 'ar'
                ? `اختر جلسة الطاولة التي ترغب في ضم طلباتها إلى طاولة ${currentSession.tableNumber}`
                : `Select the table session to merge into Table ${currentSession.tableNumber}.`}
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {mergeableSessions.length === 0 ? (
                <p className="text-xs text-slate-400 p-3 bg-slate-50 rounded-xl">
                  {state.language === 'ar' ? 'لا توجد جلسات أخرى نشطة للدمج' : 'No other active sessions to merge'}
                </p>
              ) : (
                mergeableSessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedMergeSessionId(s.id)}
                    className={`w-full p-3 rounded-xl border flex items-center justify-between text-xs font-bold transition-all ${
                      selectedMergeSessionId === s.id
                        ? 'border-[#5A24CA] bg-[#5A24CA]/10 text-[#5A24CA]'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div>
                      <span>Table {s.tableNumber}</span>
                      <span className="text-[10px] text-slate-400 block font-normal">
                        {s.orderIds.length} orders · {s.waiterName}
                      </span>
                    </div>
                    <span className="font-mono">
                      {formatCurrency(s.consolidatedGrandTotal, state.language, state.tenant.currency)}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsMergeModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                {t.cancel}
              </button>
              <button
                disabled={!selectedMergeSessionId}
                onClick={handleConfirmMerge}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#5A24CA] hover:bg-[#4a1ca8] text-white disabled:opacity-50"
              >
                {state.language === 'ar' ? 'تأكيد الدمج' : 'Confirm Merge'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
