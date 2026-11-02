/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Purchasing, Vendors & Goods Receipting
 */

import React, { useState } from 'react';
import { useRestaurantStore } from '../../services/store';
import { translations, formatCurrency } from '../../lib/i18n';
import {
  Truck,
  Plus,
  FileText,
  DollarSign,
  Phone,
  Building,
  CheckCircle2,
  X,
  Receipt,
  ArrowRight,
} from 'lucide-react';

export const PurchasingManager: React.FC = () => {
  const { state, receivePurchaseOrder } = useRestaurantStore();
  const t = translations[state.language];

  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Form state
  const [selectedSupplierId, setSelectedSupplierId] = useState(state.suppliers[0]?.id || '');
  const [invoiceRef, setInvoiceRef] = useState(`PO-INV-${Date.now().toString().slice(-4)}`);
  const [freightCost, setFreightCost] = useState('250');

  // Purchase items (ingredientId, qtyKg, unitPrice)
  const [purchaseLines, setPurchaseLines] = useState<
    { ingredientId: string; quantityKg: number; unitPriceEGP: number }[]
  >([
    { ingredientId: 'ing-beef', quantityKg: 30, unitPriceEGP: 380 },
    { ingredientId: 'ing-chicken', quantityKg: 40, unitPriceEGP: 180 },
  ]);

  const addPurchaseLine = () => {
    setPurchaseLines([
      ...purchaseLines,
      { ingredientId: state.ingredients[0].id, quantityKg: 10, unitPriceEGP: 100 },
    ]);
  };

  const removePurchaseLine = (index: number) => {
    setPurchaseLines(purchaseLines.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: string, val: any) => {
    const updated = [...purchaseLines];
    updated[index] = { ...updated[index], [field]: val };
    setPurchaseLines(updated);
  };

  const subtotal = purchaseLines.reduce((acc, l) => acc + l.quantityKg * l.unitPriceEGP, 0);
  const taxAmount = Number((subtotal * 0.14).toFixed(2));
  const freight = parseFloat(freightCost) || 0;
  const grandTotal = subtotal + taxAmount + freight;

  const handleConfirmReceipt = () => {
    if (purchaseLines.length === 0) return;
    receivePurchaseOrder(selectedSupplierId, purchaseLines, freight, invoiceRef);
    setIsReceiptModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">{t.hubPurchasing}</h2>
          <p className="text-xs text-slate-400">
            {state.language === 'ar'
              ? 'إدارة حسابات الموردين، استلام فواتير الشراء، حساب تكلفة WAC المرجحة، وترحيل قيود الدائنين'
              : 'Vendor directory, goods receipting, WAC cost recalculation, and accounts payable postings'}
          </p>
        </div>

        <button
          onClick={() => setIsReceiptModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 whitespace-nowrap"
        >
          <Truck className="w-4 h-4" />
          <span>{t.createPurchaseOrder}</span>
        </button>
      </div>

      {/* Vendors List Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {state.suppliers.map((supp) => (
          <div
            key={supp.id}
            className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span className="font-mono text-[11px]">{supp.taxNumber}</span>
                <span className="text-emerald-400 font-semibold">
                  {state.language === 'ar' ? 'مورد معتمد' : 'Verified Vendor'}
                </span>
              </div>
              <h3 className="text-sm font-bold text-white">
                {state.language === 'ar' ? supp.nameAr : supp.nameEn}
              </h3>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-slate-500" />
                <span>{supp.contactPerson}</span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 font-mono">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                <span>{supp.phone}</span>
              </p>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">{t.outstandingBalance}</span>
              <span className="text-sm font-bold font-mono text-amber-400 tabular-nums">
                {formatCurrency(supp.outstandingBalanceEGP, state.language)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Goods Receipt / Vendor Invoice Modal */}
      {isReceiptModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">{t.createPurchaseOrder}</h3>
              </div>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
              {/* Vendor & Invoice Reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300 block">{t.supplierName}</label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  >
                    {state.suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {state.language === 'ar' ? s.nameAr : s.nameEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-slate-300 block">{t.invoiceRef}</label>
                  <input
                    type="text"
                    value={invoiceRef}
                    onChange={(e) => setInvoiceRef(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-300 block">
                    {state.language === 'ar' ? 'بنود المواد الأولية الواردة' : 'Incoming Raw Materials'}
                  </label>
                  <button
                    type="button"
                    onClick={addPurchaseLine}
                    className="flex items-center gap-1 text-emerald-400 hover:underline font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{state.language === 'ar' ? 'إضافة بند' : 'Add Item'}</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {purchaseLines.map((line, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-950 border border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                    >
                      <div className="sm:col-span-5">
                        <select
                          value={line.ingredientId}
                          onChange={(e) => updateLine(idx, 'ingredientId', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                        >
                          {state.ingredients.map((ing) => (
                            <option key={ing.id} value={ing.id}>
                              {state.language === 'ar' ? ing.nameAr : ing.nameEn} ({ing.purchaseUnit})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            value={line.quantityKg}
                            onChange={(e) => updateLine(idx, 'quantityKg', parseFloat(e.target.value) || 0)}
                            placeholder="الكمية"
                            className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-center"
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-3">
                        <input
                          type="number"
                          step="any"
                          value={line.unitPriceEGP}
                          onChange={(e) => updateLine(idx, 'unitPriceEGP', parseFloat(e.target.value) || 0)}
                          placeholder="سعر الوحدة"
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-center"
                        />
                      </div>

                      <div className="sm:col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => removePurchaseLine(idx)}
                          className="p-1.5 text-rose-400 hover:text-rose-300"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Landed Freight Cost */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300 block">{t.freightCost}</label>
                <input
                  type="number"
                  step="any"
                  value={freightCost}
                  onChange={(e) => setFreightCost(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Totals Summary */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="flex justify-between text-slate-400">
                  <span>{t.subtotal}</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {formatCurrency(subtotal, state.language)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>{t.vat14}</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {formatCurrency(taxAmount, state.language)}
                  </span>
                </div>
                {freight > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>{t.freightCost}</span>
                    <span className="font-mono tabular-nums text-slate-200">
                      {formatCurrency(freight, state.language)}
                    </span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-800 flex justify-between font-bold text-sm text-white">
                  <span>{state.language === 'ar' ? 'إجمالي مستحق المورد' : 'Grand Total Payable'}</span>
                  <span className="font-mono tabular-nums text-emerald-400">
                    {formatCurrency(grandTotal, state.language)}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-950 p-3 rounded-lg border border-slate-800">
                {state.language === 'ar'
                  ? 'سيتم تحديث متوسط التكلفة المرجح (WAC) لكل مادة أولية فوراً وترحيل قيد اليومية المتزن: مدين مخزون 1200 + مدين ضريبة مدخلات 2110، ودائن موردون 2010.'
                  : 'Weighted Average Cost (WAC) will be recalculated instantly, and balanced journal voucher posted: Debit 1200 Inventory + Debit 2110 Input VAT, Credit 2010 Accounts Payable.'}
              </p>
            </div>

            {/* Footer */}
            <div className="p-5 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
              >
                {t.cancel}
              </button>

              <button
                type="button"
                onClick={handleConfirmReceipt}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-md active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{state.language === 'ar' ? 'استلام البضاعة وترحيل القيد' : 'Confirm & Post Voucher'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
