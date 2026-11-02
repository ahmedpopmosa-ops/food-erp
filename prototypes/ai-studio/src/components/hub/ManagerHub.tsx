/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Restaurant Manager Cloud Hub Container
 */

import React, { useState } from 'react';
import { useRestaurantStore } from '../../services/store';
import { translations } from '../../lib/i18n';
import { MenuManager } from './MenuManager';
import { InventoryManager } from './InventoryManager';
import { PurchasingManager } from './PurchasingManager';
import { AccountingHub } from './AccountingHub';
import { EmployeesManager } from './EmployeesManager';
import { ReportsDashboard } from './ReportsDashboard';
import {
  Utensils,
  Boxes,
  Truck,
  Landmark,
  Users,
  LineChart,
} from 'lucide-react';

export type HubTab = 'menu' | 'inventory' | 'purchasing' | 'accounting' | 'employees' | 'reports';

export const ManagerHub: React.FC = () => {
  const { state } = useRestaurantStore();
  const t = translations[state.language];

  const [activeTab, setActiveTab] = useState<HubTab>('menu');

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-60px)] bg-slate-950 text-slate-100 overflow-hidden select-none">
      {/* Sub Header Navigation */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-2.5 flex items-center gap-2 overflow-x-auto shrink-0">
        <button
          onClick={() => setActiveTab('menu')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'menu'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Utensils className="w-3.5 h-3.5" />
          <span>{t.hubMenu}</span>
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'inventory'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          <span>{t.hubInventory}</span>
        </button>

        <button
          onClick={() => setActiveTab('purchasing')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'purchasing'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          <span>{t.hubPurchasing}</span>
        </button>

        <button
          onClick={() => setActiveTab('accounting')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'accounting'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Landmark className="w-3.5 h-3.5" />
          <span>{t.hubAccounting}</span>
        </button>

        <button
          onClick={() => setActiveTab('employees')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'employees'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>{t.hubEmployees}</span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'reports'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <LineChart className="w-3.5 h-3.5" />
          <span>{t.hubReports}</span>
        </button>
      </div>

      {/* Main Content Viewport */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {activeTab === 'menu' && <MenuManager />}
          {activeTab === 'inventory' && <InventoryManager />}
          {activeTab === 'purchasing' && <PurchasingManager />}
          {activeTab === 'accounting' && <AccountingHub />}
          {activeTab === 'employees' && <EmployeesManager />}
          {activeTab === 'reports' && <ReportsDashboard />}
        </div>
      </div>
    </div>
  );
};
