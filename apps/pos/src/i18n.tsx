import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const ar = {
  appName: 'نقطة البيع',
  language: 'English',
  lock: 'قفل',
  loading: 'جارٍ التحميل…',
  cancel: 'إلغاء',
  confirm: 'تأكيد',
  close: 'إغلاق',
  back: 'رجوع',
  save: 'حفظ',
  storage: {
    title: 'تعذر فتح قاعدة بيانات الجهاز',
    otherTab: 'نقطة البيع مفتوحة في تبويب آخر في هذا المتصفح. أغلقه ثم أعد تحميل هذه الصفحة.',
    unsupported: 'هذا المتصفح لا يدعم التخزين الدائم المطلوب (OPFS). استخدم Chrome أو Edge حديثاً.',
    retry: 'إعادة المحاولة',
  },
  pair: {
    title: 'ربط هذا الجهاز بالفرع',
    hint: 'من لوحة التحكم: أجهزة نقاط البيع ← تسجيل جهاز. أدخل رمز الربط المكوّن من 8 خانات.',
    code: 'رمز الربط',
    submit: 'ربط',
    syncing: 'جارٍ تنزيل القائمة والموظفين…',
    failed: 'تعذر الربط. تأكد من الرمز (صالح 15 دقيقة) ومن الاتصال بالإنترنت.',
  },
  login: {
    title: 'تسجيل دخول الموظف',
    employeeNo: 'رقم الموظف',
    pin: 'الرقم السري',
    submit: 'دخول',
    noEmployees: 'لا يوجد موظفون لهذا الفرع على الجهاز بعد. أضف موظفاً برقم سري من لوحة التحكم ثم اضغط مزامنة.',
  },
  nav: { sell: 'البيع', tables: 'الطاولات', orders: 'الطلبات المفتوحة', sales: 'المبيعات', cash: 'الدرج' },
  sync: {
    online: 'متزامن',
    pending: 'بانتظار المزامنة',
    offline: 'غير متصل',
    rejected: 'مرفوض',
    now: 'مزامنة الآن',
    lease: 'صلاحية البيع دون اتصال حتى',
    leaseExpired: 'انتهت صلاحية البيع دون اتصال — اتصل بالإنترنت',
    unauthorised: 'الجهاز غير مصرح — أعد ربطه',
    disabled: 'تم إيقاف الجهاز من لوحة التحكم',
  },
  channels: { takeaway: 'تيك أواي', dine_in: 'صالة', delivery: 'توصيل', phone: 'هاتف' } as Record<string, string>,
  sell: {
    search: 'بحث عن صنف…',
    all: 'الكل',
    empty: 'لا توجد أصناف بسعر لهذا الفرع. أضف أصنافاً وأسعاراً من لوحة التحكم ثم زامن.',
    newOrder: 'طلب جديد',
    cartEmpty: 'اختر أصنافاً من القائمة.',
    table: 'طاولة',
    chooseTable: 'اختر طاولة',
    guests: 'عدد الأفراد',
    subtotal: 'الإجمالي قبل الضريبة',
    discount: 'الخصم',
    service: 'خدمة',
    tax: 'الضريبة',
    total: 'الإجمالي',
    pay: 'دفع',
    kitchen: 'إرسال للمطبخ',
    sentToKitchen: 'تم الإرسال للمطبخ',
    orderDiscount: 'خصم على الطلب',
    lineDiscount: 'خصم على الصنف',
    percent: 'نسبة %',
    amount: 'مبلغ',
    removeDiscount: 'إزالة الخصم',
    void: 'إلغاء الصنف',
    voidReason: 'سبب الإلغاء',
    cancelOrder: 'إلغاء الطلب',
    cancelReason: 'سبب إلغاء الطلب',
    park: 'تعليق',
    status: { pending: 'جديد', sent: 'في المطبخ', voided: 'ملغي' } as Record<string, string>,
    qty: 'الكمية',
    modifiers: 'الإضافات',
    choose: (min: number, max: number) => (min === max ? `اختر ${min}` : `اختر من ${min} إلى ${max}`),
    add: 'إضافة',
    items: (n: number) => (n === 1 ? 'صنف واحد' : n === 2 ? 'صنفان' : `${n} أصناف`),
    current: 'الطلب الحالي',
  },
  pay: {
    title: 'الدفع',
    remaining: 'المتبقي',
    tendered: 'المبلغ المستلم',
    change: 'الباقي',
    exact: 'المبلغ بالضبط',
    addPayment: 'إضافة دفعة',
    finish: 'إتمام البيع',
    payments: 'الدفعات',
    quick: 'مبالغ سريعة',
  },
  receipt: { title: 'الإيصال', print: 'طباعة', newSale: 'بيع جديد', copy: 'نسخة' },
  approval: {
    title: 'موافقة المدير',
    hint: 'هذا الإجراء يتطلب موافقة مدير برقمه السري.',
    manager: 'رقم المدير',
  },
  tables: { free: 'متاحة', occupied: 'مشغولة', open: 'فتح', transfer: 'نقل لطاولة', transferTo: 'نقل الطلب إلى' },
  orders: { empty: 'لا توجد طلبات مفتوحة.', items: 'أصناف', resume: 'متابعة' },
  sales: {
    empty: 'لا توجد مبيعات على هذا الجهاز بعد.',
    reprint: 'إعادة طباعة',
    refund: 'مرتجع',
    refundTitle: 'مرتجع من الفاتورة',
    refundQty: 'كمية المرتجع',
    reason: 'السبب',
    method: 'طريقة الرد',
    submit: 'تنفيذ المرتجع',
    sync: { pending: 'بانتظار المزامنة', acked: 'تمت المزامنة', rejected: 'مرفوض', blocked: 'معلّق' } as Record<
      string,
      string
    >,
  },
  cash: {
    closed: 'لا توجد وردية مفتوحة على هذا الجهاز.',
    open: 'فتح وردية',
    float: 'الرصيد الافتتاحي',
    session: 'الوردية الحالية',
    openedAt: 'فتحت في',
    sales: 'مبيعات نقدية',
    refunds: 'مرتجعات نقدية',
    payIns: 'إيداعات',
    payOuts: 'مسحوبات',
    expected: 'النقدية المتوقعة',
    payIn: 'إيداع',
    payOut: 'سحب',
    reason: 'السبب',
    amount: 'المبلغ',
    close: 'إقفال الوردية',
    counted: 'النقدية المعدودة في الدرج',
    variance: 'الفرق',
    closedDone: 'تم إقفال الوردية',
  },
  errors: {
    not_paired: 'الجهاز غير مربوط بفرع.',
    not_signed_in: 'سجّل الدخول أولاً.',
    not_permitted: 'ليست لديك صلاحية لهذا الإجراء.',
    approval_required: 'هذا الإجراء يتطلب موافقة مدير.',
    approval_not_permitted: 'هذا الموظف لا يملك صلاحية الموافقة على هذا الإجراء.',
    invalid_pin: 'رقم الموظف أو الرقم السري غير صحيح.',
    pin_locked: 'محاولات خاطئة كثيرة؛ حاول بعد بضع دقائق.',
    lease_expired: 'لم يتزامن الجهاز منذ مدة طويلة؛ اتصل بالإنترنت لمتابعة البيع.',
    no_cash_session: 'افتح وردية نقدية أولاً.',
    session_open: 'توجد وردية مفتوحة بالفعل.',
    insufficient_cash: 'لا يوجد هذا المبلغ في الدرج.',
    invalid_amount: 'المبلغ غير صحيح.',
    item_unavailable: 'هذا الصنف غير متاح.',
    modifiers_invalid: 'اختيار الإضافات غير صحيح.',
    empty_order: 'الطلب فارغ.',
    table_occupied: 'الطاولة مشغولة بطلب آخر.',
    overpayment: 'المبلغ أكبر من المطلوب.',
    payment_incomplete: 'المدفوع أقل من الإجمالي.',
    unknown_payment_method: 'طريقة الدفع غير متاحة.',
    refund_exceeds_sale: 'كمية المرتجع أكبر من المباع.',
    order_closed: 'هذا الطلب مغلق.',
    invalid_merge: 'لا يمكن دمج هذين الطلبين.',
    invalid_split: 'لا يمكن تقسيم الطلب بهذا الشكل.',
    not_found: 'غير موجود.',
    not_synced: 'لم يتم تنزيل القائمة بعد؛ اضغط مزامنة.',
    unknown: 'حدث خطأ.',
  } as Record<string, string>,
};

