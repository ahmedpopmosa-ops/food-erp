/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Menu & Pricing Management Hub
 */

import React, { useState } from 'react';
import { useRestaurantStore } from '../../services/store';
import { translations, formatCurrency } from '../../lib/i18n';
import { Utensils, Plus, Check, Search, Flame, Salad, CupSoda, BookOpen } from 'lucide-react';

export const MenuManager: React.FC = () => {
  const { state } = useRestaurantStore();
  const t = translations[state.language];

  const [activeCategoryId, setActiveCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = state.products.filter((p) => {
    const matchCat = activeCategoryId === 'all' || p.categoryId === activeCategoryId;
    const matchSearch =
      p.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">{t.hubMenu}</h2>
          <p className="text-xs text-slate-400">
            {state.language === 'ar'
              ? 'إدارة وجبات القائمة، الأسعار، محطات التجهيز، وربط الوصفات وحساب هامش الربح'
              : 'Manage menu items, prices, preparation stations, recipe costing, and gross margins'}
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute top-3 start-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchMenu}
            className="w-full ps-9 pe-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveCategoryId('all')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
            activeCategoryId === 'all'
              ? 'bg-slate-100 text-slate-900 shadow-sm'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          {t.allCategories} ({state.products.length})
        </button>

        {state.categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCategoryId(c.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeCategoryId === c.id
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {state.language === 'ar' ? c.nameAr : c.nameEn}
          </button>
        ))}
      </div>

      {/* Products Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 text-start">{t.item}</th>
                <th className="py-3 px-4 text-start">{t.code}</th>
                <th className="py-3 px-4 text-start">{state.language === 'ar' ? 'القسم' : 'Category'}</th>
                <th className="py-3 px-4 text-start">{state.language === 'ar' ? 'المحطة' : 'Station'}</th>
                <th className="py-3 px-4 text-end">{t.price}</th>
                <th className="py-3 px-4 text-end">{t.theoreticalCost}</th>
                <th className="py-3 px-4 text-end">{t.foodCostPercent}</th>
                <th className="py-3 px-4 text-center">{state.language === 'ar' ? 'الوصفة' : 'Recipe'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {filtered.map((prod) => {
                const category = state.categories.find((c) => c.id === prod.categoryId);
                const foodCostPct = Number(((prod.costPrice / prod.basePrice) * 100).toFixed(1));
                const hasRecipe = !!prod.recipeId;

                return (
                  <tr key={prod.id} className="hover:bg-slate-850/60 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-white">
                      <div>
                        <span>{state.language === 'ar' ? prod.nameAr : prod.nameEn}</span>
                        <span className="block text-[11px] font-normal text-slate-400 mt-0.5">
                          {state.language === 'ar' ? prod.descriptionAr : prod.descriptionEn}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">{prod.sku}</td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {category ? (state.language === 'ar' ? category.nameAr : category.nameEn) : '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {prod.prepStation}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-end font-mono font-bold text-emerald-400 tabular-nums">
                      {formatCurrency(prod.basePrice, state.language)}
                    </td>
                    <td className="py-3.5 px-4 text-end font-mono text-slate-300 tabular-nums">
                      {formatCurrency(prod.costPrice, state.language)}
                    </td>
                    <td className="py-3.5 px-4 text-end font-mono tabular-nums">
                      <span
                        className={
                          foodCostPct <= 35
                            ? 'text-emerald-400'
                            : foodCostPct <= 45
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }
                      >
                        {foodCostPct}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {hasRecipe ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                          <Check className="w-3.5 h-3.5" />
                          <span>{state.language === 'ar' ? 'مفعلة' : 'Linked'}</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">
                          {state.language === 'ar' ? 'بدون وصفة' : 'No Recipe'}
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
    </div>
  );
};
