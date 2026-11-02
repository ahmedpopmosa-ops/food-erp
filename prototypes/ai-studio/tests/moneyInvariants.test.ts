/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Money & Ledger Invariants (regression tests)
 * Discounted sales must post balanced journal entries, a 0% tax rate must survive a discount,
 * bill splits must add up to the total, and paying a table order must not crash.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useRestaurantStore } from '../src/services/store';
import type { Order } from '../src/types';

const store = useRestaurantStore.getState();

/** A takeaway order of the first two menu products at the given tax rate. */
function takeawayOrder(id: string, taxRate: number): Order {
  const items = store.state.products.slice(0, 2).map((p, i) => ({
    ...store.state.orders[0].items[0],
    id: `${id}-i${i}`,
    productId: p.id,
    productNameAr: p.nameAr,
    productNameEn: p.nameEn,
    quantity: 1,
    unitPrice: p.basePrice,
    totalPrice: p.basePrice,
  }));
  const subtotal = items.reduce((a, i) => a + i.totalPrice, 0);
  const taxAmount = Number((subtotal * taxRate).toFixed(2));
  const order: Order = {
    ...store.state.orders[0],
    id,
    orderNumber: id,
    orderType: 'TAKEAWAY',
    tableId: undefined,
    sessionId: undefined,
    status: 'DRAFT',
    items,
    subtotal,
    discountAmount: 0,
    serviceCharge: 0,
    taxRate,
    taxAmount,
    grandTotal: Number((subtotal + taxAmount).toFixed(2)),
  };
  store.createOrder(order);
  return order;
}

const balanced = (e: { totalDebit: number; totalCredit: number }) => Math.abs(e.totalDebit - e.totalCredit) < 0.005;

describe('RestaurantOS — Money & Ledger Invariants', () => {
  it('posts a balanced journal entry for a discounted cash sale', () => {
    const order = takeawayOrder('inv-disc', 0.14);
    store.applyOrderDiscount(order.id, 10);
    const discounted = store.state.orders.find((o) => o.id === order.id)!;
    store.finalizeOrderAndPay(order.id, 'CASH', discounted.grandTotal, 0);
    const entry = store.state.journalEntries[0];
    assert.equal(entry.sourceType, 'POS_SALE');
    assert.ok(balanced(entry), `debit ${entry.totalDebit} vs credit ${entry.totalCredit}`);
  });

  it('keeps a 0% tax rate when a discount is applied', () => {
    const order = takeawayOrder('inv-exempt', 0);
    store.applyOrderDiscount(order.id, 5);
    assert.equal(store.state.orders.find((o) => o.id === order.id)!.taxAmount, 0);
  });

  it('splits a bill into shares that add up to the total', () => {
    const session = { ...store.state.tableSessions[0], id: 'inv-split', consolidatedGrandTotal: 100 };
    store.state.tableSessions.push(session);
    const shares = store.splitSessionBill(session.id, 3);
    assert.equal(Math.round(shares.reduce((a, b) => a + b, 0) * 100), 10000);
  });

  it('pays a table order through finalizeOrderAndPay with a balanced entry', () => {
    const order = store.state.orders.find(
      (o) => o.sessionId && !store.state.tableSessions.find((s) => s.id === o.sessionId)?.isPaid
    )!;
    const result = store.finalizeOrderAndPay(order.id, 'CASH', 100000, 0);
    assert.equal(result.success, true);
    assert.ok(store.state.journalEntries.every(balanced), 'every posted entry is balanced');
  });
});