type Dict = typeof ar;

const en: Dict = {
  appName: 'POS',
  language: 'العربية',
  lock: 'Lock',
  loading: 'Loading…',
  cancel: 'Cancel',
  confirm: 'Confirm',
  close: 'Close',
  back: 'Back',
  save: 'Save',
  storage: {
    title: 'Cannot open the device database',
    otherTab: 'The POS is open in another tab of this browser. Close it, then reload this page.',
    unsupported: 'This browser lacks the durable storage the POS needs (OPFS). Use a recent Chrome or Edge.',
    retry: 'Try again',
  },
  pair: {
    title: 'Pair this device with a branch',
    hint: 'In the dashboard: POS devices → Register device. Enter the 8-character pairing code.',
    code: 'Pairing code',
    submit: 'Pair',
    syncing: 'Downloading the menu and staff…',
    failed: 'Pairing failed. Check the code (valid 15 minutes) and the internet connection.',
  },
  login: {
    title: 'Employee sign-in',
    employeeNo: 'Employee no.',
    pin: 'PIN',
    submit: 'Sign in',
    noEmployees: 'No staff for this branch on the device yet. Add an employee with a PIN in the dashboard, then sync.',
  },
  nav: { sell: 'Sell', tables: 'Tables', orders: 'Open orders', sales: 'Sales', cash: 'Drawer' },
  sync: {
    online: 'Synced',
    pending: 'Waiting to sync',
    offline: 'Offline',
    rejected: 'Rejected',
    now: 'Sync now',
    lease: 'Offline selling allowed until',
    leaseExpired: 'Offline selling expired — connect to the internet',
    unauthorised: 'Device not authorised — pair it again',
    disabled: 'This device was disabled in the dashboard',
  },
  channels: { takeaway: 'Takeaway', dine_in: 'Dine-in', delivery: 'Delivery', phone: 'Phone' },
  sell: {
    search: 'Search items…',
    all: 'All',
    empty: 'No priced items for this branch. Add items and prices in the dashboard, then sync.',
    newOrder: 'New order',
    cartEmpty: 'Choose items from the menu.',
    table: 'Table',
    chooseTable: 'Choose a table',
    guests: 'Guests',
    subtotal: 'Subtotal (excl. tax)',
    discount: 'Discount',
    service: 'Service',
    tax: 'Tax',
    total: 'Total',
    pay: 'Pay',
    kitchen: 'Send to kitchen',
    sentToKitchen: 'Sent to the kitchen',
    orderDiscount: 'Order discount',
    lineDiscount: 'Item discount',
    percent: 'Percent %',
    amount: 'Amount',
    removeDiscount: 'Remove discount',
    void: 'Void item',
    voidReason: 'Void reason',
    cancelOrder: 'Cancel order',
    cancelReason: 'Cancellation reason',
    park: 'Park',
    status: { pending: 'New', sent: 'In kitchen', voided: 'Voided' },
    qty: 'Qty',
    modifiers: 'Options',
    choose: (min: number, max: number) => (min === max ? `Choose ${min}` : `Choose ${min} to ${max}`),
    add: 'Add',
    items: (n: number) => (n === 1 ? '1 item' : `${n} items`),
    current: 'Current order',
  },
  pay: {
    title: 'Payment',
    remaining: 'Remaining',
    tendered: 'Cash received',
    change: 'Change',
    exact: 'Exact amount',
    addPayment: 'Add payment',
    finish: 'Complete sale',
    payments: 'Payments',
    quick: 'Quick amounts',
  },
  receipt: { title: 'Receipt', print: 'Print', newSale: 'New sale', copy: 'Copy' },
  approval: {
    title: 'Manager approval',
    hint: 'This action needs a manager’s PIN.',
    manager: 'Manager no.',
  },
  tables: { free: 'Free', occupied: 'Occupied', open: 'Open', transfer: 'Move table', transferTo: 'Move the order to' },
  orders: { empty: 'No open orders.', items: 'items', resume: 'Resume' },
  sales: {
    empty: 'No sales on this device yet.',
    reprint: 'Reprint',
    refund: 'Refund',
    refundTitle: 'Refund from invoice',
    refundQty: 'Refund qty',
    reason: 'Reason',
    method: 'Refund method',
    submit: 'Issue refund',
    sync: { pending: 'Waiting to sync', acked: 'Synced', rejected: 'Rejected', blocked: 'On hold' },
  },
  cash: {
    closed: 'No cash session is open on this device.',
    open: 'Open session',
    float: 'Opening float',
    session: 'Current session',
    openedAt: 'Opened at',
    sales: 'Cash sales',
    refunds: 'Cash refunds',
    payIns: 'Pay-ins',
    payOuts: 'Pay-outs',
    expected: 'Expected cash',
    payIn: 'Pay in',
    payOut: 'Pay out',
    reason: 'Reason',
    amount: 'Amount',
    close: 'Close session',
    counted: 'Cash counted in the drawer',
    variance: 'Variance',
    closedDone: 'Session closed',
  },
  errors: {
    not_paired: 'This device is not paired with a branch.',
    not_signed_in: 'Sign in first.',
    not_permitted: 'You are not allowed to do this.',
    approval_required: 'This needs a manager’s approval.',
    approval_not_permitted: 'That employee cannot approve this action.',
    invalid_pin: 'Wrong employee number or PIN.',
    pin_locked: 'Too many wrong PINs; try again in a few minutes.',
    lease_expired: 'This device has not synced for too long; connect to the internet to keep selling.',
    no_cash_session: 'Open a cash session first.',
    session_open: 'A cash session is already open.',
    insufficient_cash: 'The drawer does not hold that much cash.',
    invalid_amount: 'Invalid amount.',
    item_unavailable: 'This item is not available.',
    modifiers_invalid: 'Invalid choice of options.',
    empty_order: 'The order is empty.',
    table_occupied: 'The table has another open order.',
    overpayment: 'That is more than the amount due.',
    payment_incomplete: 'The payments do not cover the total.',
    unknown_payment_method: 'Payment method not available.',
    refund_exceeds_sale: 'That is more than was sold.',
    order_closed: 'This order is closed.',
    invalid_merge: 'These orders cannot be merged.',
    invalid_split: 'The order cannot be split that way.',
    not_found: 'Not found.',
    not_synced: 'The menu has not been downloaded yet; press sync.',
    unknown: 'Something went wrong.',
  },
};

