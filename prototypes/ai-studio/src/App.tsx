/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Root Application Shell
 */

import React, { useState, useEffect } from 'react';
import { useRestaurantStore } from './services/store';
import { TopNavigation, WorkspaceView } from './components/layout/TopNavigation';
import { OfflineSyncBanner } from './components/layout/OfflineSyncBanner';
import { PosTerminal } from './components/pos/PosTerminal';
import { KitchenDisplay } from './components/kds/KitchenDisplay';
import { ManagerHub } from './components/hub/ManagerHub';
import { SaasAdmin } from './components/saas/SaasAdmin';
import { SettingsManager } from './components/settings/SettingsManager';
import { CallCenterHub } from './components/callcenter/CallCenterHub';

export default function App() {
  const { state } = useRestaurantStore();
  const [currentView, setCurrentView] = useState<WorkspaceView>('pos');

  // Sync HTML lang and dir attribute
  useEffect(() => {
    document.documentElement.lang = state.language;
    document.documentElement.dir = state.language === 'ar' ? 'rtl' : 'ltr';
  }, [state.language]);

  return (
    <div
      className="min-h-screen flex flex-col bg-white text-slate-900 font-sans"
      dir={state.language === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* Top Bar Contract Navigation */}
      <TopNavigation currentView={currentView} onSelectView={setCurrentView} />

      {/* Offline & Transactional Outbox Banner */}
      <OfflineSyncBanner />

      {/* Active Workspace Viewport */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {currentView === 'pos' && <PosTerminal onOpenSettings={() => setCurrentView('settings')} />}
        {currentView === 'callcenter' && <CallCenterHub />}
        {currentView === 'kds' && <KitchenDisplay />}
        {currentView === 'hub' && <ManagerHub />}
        {currentView === 'saas' && <SaasAdmin />}
        {currentView === 'settings' && <SettingsManager />}
      </main>
    </div>
  );
}
