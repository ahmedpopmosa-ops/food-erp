/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Call Center Invoicing, Branch Attribution, and Cashier Printing Test Suite
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { useRestaurantStore } from '../src/services/store';
import { OrderItem } from '../src/types';

describe('RestaurantOS — Call Center Invoice & Branch Accounting Integration', () => {
  const store = useRestaurantStore.getState();

  it('1. Should create Call Center order attributed strictly to fulfilling branch', () => {
    const branchA = store.state.branches.find((b) => b.id === 'branch-cairo-main')!;
    const product = store.state.products[0];

    const items: OrderItem[] = [
      {
        id: 'test-item-1',
        productId: product.id,
        productNameAr: product.nameAr,
        productNameEn: product.nameEn,
        unitPrice: product.basePrice,
        quantity: 2,
        selectedModifiers: [],
        prepStation: product.prepStation,
        kitchenStatus: 'PENDING',
        totalPrice: product.basePrice * 2,
      },
    ];

    const result = store.createCallCenterOrder({
      fulfillingBranchId: branchA.id,
      agentId: 'user-callcenter-01',
      agentName: 'Mai Hossam',
      customerName: 'سلطان الشمري',
      customerPhone: '0551122334',
      deliveryAddress: 'حي الياسمين، شارع أنس بن مالك، الرياض',
      deliveryNotes: 'الاتصال عند الوصول للبوابة',
      deliveryFee: 15.0,
      items,
      paymentMethod: 'CASH_ON_DELIVERY',
      invoiceType: 'CUSTOMER_INVOICE',
    });

    const { order, invoice } = result;

    // Verify Order Attributes
    assert.strictEqual(order.orderSource, 'CALL_CENTER');
    assert.strictEqual(order.fulfillingBranchId, branchA.id);
    assert.strictEqual(order.callCenterAgentId, 'user-callcenter-01');
    assert.strictEqual(order.callCenterAgentName, 'Mai Hossam');
    assert.strictEqual(order.customerName, 'سلطان الشمري');
    assert.strictEqual(order.customerPhone, '0551122334');
    assert.strictEqual(order.deliveryFee, 15.0);
    assert.strictEqual(order.paymentStatus, 'UNPAID'); // COD must start unpaid

    // Verify Invoice Attributes
    assert.ok(invoice.invoiceNumber.startsWith('INV-'));
    assert.strictEqual(invoice.branchId, branchA.id);
    assert.strictEqual(invoice.orderSource, 'CALL_CENTER');
    assert.strictEqual(invoice.paymentStatus, 'UNPAID');
    assert.strictEqual(invoice.reprintCount, 0);
    assert.strictEqual(invoice.legalEntity?.branchNameAr || invoice.legalEntityInfo.branchNameAr, branchA.nameAr);
    assert.strictEqual(
      invoice.legalEntity?.taxRegistrationNumber || invoice.legalEntityInfo.taxRegistrationNumber,
      store.state.tenant.taxRegistrationNumber
    );
  });

  it('2. Strict Branch Scoping: Cashier at Branch A sees only Branch A orders, Branch B is denied access', () => {
    const branchAOrders = store.getCallCenterOrdersForBranch('branch-cairo-main');
    const branchBOrders = store.getCallCenterOrdersForBranch('branch-giza-dokki');

    // Branch A orders must all belong to branch-cairo-main
    branchAOrders.orders.forEach((ord) => {
      assert.strictEqual(ord.fulfillingBranchId || ord.branchId, 'branch-cairo-main');
    });

    // Branch B orders must all belong to branch-giza-dokki
    branchBOrders.orders.forEach((ord) => {
      assert.strictEqual(ord.fulfillingBranchId || ord.branchId, 'branch-giza-dokki');
    });

    // Branch B must NOT see any order from Branch A
    const branchAOrderIds = new Set(branchAOrders.orders.map((o) => o.id));
    branchBOrders.orders.forEach((ord) => {
      assert.ok(!branchAOrderIds.has(ord.id), `Security breach: Branch B saw Branch A order ${ord.id}`);
    });
  });

  it('3. Invariant: Printing an invoice must NEVER mark it as paid', () => {
    const branchAData = store.getCallCenterOrdersForBranch('branch-cairo-main');
    const unpaidInvoice = branchAData.invoices.find((i) => i.paymentStatus === 'UNPAID');
    assert.ok(unpaidInvoice, 'Must have an unpaid invoice in Branch A');

    const originalPaymentStatus = unpaidInvoice.paymentStatus;
    assert.strictEqual(originalPaymentStatus, 'UNPAID');

    // Cashier prints the invoice (80mm)
    store.logInvoicePrint(
      unpaidInvoice.id,
      'user-cashier-01',
      'Ahmed Hassan (Riyadh Cashier)',
      '80mm',
      false
    );

    // Re-fetch state
    const currentInvoice = store.state.invoices.find((i) => i.id === unpaidInvoice.id)!;

    // CRITICAL ASSERTION: Printing MUST NOT mark invoice as paid!
    assert.strictEqual(
      currentInvoice.paymentStatus,
      'UNPAID',
      'CRITICAL BUG: Printing an invoice marked it as paid!'
    );
    assert.ok(currentInvoice.lastPrintedAt);

    // Audit log was created
    const log = store.state.invoicePrintLogs.find((l) => l.invoiceId === unpaidInvoice.id);
    assert.ok(log, 'Print log was not created');
    assert.strictEqual(log.format, '80mm');
    assert.strictEqual(log.isReprint, false);
    assert.strictEqual(log.printedByUserId, 'user-cashier-01');
  });

  it('4. Reprint tracking: Every reprint must increment reprintCount and log reason', () => {
    const unpaidInvoice = store.state.invoices.find((i) => i.branchId === 'branch-cairo-main')!;
    const initialCount = unpaidInvoice.reprintCount;

    // Cashier reprints invoice
    store.logInvoicePrint(
      unpaidInvoice.id,
      'user-cashier-01',
      'Ahmed Hassan',
      'A4',
      true,
      'Customer requested duplicate copy'
    );

    const reloadedInvoice = store.state.invoices.find((i) => i.id === unpaidInvoice.id)!;
    assert.strictEqual(reloadedInvoice.reprintCount, initialCount + 1);

    const reprintLog = store.state.invoicePrintLogs.find(
      (l) => l.invoiceId === unpaidInvoice.id && l.isReprint === true
    );
    assert.ok(reprintLog, 'Reprint audit log missing');
    assert.strictEqual(reprintLog.reprintReason, 'Customer requested duplicate copy');
    assert.strictEqual(reprintLog.format, 'A4');
  });

  it('5. Cashier registers COD payment upon driver return: Marks PAID and prevents duplicates', () => {
    const unpaidInvoice = store.state.invoices.find(
      (i) => i.branchId === 'branch-cairo-main' && i.paymentStatus === 'UNPAID'
    )!;
    assert.ok(unpaidInvoice, 'Must have unpaid invoice to settle');

    // Register payment
    const paymentResult = store.registerCallCenterOrderPayment(
      unpaidInvoice.id,
      'user-cashier-01',
      'Ahmed Hassan',
      'CASH',
      unpaidInvoice.grandTotal,
      0
    );

    assert.strictEqual(paymentResult.success, true);
    assert.strictEqual(paymentResult.invoice?.paymentStatus, 'PAID');
    assert.strictEqual(paymentResult.invoice?.status, 'PAID');

    // Associated order is now COMPLETED and PAID
    const order = store.state.orders.find(
      (o) => o.id === unpaidInvoice.orderId || o.orderNumber === unpaidInvoice.orderNumber
    )!;
    assert.strictEqual(order.paymentStatus, 'PAID');
    assert.strictEqual(order.status, 'COMPLETED');

    // Attempt duplicate payment should be safely blocked
    const duplicateAttempt = store.registerCallCenterOrderPayment(
      unpaidInvoice.id,
      'user-cashier-01',
      'Ahmed Hassan',
      'CASH',
      unpaidInvoice.grandTotal,
      0
    );
    assert.strictEqual(duplicateAttempt.success, false);
    assert.strictEqual(duplicateAttempt.error, 'Invoice is already paid');
  });

  it('6. Accounting verification: Balanced journal entries for sale and COD settlement', () => {
    // Check all journal entries in store
    store.state.journalEntries.forEach((je) => {
      assert.strictEqual(
        je.totalDebit,
        je.totalCredit,
        `Journal entry ${je.entryNumber} is unbalanced: Debit ${je.totalDebit} != Credit ${je.totalCredit}`
      );
    });

    // Check AR COD account and Cash account
    const arDeliveryAccount = store.state.accounts.find((a) => a.id === 'acc-1130')!;
    const cashAccount = store.state.accounts.find((a) => a.id === 'acc-1010')!;
    const vatAccount = store.state.accounts.find((a) => a.id === 'acc-2100')!;
    const revenueAccount = store.state.accounts.find((a) => a.id === 'acc-4010')!;
    const deliveryRevAccount = store.state.accounts.find((a) => a.id === 'acc-4020')!;

    assert.ok(arDeliveryAccount, 'AR Delivery Collections account must exist');
    assert.ok(cashAccount, 'Cash account must exist');
    assert.ok(vatAccount, 'VAT Payable account must exist');
    assert.ok(revenueAccount, 'Revenue account must exist');
    assert.ok(deliveryRevAccount, 'Delivery revenue account must exist');
  });
});
