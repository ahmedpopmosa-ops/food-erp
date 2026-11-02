/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Offline Outbox & Network Status Banner
 */

import React from 'react';
import { useRestaurantStore } from '../../services/store';
import { translations } from '../../lib/i18n';
import { AlertCircle, RefreshCw, CheckCircle2, ShieldCheck } from 'lucide-react';

export const OfflineSyncBanner: React.FC = () => {
  const { state, syncOutboxNow } = useRestaurantStore();
  const t = translations[state.language];

  const pendingCount = state.syncOutbox.filter((item) => item.status === 'PENDING').length;

  if (state.isOnline && pendingCount === 0) {
    return null; // Silent when everything is normal and synced
  }

  return (
    <div className="bg-amber-950/90 border-b border-amber-800/80 px-6 py-2 flex items-center justify-between text-xs text-amber-200">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
        <div>
          {!state.isOnline ? (
            <span className="font-semibold text-amber-300">
              {state.language === 'ar'
                ? 'تعمل الآن بوضع عدم الاتصال المحلي (Offline Engine) — عمليات البيع والمخزون تحفظ محلياً بدقة تامة.'
                : 'Operating in Offline-First mode — sales and inventory are securely saved to local transactional store.'}
            </span>
          ) : (
            <span>
              {state.language === 'ar'
                ? `توجد ${pendingCount} عمليات مبيعات ومخزون معلقة بانتظار استكمال الترحيل للسحابة.`
                : `${pendingCount} operations queued in local outbox awaiting cloud synchronization.`}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {pendingCount > 0 && state.isOnline && (
          <button
            onClick={syncOutboxNow}
            className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded transition-colors whitespace-nowrap shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t.syncNow}</span>
          </button>
        )}
        <div className="hidden sm:flex items-center gap-1 text-[11px] text-amber-400/80">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{state.language === 'ar' ? 'المعاملات مؤمّنة ضد فقدان الطاقة' : 'Durable Local Store'}</span>
        </div>
      </div>
    </div>
  );
};
