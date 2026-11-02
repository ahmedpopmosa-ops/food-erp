/**
 * Default chart of accounts for a new tenant (doc 07 §3). A starting point only — the tenant's accountant
 * adjusts it, and the posting rules resolve accounts through `accounting_mappings`, never by code.
 * REVIEW: to be validated by a qualified accountant (doc 07 §8).
 */
export interface AccountTemplate {
  code: string;
  nameEn: string;
  nameAr: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  subtype?: string;
  parent?: string;
  postable?: boolean;
  control?: boolean;
}

export const CHART_OF_ACCOUNTS: AccountTemplate[] = [
  { code: '1000', nameEn: 'Assets', nameAr: 'الأصول', type: 'asset', postable: false },
  {
    code: '1100',
    nameEn: 'Cash and cash equivalents',
    nameAr: 'النقدية وما في حكمها',
    type: 'asset',
    parent: '1000',
    postable: false,
  },
  { code: '1110', nameEn: 'Cash in drawers', nameAr: 'نقدية الأدراج', type: 'asset', subtype: 'cash', parent: '1100' },
  {
    code: '1120',
    nameEn: 'Card payments clearing',
    nameAr: 'مقاصة مدفوعات البطاقات',
    type: 'asset',
    subtype: 'clearing',
    parent: '1100',
  },
  {
    code: '1130',
    nameEn: 'Wallet payments clearing',
    nameAr: 'مقاصة المحافظ الإلكترونية',
    type: 'asset',
    subtype: 'clearing',
    parent: '1100',
  },
  { code: '1140', nameEn: 'Cash in safe', nameAr: 'نقدية الخزينة', type: 'asset', subtype: 'cash', parent: '1100' },
  { code: '1150', nameEn: 'Bank', nameAr: 'البنك', type: 'asset', subtype: 'bank', parent: '1100' },
  {
    code: '1190',
    nameEn: 'Sales suspense',
    nameAr: 'حساب معلق المبيعات',
    type: 'asset',
    subtype: 'suspense',
    parent: '1000',
  },
  { code: '1200', nameEn: 'Inventory', nameAr: 'المخزون', type: 'asset', subtype: 'inventory', parent: '1000' },
  {
    code: '1210',
    nameEn: 'Inventory in transit',
    nameAr: 'مخزون بالطريق',
    type: 'asset',
    subtype: 'inventory',
    parent: '1000',
  },
  {
    code: '1300',
    nameEn: 'Input VAT recoverable',
    nameAr: 'ضريبة القيمة المضافة على المشتريات',
    type: 'asset',
    subtype: 'tax',
    parent: '1000',
  },
  { code: '2000', nameEn: 'Liabilities', nameAr: 'الالتزامات', type: 'liability', postable: false },
  {
    code: '2100',
    nameEn: 'Accounts payable (suppliers)',
    nameAr: 'الموردون',
    type: 'liability',
    subtype: 'payable',
    parent: '2000',
    control: true,
  },
  {
    code: '2110',
    nameEn: 'Goods received not invoiced',
    nameAr: 'بضاعة مستلمة لم ترد فواتيرها',
    type: 'liability',
    subtype: 'accrual',
    parent: '2000',
    control: true,
  },
  {
    code: '2120',
    nameEn: 'Accrued purchase charges',
    nameAr: 'مصاريف مشتريات مستحقة',
    type: 'liability',
    subtype: 'accrual',
    parent: '2000',
  },
  { code: '2200', nameEn: 'Taxes payable', nameAr: 'ضرائب مستحقة', type: 'liability', parent: '2000', postable: false },
  {
    code: '2210',
    nameEn: 'Output VAT payable',
    nameAr: 'ضريبة القيمة المضافة على المبيعات',
    type: 'liability',
    subtype: 'tax',
    parent: '2200',
  },
  { code: '3000', nameEn: 'Equity', nameAr: 'حقوق الملكية', type: 'equity', postable: false },
  { code: '3100', nameEn: 'Owner capital', nameAr: 'رأس المال', type: 'equity', parent: '3000' },
  { code: '3200', nameEn: 'Retained earnings', nameAr: 'الأرباح المحتجزة', type: 'equity', parent: '3000' },
  {
    code: '3300',
    nameEn: 'Opening balance equity',
    nameAr: 'حقوق ملكية أرصدة افتتاحية',
    type: 'equity',
    parent: '3000',
  },
  { code: '4000', nameEn: 'Revenue', nameAr: 'الإيرادات', type: 'revenue', postable: false },
  {
    code: '4100',
    nameEn: 'Food and beverage sales',
    nameAr: 'مبيعات الأطعمة والمشروبات',
    type: 'revenue',
    parent: '4000',
  },
  {
    code: '4190',
    nameEn: 'Sales discounts',
    nameAr: 'خصومات المبيعات',
    type: 'revenue',
    subtype: 'contra',
    parent: '4000',
  },
  { code: '4200', nameEn: 'Service charge revenue', nameAr: 'إيراد خدمة', type: 'revenue', parent: '4000' },
  { code: '4900', nameEn: 'Rounding differences', nameAr: 'فروق التقريب', type: 'revenue', parent: '4000' },
  { code: '5000', nameEn: 'Expenses', nameAr: 'المصروفات', type: 'expense', postable: false },
  {
    code: '5100',
    nameEn: 'Cost of goods sold',
    nameAr: 'تكلفة المبيعات',
    type: 'expense',
    subtype: 'cogs',
    parent: '5000',
  },
  { code: '5200', nameEn: 'Wastage and spoilage', nameAr: 'الهالك والتالف', type: 'expense', parent: '5000' },
  {
    code: '5300',
    nameEn: 'Inventory adjustments and count differences',
    nameAr: 'تسويات وفروق جرد المخزون',
    type: 'expense',
    parent: '5000',
  },
  { code: '5400', nameEn: 'Inventory price variance', nameAr: 'فروق أسعار المخزون', type: 'expense', parent: '5000' },
  { code: '5500', nameEn: 'Bank charges', nameAr: 'مصروفات ومصاريف بنكية', type: 'expense', parent: '5000' },
  { code: '5900', nameEn: 'Cash over / short', nameAr: 'عجز وزيادة النقدية', type: 'expense', parent: '5000' },
];

/** Tenant-wide default mappings: mapping key → account code. */
export const DEFAULT_MAPPINGS: Record<string, string> = {
  sales_revenue: '4100',
  cash_drawer: '1110',
  cash_transfer: '1140',
  cash_over_short: '5900',
  inventory: '1200',
  inventory_in_transit: '1210',
  opening_balance_equity: '3300',
  wastage_expense: '5200',
  inventory_adjustment: '5300',
  inventory_price_variance: '5400',
  sales_discount: '4190',
  service_charge_revenue: '4200',
  rounding: '4900',
  sales_suspense: '1190',
  output_tax: '2210',
  cogs: '5100',
  retained_earnings: '3200',
  bank: '1150',
  input_tax: '1300',
  accounts_payable: '2100',
  goods_received_not_invoiced: '2110',
  purchase_charges_accrual: '2120',
};

export const normalBalance = (type: AccountTemplate['type'], subtype?: string) =>
  type === 'asset' || type === 'expense' || subtype === 'contra' ? 'debit' : 'credit';
