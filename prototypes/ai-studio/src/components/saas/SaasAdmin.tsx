/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — SaaS Platform Operator & Subscription Console
 */

import React from 'react';
import { useRestaurantStore } from '../../services/store';
import { translations, formatCurrency } from '../../lib/i18n';
import { INITIAL_PLANS } from '../../db/initialData';
import {
  Building2,
  Shield,
  Layers,
  Monitor,
  CheckCircle2,
  Activity,
  Cpu,
  RefreshCw,
  HardDrive,
  Clock,
} from 'lucide-react';

export const SaasAdmin: React.FC = () => {
  const { state, syncOutboxNow, toggleNetworkMode } = useRestaurantStore();
  const t = translations[state.language];

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-slate-950 text-slate-100 select-none">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">{t.saasConsole}</h2>
            <p className="text-xs text-slate-400">
              {state.language === 'ar'
                ? 'إدارة اشتراكات المطاعم، حصص الفروع والأجهزة، ومراقبة خوادم المزامنة وعزل البيانات'
                : 'Platform multi-tenant subscription tiers, quotas, device registries, and outbox telemetry'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleNetworkMode}
              className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                state.isOnline
                  ? 'bg-emerald-950 border-emerald-800 text-emerald-400'
                  : 'bg-rose-950 border-rose-800 text-rose-400'
              }`}
            >
              {state.isOnline ? t.simulateOffline : t.simulateOnline}
            </button>
            <button
              onClick={syncOutboxNow}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t.syncNow}</span>
            </button>
          </div>
        </div>

        {/* Subscribed Tenant Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-950/80 border border-purple-800 flex items-center justify-center text-purple-400">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {state.language === 'ar' ? state.tenant.tradeNameAr : state.tenant.tradeNameEn}
                </h3>
                <span className="text-xs text-slate-400">
                  {state.tenant.name} · Subdomain: {state.tenant.subdomain}.restaurantos.io
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                {state.tenant.subscriptionStatus}
              </span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-950 text-purple-400 border border-purple-800">
                TIER: {state.tenant.planTier}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-500 text-[10px] block font-sans">
                {state.language === 'ar' ? 'السجل التجاري' : 'Commercial Register'}
              </span>
              <span className="font-bold text-slate-200">{state.tenant.commercialRegister}</span>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-500 text-[10px] block font-sans">
                {state.language === 'ar' ? 'التسجيل الضريبي (ETA)' : 'Tax ID (ETA)'}
              </span>
              <span className="font-bold text-slate-200">{state.tenant.taxRegistrationNumber}</span>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-500 text-[10px] block font-sans">
                {state.language === 'ar' ? 'الفروع المسجلة' : 'Active Branches'}
              </span>
              <span className="font-bold text-emerald-400">
                {state.branches.length} / 5 {state.language === 'ar' ? 'فروع' : 'branches'}
              </span>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-slate-500 text-[10px] block font-sans">
                {state.language === 'ar' ? 'أجهزة نقاط البيع' : 'Registered Devices'}
              </span>
              <span className="font-bold text-blue-400">
                2 / 12 {state.language === 'ar' ? 'أجهزة' : 'devices'}
              </span>
            </div>
          </div>
        </div>

        {/* Subscription Tier Cards */}
        <div className="space-y-4">
          <h3 className="text-base font-bold text-white">{t.subscriptionPlans}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {INITIAL_PLANS.map((plan) => {
              const isCurrent = plan.tierCode === state.tenant.planTier;

              return (
                <div
                  key={plan.id}
                  className={`bg-slate-900 border rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between ${
                    isCurrent ? 'border-purple-600 ring-1 ring-purple-500' : 'border-slate-800'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">
                        {state.language === 'ar' ? plan.nameAr : plan.nameEn}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-950 text-purple-400 border border-purple-800">
                          {state.language === 'ar' ? 'الباقة الحالية' : 'Active Plan'}
                        </span>
                      )}
                    </div>

                    <div className="font-mono">
                      <span className="text-2xl font-black text-white">
                        {formatCurrency(plan.priceMonthlyEGP, state.language)}
                      </span>
                      <span className="text-slate-400 text-xs font-sans">
                        {' '}
                        / {state.language === 'ar' ? 'شهرياً' : 'monthly'}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-300 pt-2 border-t border-slate-800">
                      <div className="flex justify-between">
                        <span className="text-slate-400">{t.branchLimit}:</span>
                        <span className="font-mono font-bold text-white">{plan.maxBranches}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">{t.deviceLimit}:</span>
                        <span className="font-mono font-bold text-white">{plan.maxDevices}</span>
                      </div>
                    </div>

                    <div className="space-y-1 pt-2">
                      {plan.features.map((feat, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-xs text-slate-400">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Transactional Outbox Diagnostics */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-purple-400" />
              <h3 className="text-base font-bold text-white">{t.outboxDiagnostics}</h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Queue Depth: {state.syncOutbox.length} ops
            </span>
          </div>

          <div className="overflow-x-auto">
            {state.syncOutbox.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500/60" />
                <p>
                  {state.language === 'ar'
                    ? 'طابور المزامنة فارغ ومُحدّث بالكامل مع الخادم السحابي'
                    : 'Transactional outbox is empty and synced with cloud'}
                </p>
              </div>
            ) : (
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 text-start">Operation ID</th>
                    <th className="py-2.5 px-3 text-start">Type</th>
                    <th className="py-2.5 px-3 text-start">{t.date}</th>
                    <th className="py-2.5 px-3 text-center">{t.status}</th>
                    <th className="py-2.5 px-3 text-center">Retries</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {state.syncOutbox.slice(0, 10).map((op) => (
                    <tr key={op.operationId} className="hover:bg-slate-850/60 text-slate-300">
                      <td className="py-2.5 px-3 text-slate-400">{op.operationId}</td>
                      <td className="py-2.5 px-3 font-bold text-white">{op.operationType}</td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {new Date(op.occurredAt).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            op.status === 'SYNCED'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-amber-950 text-amber-400 border border-amber-800'
                          }`}
                        >
                          {op.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">{op.retryCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
