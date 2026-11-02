/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Foodics POS Table Selector Modal
 * Supports Order-First table assignment, section filtering, and live status badges
 */

import React, { useState } from 'react';
import { X, LayoutGrid, Users, Check, AlertCircle, Utensils, Receipt } from 'lucide-react';
import { RestaurantTable, TableStatus } from '../../types';
import { useRestaurantStore } from '../../services/store';

interface TableSelectorModalProps {
  tables: RestaurantTable[];
  selectedTableId?: string;
  orderNumber?: string;
  onSelectTable: (table: RestaurantTable) => void;
  onClose: () => void;
}

export const TableSelectorModal: React.FC<TableSelectorModalProps> = ({
  tables,
  selectedTableId,
  orderNumber,
  onSelectTable,
  onClose,
}) => {
  const { state } = useRestaurantStore();
  const [selectedSection, setSelectedSection] = useState<string>('ALL');

  // Extract unique sections
  const sections = Array.from(new Set(tables.map((t) => t.sectionEn)));

  const filteredTables = tables.filter((t) => {
    if (selectedSection === 'ALL') return true;
    return t.sectionEn === selectedSection;
  });

  const getTableStatusDisplay = (table: RestaurantTable) => {
    switch (table.status) {
      case 'BILL_REQUESTED':
        return {
          labelEn: 'Bill Requested',
          labelAr: 'مطلوب الحساب',
          badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
          cardClass: 'border-rose-300 bg-rose-50/50 hover:border-rose-400',
          textClass: 'text-rose-700',
        };
      case 'ADDITIONAL_ORDER':
        return {
          labelEn: 'Additional Order',
          labelAr: 'طلب إضافي',
          badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
          cardClass: 'border-amber-300 bg-amber-50/50 hover:border-amber-400',
          textClass: 'text-amber-700',
        };
      case 'OCCUPIED':
        return {
          labelEn: 'Occupied',
          labelAr: 'مشغولة',
          badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          cardClass: 'border-emerald-300 bg-emerald-50/50 hover:border-emerald-400',
          textClass: 'text-emerald-700',
        };
      case 'ORDER_STARTED':
      case 'ORDER_SENT':
        return {
          labelEn: 'In Kitchen',
          labelAr: 'في المطبخ',
          badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
          cardClass: 'border-blue-300 bg-blue-50/50 hover:border-blue-400',
          textClass: 'text-blue-700',
        };
      case 'AVAILABLE':
      default:
        return {
          labelEn: 'Available',
          labelAr: 'شاغرة',
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
          cardClass: 'border-slate-200 bg-white hover:border-[#5A24CA] hover:bg-purple-50/30',
          textClass: 'text-slate-900',
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#5A24CA] text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg">
                {state.language === 'ar' ? 'تحديد طاولة للطلب' : 'Assign Table to Order'}
              </h3>
              <p className="text-xs text-white/80">
                {state.language === 'ar'
                  ? orderNumber ? `اختر الطاولة لربطها بالطلب #${orderNumber} قبل إرساله للمطبخ` : 'اختر طاولة شاغرة للطلب'
                  : orderNumber ? `Select an available table for Order #${orderNumber} before kitchen dispatch` : 'Select an available table'}
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

        {/* Section Tabs */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSelectedSection('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedSection === 'ALL'
                ? 'bg-[#5A24CA] text-white shadow'
                : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            {state.language === 'ar' ? 'جميع القاعات' : 'All Sections'}
          </button>
          {sections.map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => setSelectedSection(sec)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedSection === sec
                  ? 'bg-[#5A24CA] text-white shadow'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              {sec}
            </button>
          ))}
        </div>

        {/* Tables Grid */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-100/60">
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3.5">
            {filteredTables.map((table) => {
              const isCurrent = table.id === selectedTableId;
              const statusDisplay = getTableStatusDisplay(table);

              return (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => {
                    onSelectTable(table);
                    onClose();
                  }}
                  className={`relative p-4 rounded-2xl border-2 flex flex-col items-center justify-between min-h-[120px] transition-all shadow-sm ${
                    isCurrent
                      ? 'border-[#5A24CA] bg-[#5A24CA]/10 shadow-md ring-2 ring-[#5A24CA]/30'
                      : statusDisplay.cardClass
                  }`}
                >
                  {isCurrent && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#5A24CA] text-white flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}

                  <span className={`text-2xl font-black ${statusDisplay.textClass}`}>
                    {table.tableNumber}
                  </span>

                  <span className="text-[11px] font-semibold text-slate-500">
                    {state.language === 'ar' ? table.sectionAr : table.sectionEn}
                  </span>

                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Users className="w-3 h-3" />
                    <span>{table.capacity} {state.language === 'ar' ? 'مقاعد' : 'Seats'}</span>
                  </div>

                  <span
                    className={`mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${statusDisplay.badgeClass}`}
                  >
                    {state.language === 'ar' ? statusDisplay.labelAr : statusDisplay.labelEn}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              <span>{state.language === 'ar' ? 'رمادي: شاغرة' : 'Gray: Available'}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>{state.language === 'ar' ? 'أخضر: مشغولة' : 'Green: Occupied'}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>{state.language === 'ar' ? 'برتقالي: طلب إضافي' : 'Orange: Additional Order'}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>{state.language === 'ar' ? 'أحمر: مطلوب الحساب' : 'Red: Bill Requested'}</span>
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700"
          >
            {state.language === 'ar' ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
