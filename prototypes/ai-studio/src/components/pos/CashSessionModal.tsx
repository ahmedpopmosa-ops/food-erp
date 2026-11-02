/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Cashier Shift & Cash Register Session Reconciliation
 */

import React, { useState } from 'react';
import { useRestaurantStore } from '../../services/store';
import { translations, formatCurrency } from '../../lib/i18n';
import {
  X,
  Lock,
  Unlock,
  Coins,
  Scale,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
} from 'lucide-react';

interface CashSessionModalProps {
  onClose: () => void;
}

export const CashSessionModal: React.FC<CashSessionModalProps> = ({ onClose }) => {
  const { state, openCashSession, closeCashSession } = useRestaurantStore();
  const t = translations[state.language];

  const session = state.cashSession;
  const isOpen = session.status === 'OPEN';

  const [openingFloatInput, setOpeningFloatInput] = useState('1500');
  const [countedCashInput, setCountedCashInput] = useState(
    session.expectedCash ? session.expectedCash.toString() : '0'
  );

  const countedAmount = parseFloat(countedCashInput) || 0;
  const variance = countedAmount - (session.expectedCash || 0);

  const handleOpen = () => {
    const floatVal = parseFloat(openingFloatInput) || 0;
    openCashSession(floatVal);
    onClose();
  };

  const handleClose = () => {
    closeCashSession(countedAmount);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isOpen ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800' : 'bg-rose-950/80 text-rose-400 border border-rose-800'
              }`}
            >
              {isOpen ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {t.cashSession}
              </h3>
              <span className="text-xs text-slate-400">
                {isOpen ? t.sessionStatusOpen : t.sessionStatusClosed} · {session.cashierName}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {isOpen ? (
            <>
              {/* Shift Key Metrics Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60">
                  <span className="text-slate-400 block mb-1">{t.openingFloat}</span>
                  <span className="text-sm font-bold font-mono tabular-nums text-slate-200">
                    {formatCurrency(session.openingFloat, state.language)}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60">
                  <span className="text-slate-400 block mb-1">{t.totalCashSales}</span>
                  <span className="text-sm font-bold font-mono tabular-nums text-emerald-400">
                    {formatCurrency(session.totalSalesCash, state.language)}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60">
                  <span className="text-slate-400 block mb-1">{t.totalCardSales}</span>
                  <span className="text-sm font-bold font-mono tabular-nums text-blue-400">
                    {formatCurrency(session.totalSalesCard, state.language)}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60">
                  <span className="text-slate-400 block mb-1">{t.totalInstaPaySales}</span>
                  <span className="text-sm font-bold font-mono tabular-nums text-purple-400">
                    {formatCurrency(session.totalSalesInstaPay, state.language)}
                  </span>
                </div>
              </div>

              {/* Expected vs Actual Count */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 block">{t.expectedCash}</span>
                    <span className="text-[11px] text-slate-500">
                      ({t.openingFloat} + {t.totalCashSales})
                    </span>
                  </div>
                  <span className="text-xl font-black font-mono tabular-nums text-slate-100">
                    {formatCurrency(session.expectedCash, state.language)}
                  </span>
                </div>

                {/* Blind Counted Cash Input */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>{t.countedCash}</span>
                    <span className="text-[11px] text-slate-400">
                      {state.language === 'ar' ? 'الجرد الفعلي للدرج' : 'Physical drawer count'}
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      value={countedCashInput}
                      onChange={(e) => setCountedCashInput(e.target.value)}
                      className="w-full text-xl font-bold font-mono tabular-nums px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                    />
                    <span className="absolute left-3 top-3 text-xs font-semibold text-slate-400">
                      {t.currencyUnit}
                    </span>
                  </div>
                </div>

                {/* Variance Display */}
                <div className="p-3 rounded-xl bg-slate-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-medium text-slate-300">{t.variance}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono font-bold text-xs tabular-nums">
                    {variance === 0 && (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t.varianceExact} (0.00 {t.currencyUnit})
                      </span>
                    )}
                    {variance < 0 && (
                      <span className="text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {t.varianceShortage}: {formatCurrency(Math.abs(variance), state.language)}
                      </span>
                    )}
                    {variance > 0 && (
                      <span className="text-blue-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t.varianceSurplus}: +{formatCurrency(variance, state.language)}
                      </span>
                    )}
                  </div>
                </div>

                {Math.abs(variance) > 0 && (
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {state.language === 'ar'
                      ? 'ملاحظة محاسبية: سيقوم النظام تلقائياً بترحيل قيد تسوية عجز/زيادة الصندوق إلى حساب الأستاذ العام (5030).'
                      : 'Accounting note: The system will automatically post an audited variance entry to General Ledger Account 5030.'}
                  </p>
                )}
              </div>
            </>
          ) : (
            /* Open New Session Prompt */
            <div className="space-y-4">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <label className="text-xs font-semibold text-slate-300 block">
                  {t.openingFloat}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={openingFloatInput}
                    onChange={(e) => setOpeningFloatInput(e.target.value)}
                    className="w-full text-xl font-bold font-mono tabular-nums px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                  <span className="absolute left-3 top-3 text-xs font-semibold text-slate-400">
                    {t.currencyUnit}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {state.language === 'ar'
                    ? 'المبلغ النقدي المسلّم كفكة افتتاحية في بداية الوردية'
                    : 'Opening change float placed in cash drawer at start of shift'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold transition-colors"
          >
            {t.cancel}
          </button>

          {isOpen ? (
            <button
              onClick={handleClose}
              className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-95"
            >
              <Lock className="w-4 h-4" />
              <span>{t.closeSessionConfirm}</span>
            </button>
          ) : (
            <button
              onClick={handleOpen}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-95"
            >
              <Unlock className="w-4 h-4" />
              <span>{t.openSession}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
