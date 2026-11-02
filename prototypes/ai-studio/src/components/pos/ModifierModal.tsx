/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Product Modifier Selection Modal
 */

import React, { useState } from 'react';
import { Product, ModifierOption } from '../../types';
import { useRestaurantStore } from '../../services/store';
import { translations, formatCurrency } from '../../lib/i18n';
import { X, Check, Plus, Minus } from 'lucide-react';

interface ModifierModalProps {
  product: Product;
  onClose: () => void;
  onConfirm: (
    quantity: number,
    selectedModifiers: {
      groupNameAr: string;
      optionNameAr: string;
      optionNameEn: string;
      priceDelta: number;
    }[],
    notes: string,
    unitPrice: number
  ) => void;
}

export const ModifierModal: React.FC<ModifierModalProps> = ({
  product,
  onClose,
  onConfirm,
}) => {
  const { state } = useRestaurantStore();
  const t = translations[state.language];

  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, ModifierOption[]>
  >(() => {
    // Select defaults for single-selection required groups
    const initial: Record<string, ModifierOption[]> = {};
    if (product.modifierGroups) {
      product.modifierGroups.forEach((group) => {
        if (group.isRequired && group.maxSelections === 1 && group.options.length > 0) {
          initial[group.id] = [group.options[0]];
        } else {
          initial[group.id] = [];
        }
      });
    }
    return initial;
  });
  const [notes, setNotes] = useState('');

  const toggleOption = (groupId: string, option: ModifierOption, isSingle: boolean) => {
    setSelectedOptions((prev) => {
      const current = prev[groupId] || [];
      if (isSingle) {
        return { ...prev, [groupId]: [option] };
      }
      const exists = current.some((o) => o.id === option.id);
      if (exists) {
        return { ...prev, [groupId]: current.filter((o) => o.id !== option.id) };
      } else {
        return { ...prev, [groupId]: [...current, option] };
      }
    });
  };

  // Calculate dynamic unit price
  let extraPrice = 0;
  Object.values(selectedOptions).forEach((opts) => {
    opts.forEach((o) => {
      extraPrice += o.priceDelta;
    });
  });
  const finalUnitPrice = product.basePrice + extraPrice;
  const totalPrice = finalUnitPrice * quantity;

  const handleSave = () => {
    const flattenedModifiers: {
      groupNameAr: string;
      optionNameAr: string;
      optionNameEn: string;
      priceDelta: number;
    }[] = [];

    if (product.modifierGroups) {
      product.modifierGroups.forEach((group) => {
        const selected = selectedOptions[group.id] || [];
        selected.forEach((opt) => {
          flattenedModifiers.push({
            groupNameAr: group.nameAr,
            optionNameAr: opt.nameAr,
            optionNameEn: opt.nameEn,
            priceDelta: opt.priceDelta,
          });
        });
      });
    }

    onConfirm(quantity, flattenedModifiers, notes, finalUnitPrice);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-white">
              {state.language === 'ar' ? product.nameAr : product.nameEn}
            </h3>
            <span className="text-xs text-slate-400">
              {formatCurrency(product.basePrice, state.language)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {product.modifierGroups &&
            product.modifierGroups.map((group) => {
              const isSingle = group.maxSelections === 1;
              const currentGroupSelection = selectedOptions[group.id] || [];

              return (
                <div key={group.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-200">
                      {state.language === 'ar' ? group.nameAr : group.nameEn}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {isSingle
                        ? state.language === 'ar'
                          ? 'اختيار واحد فقط'
                          : 'Select one'
                        : state.language === 'ar'
                        ? 'اختيارات متعددة'
                        : 'Multiple selections'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.options.map((opt) => {
                      const isSelected = currentGroupSelection.some((o) => o.id === opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => toggleOption(group.id, opt, isSingle)}
                          className={`flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all ${
                            isSelected
                              ? 'bg-emerald-950/70 border-emerald-500 text-white shadow-sm'
                              : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-4 h-4 rounded-md flex items-center justify-center border ${
                                isSelected
                                  ? 'bg-emerald-600 border-emerald-500 text-white'
                                  : 'border-slate-600 bg-slate-900'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3" />}
                            </div>
                            <span>{state.language === 'ar' ? opt.nameAr : opt.nameEn}</span>
                          </div>
                          {opt.priceDelta > 0 && (
                            <span className="text-emerald-400 font-mono tabular-nums">
                              +{formatCurrency(opt.priceDelta, state.language)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

          {/* Kitchen special notes */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">
              {t.orderNotes}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                state.language === 'ar'
                  ? 'مثال: بدون طماطم، تحميص زيادة، الصوص جانبي...'
                  : 'e.g., Extra crispy, sauce on the side, no onions...'
              }
              className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Quantity Selector */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <span className="text-sm font-semibold text-slate-200">{t.qty}</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 hover:bg-slate-700 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-base font-bold font-mono tabular-nums text-white min-w-[24px] text-center">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 hover:bg-slate-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] text-slate-400">{t.grandTotal}</span>
            <span className="text-lg font-bold font-mono tabular-nums text-emerald-400">
              {formatCurrency(totalPrice, state.language)}
            </span>
          </div>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-md active:scale-95"
          >
            {state.language === 'ar' ? 'إضافة إلى الطلب' : 'Add to Order'}
          </button>
        </div>
      </div>
    </div>
  );
};
