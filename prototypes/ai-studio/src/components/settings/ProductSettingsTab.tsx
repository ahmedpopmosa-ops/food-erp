/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Product & Menu Management Workspace (Settings)
 * Supports real PDF menu extracted photos, custom uploads, pricing, and full product customization.
 */

import React, { useState, useRef } from 'react';
import { useRestaurantStore } from '../../services/store';
import { Product, Category } from '../../types';
import { formatCurrency, translations } from '../../lib/i18n';
import { FoodVisual } from '../pos/FoodVisual';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Image as ImageIcon,
  Upload,
  X,
  Check,
  CheckCircle2,
  UtensilsCrossed,
  Tag,
  DollarSign,
  Layers,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Percent,
} from 'lucide-react';

// Preset real food images extracted from the "My Corner" official PDF menu
export const PRESET_MENU_IMAGES = [
  {
    url: '/assets/menu/foul_sandwich.jpg',
    nameAr: 'سندوتش فول مصري بلدي',
    nameEn: 'Egyptian Foul Sandwich',
    categoryHint: 'cat-egy-breakfast',
  },
  {
    url: '/assets/menu/taameya_sandwich.jpg',
    nameAr: 'سندوتش طعمية مقرمشة سخنة',
    nameEn: 'Falafel Sandwich',
    categoryHint: 'cat-egy-breakfast',
  },
  {
    url: '/assets/menu/french_fries.jpg',
    nameAr: 'بطاطس مقلية ذهبية متبلة',
    nameEn: 'Seasoned French Fries',
    categoryHint: 'cat-egy-breakfast',
  },
  {
    url: '/assets/menu/taameya_plate.jpg',
    nameAr: 'طبق طعمية مقلية بالسمسم',
    nameEn: 'Crispy Taameya Plate',
    categoryHint: 'cat-egy-breakfast',
  },
  {
    url: '/assets/menu/foul_hummus.jpg',
    nameAr: 'طبق فول وحمص بزيت الزيتون',
    nameEn: 'Foul & Hummus Platter',
    categoryHint: 'cat-egy-breakfast',
  },
  {
    url: '/assets/menu/feta_cheese_tomato.jpg',
    nameAr: 'جبنة بيضاء بالطماطم والنعناع',
    nameEn: 'Feta Cheese with Tomatoes',
    categoryHint: 'cat-egy-breakfast',
  },
  {
    url: '/assets/menu/pepperoni_pizza.jpg',
    nameAr: 'بيتزا ببروني إيطالي أصلية',
    nameEn: 'Pepperoni Pizza',
    categoryHint: 'cat-pizza-it',
  },
  {
    url: '/assets/menu/super_supreme_pizza.jpg',
    nameAr: 'بيتزا سوبر سوبريم ميكس جبن',
    nameEn: 'Super Supreme Pizza',
    categoryHint: 'cat-pizza-it',
  },
  {
    url: '/assets/menu/pizza_spread.jpg',
    nameAr: 'تشكيلة بيتزا فاخرة منيو',
    nameEn: 'Gourmet Pizza Assortment',
    categoryHint: 'cat-pizza-it',
  },
  {
    url: '/assets/menu/feteer_savory.jpg',
    nameAr: 'فطير شرقي مشكل لحوم وجبن',
    nameEn: 'Savory Oriental Feteer',
    categoryHint: 'cat-feteer',
  },
  {
    url: '/assets/menu/feteer_meshaltet.jpg',
    nameAr: 'فطير مشلتت بلدي بالسمن والعسل',
    nameEn: 'Feteer Meshaltet Honey & Cream',
    categoryHint: 'cat-feteer',
  },
  {
    url: '/assets/menu/mixed_grill.jpg',
    nameAr: 'مشاوي مشكلة فحم مع أرز بسمتي',
    nameEn: 'Mixed Grill Platter',
    categoryHint: 'cat-grills',
  },
];

