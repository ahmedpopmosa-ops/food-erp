/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Double-Entry Accounting Hub, General Ledger & Financial Statements
 */

import React, { useState } from 'react';
import { useRestaurantStore } from '../../services/store';
import { translations, formatCurrency } from '../../lib/i18n';
import {
  BookOpen,
  Scale,
  FileSpreadsheet,
  TrendingUp,
  Landmark,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export const AccountingHub: React.FC = () => {
  const { state } = useRestaurantStore();
  const t = translations[state.language];

  const [activeTab, setActiveTab] = useState<
    'ledger' | 'coa' | 'trial_balance' | 'income_statement' | 'balance_sheet' | 'vat_return'
  >('ledger');
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  // Calculate global double-entry debit & credit sums to verify invariant
  let globalDebits = 0;
  let globalCredits = 0;
  state.journalEntries.forEach((je) => {
    globalDebits += je.totalDebit;
    globalCredits += je.totalCredit;
  });
  const isLedgerBalanced = Math.abs(globalDebits - globalCredits) < 0.05;

  // Financial calculations for P&L
  const revenueAccount = state.accounts.find((a) => a.code === '4010');
  const cogsAccount = state.accounts.find((a) => a.code === '5010');
  const spoilageAccount = state.accounts.find((a) => a.code === '5020');
  const varianceAccount = state.accounts.find((a) => a.code === '5030');
  const rentAccount = state.accounts.find((a) => a.code === '6010');
  const salariesAccount = state.accounts.find((a) => a.code === '6020');

  const totalRevenue = revenueAccount?.currentBalance || 0;
  const totalCogs = cogsAccount?.currentBalance || 0;
  const grossProfit = totalRevenue - totalCogs;
  const totalExpenses =
    (spoilageAccount?.currentBalance || 0) +
    (varianceAccount?.currentBalance || 0) +
    (rentAccount?.currentBalance || 0) +
    (salariesAccount?.currentBalance || 0);
  const netIncome = grossProfit - totalExpenses;

  // Balance sheet sums
  const assetAccounts = state.accounts.filter((a) => a.type === 'ASSET');
  const liabilityAccounts = state.accounts.filter((a) => a.type === 'LIABILITY');
  const equityAccounts = state.accounts.filter((a) => a.type === 'EQUITY');

  const totalAssets = assetAccounts.reduce((sum, a) => sum + a.currentBalance, 0);
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + a.currentBalance, 0);
  const baseEquity = equityAccounts.reduce((sum, a) => sum + a.currentBalance, 0);
  const totalLiabilitiesAndEquity = totalLiabilities + baseEquity + netIncome;

  // VAT calculations
  const outputVatAccount = state.accounts.find((a) => a.code === '2100');
  const inputVatAccount = state.accounts.find((a) => a.code === '2110');
  const outputVat = outputVatAccount?.currentBalance || 0;
  const inputVat = inputVatAccount?.currentBalance || 0;
  const netVatPayable = outputVat - inputVat;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">{t.hubAccounting}</h2>
          <p className="text-xs text-slate-400">
            {state.language === 'ar'
              ? 'دفتر اليومية العامة، ميزان المراجعة، شجرة الحسابات، وقوائم الدخل والمركز المالي وفق معايير المحاسبة المزدوجة'
              : 'General ledger, trial balance, chart of accounts, and financial statements following GAAP double-entry'}
          </p>
        </div>

        {/* Double-Entry Invariant Proof Banner */}
        <div
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold ${
            isLedgerBalanced
              ? 'bg-emerald-950/80 border-emerald-600/60 text-emerald-300'
              : 'bg-rose-950 border-rose-700 text-rose-300'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            {isLedgerBalanced ? t.ledgerBalanced : 'تحذير: عدم اتزان بدفتر اليومية'}
          </span>
          <span className="font-mono tabular-nums text-slate-300 ms-1">
            ({formatCurrency(globalDebits, state.language)})
          </span>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('ledger')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'ledger'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>{t.journalEntries} ({state.journalEntries.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('coa')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'coa'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Landmark className="w-3.5 h-3.5" />
          <span>{t.chartOfAccounts}</span>
        </button>

        <button
          onClick={() => setActiveTab('trial_balance')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'trial_balance'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>{t.trialBalance}</span>
        </button>

        <button
          onClick={() => setActiveTab('income_statement')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'income_statement'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>{t.incomeStatement}</span>
        </button>

        <button
          onClick={() => setActiveTab('balance_sheet')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'balance_sheet'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>{t.balanceSheet}</span>
        </button>

        <button
          onClick={() => setActiveTab('vat_return')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'vat_return'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <span>{state.language === 'ar' ? 'إقرار القيمة المضافة 14%' : 'VAT 14% Return'}</span>
        </button>
      </div>

      {/* Tab 1: General Journal Entries Ledger */}
      {activeTab === 'ledger' && (
        <div className="space-y-3">
          {state.journalEntries.map((je) => {
            const isExpanded = expandedEntryId === je.id;

            return (
              <div
                key={je.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm"
              >
                {/* Voucher Header */}
                <div
                  onClick={() => setExpandedEntryId(isExpanded ? null : je.id)}
                  className="p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover:bg-slate-850/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-emerald-400">
                      {je.entryNumber}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-white">
                        {state.language === 'ar' ? je.memoAr : je.memoEn}
                      </h4>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(je.date).toLocaleDateString()} · {je.sourceType}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-end font-mono tabular-nums text-xs">
                      <span className="text-slate-400 text-[10px] block">
                        {state.language === 'ar' ? 'إجمالي القيد' : 'Voucher Total'}
                      </span>
                      <span className="font-bold text-slate-100">
                        {formatCurrency(je.totalDebit, state.language)}
                      </span>
                    </div>

                    <div className="text-slate-400">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Drilldown Voucher Lines */}
                {isExpanded && (
                  <div className="p-4 bg-slate-950 border-t border-slate-800 overflow-x-auto">
                    <table className="w-full text-xs text-start">
                      <thead className="text-slate-500 font-semibold border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-3 text-start">{t.accountCode}</th>
                          <th className="py-2 px-3 text-start">{t.accountName}</th>
                          <th className="py-2 px-3 text-end">{t.debit}</th>
                          <th className="py-2 px-3 text-end">{t.credit}</th>
                          <th className="py-2 px-3 text-start">{t.notes}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850 font-mono">
                        {je.lines.map((line) => (
                          <tr key={line.id} className="text-slate-300">
                            <td className="py-2 px-3 text-slate-400">{line.accountCode}</td>
                            <td className="py-2 px-3 font-sans font-medium text-white">
                              {state.language === 'ar' ? line.accountNameAr : line.accountNameEn}
                            </td>
                            <td className="py-2 px-3 text-end tabular-nums font-bold text-slate-200">
                              {line.debit > 0 ? formatCurrency(line.debit, state.language) : '—'}
                            </td>
                            <td className="py-2 px-3 text-end tabular-nums font-bold text-slate-200">
                              {line.credit > 0 ? formatCurrency(line.credit, state.language) : '—'}
                            </td>
                            <td className="py-2 px-3 text-slate-500 font-sans text-[11px]">
                              {line.memo || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t border-slate-800 font-bold font-mono text-emerald-400">
                        <tr>
                          <td colSpan={2} className="py-2.5 px-3 text-start font-sans">
                            {state.language === 'ar' ? 'الإجمالي المتزن:' : 'Balanced Total:'}
                          </td>
                          <td className="py-2.5 px-3 text-end tabular-nums">
                            {formatCurrency(je.totalDebit, state.language)}
                          </td>
                          <td className="py-2.5 px-3 text-end tabular-nums">
                            {formatCurrency(je.totalCredit, state.language)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 2: Chart of Accounts */}
      {activeTab === 'coa' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 text-start">{t.accountCode}</th>
                  <th className="py-3 px-4 text-start">{t.accountName}</th>
                  <th className="py-3 px-4 text-start">{t.accountType}</th>
                  <th className="py-3 px-4 text-center">
                    {state.language === 'ar' ? 'طبيعة الحساب' : 'Normal Balance'}
                  </th>
                  <th className="py-3 px-4 text-end">{t.balance}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {state.accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-850/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400">{acc.code}</td>
                    <td className="py-3 px-4 font-bold text-white">
                      {state.language === 'ar' ? acc.nameAr : acc.nameEn}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {acc.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-[11px] text-slate-400">
                      {acc.normalBalance}
                    </td>
                    <td className="py-3 px-4 text-end font-mono font-bold text-slate-100 tabular-nums">
                      {formatCurrency(acc.currentBalance, state.language)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Trial Balance */}
      {activeTab === 'trial_balance' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 text-start">{t.accountCode}</th>
                  <th className="py-3 px-4 text-start">{t.accountName}</th>
                  <th className="py-3 px-4 text-end">{t.debit}</th>
                  <th className="py-3 px-4 text-end">{t.credit}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {state.accounts.map((acc) => {
                  const isDebit = acc.normalBalance === 'DEBIT';
                  return (
                    <tr key={acc.id} className="hover:bg-slate-850/60 text-slate-200">
                      <td className="py-2.5 px-4 text-slate-400">{acc.code}</td>
                      <td className="py-2.5 px-4 font-sans font-medium text-white">
                        {state.language === 'ar' ? acc.nameAr : acc.nameEn}
                      </td>
                      <td className="py-2.5 px-4 text-end tabular-nums">
                        {isDebit ? formatCurrency(acc.currentBalance, state.language) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-end tabular-nums">
                        {!isDebit ? formatCurrency(acc.currentBalance, state.language) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-slate-700 font-bold font-mono text-emerald-400 bg-slate-950">
                <tr>
                  <td colSpan={2} className="py-3 px-4 font-sans text-sm">
                    {state.language === 'ar' ? 'إجمالي ميزان المراجعة:' : 'Total Trial Balance:'}
                  </td>
                  <td className="py-3 px-4 text-end tabular-nums text-sm">
                    {formatCurrency(
                      state.accounts
                        .filter((a) => a.normalBalance === 'DEBIT')
                        .reduce((sum, a) => sum + a.currentBalance, 0),
                      state.language
                    )}
                  </td>
                  <td className="py-3 px-4 text-end tabular-nums text-sm">
                    {formatCurrency(
                      state.accounts
                        .filter((a) => a.normalBalance === 'CREDIT')
                        .reduce((sum, a) => sum + a.currentBalance, 0),
                      state.language
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Income Statement (P&L) */}
      {activeTab === 'income_statement' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl mx-auto space-y-5 shadow-sm">
          <div className="text-center pb-4 border-b border-slate-800">
            <h3 className="text-base font-bold text-white">{t.incomeStatement}</h3>
            <span className="text-xs text-slate-400">
              {state.tenant.tradeNameAr} · {state.language === 'ar' ? 'للفترة المالية المنتهية' : 'For Period Ended'}
            </span>
          </div>

          <div className="space-y-3 text-xs font-mono">
            {/* Revenue */}
            <div className="flex justify-between items-center py-2 border-b border-slate-800">
              <span className="font-sans font-bold text-slate-200">{t.revenue}</span>
              <span className="font-bold text-emerald-400 tabular-nums">
                {formatCurrency(totalRevenue, state.language)}
              </span>
            </div>

            {/* COGS */}
            <div className="flex justify-between items-center py-2 text-slate-300">
              <span className="font-sans ps-4">{t.cogs}</span>
              <span className="tabular-nums">({formatCurrency(totalCogs, state.language)})</span>
            </div>

            {/* Gross Profit */}
            <div className="flex justify-between items-center py-2 bg-slate-950 p-3 rounded-xl border border-slate-800 font-bold">
              <span className="font-sans text-white">{t.grossProfit}</span>
              <span className="text-emerald-300 tabular-nums">
                {formatCurrency(grossProfit, state.language)}
              </span>
            </div>

            {/* Expenses */}
            <div className="pt-2 space-y-2">
              <span className="font-sans font-bold text-slate-400 block">{t.operatingExpenses}</span>
              <div className="flex justify-between ps-4 text-slate-400">
                <span className="font-sans">{spoilageAccount?.nameAr}</span>
                <span>{formatCurrency(spoilageAccount?.currentBalance || 0, state.language)}</span>
              </div>
              <div className="flex justify-between ps-4 text-slate-400">
                <span className="font-sans">{varianceAccount?.nameAr}</span>
                <span>{formatCurrency(varianceAccount?.currentBalance || 0, state.language)}</span>
              </div>
              <div className="flex justify-between ps-4 text-slate-400">
                <span className="font-sans">{rentAccount?.nameAr}</span>
                <span>{formatCurrency(rentAccount?.currentBalance || 0, state.language)}</span>
              </div>
              <div className="flex justify-between ps-4 text-slate-400">
                <span className="font-sans">{salariesAccount?.nameAr}</span>
                <span>{formatCurrency(salariesAccount?.currentBalance || 0, state.language)}</span>
              </div>
            </div>

            {/* Net Income */}
            <div className="pt-3 border-t-2 border-slate-700 flex justify-between items-center text-sm font-black bg-emerald-950/40 p-3 rounded-xl border border-emerald-800/80">
              <span className="font-sans text-emerald-300">{t.netProfit}</span>
              <span className="text-emerald-400 tabular-nums">
                {formatCurrency(netIncome, state.language)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Balance Sheet */}
      {activeTab === 'balance_sheet' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Assets Side */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">
              {t.totalAssets}
            </h3>
            <div className="space-y-2 text-xs font-mono">
              {assetAccounts.map((a) => (
                <div key={a.id} className="flex justify-between py-1 text-slate-300">
                  <span className="font-sans">{state.language === 'ar' ? a.nameAr : a.nameEn}</span>
                  <span className="tabular-nums">{formatCurrency(a.currentBalance, state.language)}</span>
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-slate-800 flex justify-between font-bold text-sm text-emerald-400">
              <span className="font-sans">{t.totalAssets}</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(totalAssets, state.language)}
              </span>
            </div>
          </div>

          {/* Liabilities & Equity Side */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-2">
              {t.totalLiabilitiesEquity}
            </h3>
            <div className="space-y-3 text-xs font-mono">
              {/* Liabilities */}
              <div className="space-y-1">
                <span className="font-sans font-bold text-slate-400 text-[11px] block">
                  {state.language === 'ar' ? 'الخصوم والالتزامات المتداولة' : 'Current Liabilities'}
                </span>
                {liabilityAccounts.map((a) => (
                  <div key={a.id} className="flex justify-between py-1 text-slate-300 ps-2">
                    <span className="font-sans">{state.language === 'ar' ? a.nameAr : a.nameEn}</span>
                    <span className="tabular-nums">{formatCurrency(a.currentBalance, state.language)}</span>
                  </div>
                ))}
              </div>

              {/* Equity */}
              <div className="space-y-1 pt-2 border-t border-slate-850">
                <span className="font-sans font-bold text-slate-400 text-[11px] block">
                  {state.language === 'ar' ? 'حقوق الملكية' : 'Equity'}
                </span>
                {equityAccounts.map((a) => (
                  <div key={a.id} className="flex justify-between py-1 text-slate-300 ps-2">
                    <span className="font-sans">{state.language === 'ar' ? a.nameAr : a.nameEn}</span>
                    <span className="tabular-nums">{formatCurrency(a.currentBalance, state.language)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-1 text-emerald-400 ps-2 font-bold">
                  <span className="font-sans">
                    {state.language === 'ar' ? 'أرباح الفترة الحالية (من قائمة الدخل)' : 'Current Period Net Income'}
                  </span>
                  <span className="tabular-nums">{formatCurrency(netIncome, state.language)}</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-between font-bold text-sm text-emerald-400">
              <span className="font-sans">{t.totalLiabilitiesEquity}</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(totalLiabilitiesAndEquity, state.language)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: VAT Return Summary */}
      {activeTab === 'vat_return' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl mx-auto space-y-5 shadow-sm">
          <div className="text-center pb-3 border-b border-slate-800">
            <h3 className="text-base font-bold text-white">
              {state.language === 'ar'
                ? 'إقرار ضريبة القيمة المضافة لمصلحة الضرائب المصرية (ETA)'
                : 'Egyptian Tax Authority (ETA) VAT Return Summary'}
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {state.tenant.taxRegistrationNumber}
            </span>
          </div>

          <div className="space-y-3 text-xs font-mono">
            <div className="flex justify-between py-2 border-b border-slate-800">
              <span className="font-sans text-slate-300">
                {state.language === 'ar' ? 'ضريبة المخرجات المحصلة 14% (مبيعات POS)' : 'Output VAT Collected 14% (Sales)'}
              </span>
              <span className="font-bold text-slate-100 tabular-nums">
                {formatCurrency(outputVat, state.language)}
              </span>
            </div>

            <div className="flex justify-between py-2 border-b border-slate-800">
              <span className="font-sans text-slate-300">
                {state.language === 'ar' ? 'ضريبة المدخلات القابلة للخصم 14% (مشتريات الموردين)' : 'Input VAT Deductible 14% (Purchases)'}
              </span>
              <span className="font-bold text-slate-100 tabular-nums">
                ({formatCurrency(inputVat, state.language)})
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center text-sm font-bold">
              <span className="font-sans text-emerald-300">
                {state.language === 'ar' ? 'صافي الضريبة واجبة السداد' : 'Net VAT Payable to Authority'}
              </span>
              <span className="text-lg font-mono text-emerald-400 tabular-nums">
                {formatCurrency(netVatPayable, state.language)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
