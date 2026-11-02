/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Inventory, Recipes & Stock Depletion Ledger
 */

import React, { useState } from 'react';
import { useRestaurantStore } from '../../services/store';
import { translations, formatCurrency } from '../../lib/i18n';
import {
  Boxes,
  BookOpen,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  Plus,
  Trash2,
  Scale,
  RefreshCw,
  X,
  CheckCircle2,
} from 'lucide-react';

export const InventoryManager: React.FC = () => {
  const { state, recordWastage } = useRestaurantStore();
  const t = translations[state.language];

  const [activeTab, setActiveTab] = useState<'catalog' | 'recipes' | 'movements'>('catalog');
  const [isWastageModalOpen, setIsWastageModalOpen] = useState(false);

  // Wastage form state
  const [selectedIngredientId, setSelectedIngredientId] = useState(state.ingredients[0]?.id || '');
  const [wastageQtyKg, setWastageQtyKg] = useState('1.5');
  const [wastageReason, setWastageReason] = useState('BURNT_SPOILED');

  const handleRecordWastage = () => {
    const qty = parseFloat(wastageQtyKg) || 0;
    if (qty <= 0) return;

    recordWastage(selectedIngredientId, qty, wastageReason);
    setIsWastageModalOpen(false);
  };

  // Calculate total inventory valuation
  const totalInventoryValuation = state.ingredients.reduce((acc, ing) => {
    const balance = state.stockBalances.find(
      (b) => b.warehouseId === state.activeWarehouseId && b.ingredientId === ing.id
    );
    const qty = balance ? balance.quantityOnHand : 0;
    return acc + qty * ing.currentCostPerBaseUnit;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Top Header & Valuation Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">{t.hubInventory}</h2>
          <p className="text-xs text-slate-400">
            {state.language === 'ar'
              ? 'إدارة المواد الأولية الخام، تركيبات الوصفات، حركات المخزون، وتسجيل الهدر والتالف'
              : 'Raw ingredients catalog, recipe formulation, movement audit logs, and spoilage write-offs'}
          </p>
        </div>

        {/* Valuation Badge & Wastage CTA */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <span className="text-slate-400 block text-[10px]">
              {state.language === 'ar' ? 'إجمالي قيمة المخزون (WAC)' : 'Total Inventory Valuation'}
            </span>
            <span className="text-sm font-bold font-mono text-emerald-400 tabular-nums">
              {formatCurrency(totalInventoryValuation, state.language)}
            </span>
          </div>

          <button
            onClick={() => setIsWastageModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600/90 hover:bg-rose-600 text-white font-bold text-xs rounded-xl transition-all shadow-sm active:scale-95 whitespace-nowrap"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{t.recordWastage}</span>
          </button>
        </div>
      </div>

      {/* Segmented Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'catalog'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          <span>{t.ingredientsCatalog}</span>
        </button>

        <button
          onClick={() => setActiveTab('recipes')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'recipes'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>{t.hubRecipes}</span>
        </button>

        <button
          onClick={() => setActiveTab('movements')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'movements'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{t.stockMovements} ({state.stockMovements.length})</span>
        </button>
      </div>

      {/* Tab 1: Ingredients Catalog */}
      {activeTab === 'catalog' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 text-start">{t.code}</th>
                  <th className="py-3 px-4 text-start">{t.ingredientName}</th>
                  <th className="py-3 px-4 text-start">{state.language === 'ar' ? 'الوحدة' : 'Units'}</th>
                  <th className="py-3 px-4 text-end">{t.stockOnHand}</th>
                  <th className="py-3 px-4 text-end">{t.wacCost}</th>
                  <th className="py-3 px-4 text-end">{state.language === 'ar' ? 'قيمة الرصيد' : 'Total Asset Value'}</th>
                  <th className="py-3 px-4 text-center">{t.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {state.ingredients.map((ing) => {
                  const balance = state.stockBalances.find(
                    (b) => b.warehouseId === state.activeWarehouseId && b.ingredientId === ing.id
                  );
                  const qtyOnHand = balance ? balance.quantityOnHand : 0;
                  const isLowStock = qtyOnHand <= ing.minimumAlertStock;

                  // Render quantity in purchase units (e.g. kg or cartons)
                  const displayQty = (qtyOnHand / ing.conversionFactor).toFixed(2);
                  const displayCost = (ing.currentCostPerBaseUnit * ing.conversionFactor).toFixed(2);
                  const totalLineValue = qtyOnHand * ing.currentCostPerBaseUnit;

                  return (
                    <tr key={ing.id} className="hover:bg-slate-850/60 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-slate-400">{ing.code}</td>
                      <td className="py-3.5 px-4 font-bold text-white">
                        {state.language === 'ar' ? ing.nameAr : ing.nameEn}
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {ing.purchaseUnit} ({ing.conversionFactor} {ing.baseUnit})
                      </td>
                      <td className="py-3.5 px-4 text-end font-mono font-bold text-slate-200 tabular-nums">
                        {displayQty} {ing.purchaseUnit}
                      </td>
                      <td className="py-3.5 px-4 text-end font-mono text-slate-300 tabular-nums">
                        {displayCost} {t.currencyUnit} / {ing.purchaseUnit}
                      </td>
                      <td className="py-3.5 px-4 text-end font-mono font-bold text-emerald-400 tabular-nums">
                        {formatCurrency(totalLineValue, state.language)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {isLowStock ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800">
                            <AlertTriangle className="w-3 h-3" />
                            <span>{state.language === 'ar' ? 'دون حد الأمان' : 'Low Stock'}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/60">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{state.language === 'ar' ? 'متوفر' : 'In Stock'}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Recipes & Formulation */}
      {activeTab === 'recipes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {state.recipes.map((recipe) => {
            const product = state.products.find((p) => p.id === recipe.productId);
            if (!product) return null;

            // Compute theoretical cost
            let recipeCost = 0;
            recipe.items.forEach((item) => {
              const ing = state.ingredients.find((i) => i.id === item.ingredientId);
              if (ing) {
                recipeCost += item.quantityBaseUnit * ing.currentCostPerBaseUnit;
              }
            });

            const foodCostPct = Number(((recipeCost / product.basePrice) * 100).toFixed(1));

            return (
              <div
                key={recipe.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm"
              >
                <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {state.language === 'ar' ? product.nameAr : product.nameEn}
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      {state.language === 'ar' ? 'سعر البيع:' : 'Retail Price:'}{' '}
                      <strong className="text-emerald-400 font-mono">
                        {formatCurrency(product.basePrice, state.language)}
                      </strong>
                    </span>
                  </div>
                  <div className="text-end">
                    <span className="text-xs text-slate-400 block">{t.foodCostPercent}</span>
                    <span className="text-base font-bold font-mono tabular-nums text-amber-400">
                      {foodCostPct}%
                    </span>
                  </div>
                </div>

                {/* Recipe Ingredients Breakdown */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-slate-400 block">
                    {state.language === 'ar' ? 'المكونات ومعدل الصرف للوجبة:' : 'Ingredient Portions per Meal:'}
                  </span>
                  <div className="space-y-1.5 text-xs">
                    {recipe.items.map((item, idx) => {
                      const ing = state.ingredients.find((i) => i.id === item.ingredientId);
                      if (!ing) return null;
                      const itemCost = item.quantityBaseUnit * ing.currentCostPerBaseUnit;

                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-850"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-slate-200">
                              {state.language === 'ar' ? ing.nameAr : ing.nameEn}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 font-mono tabular-nums">
                            <span className="text-slate-400">
                              {item.quantityBaseUnit} {ing.baseUnit}
                            </span>
                            <span className="text-emerald-400 font-semibold">
                              {formatCurrency(itemCost, state.language)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
                  <span className="text-slate-400">{t.theoreticalCost}</span>
                  <span className="font-bold font-mono tabular-nums text-white">
                    {formatCurrency(recipeCost, state.language)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab 3: Stock Movements Audit Ledger */}
      {activeTab === 'movements' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 text-start">{t.date}</th>
                  <th className="py-3 px-4 text-start">{t.movementType}</th>
                  <th className="py-3 px-4 text-start">{t.ingredientName}</th>
                  <th className="py-3 px-4 text-end">{t.qty}</th>
                  <th className="py-3 px-4 text-end">{t.price}</th>
                  <th className="py-3 px-4 text-end">{state.language === 'ar' ? 'إجمالي التكلفة' : 'Total Cost'}</th>
                  <th className="py-3 px-4 text-start">{t.notes}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {state.stockMovements.map((m) => {
                  const isPositive = m.quantityBaseUnit > 0;
                  const ing = state.ingredients.find((i) => i.id === m.ingredientId);
                  const displayQty = ing
                    ? (Math.abs(m.quantityBaseUnit) / ing.conversionFactor).toFixed(2) + ' ' + ing.purchaseUnit
                    : `${Math.abs(m.quantityBaseUnit)}`;

                  return (
                    <tr key={m.id} className="hover:bg-slate-850/60 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {new Date(m.occurredAt).toLocaleDateString()} {new Date(m.occurredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${
                            m.movementType === 'PURCHASE_RECEIPT'
                              ? 'bg-blue-950/80 text-blue-400 border border-blue-800'
                              : m.movementType === 'SALE_DEPLETION'
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                              : 'bg-rose-950/80 text-rose-400 border border-rose-800'
                          }`}
                        >
                          {m.movementType === 'PURCHASE_RECEIPT' ? (
                            <ArrowDownRight className="w-3 h-3" />
                          ) : (
                            <ArrowUpRight className="w-3 h-3" />
                          )}
                          <span>
                            {m.movementType === 'SALE_DEPLETION'
                              ? t.movementSale
                              : m.movementType === 'PURCHASE_RECEIPT'
                              ? t.movementPurchase
                              : t.movementWastage}
                          </span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-white">
                        {state.language === 'ar' ? m.ingredientNameAr : m.ingredientNameEn}
                      </td>
                      <td
                        className={`py-3 px-4 text-end font-mono font-bold tabular-nums ${
                          isPositive ? 'text-blue-400' : 'text-slate-300'
                        }`}
                      >
                        {isPositive ? `+${displayQty}` : `-${displayQty}`}
                      </td>
                      <td className="py-3 px-4 text-end font-mono text-slate-400 tabular-nums">
                        {m.unitCostEGP.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-end font-mono font-bold text-slate-200 tabular-nums">
                        {formatCurrency(m.totalCostEGP, state.language)}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px]">{m.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Wastage Modal */}
      {isWastageModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <h3 className="text-base font-bold text-white">{t.recordWastage}</h3>
              </div>
              <button
                onClick={() => setIsWastageModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Select Ingredient */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300 block">{t.ingredientName}</label>
                <select
                  value={selectedIngredientId}
                  onChange={(e) => setSelectedIngredientId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-rose-500"
                >
                  {state.ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {state.language === 'ar' ? ing.nameAr : ing.nameEn} ({ing.purchaseUnit})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity in KG */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300 block">
                  {state.language === 'ar' ? 'الكمية المهدرة (كجم / وحدات شراء)' : 'Wastage Quantity (kg / units)'}
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={wastageQtyKg}
                  onChange={(e) => setWastageQtyKg(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono font-bold text-sm focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Reason */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-300 block">{t.wastageReason}</label>
                <select
                  value={wastageReason}
                  onChange={(e) => setWastageReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-rose-500"
                >
                  <option value="BURNT_SPOILED">
                    {state.language === 'ar' ? 'احتراق أو تلف أثناء الطهي' : 'Burnt / Kitchen Overcook'}
                  </option>
                  <option value="EXPIRED">
                    {state.language === 'ar' ? 'انتهاء فترة الصلاحية' : 'Expired Batch'}
                  </option>
                  <option value="DEFECTIVE_BATCH">
                    {state.language === 'ar' ? 'عيب في الجودة من المورد' : 'Vendor Quality Defect'}
                  </option>
                </select>
              </div>

              <p className="text-[11px] text-slate-400 bg-slate-950 p-3 rounded-lg border border-slate-800">
                {state.language === 'ar'
                  ? 'سيتم ترحيل قيد محاسبي فوري: مدين مصروف الهدر والتالف (5020) ودائن مخزون المواد الأولية (1200).'
                  : 'Automatic journal voucher will be posted: Debit Spoilage Expense 5020 and Credit Raw Material Inventory 1200.'}
              </p>
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={() => setIsWastageModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
              >
                {t.cancel}
              </button>

              <button
                onClick={handleRecordWastage}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-md active:scale-95"
              >
                {state.language === 'ar' ? 'تأكيد وترحيل القيد' : 'Confirm & Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
