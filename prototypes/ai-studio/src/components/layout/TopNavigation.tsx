/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Top Navigation Bar (Strict 3-Zone Contract)
 */

import React from 'react';
import { useRestaurantStore } from '../../services/store';
import { translations } from '../../lib/i18n';
import { Wifi, WifiOff, Globe, UtensilsCrossed, MonitorCheck, LayoutDashboard, Building2, Settings, PhoneCall } from 'lucide-react';

export type WorkspaceView = 'pos' | 'callcenter' | 'kds' | 'hub' | 'saas' | 'settings';

interface TopNavigationProps {
  currentView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
}

export const TopNavigation: React.FC<TopNavigationProps> = ({ currentView, onSelectView }) => {
  const { state, setLanguage, toggleNetworkMode } = useRestaurantStore();
  const t = translations[state.language];

  const callCenterOrdersCount = state.orders.filter((o) => o.orderSource === 'CALL_CENTER').length;

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-slate-200 text-slate-800 sticky top-0 z-40 select-none shadow-xs">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[#5A24CA] flex items-center justify-center text-white font-black text-lg shadow-sm">
          F
        </div>
        <div className="flex flex-col">
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            RestaurantOS
          </span>
          <span className="text-[11px] text-slate-500 whitespace-nowrap hidden sm:inline">
            {state.language === 'ar' ? state.tenant.tradeNameAr : state.tenant.tradeNameEn}
          </span>
        </div>
      </div>

      {/* Zone 2: Clean single-line workspace navigation links */}
      <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1">
        <button
          onClick={() => onSelectView('pos')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
            currentView === 'pos'
              ? 'bg-[#5A24CA] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <UtensilsCrossed className="w-3.5 h-3.5" />
          <span>{t.workspacePos}</span>
        </button>

        <button
          onClick={() => onSelectView('callcenter')}
          className={`relative flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
            currentView === 'callcenter'
              ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <PhoneCall className={`w-3.5 h-3.5 ${currentView === 'callcenter' ? 'text-white' : 'text-indigo-600'}`} />
          <span>{t.workspaceCallCenter}</span>
          {callCenterOrdersCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-500 text-white">
              {callCenterOrdersCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onSelectView('kds')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
            currentView === 'kds'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <MonitorCheck className="w-3.5 h-3.5" />
          <span>{t.workspaceKds}</span>
        </button>

        <button
          onClick={() => onSelectView('hub')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
            currentView === 'hub'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>{t.workspaceHub}</span>
        </button>

        <button
          onClick={() => onSelectView('saas')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
            currentView === 'saas'
              ? 'bg-purple-700 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>{t.workspaceSaas}</span>
        </button>

        <button
          onClick={() => onSelectView('settings')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
            currentView === 'settings'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>{t.workspaceSettings}</span>
        </button>
      </nav>

      {/* Zone 3: Primary operational controls */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Network status toggle for offline resilience demo */}
        <button
          onClick={toggleNetworkMode}
          title={state.isOnline ? t.simulateOffline : t.simulateOnline}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
            state.isOnline
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
              : 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100'
          }`}
        >
          {state.isOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden md:inline font-bold">{t.online}</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-rose-600" />
              <span className="hidden md:inline font-bold">{t.offline}</span>
            </>
          )}
        </button>

        {/* Language switch */}
        <button
          onClick={() => setLanguage(state.language === 'ar' ? 'en' : 'ar')}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
        >
          <Globe className="w-3.5 h-3.5 text-slate-500" />
          <span className="font-bold">{state.language === 'ar' ? 'English' : 'عربي'}</span>
        </button>

        {/* Cashier shift info */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs">
          <span className="text-slate-500">{state.language === 'ar' ? 'الكاشير:' : 'Cashier:'}</span>
          <span className="font-bold text-slate-800">{state.currentUser.fullNameAr}</span>
        </div>
      </div>
    </header>
  );
};