export const ProductSettingsTab: React.FC = () => {
  const { state, addProduct, updateProduct, deleteProduct } = useRestaurantStore();
  const t = translations[state.language];

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<'ALL' | 'AVAILABLE' | 'OUT_OF_STOCK'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form Fields
  const [formNameAr, setFormNameAr] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formBasePrice, setFormBasePrice] = useState<number>(0);
  const [formCostPrice, setFormCostPrice] = useState<number>(0);
  const [formPrepStation, setFormPrepStation] = useState<'GRILL' | 'COLD' | 'BEVERAGE'>('GRILL');
  const [formSku, setFormSku] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formDescriptionAr, setFormDescriptionAr] = useState('');
  const [formDescriptionEn, setFormDescriptionEn] = useState('');
  const [formIsAvailable, setFormIsAvailable] = useState<boolean>(true);
  const [formImageUrl, setFormImageUrl] = useState<string>('');

  // Active Image Picker Tab inside modal: 'preset' | 'upload' | 'url'
  const [imagePickerMode, setImagePickerMode] = useState<'preset' | 'upload' | 'url'>('preset');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Open modal for new product
  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setFormNameAr('');
    setFormNameEn('');
    setFormCategoryId(state.categories[0]?.id || 'cat-egy-breakfast');
    setFormBasePrice(25);
    setFormCostPrice(10);
    setFormPrepStation('COLD');
    setFormSku(`PRD-${Date.now().toString().slice(-4)}`);
    setFormBarcode(`622${Date.now().toString().slice(-6)}`);
    setFormDescriptionAr('');
    setFormDescriptionEn('');
    setFormIsAvailable(true);
    setFormImageUrl('/assets/menu/foul_sandwich.jpg'); // default nice preset
    setImagePickerMode('preset');
    setIsModalOpen(true);
  };

  // Open modal for editing existing product
  const handleOpenEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormNameAr(product.nameAr);
    setFormNameEn(product.nameEn);
    setFormCategoryId(product.categoryId);
    setFormBasePrice(product.basePrice);
    setFormCostPrice(product.costPrice || 0);
    setFormPrepStation(product.prepStation);
    setFormSku(product.sku);
    setFormBarcode(product.barcode || '');
    setFormDescriptionAr(product.descriptionAr || '');
    setFormDescriptionEn(product.descriptionEn || '');
    setFormIsAvailable(product.isAvailable);
    setFormImageUrl(product.imageUrl || '');
    setImagePickerMode('preset');
    setIsModalOpen(true);
  };

  // Handle local image file upload (converts to base64 data URL)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert(state.language === 'ar' ? 'حجم الصورة كبير جداً (الحد الأقصى 5 ميجابايت)' : 'Image is too large (max 5MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setFormImageUrl(result);
      showToast(state.language === 'ar' ? 'تم تحميل الصورة من الجهاز بنجاح' : 'Image uploaded from device');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Save product changes
  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formNameAr.trim() || !formNameEn.trim()) {
      alert(state.language === 'ar' ? 'يرجى إدخال اسم الصنف بالعربية والإنجليزية' : 'Please provide product name in Arabic and English');
      return;
    }

    if (formBasePrice <= 0) {
      alert(state.language === 'ar' ? 'يرجى إدخال سعر بيع صحيح' : 'Please provide a valid price');
      return;
    }

    if (editingProduct) {
      // Update existing
      const updated: Product = {
        ...editingProduct,
        nameAr: formNameAr.trim(),
        nameEn: formNameEn.trim(),
        categoryId: formCategoryId,
        basePrice: Number(formBasePrice),
        costPrice: Number(formCostPrice) || 0,
        prepStation: formPrepStation,
        sku: formSku.trim() || editingProduct.sku,
        barcode: formBarcode.trim() || undefined,
        descriptionAr: formDescriptionAr.trim(),
        descriptionEn: formDescriptionEn.trim(),
        isAvailable: formIsAvailable,
        imageUrl: formImageUrl.trim() || undefined,
      };
      updateProduct(updated);
      showToast(state.language === 'ar' ? `تم تحديث الصنف (${updated.nameAr}) بنجاح!` : `Product (${updated.nameEn}) updated!`);
    } else {
      // Create new
      const newProd: Product = {
        id: `prod-${Date.now()}`,
        tenantId: state.tenant.id,
        categoryId: formCategoryId,
        sku: formSku.trim() || `SKU-${Date.now().toString().slice(-4)}`,
        barcode: formBarcode.trim() || undefined,
        nameAr: formNameAr.trim(),
        nameEn: formNameEn.trim(),
        descriptionAr: formDescriptionAr.trim(),
        descriptionEn: formDescriptionEn.trim(),
        basePrice: Number(formBasePrice),
        costPrice: Number(formCostPrice) || 0,
        prepStation: formPrepStation,
        isAvailable: formIsAvailable,
        imageUrl: formImageUrl.trim() || undefined,
      };
      addProduct(newProd);
      showToast(state.language === 'ar' ? `تم إضافة الصنف الجديد (${newProd.nameAr}) لقائمة الطعام!` : `New product (${newProd.nameEn}) added!`);
    }

    setIsModalOpen(false);
  };

  // Delete product
  const handleDeleteProduct = (productId: string, nameAr: string) => {
    const confirmMsg = state.language === 'ar'
      ? `هل أنت متأكد من حذف الصنف "${nameAr}" نهائياً من قائمة الطعام؟`
      : `Are you sure you want to permanently delete this product?`;
    if (window.confirm(confirmMsg)) {
      deleteProduct(productId);
      showToast(state.language === 'ar' ? 'تم حذف الصنف من القائمة' : 'Product deleted');
    }
  };

  // Quick toggle product availability directly from list
  const handleToggleAvailability = (prod: Product) => {
    updateProduct({
      ...prod,
      isAvailable: !prod.isAvailable,
    });
    showToast(
      state.language === 'ar'
        ? `تم تغيير حالة "${prod.nameAr}" إلى: ${!prod.isAvailable ? 'متوفر' : 'غير متوفر'}`
        : `Product status updated`
    );
  };

  // Filtered Products
  const filteredProducts = state.products.filter((p) => {
    const matchesSearch =
      searchQuery.trim() === '' ||
      p.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'ALL' || p.categoryId === selectedCategory;

    const matchesAvailability =
      availabilityFilter === 'ALL' ||
      (availabilityFilter === 'AVAILABLE' && p.isAvailable) ||
      (availabilityFilter === 'OUT_OF_STOCK' && !p.isAvailable);

    return matchesSearch && matchesCategory && matchesAvailability;
  });

  const activeCategoryObj = state.categories.find((c) => c.id === formCategoryId);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-[#5A24CA] text-white px-5 py-2.5 rounded-full shadow-2xl text-xs font-bold flex items-center gap-2 border border-purple-400/30 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner & Action */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#5A24CA] flex items-center justify-center text-white shadow-md shadow-[#5A24CA]/30">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-black text-white">
              {state.language === 'ar' ? 'إدارة المنتجات وقائمة الطعام' : 'Menu & Product Management'}
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            {state.language === 'ar'
              ? 'تحكم كامل في أصناف قائمة الطعام المستخرجة من منيو ماي كورنر: تعديل الصور، الأسعار، التكاليف، الأقسام، وحالة التوفر في نقطة البيع'
              : 'Full control over menu items: edit photos, prices, costs, categories, and real-time POS availability'}
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="px-5 py-2.5 rounded-xl bg-[#5A24CA] hover:bg-[#4C1CB3] text-white font-bold text-xs shadow-lg shadow-[#5A24CA]/30 flex items-center justify-center gap-2 transition-all active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{state.language === 'ar' ? 'إضافة صنف جديد' : 'Add New Product'}</span>
        </button>
      </div>

      {/* Search & Category Filter Toolbar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          {/* Search Bar */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={state.language === 'ar' ? 'ابحث باسم الوجبة، الكود، أو السعر...' : 'Search by product name, SKU...'}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-10 pl-4 py-2 text-xs text-white placeholder-slate-500 focus:border-[#5A24CA] outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Stats & Availability Toggle */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="text-[11px] text-slate-400">
              {state.language === 'ar' ? 'الأصناف:' : 'Items:'}{' '}
              <span className="font-bold text-white font-mono">{filteredProducts.length}</span> /{' '}
              <span className="text-slate-500 font-mono">{state.products.length}</span>
            </span>

            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
              <button
                onClick={() => setAvailabilityFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  availabilityFilter === 'ALL'
                    ? 'bg-[#5A24CA] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {state.language === 'ar' ? 'الكل' : 'All'}
              </button>
              <button
                onClick={() => setAvailabilityFilter('AVAILABLE')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  availabilityFilter === 'AVAILABLE'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {state.language === 'ar' ? 'المتاح فقط' : 'Available'}
              </button>
              <button
                onClick={() => setAvailabilityFilter('OUT_OF_STOCK')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  availabilityFilter === 'OUT_OF_STOCK'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {state.language === 'ar' ? 'المعلق' : 'Out of Stock'}
              </button>
            </div>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
              selectedCategory === 'ALL'
                ? 'bg-[#5A24CA] border-[#5A24CA] text-white shadow-sm shadow-[#5A24CA]/30'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
            }`}
          >
            {state.language === 'ar' ? 'جميع الأقسام' : 'All Categories'} ({state.products.length})
          </button>

          {state.categories.map((cat) => {
            const count = state.products.filter((p) => p.categoryId === cat.id).length;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-[#5A24CA] border-[#5A24CA] text-white shadow-sm shadow-[#5A24CA]/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                }`}
              >
                <span>{state.language === 'ar' ? cat.nameAr : cat.nameEn}</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 mx-auto">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-white">
            {state.language === 'ar' ? 'لم يتم العثور على أي أصناف مطابقة للبحث' : 'No products found'}
          </p>
          <p className="text-xs text-slate-400">
            {state.language === 'ar'
              ? 'جرّب البحث بكلمة أخرى أو اختر قسماً مختلفاً من الأعلى'
              : 'Try adjusting your search terms or category filter'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map((product) => {
            const category = state.categories.find((c) => c.id === product.categoryId);
            const margin = product.basePrice > 0
              ? (((product.basePrice - (product.costPrice || 0)) / product.basePrice) * 100).toFixed(0)
              : '0';

            return (
              <div
                key={product.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-[#5A24CA]/50 transition-all shadow-md group flex flex-col justify-between"
              >
                {/* Image & Badges */}
                <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden">
                  <FoodVisual
                    id={product.id}
                    name={product.nameEn}
                    imageUrl={product.imageUrl}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30 pointer-events-none" />

                  {/* Category Pill Top Right */}
                  <div className="absolute top-2.5 right-2.5 z-10">
                    <span className="px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-[10px] font-bold text-white border border-white/10 shadow-sm">
                      {category ? (state.language === 'ar' ? category.nameAr : category.nameEn) : ''}
                    </span>
                  </div>

                  {/* Availability Badge Top Left */}
                  <div className="absolute top-2.5 left-2.5 z-10">
                    <button
                      onClick={() => handleToggleAvailability(product)}
                      title={state.language === 'ar' ? 'انقر لتبديل حالة التوفر' : 'Click to toggle availability'}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 backdrop-blur-md border transition-all ${
                        product.isAvailable
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/30 hover:bg-emerald-900'
                          : 'bg-rose-950/80 text-rose-300 border-rose-500/30 hover:bg-rose-900'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${product.isAvailable ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                      <span>{product.isAvailable ? (state.language === 'ar' ? 'متاح' : 'Active') : (state.language === 'ar' ? 'متوقف' : 'Unavailable')}</span>
                    </button>
                  </div>

                  {/* Price Tag Bottom Right */}
                  <div className="absolute bottom-2.5 right-2.5 z-10">
                    <span className="px-2.5 py-1 rounded-xl bg-[#5A24CA] text-white font-black text-xs shadow-lg shadow-purple-900/50 font-mono">
                      {formatCurrency(product.basePrice, state.language, state.tenant.currency)}
                    </span>
                  </div>

                  {/* Cost & Margin Bottom Left */}
                  <div className="absolute bottom-2.5 left-2.5 z-10">
                    <span className="px-2 py-0.5 rounded-lg bg-slate-900/80 text-[10px] font-mono text-slate-300 border border-slate-700/50 backdrop-blur-sm">
                      Margin: {margin}%
                    </span>
                  </div>
                </div>

                {/* Body Content */}
                <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-white line-clamp-1 leading-snug">
                      {state.language === 'ar' ? product.nameAr : product.nameEn}
                    </h3>
                    <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                      {state.language === 'ar' ? product.nameEn : product.nameAr}
                    </p>
                    {product.descriptionAr && (
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-1">
                        {state.language === 'ar' ? product.descriptionAr : product.descriptionEn}
                      </p>
                    )}
                  </div>

                  {/* SKU & Actions */}
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 mt-auto">
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                      {product.sku}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditModal(product)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-[#5A24CA] text-slate-300 hover:text-white transition-colors"
                        title={state.language === 'ar' ? 'تعديل الصنف والسعر والصورة' : 'Edit product'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id, product.nameAr)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white transition-colors"
                        title={state.language === 'ar' ? 'حذف الصنف' : 'Delete product'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Product Edit / Add Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl animate-in fade-in duration-150 my-6 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#5A24CA] text-white flex items-center justify-between shrink-0 shadow-md">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white">
                  <UtensilsCrossed className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    {editingProduct
                      ? state.language === 'ar' ? `تعديل صنف: ${editingProduct.nameAr}` : `Edit Product: ${editingProduct.nameEn}`
                      : state.language === 'ar' ? 'إضافة صنف جديد لقائمة الطعام' : 'Add New Menu Item'}
                  </h3>
                  <p className="text-[11px] text-purple-200">
                    {state.language === 'ar'
                      ? 'حدد صورة الوجبة والسعر والقسم ومحطة التجهيز بدقة'
                      : 'Set product photo, selling price, recipe cost, and station'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <form onSubmit={handleSaveProduct} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* TOP: Live Foodics POS Card Preview & Image Selector */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                {/* Preview Card */}
                <div className="md:col-span-4 flex flex-col items-center">
                  <label className="text-[11px] font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#5A24CA]" />
                    <span>{state.language === 'ar' ? 'معاينة البطاقة في نقطة البيع' : 'POS Card Live Preview'}</span>
                  </label>

                  <div className="w-48 bg-white rounded-2xl overflow-hidden shadow-2xl border-2 border-[#5A24CA] flex flex-col select-none pointer-events-none">
                    <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
                      <FoodVisual
                        id={formCategoryId || 'dish'}
                        name={formNameEn || 'Dish'}
                        imageUrl={formImageUrl}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-3 text-center bg-white">
                      <h4 className="text-xs font-black text-slate-900 tracking-tight line-clamp-1">
                        {formNameAr || formNameEn || (state.language === 'ar' ? 'اسم الوجبة' : 'Product Name')}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-medium font-mono mt-0.5">
                        {formatCurrency(formBasePrice, state.language, state.tenant.currency)}
                      </p>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-500 mt-2 text-center">
                    {state.language === 'ar' ? 'هكذا ستظهر الوجبة على شاشة iPad POS' : 'How it appears on Foodics POS terminal'}
                  </p>
                </div>

                {/* Image Selection Tabs */}
                <div className="md:col-span-8 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <label className="text-xs font-bold text-white flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-[#5A24CA]" />
                      <span>{state.language === 'ar' ? 'تحديد صورة الصنف' : 'Select Product Image'}</span>
                    </label>

                    {/* Image Mode Switcher */}
                    <div className="flex bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setImagePickerMode('preset')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                          imagePickerMode === 'preset'
                            ? 'bg-[#5A24CA] text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {state.language === 'ar' ? 'معرض المنيو (PDF)' : 'Menu Presets'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setImagePickerMode('upload')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                          imagePickerMode === 'upload'
                            ? 'bg-[#5A24CA] text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {state.language === 'ar' ? 'رفع من الجهاز' : 'Upload File'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setImagePickerMode('url')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                          imagePickerMode === 'url'
                            ? 'bg-[#5A24CA] text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {state.language === 'ar' ? 'رابط URL' : 'Direct URL'}
                      </button>
                    </div>
                  </div>

                  {/* 1. Preset Gallery (Extracted from PDF) */}
                  {imagePickerMode === 'preset' && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-400">
                        {state.language === 'ar'
                          ? 'اختر صورة من الصور الحقيقية المستخرجة من منيو ماي كورنر الرسمي:'
                          : 'Choose from authentic food images extracted directly from the PDF menu:'}
                      </p>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1 bg-slate-900/50 rounded-xl border border-slate-800/80">
                        {PRESET_MENU_IMAGES.map((preset) => {
                          const isSelected = formImageUrl === preset.url;
                          return (
                            <button
                              type="button"
                              key={preset.url}
                              onClick={() => setFormImageUrl(preset.url)}
                              className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all group ${
                                isSelected
                                  ? 'border-emerald-500 ring-2 ring-emerald-500/40 scale-95 shadow-md'
                                  : 'border-slate-800 hover:border-purple-500 opacity-80 hover:opacity-100'
                              }`}
                              title={state.language === 'ar' ? preset.nameAr : preset.nameEn}
                            >
                              <img
                                src={preset.url}
                                alt={preset.nameAr}
                                className="w-full h-full object-cover"
                              />
                              {isSelected && (
                                <div className="absolute inset-0 bg-emerald-950/40 flex items-center justify-center">
                                  <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg">
                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  </div>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 2. File Upload from Local Device */}
                  {imagePickerMode === 'upload' && (
                    <div className="p-4 bg-slate-900/60 border border-dashed border-slate-700 rounded-xl text-center space-y-3">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <div className="w-10 h-10 rounded-full bg-purple-950/60 text-[#5A24CA] flex items-center justify-center mx-auto border border-purple-800/40">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">
                          {state.language === 'ar' ? 'اختر صورة من هاتفك أو جهاز الكمبيوتر' : 'Upload image from your device'}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {state.language === 'ar' ? 'يدعم PNG, JPG, WebP بحجم يصل إلى 5MB' : 'Supports PNG, JPG, WebP up to 5MB'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold inline-flex items-center gap-2 transition-all border border-slate-700"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{state.language === 'ar' ? 'استعراض الملفات' : 'Browse Files'}</span>
                      </button>
                    </div>
                  )}

                  {/* 3. Direct Image URL */}
                  {imagePickerMode === 'url' && (
                    <div className="space-y-2">
                      <label className="text-[11px] font-semibold text-slate-400">
                        {state.language === 'ar' ? 'أدخل رابط الصورة على الإنترنت (URL):' : 'Enter image URL:'}
                      </label>
                      <input
                        type="url"
                        value={formImageUrl}
                        onChange={(e) => setFormImageUrl(e.target.value)}
                        placeholder="https://example.com/images/dish.jpg"
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-[#5A24CA]"
                      />
                    </div>
                  )}

                  {/* Reset to Default Graphic */}
                  {formImageUrl && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-500 font-mono truncate max-w-xs">
                        {formImageUrl.startsWith('data:') ? 'Base64 Local Image' : formImageUrl}
                      </span>
                      <button
                        type="button"
                        onClick={() => setFormImageUrl('')}
                        className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 font-bold"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>{state.language === 'ar' ? 'إزالة الصورة واستخدام الأيقونة' : 'Clear & Use Icon'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION: Names & Basic Information */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Tag className="w-4 h-4 text-[#5A24CA]" />
                  <span>{state.language === 'ar' ? 'البيانات الأساسية للصنف' : 'Basic Product Information'}</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'اسم الصنف بالعربية *' : 'Product Name (Arabic) *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={formNameAr}
                      onChange={(e) => setFormNameAr(e.target.value)}
                      placeholder="مثال: سندوتش فول مخصوص بالزيت الحار"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:border-[#5A24CA] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'اسم الصنف بالإنجليزية *' : 'Product Name (English) *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={formNameEn}
                      onChange={(e) => setFormNameEn(e.target.value)}
                      placeholder="e.g. Special Egyptian Foul Sandwich"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:border-[#5A24CA] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'القسم / التصنيف *' : 'Category *'}
                    </label>
                    <select
                      value={formCategoryId}
                      onChange={(e) => setFormCategoryId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:border-[#5A24CA] outline-none"
                    >
                      {state.categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {state.language === 'ar' ? cat.nameAr : cat.nameEn}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'محطة التجهيز بالمطبخ (KDS)' : 'Kitchen Preparation Station'}
                    </label>
                    <select
                      value={formPrepStation}
                      onChange={(e) => setFormPrepStation(e.target.value as 'GRILL' | 'COLD' | 'BEVERAGE')}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:border-[#5A24CA] outline-none font-mono"
                    >
                      <option value="COLD">
                        {state.language === 'ar' ? 'مطبخ بارد وسلطات وساندوتشات (COLD)' : 'Cold Kitchen & Sandwiches (COLD)'}
                      </option>
                      <option value="GRILL">
                        {state.language === 'ar' ? 'شواية وأفران وساخن (GRILL)' : 'Grill, Oven & Hot Food (GRILL)'}
                      </option>
                      <option value="BEVERAGE">
                        {state.language === 'ar' ? 'بار ومشروبات وعصائر (BEVERAGE)' : 'Beverage & Bar (BEVERAGE)'}
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION: Pricing & Costing */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <DollarSign className="w-4 h-4 text-[#5A24CA]" />
                  <span>{state.language === 'ar' ? 'التسعير والتكلفة وهوامش الربح' : 'Pricing, Recipe Cost & Margins'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'سعر البيع للعميل *' : 'Selling Price *'} ({state.tenant.currency})
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        required
                        value={formBasePrice}
                        onChange={(e) => setFormBasePrice(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono font-bold focus:border-[#5A24CA] outline-none"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                        {state.tenant.currency}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'تكلفة المقادير (Recipe Cost)' : 'Theoretical Cost'} ({state.tenant.currency})
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={formCostPrice}
                        onChange={(e) => setFormCostPrice(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:border-[#5A24CA] outline-none"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                        {state.tenant.currency}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'هامش الربح الإجمالي المحسوب' : 'Gross Profit Margin'}
                    </label>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono flex items-center justify-between">
                      <span className="text-slate-400">
                        {formBasePrice > 0
                          ? `${formatCurrency(formBasePrice - formCostPrice, state.language, state.tenant.currency)}`
                          : '0'}
                      </span>
                      <span className={`font-bold px-2 py-0.5 rounded ${
                        formBasePrice > 0 && ((formBasePrice - formCostPrice) / formBasePrice) >= 0.5
                          ? 'bg-emerald-950 text-emerald-400'
                          : 'bg-amber-950 text-amber-400'
                      }`}>
                        {formBasePrice > 0
                          ? `${(((formBasePrice - formCostPrice) / formBasePrice) * 100).toFixed(0)}%`
                          : '0%'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION: Details, SKU & Availability */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Layers className="w-4 h-4 text-[#5A24CA]" />
                  <span>{state.language === 'ar' ? 'بيانات التتبع والوصف والتوفر' : 'Tracking, Description & Availability'}</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'كود الصنف (SKU)' : 'SKU Code'}
                    </label>
                    <input
                      type="text"
                      value={formSku}
                      onChange={(e) => setFormSku(e.target.value)}
                      placeholder="e.g. PRD-FL-01"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:border-[#5A24CA] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'الباركود (Barcode)' : 'Barcode'}
                    </label>
                    <input
                      type="text"
                      value={formBarcode}
                      onChange={(e) => setFormBarcode(e.target.value)}
                      placeholder="e.g. 62210048291"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:border-[#5A24CA] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'الوصف بالعربية' : 'Description (Arabic)'}
                    </label>
                    <textarea
                      rows={2}
                      value={formDescriptionAr}
                      onChange={(e) => setFormDescriptionAr(e.target.value)}
                      placeholder="مكونات الوجبة وطريقة التحضير..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:border-[#5A24CA] outline-none resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {state.language === 'ar' ? 'الوصف بالإنجليزية' : 'Description (English)'}
                    </label>
                    <textarea
                      rows={2}
                      value={formDescriptionEn}
                      onChange={(e) => setFormDescriptionEn(e.target.value)}
                      placeholder="Ingredients and serving details..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:border-[#5A24CA] outline-none resize-none"
                    />
                  </div>
                </div>

                {/* Availability Checkbox */}
                <div className="pt-2 flex items-center gap-3">
                  <label className="relative flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formIsAvailable}
                      onChange={(e) => setFormIsAvailable(e.target.checked)}
                      className="w-4 h-4 rounded text-[#5A24CA] bg-slate-900 border-slate-700 focus:ring-0"
                    />
                    <span className="text-xs font-bold text-white">
                      {state.language === 'ar'
                        ? 'الصنف متاح حالياً للطلب والبيع في نقطة البيع (Active in POS)'
                        : 'Product is available for ordering on POS'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-all"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#5A24CA] hover:bg-[#4C1CB3] text-white text-xs font-bold transition-all shadow-lg shadow-[#5A24CA]/30 active:scale-95 flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingProduct ? (state.language === 'ar' ? 'حفظ التعديلات' : 'Save Changes') : (state.language === 'ar' ? 'إضافة الصنف للمنيو' : 'Add Product')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