export type Locale = 'ar' | 'en';

interface I18n {
  locale: Locale;
  t: Dict;
  setLocale: (l: Locale) => void;
  money: (amount: string | number) => string;
  name: (row: { nameAr?: string | null; nameEn?: string | null }) => string;
  time: (iso: string) => string;
  error: (err: unknown) => string;
}

const Ctx = createContext<I18n | null>(null);

const stored = (): Locale => {
  try {
    return localStorage.getItem('ros.pos.locale') === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(stored);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);
  const value = useMemo<I18n>(() => {
    const d = locale === 'ar' ? ar : en;
    const tag = locale === 'ar' ? 'ar-EG' : 'en-EG';
    return {
      locale,
      t: d,
      setLocale: (l) => {
        try {
          localStorage.setItem('ros.pos.locale', l);
        } catch {
          /* per-device convenience only */
        }
        setLocaleState(l);
      },
      // Display only (ADR-0006): amounts are computed by the POS core with exact decimals.
      money: (amount) => new Intl.NumberFormat(tag, { style: 'currency', currency: 'EGP' }).format(Number(amount)),
      name: (row) => (locale === 'ar' ? row.nameAr || row.nameEn : row.nameEn || row.nameAr) ?? '',
      time: (iso) =>
        new Intl.DateTimeFormat(tag, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(
          new Date(iso),
        ),
      error: (err) => {
        const code = (err as { code?: string } | null)?.code;
        return (code && d.errors[code]) || (err instanceof Error && !code ? err.message : d.errors.unknown!);
      },
    };
  }, [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}
