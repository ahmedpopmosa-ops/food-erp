/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Foodics POS Discount Modal
 */

import React, { useState } from 'react';
import { X, Percent, DollarSign, Check } from 'lucide-react';

interface DiscountModalProps {
  currentDiscount: number;
  subtotal: number;
  currency: string;
  onApply: (discountAmount: number) => void;
  onClose: () => void;
}

export const DiscountModal: React.FC<DiscountModalProps> = ({
  currentDiscount,
  subtotal,
  currency,
  onApply,
  onClose,
}) => {
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [value, setValue] = useState<string>(currentDiscount > 0 ? currentDiscount.toString() : '11');

  const presetPercentages = [5, 10, 15, 20, 25, 50];

  const handlePercentageClick = (pct: number) => {
    setDiscountType('percent');
    const calc = Number(((subtotal * pct) / 100).toFixed(2));
    setValue(calc.toString());
  };

  const handleApply = () => {
    const num = parseFloat(value) || 0;
    const finalAmount = Math.min(subtotal, Math.max(0, num));
    onApply(finalAmount);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#5A24CA] text-white">
          <div className="flex items-center gap-2">
            <Percent className="w-5 h-5" />
            <h3 className="font-bold text-lg">Apply Discount</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Discount amount input */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Discount Amount ({currency})
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.5"
                min="0"
                max={subtotal}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full text-2xl font-bold px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-[#5A24CA] focus:bg-white outline-none text-slate-800 transition-all"
                placeholder="0.00"
                autoFocus
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                {currency}
              </span>
            </div>
          </div>

          {/* Quick preset buttons */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Quick Percentages
            </label>
            <div className="grid grid-cols-3 gap-2">
              {presetPercentages.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handlePercentageClick(pct)}
                  className="py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-[#5A24CA]/10 hover:border-[#5A24CA] hover:text-[#5A24CA] text-slate-700 font-bold text-sm transition-colors text-center"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Subtotal reference */}
          <div className="bg-slate-50 p-3 rounded-xl flex items-center justify-between text-xs text-slate-600">
            <span>Order Subtotal:</span>
            <span className="font-bold text-slate-900">{currency} {subtotal.toFixed(2)}</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                onApply(0);
                onClose();
              }}
              className="flex-1 py-3 px-4 rounded-xl border border-rose-200 text-rose-600 font-semibold hover:bg-rose-50 transition-colors text-center text-sm"
            >
              Remove Discount
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="flex-1 py-3 px-4 rounded-xl bg-[#5A24CA] hover:bg-[#4C1CB3] text-white font-bold text-sm transition-colors shadow-md shadow-[#5A24CA]/30 flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
