/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Comprehensive Settings & Control Workspace
 */

import React, { useState } from 'react';
import { useRestaurantStore } from '../../services/store';
import { translations, formatCurrency } from '../../lib/i18n';
import { TenantSettings, Branch, OrderType } from '../../types';
import {
  Store,
  Coins,
  Percent,
  SlidersHorizontal,
  Printer,
  Building,
  Database,
  Save,
  CheckCircle2,
  RefreshCw,
  Download,
  Upload,
  AlertTriangle,
  QrCode,
  Globe,
  Clock,
  Phone,
  Hash,
  MapPin,
  Plus,
  Trash2,
  Edit2,
  Eye,
  FileCheck,
  UtensilsCrossed,
} from 'lucide-react';
import { ProductSettingsTab } from './ProductSettingsTab';

type SettingsTab =
  | 'products'
  | 'general'
  | 'currency'
  | 'tax'
  | 'pos'
  | 'receipt'
  | 'branches'
  | 'backup';

export const SettingsManager: React.FC = () => {
  const {
    state,
    updateTenant,
    updateTenantSettings,
    addBranch,
    updateBranch,
    deleteBranch,
    setActiveBranch,
    setLanguage,
    resetToDefault,
    exportDatabaseJson,
    importDatabaseJson,
  } = useRestaurantStore();

  const t = translations[state.language];

  const [activeTab, setActiveTab] = useState<SettingsTab>('products');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form states initialized from store
  const tenant = state.tenant;
  const currentSettings: TenantSettings = tenant.settings || {
    defaultTaxRate: 0.14,
    taxCalculation: 'EXCLUDED',
    defaultServiceCharge: 0,
    defaultOrderType: 'DINE_IN',
    enableGuestCountPrompt: true,
    autoPrintReceipt: true,
    autoSendToKitchen: false,
    allowManualDiscount: true,
    maxDiscountPercent: 30,
    receiptHeaderAr: 'أهلاً بكم في فودكس — برجر ومشاوي فاخرة',
    receiptHeaderEn: 'Welcome to Foodics Gourmet Burger & Grill',
    receiptFooterAr: 'شكراً لزيارتكم! الرقم الضريبي: SA-310-984-219',
    receiptFooterEn: 'Thank you for dining with us! Tax No: SA-310-984-219',
    showZatcaQrCode: true,
    receiptPaperWidth: '80mm',
    enableOfflineOutbox: true,
  };

  // General profile form
  const [name, setName] = useState(tenant.name);
  const [tradeNameAr, setTradeNameAr] = useState(tenant.tradeNameAr);
  const [tradeNameEn, setTradeNameEn] = useState(tenant.tradeNameEn);
  const [taxRegistrationNumber, setTaxRegistrationNumber] = useState(tenant.taxRegistrationNumber);
  const [commercialRegister, setCommercialRegister] = useState(tenant.commercialRegister);
  const [currency, setCurrency] = useState(tenant.currency || 'EGP');
  const [timezone, setTimezone] = useState(tenant.timezone || 'Asia/Riyadh');

  // Financial & Tax form
  const [defaultTaxRate, setDefaultTaxRate] = useState<number>(currentSettings.defaultTaxRate);
  const [taxCalculation, setTaxCalculation] = useState<'EXCLUDED' | 'INCLUDED'>(currentSettings.taxCalculation);
  const [defaultServiceCharge, setDefaultServiceCharge] = useState<number>(currentSettings.defaultServiceCharge);

  // POS & Order flow
  const [defaultOrderType, setDefaultOrderType] = useState<OrderType>(currentSettings.defaultOrderType);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState<boolean>(currentSettings.autoPrintReceipt);
  const [autoSendToKitchen, setAutoSendToKitchen] = useState<boolean>(currentSettings.autoSendToKitchen);
  const [allowManualDiscount, setAllowManualDiscount] = useState<boolean>(currentSettings.allowManualDiscount);
  const [maxDiscountPercent, setMaxDiscountPercent] = useState<number>(currentSettings.maxDiscountPercent);

  // Receipt template
  const [receiptHeaderAr, setReceiptHeaderAr] = useState(currentSettings.receiptHeaderAr);
  const [receiptHeaderEn, setReceiptHeaderEn] = useState(currentSettings.receiptHeaderEn);
  const [receiptFooterAr, setReceiptFooterAr] = useState(currentSettings.receiptFooterAr);
  const [receiptFooterEn, setReceiptFooterEn] = useState(currentSettings.receiptFooterEn);
  const [showZatcaQrCode, setShowZatcaQrCode] = useState(currentSettings.showZatcaQrCode);
  const [receiptPaperWidth, setReceiptPaperWidth] = useState<'80mm' | '58mm'>(currentSettings.receiptPaperWidth);

  // Branch Modal State
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [branchFormCode, setBranchFormCode] = useState('');
  const [branchFormNameAr, setBranchFormNameAr] = useState('');
  const [branchFormNameEn, setBranchFormNameEn] = useState('');
  const [branchFormPhone, setBranchFormPhone] = useState('');
  const [branchFormAddressAr, setBranchFormAddressAr] = useState('');
  const [branchFormAddressEn, setBranchFormAddressEn] = useState('');

  // Backup file input ref
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSaveAll = () => {
    updateTenant({
      name,
      tradeNameAr,
      tradeNameEn,
      taxRegistrationNumber,
      commercialRegister,
      currency,
      timezone,
    });

    updateTenantSettings({
      defaultTaxRate,
      taxCalculation,
      defaultServiceCharge,
      defaultOrderType,
      autoPrintReceipt,
      autoSendToKitchen,
      allowManualDiscount,
      maxDiscountPercent,
      receiptHeaderAr,
      receiptHeaderEn,
      receiptFooterAr,
      receiptFooterEn,
      showZatcaQrCode,
      receiptPaperWidth,
    });

    showToast(state.language === 'ar' ? 'تم حفظ وتطبيق جميع الإعدادات بنجاح!' : 'All settings saved and applied successfully!');
  };

  // Available Currencies
  const availableCurrencies = [
    { code: 'SAR', labelAr: 'ريال سعودي (SAR)', labelEn: 'Saudi Riyal (SAR)', symbol: 'ر.س', flag: '🇸🇦' },
    { code: 'EGP', labelAr: 'جنيه مصري (EGP)', labelEn: 'Egyptian Pound (EGP)', symbol: 'ج.م', flag: '🇪🇬' },
    { code: 'AED', labelAr: 'درهم إماراتي (AED)', labelEn: 'UAE Dirham (AED)', symbol: 'د.إ', flag: '🇦🇪' },
    { code: 'KWD', labelAr: 'دينار كويتي (KWD)', labelEn: 'Kuwaiti Dinar (KWD)', symbol: 'د.ك', flag: '🇰🇼' },
    { code: 'QAR', labelAr: 'ريال قطري (QAR)', labelEn: 'Qatari Riyal (QAR)', symbol: 'ر.ق', flag: '🇶🇦' },
    { code: 'BHD', labelAr: 'دينار بحريني (BHD)', labelEn: 'Bahraini Dinar (BHD)', symbol: 'د.ب', flag: '🇧🇭' },
    { code: 'OMR', labelAr: 'ريال عماني (OMR)', labelEn: 'Omani Rial (OMR)', symbol: 'ر.ع', flag: '🇴🇲' },
    { code: 'USD', labelAr: 'دولار أمريكي (USD)', labelEn: 'US Dollar (USD)', symbol: '$', flag: '🇺🇸' },
    { code: 'EUR', labelAr: 'يورو أوروبي (EUR)', labelEn: 'Euro (EUR)', symbol: '€', flag: '🇪🇺' },
  ];

  // Common Timezones
  const availableTimezones = [
    { code: 'Asia/Riyadh', label: 'Riyadh / KSA (GMT+3)' },
    { code: 'Africa/Cairo', label: 'Cairo / Egypt (GMT+2 / GMT+3)' },
    { code: 'Asia/Dubai', label: 'Dubai / UAE (GMT+4)' },
    { code: 'Asia/Kuwait', label: 'Kuwait (GMT+3)' },
    { code: 'Asia/Qatar', label: 'Doha / Qatar (GMT+3)' },
    { code: 'UTC', label: 'Coordinated Universal Time (UTC)' },
  ];

  // Export JSON file
  const handleExportJson = () => {
    const jsonStr = exportDatabaseJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `restaurant-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(state.language === 'ar' ? 'تم تنزيل النسخة الاحتياطية بنجاح' : 'Backup exported successfully');
  };

  // Import JSON file
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const success = importDatabaseJson(content);
      if (success) {
        showToast(state.language === 'ar' ? 'تم استيراد واسترجاع قاعدة البيانات بنجاح!' : 'Database restored successfully!');
      } else {
        alert(state.language === 'ar' ? 'ملف النسخة الاحتياطية غير صالح' : 'Invalid backup JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Branch edit save
  const handleSaveBranch = () => {
    if (!branchFormNameAr.trim() || !branchFormNameEn.trim()) return;

    if (editingBranch) {
      updateBranch({
        ...editingBranch,
        code: branchFormCode,
        nameAr: branchFormNameAr,
        nameEn: branchFormNameEn,
        phone: branchFormPhone,
        addressAr: branchFormAddressAr,
        addressEn: branchFormAddressEn,
      });
      showToast(state.language === 'ar' ? 'تم تحديث بيانات الفرع' : 'Branch updated');
    } else {
      const newB: Branch = {
        id: `branch-${Date.now()}`,
        tenantId: state.tenant.id,
        code: branchFormCode || `BR-${state.branches.length + 1}`,
        nameAr: branchFormNameAr,
        nameEn: branchFormNameEn,
        phone: branchFormPhone || '+966 11 000 0000',
        addressAr: branchFormAddressAr,
        addressEn: branchFormAddressEn,
        defaultWarehouseId: state.warehouses[0]?.id || 'wh-main',
        isActive: true,
      };
      addBranch(newB);
      showToast(state.language === 'ar' ? 'تمت إضافة الفرع الجديد بنجاح' : 'New branch added');
    }

    setIsBranchModalOpen(false);
    setEditingBranch(null);
  };

  const openNewBranchModal = () => {
    setEditingBranch(null);
    setBranchFormCode(`BR-0${state.branches.length + 1}`);
    setBranchFormNameAr('');
    setBranchFormNameEn('');
    setBranchFormPhone('');
    setBranchFormAddressAr('');
    setBranchFormAddressEn('');
    setIsBranchModalOpen(true);
  };

  const openEditBranchModal = (b: Branch) => {
    setEditingBranch(b);
    setBranchFormCode(b.code);
    setBranchFormNameAr(b.nameAr);
    setBranchFormNameEn(b.nameEn);
    setBranchFormPhone(b.phone);
    setBranchFormAddressAr(b.addressAr);
    setBranchFormAddressEn(b.addressEn);
    setIsBranchModalOpen(true);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#5A24CA] text-white px-6 py-2.5 rounded-full shadow-2xl text-sm font-bold flex items-center gap-2 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Banner */}
      <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#5A24CA] flex items-center justify-center text-white shadow-md shadow-[#5A24CA]/30">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white tracking-tight">
              {t.settingsTitle}
            </h1>
            <p className="text-xs text-slate-400">
              {t.settingsSubtitle}
            </p>
          </div>
        </div>

        {/* Global Save Button */}
        <button
          onClick={handleSaveAll}
          className="px-5 py-2.5 rounded-xl bg-[#5A24CA] hover:bg-[#4C1CB3] text-white font-bold text-xs transition-all shadow-md shadow-[#5A24CA]/25 flex items-center gap-2 active:scale-95"
        >
          <Save className="w-4 h-4" />
          <span>{t.save}</span>
        </button>
      </div>

      {/* Main Settings Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Tabs */}
        <aside className="w-64 bg-slate-900/60 border-r border-slate-800 p-4 flex flex-col gap-1.5 shrink-0 overflow-y-auto">
          <button
            onClick={() => setActiveTab('products')}
            className={`w-full px-3.5 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-between text-left ${
              activeTab === 'products'
                ? 'bg-[#5A24CA] text-white shadow-md shadow-[#5A24CA]/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <UtensilsCrossed className="w-4 h-4 shrink-0" />
              <span>{state.language === 'ar' ? 'المنتجات وقائمة الطعام' : 'Products & Menu'}</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-mono ${
                activeTab === 'products' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {state.products.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('currency')}
            className={`w-full px-3.5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 text-left ${
              activeTab === 'currency'
                ? 'bg-[#5A24CA] text-white shadow-md shadow-[#5A24CA]/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Coins className="w-4 h-4 shrink-0" />
            <span>{t.settingsCurrency}</span>
          </button>

          <button
            onClick={() => setActiveTab('general')}
            className={`w-full px-3.5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 text-left ${
              activeTab === 'general'
                ? 'bg-[#5A24CA] text-white shadow-md shadow-[#5A24CA]/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Store className="w-4 h-4 shrink-0" />
            <span>{t.settingsGeneral}</span>
          </button>

          <button
            onClick={() => setActiveTab('tax')}
            className={`w-full px-3.5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 text-left ${
              activeTab === 'tax'
                ? 'bg-[#5A24CA] text-white shadow-md shadow-[#5A24CA]/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Percent className="w-4 h-4 shrink-0" />
            <span>{t.settingsTax}</span>
          </button>

          <button
            onClick={() => setActiveTab('pos')}
            className={`w-full px-3.5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 text-left ${
              activeTab === 'pos'
                ? 'bg-[#5A24CA] text-white shadow-md shadow-[#5A24CA]/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 shrink-0" />
            <span>{t.settingsPos}</span>
          </button>

          <button
            onClick={() => setActiveTab('receipt')}
            className={`w-full px-3.5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 text-left ${
              activeTab === 'receipt'
                ? 'bg-[#5A24CA] text-white shadow-md shadow-[#5A24CA]/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span>{t.settingsReceipt}</span>
          </button>

          <button
            onClick={() => setActiveTab('branches')}
            className={`w-full px-3.5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 text-left ${
              activeTab === 'branches'
                ? 'bg-[#5A24CA] text-white shadow-md shadow-[#5A24CA]/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Building className="w-4 h-4 shrink-0" />
            <span>{t.settingsBranches} ({state.branches.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`w-full px-3.5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-3 text-left ${
              activeTab === 'backup'
                ? 'bg-[#5A24CA] text-white shadow-md shadow-[#5A24CA]/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Database className="w-4 h-4 shrink-0" />
            <span>{t.settingsBackup}</span>
          </button>
        </aside>

        {/* Tab Content Viewport */}
        <main className="flex-1 overflow-y-auto p-6 max-w-5xl">
          {/* ======================================================== */}
          {/* 0. PRODUCTS & MENU MANAGEMENT TAB */}
          {/* ======================================================== */}
          {activeTab === 'products' && <ProductSettingsTab />}

          {/* ======================================================== */}
          {/* 1. CURRENCY & REGIONAL TAB */}
          {/* ======================================================== */}
          {activeTab === 'currency' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Coins className="w-5 h-5 text-[#5A24CA]" />
                      <span>{state.language === 'ar' ? 'عملة المتجر والحسابات' : 'System Store Currency'}</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {state.language === 'ar'
                        ? 'اختر العملة المستخدمة في نقطة البيع Foodics POS، شاشات المطبخ، الفواتير الحرارية والمحاسبة'
                        : 'Choose the operational currency applied to POS orders, tickets, and accounting'}
                    </p>
                  </div>

                  <span className="px-3 py-1 bg-[#5A24CA]/20 text-[#5A24CA] border border-[#5A24CA]/40 rounded-xl text-xs font-black font-mono">
                    Active: {currency}
                  </span>
                </div>

                {/* Currency Selection Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {availableCurrencies.map((c) => {
                    const isSelected = currency === c.code;
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => {
                          setCurrency(c.code);
                          updateTenant({ currency: c.code });
                          showToast(`Currency switched to ${c.code}`);
                        }}
                        className={`p-4 rounded-xl border-2 flex items-center justify-between transition-all text-left ${
                          isSelected
                            ? 'border-[#5A24CA] bg-[#5A24CA]/15 shadow-md shadow-[#5A24CA]/20 ring-1 ring-[#5A24CA]'
                            : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-800/40 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{c.flag}</span>
                          <div>
                            <span className="block text-sm font-black text-white">
                              {state.language === 'ar' ? c.labelAr : c.labelEn}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              Code: {c.code} · Symbol: {c.symbol}
                            </span>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-[#5A24CA] text-white flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Live Currency Preview Banner */}
                <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    <span className="font-bold text-white block">
                      {state.language === 'ar' ? 'معاينة ظهور السعر بالعملة المختارة:' : 'Live Currency Display Preview:'}
                    </span>
                    <span>Sample total 99.00 units</span>
                  </div>
                  <div className="text-xl font-black font-mono text-emerald-400">
                    {formatCurrency(99.0, state.language, currency)}
                  </div>
                </div>
              </div>

              {/* Interface Language & Direction */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#5A24CA]" />
                  <span>{state.language === 'ar' ? 'لغة الواجهة واتجاه العرض' : 'Default Interface Language'}</span>
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setLanguage('ar')}
                    className={`p-4 rounded-xl border text-center transition-all ${
                      state.language === 'ar'
                        ? 'border-[#5A24CA] bg-[#5A24CA]/15 text-white font-bold'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-base block font-bold">العربية (RTL)</span>
                    <span className="text-xs text-slate-400 mt-1 block">واجهة كاملة باللغة العربية مع دعم RTL</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setLanguage('en')}
                    className={`p-4 rounded-xl border text-center transition-all ${
                      state.language === 'en'
                        ? 'border-[#5A24CA] bg-[#5A24CA]/15 text-white font-bold'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-base block font-bold">English (LTR)</span>
                    <span className="text-xs text-slate-400 mt-1 block">Full English interface with LTR alignment</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* 2. GENERAL RESTAURANT PROFILE TAB */}
          {/* ======================================================== */}
          {activeTab === 'general' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Store className="w-5 h-5 text-[#5A24CA]" />
                  <span>{state.language === 'ar' ? 'البيانات التجارية والقانونية للمطعم' : 'Legal & Commercial Identity'}</span>
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      {state.language === 'ar' ? 'الاسم التجاري بالعربية' : 'Trade Name (Arabic)'}
                    </label>
                    <input
                      type="text"
                      value={tradeNameAr}
                      onChange={(e) => setTradeNameAr(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#5A24CA] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      {state.language === 'ar' ? 'الاسم التجاري بالإنجليزية' : 'Trade Name (English)'}
                    </label>
                    <input
                      type="text"
                      value={tradeNameEn}
                      onChange={(e) => setTradeNameEn(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#5A24CA] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-slate-500" />
                      <span>{state.language === 'ar' ? 'الرقم الضريبي (ZATCA / ETA Tax ID)' : 'Tax Registration Number'}</span>
                    </label>
                    <input
                      type="text"
                      value={taxRegistrationNumber}
                      onChange={(e) => setTaxRegistrationNumber(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:border-[#5A24CA] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      {state.language === 'ar' ? 'رقم السجل التجاري (CR)' : 'Commercial Register (CR)'}
                    </label>
                    <input
                      type="text"
                      value={commercialRegister}
                      onChange={(e) => setCommercialRegister(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:border-[#5A24CA] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{state.language === 'ar' ? 'المنطقة الزمنية (Timezone)' : 'System Timezone'}</span>
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#5A24CA] outline-none"
                    >
                      {availableTimezones.map((tz) => (
                        <option key={tz.code} value={tz.code}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      {state.language === 'ar' ? 'النطاق الفرعي للمنظومة' : 'Subdomain / Slug'}
                    </label>
                    <input
                      type="text"
                      value={tenant.subdomain}
                      disabled
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-500 font-mono cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* 3. TAXES & SURCHARGES TAB */}
          {/* ======================================================== */}
          {activeTab === 'tax' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
                <div className="border-b border-slate-800 pb-3">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Percent className="w-5 h-5 text-[#5A24CA]" />
                    <span>{state.language === 'ar' ? 'قواعد الضريبة ورسوم الخدمة' : 'Taxes & Surcharge Calculation'}</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {state.language === 'ar'
                      ? 'تهيئة نسبة ضريبة القيمة المضافة ورسوم خدمة الصالة لتطبيقها آلياً في فواتير Foodics POS'
                      : 'Configure VAT tax percentage and dine-in service surcharge'}
                  </p>
                </div>

                {/* Tax Rate Stepper / Quick Chips */}
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-300">
                    {state.language === 'ar' ? 'نسبة ضريبة القيمة المضافة (VAT Rate)' : 'Value Added Tax Rate (%)'}
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="relative w-48">
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="1"
                        value={Math.round(defaultTaxRate * 100)}
                        onChange={(e) => setDefaultTaxRate((parseFloat(e.target.value) || 0) / 100)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xl font-bold font-mono text-white text-center focus:border-[#5A24CA] outline-none"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                        %
                      </span>
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setDefaultTaxRate(0.15)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                          defaultTaxRate === 0.15
                            ? 'bg-[#5A24CA] border-[#5A24CA] text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        15% (KSA ZATCA)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDefaultTaxRate(0.14)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                          defaultTaxRate === 0.14
                            ? 'bg-[#5A24CA] border-[#5A24CA] text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        14% (Egypt ETA)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDefaultTaxRate(0.05)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                          defaultTaxRate === 0.05
                            ? 'bg-[#5A24CA] border-[#5A24CA] text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        5% (UAE VAT)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDefaultTaxRate(0)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                          defaultTaxRate === 0
                            ? 'bg-[#5A24CA] border-[#5A24CA] text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        0% (Tax Exempt)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tax Inclusion Method */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <label className="block text-xs font-semibold text-slate-300">
                    {state.language === 'ar' ? 'طريقة احتساب الضريبة على قائمة الطعام' : 'Tax Inclusion Policy'}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setTaxCalculation('EXCLUDED')}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        taxCalculation === 'EXCLUDED'
                          ? 'border-[#5A24CA] bg-[#5A24CA]/15 text-white'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-sm font-bold block">
                        {state.language === 'ar' ? 'الأسعار غير شاملة الضريبة (تضاف عند الدفع)' : 'Prices Exclusive of Tax (Added at POS)'}
                      </span>
                      <span className="text-[11px] text-slate-400 mt-1 block">
                        Subtotal + {Math.round(defaultTaxRate * 100)}% Tax = Grand Total
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setTaxCalculation('INCLUDED')}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        taxCalculation === 'INCLUDED'
                          ? 'border-[#5A24CA] bg-[#5A24CA]/15 text-white'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-sm font-bold block">
                        {state.language === 'ar' ? 'الأسعار شاملة الضريبة في المنيو' : 'Prices Inclusive of Tax in Menu'}
                      </span>
                      <span className="text-[11px] text-slate-400 mt-1 block">
                        Tax is extracted from total item price
                      </span>
                    </button>
                  </div>
                </div>

                {/* Dine-In Service Charge */}
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <label className="block text-xs font-semibold text-slate-300">
                    {state.language === 'ar' ? 'رسوم خدمة الصالة (Dine-In Service Charge %)' : 'Dine-In Service Charge (%)'}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      max="30"
                      step="1"
                      value={Math.round(defaultServiceCharge * 100)}
                      onChange={(e) => setDefaultServiceCharge((parseFloat(e.target.value) || 0) / 100)}
                      className="w-36 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-bold font-mono text-white text-center focus:border-[#5A24CA] outline-none"
                    />
                    <span className="text-xs text-slate-400">
                      {state.language === 'ar' ? 'تطبق حصرياً على طلبات صالة الطعام (DINE IN)' : 'Applies exclusively to Dine-In orders'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* 4. POS & ORDERS TAB */}
          {/* ======================================================== */}
          {activeTab === 'pos' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <SlidersHorizontal className="w-5 h-5 text-[#5A24CA]" />
                  <span>{state.language === 'ar' ? 'سلوكيات وتفضيلات نقطة البيع Foodics POS' : 'POS & Order Preferences'}</span>
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Default Order Type */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'نوع الطلب الافتراضي عند فتح تذكرة جديدة' : 'Default Order Type on New Ticket'}
                    </label>
                    <select
                      value={defaultOrderType}
                      onChange={(e) => setDefaultOrderType(e.target.value as OrderType)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#5A24CA] outline-none"
                    >
                      <option value="DINE_IN">صالة طعام — DINE IN</option>
                      <option value="TAKEAWAY">سفري — TAKE AWAY</option>
                      <option value="DELIVERY">توصيل — DELIVERY</option>
                    </select>
                  </div>

                  {/* Max Discount Percent */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'الحد الأقصى للخصم المباشر للكاشير (%)' : 'Max Allowed Discount Without PIN (%)'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={maxDiscountPercent}
                      onChange={(e) => setMaxDiscountPercent(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:border-[#5A24CA] outline-none"
                    />
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 cursor-pointer hover:bg-slate-800/40 transition-colors">
                    <div>
                      <span className="text-sm font-bold text-white block">
                        {state.language === 'ar' ? 'طباعة الفاتورة تلقائياً عند السداد' : 'Auto-Print Receipt Upon Payment'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {state.language === 'ar' ? 'فتح شاشة الفاتورة الحرارية وإرسال أمر الطباعة فور إتمام الدفع' : 'Immediately triggers receipt thermal preview when invoice is paid'}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoPrintReceipt}
                      onChange={(e) => setAutoPrintReceipt(e.target.checked)}
                      className="w-5 h-5 accent-[#5A24CA] cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 cursor-pointer hover:bg-slate-800/40 transition-colors">
                    <div>
                      <span className="text-sm font-bold text-white block">
                        {state.language === 'ar' ? 'إرسال الطلب آلياً إلى شاشة المطبخ KDS' : 'Auto-Dispatch to Kitchen KDS'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {state.language === 'ar' ? 'ترحيل الأصناف فوراً إلى محطات الطهي دون الحاجة لضغط زر KITCHEN' : 'Dispatches ticket to kitchen stations automatically'}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoSendToKitchen}
                      onChange={(e) => setAutoSendToKitchen(e.target.checked)}
                      className="w-5 h-5 accent-[#5A24CA] cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 cursor-pointer hover:bg-slate-800/40 transition-colors">
                    <div>
                      <span className="text-sm font-bold text-white block">
                        {state.language === 'ar' ? 'تفعيل زر الخصم المباشر (Discount Modal)' : 'Enable Cashier Discount Action Button'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {state.language === 'ar' ? 'السماح بتطبيق خصم على الفاتورة عبر الزر البنفسجي' : 'Allows quick discounts from top Foodics action bar'}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={allowManualDiscount}
                      onChange={(e) => setAllowManualDiscount(e.target.checked)}
                      className="w-5 h-5 accent-[#5A24CA] cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* 5. RECEIPT & PRINTING TEMPLATE TAB */}
          {/* ======================================================== */}
          {activeTab === 'receipt' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-150">
              {/* Form Controls (8 cols) */}
              <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Printer className="w-5 h-5 text-[#5A24CA]" />
                  <span>{state.language === 'ar' ? 'تخصيص قالب الفاتورة الحرارية' : 'Thermal Receipt Template'}</span>
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'ترويسة الفاتورة (عربي)' : 'Receipt Header (Arabic)'}
                    </label>
                    <input
                      type="text"
                      value={receiptHeaderAr}
                      onChange={(e) => setReceiptHeaderAr(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:border-[#5A24CA] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'ترويسة الفاتورة (إنجليزي)' : 'Receipt Header (English)'}
                    </label>
                    <input
                      type="text"
                      value={receiptHeaderEn}
                      onChange={(e) => setReceiptHeaderEn(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:border-[#5A24CA] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'تذييل الفاتورة والشروط (عربي)' : 'Receipt Footer & Return Policy (Arabic)'}
                    </label>
                    <textarea
                      rows={2}
                      value={receiptFooterAr}
                      onChange={(e) => setReceiptFooterAr(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:border-[#5A24CA] outline-none resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'تذييل الفاتورة والشروط (إنجليزي)' : 'Receipt Footer (English)'}
                    </label>
                    <textarea
                      rows={2}
                      value={receiptFooterEn}
                      onChange={(e) => setReceiptFooterEn(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:border-[#5A24CA] outline-none resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        {state.language === 'ar' ? 'عرض الورق الحراري' : 'Thermal Paper Width'}
                      </label>
                      <select
                        value={receiptPaperWidth}
                        onChange={(e) => setReceiptPaperWidth(e.target.value as '80mm' | '58mm')}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:border-[#5A24CA] outline-none"
                      >
                        <option value="80mm">80mm (Standard POS)</option>
                        <option value="58mm">58mm (Compact Mobile)</option>
                      </select>
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showZatcaQrCode}
                          onChange={(e) => setShowZatcaQrCode(e.target.checked)}
                          className="w-5 h-5 accent-[#5A24CA] cursor-pointer"
                        />
                        <span className="text-xs font-bold text-white">
                          {state.language === 'ar' ? 'طباعة رمز QR الإلكتروني' : 'Print ZATCA/ETA QR'}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Interactive Thermal Receipt Simulator (5 cols) */}
              <div className="lg:col-span-5 flex flex-col items-center">
                <div className="w-full max-w-[290px] bg-white text-slate-900 p-5 rounded-lg shadow-2xl font-mono text-xs border border-slate-300 space-y-3">
                  <div className="text-center space-y-1 border-b border-dashed border-slate-400 pb-3">
                    <p className="font-bold text-sm tracking-tight">{tradeNameAr}</p>
                    <p className="text-[10px] text-slate-600">{tradeNameEn}</p>
                    <p className="text-[10px] text-slate-500">VAT: {taxRegistrationNumber}</p>
                    <p className="text-[10px] text-slate-500">{receiptHeaderAr}</p>
                  </div>

                  <div className="space-y-1 text-[11px] border-b border-dashed border-slate-400 pb-2">
                    <div className="flex justify-between">
                      <span>Invoice: INV-2026-00108</span>
                      <span>Table: 8</span>
                    </div>
                    <div className="flex justify-between text-slate-500 text-[10px]">
                      <span>Date: {new Date().toLocaleDateString()}</span>
                      <span>Cashier: POS-01</span>
                    </div>
                  </div>

                  {/* Sample Items */}
                  <div className="space-y-1.5 border-b border-dashed border-slate-400 pb-2 text-[11px]">
                    <div className="flex justify-between">
                      <span>1 x Mushroom Burger</span>
                      <span>{formatCurrency(21.0, state.language, currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>1 x Chicken Salad</span>
                      <span>{formatCurrency(30.0, state.language, currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>1 x Pepsi Can</span>
                      <span>{formatCurrency(4.0, state.language, currency)}</span>
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="space-y-1 text-[11px] border-b border-dashed border-slate-400 pb-2">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(55.0, state.language, currency)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Tax ({Math.round(defaultTaxRate * 100)}%):</span>
                      <span>{formatCurrency(55.0 * defaultTaxRate, state.language, currency)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-300">
                      <span>TOTAL:</span>
                      <span>{formatCurrency(55.0 * (1 + defaultTaxRate), state.language, currency)}</span>
                    </div>
                  </div>

                  {/* QR Code */}
                  {showZatcaQrCode && (
                    <div className="flex flex-col items-center justify-center pt-2">
                      <div className="w-20 h-20 bg-slate-100 border border-slate-300 p-1 flex items-center justify-center">
                        <QrCode className="w-16 h-16 text-slate-800" />
                      </div>
                      <span className="text-[9px] text-slate-400 mt-1">ZATCA e-Invoice QR</span>
                    </div>
                  )}

                  <div className="text-center pt-2 text-[9px] text-slate-500 border-t border-dashed border-slate-400">
                    <p>{receiptFooterAr}</p>
                    <p>{receiptFooterEn}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* 6. BRANCHES & SITES TAB */}
          {/* ======================================================== */}
          {activeTab === 'branches' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Building className="w-5 h-5 text-[#5A24CA]" />
                      <span>{state.language === 'ar' ? 'فروع المطعم ونقاط التشغيل' : 'Restaurant Branches & Sites'}</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {state.language === 'ar'
                        ? 'إدارة الفروع، تخصيص العناوين، وتعيين الفرع النشط الحالي للـ POS'
                        : 'Configure branch locations, contact details, and default active branch'}
                    </p>
                  </div>

                  <button
                    onClick={openNewBranchModal}
                    className="px-3.5 py-2 rounded-xl bg-[#5A24CA] hover:bg-[#4C1CB3] text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{state.language === 'ar' ? 'إضافة فرع جديد' : 'Add Branch'}</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {state.branches.map((b) => {
                    const isActive = b.id === state.activeBranchId;
                    return (
                      <div
                        key={b.id}
                        className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
                          isActive
                            ? 'border-[#5A24CA] bg-[#5A24CA]/10 shadow-sm'
                            : 'border-slate-800 bg-slate-950/60'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">
                              {state.language === 'ar' ? b.nameAr : b.nameEn}
                            </span>
                            <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded font-mono text-[10px]">
                              {b.code}
                            </span>
                            {isActive && (
                              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded text-[10px] font-bold">
                                {state.language === 'ar' ? 'الفرع النشط حالياً' : 'Active Operating Branch'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-400">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-500" />
                              {state.language === 'ar' ? b.addressAr : b.addressEn}
                            </span>
                            <span className="flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5 text-slate-500" />
                              {b.phone}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {!isActive && (
                            <button
                              onClick={() => {
                                setActiveBranch(b.id);
                                showToast(`Active branch switched to ${b.nameEn}`);
                              }}
                              className="px-3 py-1.5 rounded-lg border border-slate-700 hover:border-[#5A24CA] text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                            >
                              {state.language === 'ar' ? 'تعيين كفرع نشط' : 'Set as Active'}
                            </button>
                          )}
                          <button
                            onClick={() => openEditBranchModal(b)}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            title="Edit Branch"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {state.branches.length > 1 && (
                            <button
                              onClick={() => {
                                if (confirm(state.language === 'ar' ? `هل أنت متأكد من حذف ${b.nameAr}؟` : `Delete branch ${b.nameEn}?`)) {
                                  deleteBranch(b.id);
                                  showToast('Branch deleted');
                                }
                              }}
                              className="p-2 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-800/80 text-rose-300 transition-colors"
                              title="Delete Branch"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* 7. DATA BACKUP & RESET TAB */}
          {/* ======================================================== */}
          {activeTab === 'backup' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
                <div className="border-b border-slate-800 pb-3">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-[#5A24CA]" />
                    <span>{state.language === 'ar' ? 'النسخ الاحتياطي وإدارة قاعدة البيانات' : 'Backup & Database Maintenance'}</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {state.language === 'ar'
                      ? 'تصدير كامل بيانات المطعم، استيراد نسخة سابقة، أو إعادة ضبط المنظومة للبيانات الافتراضية'
                      : 'Export complete restaurant state to JSON, restore backups, or factory reset to seeds'}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Export Card */}
                  <div className="p-5 rounded-xl border border-slate-800 bg-slate-950/60 space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-white font-bold text-sm">
                        <Download className="w-4 h-4 text-[#5A24CA]" />
                        <span>{state.language === 'ar' ? 'تصدير نسخة احتياطية (JSON)' : 'Export Full Backup (JSON)'}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {state.language === 'ar'
                          ? 'تنزيل ملف JSON يحتوي على كافة الأصناف، الفواتير، الحسابات المحاسبية والمخزون'
                          : 'Download full snapshot including catalog, orders, stock movements, and journal vouchers'}
                      </p>
                    </div>

                    <button
                      onClick={handleExportJson}
                      className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>{state.language === 'ar' ? 'تنزيل ملف النسخة الاحتياطية' : 'Download Backup File'}</span>
                    </button>
                  </div>

                  {/* Import Card */}
                  <div className="p-5 rounded-xl border border-slate-800 bg-slate-950/60 space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-white font-bold text-sm">
                        <Upload className="w-4 h-4 text-emerald-400" />
                        <span>{state.language === 'ar' ? 'استيراد واسترجاع نسخة سابقة' : 'Restore from JSON File'}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {state.language === 'ar'
                          ? 'رفع ملف JSON تم تصديره مسبقاً لاستبدال واسترجاع قاعدة البيانات فوراً'
                          : 'Upload an existing RestaurantOS JSON export file to restore database state'}
                      </p>
                    </div>

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImportJson}
                      accept=".json"
                      className="hidden"
                    />

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2.5 rounded-xl border border-slate-700 hover:border-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{state.language === 'ar' ? 'اختيار ملف الاسترجاع...' : 'Select Backup File...'}</span>
                    </button>
                  </div>
                </div>

                {/* Reset to Factory Demo Seeds */}
                <div className="p-5 rounded-xl border border-rose-900/60 bg-rose-950/20 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-rose-300">
                        {state.language === 'ar' ? 'إعادة ضبط المصنع (Demo Seed Reset)' : 'Factory Reset to Demo State'}
                      </h4>
                      <p className="text-xs text-rose-400 mt-0.5">
                        {state.language === 'ar'
                          ? 'سيتم مسح التعديلات المحلية واسترجاع بيانات متجر Foodics الافتراضية مع طاولة 8 وكامل الأصناف'
                          : 'Clears custom modifications and reloads the default Foodics demo catalog and Table 8'}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (confirm(state.language === 'ar' ? 'هل أنت متأكد من إعادة ضبط البيانات للوضع الافتراضي؟' : 'Are you sure you want to restore initial demo data?')) {
                        resetToDefault();
                        showToast(state.language === 'ar' ? 'تمت استعادة البيانات الافتراضية بنجاح' : 'Demo seeds restored');
                      }
                    }}
                    className="py-2 px-4 rounded-xl bg-rose-900/80 hover:bg-rose-800 text-white text-xs font-bold transition-colors flex items-center gap-2"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{state.language === 'ar' ? 'استعادة البيانات الافتراضية' : 'Reset to Default Seeds'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modal: Add/Edit Branch */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in duration-150">
            <div className="px-6 py-4 bg-[#5A24CA] text-white flex items-center justify-between">
              <h3 className="font-bold text-base">
                {editingBranch
                  ? state.language === 'ar' ? 'تعديل بيانات الفرع' : 'Edit Branch'
                  : state.language === 'ar' ? 'إضافة فرع جديد' : 'Add New Branch'}
              </h3>
              <button
                onClick={() => setIsBranchModalOpen(false)}
                className="text-white/80 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {state.language === 'ar' ? 'رمز الفرع (Code)' : 'Branch Code'}
                </label>
                <input
                  type="text"
                  value={branchFormCode}
                  onChange={(e) => setBranchFormCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-mono outline-none"
                  placeholder="BR-01"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {state.language === 'ar' ? 'اسم الفرع بالعربية' : 'Branch Name (Arabic)'}
                </label>
                <input
                  type="text"
                  value={branchFormNameAr}
                  onChange={(e) => setBranchFormNameAr(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                  placeholder="فرع الرياض — التحلية"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {state.language === 'ar' ? 'اسم الفرع بالإنجليزية' : 'Branch Name (English)'}
                </label>
                <input
                  type="text"
                  value={branchFormNameEn}
                  onChange={(e) => setBranchFormNameEn(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                  placeholder="Riyadh — Tahlia Branch"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {state.language === 'ar' ? 'رقم الهاتف' : 'Phone'}
                </label>
                <input
                  type="text"
                  value={branchFormPhone}
                  onChange={(e) => setBranchFormPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                  placeholder="+966 11 482 9900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {state.language === 'ar' ? 'العنوان' : 'Address'}
                </label>
                <input
                  type="text"
                  value={branchFormAddressAr}
                  onChange={(e) => setBranchFormAddressAr(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                  placeholder="شارع التحلية، الرياض"
                />
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsBranchModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold"
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleSaveBranch}
                  className="flex-1 py-2.5 rounded-xl bg-[#5A24CA] hover:bg-[#4C1CB3] text-white text-xs font-bold"
                >
                  {t.save}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
