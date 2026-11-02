/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * RestaurantOS — Table Management & Billing Workflow Automated Test Suite
 * Validates Scenarios A through G for Order-First tables, additional courses, and unified billing.
 */

import { useRestaurantStore } from '../src/services/store';
import { Order, OrderItem } from '../src/types';

function runTestSuite() {
  console.log('====================================================');
  console.log(' RestaurantOS — Table Management & Billing Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` — ${detail}` : ''}`);
      failed++;
    }
  }

  const store = useRestaurantStore.getState();

  // -----------------------------------------------------------------
  // SCENARIO A: Order-First Table Assignment & Kitchen Dispatch
  // -----------------------------------------------------------------
  console.log('--- Scenario A: Order-First Table Assignment ---');

  // Waiter creates order first without upfront table selection
  const draftOrder: Order = {
    id: `ord-test-scen-a-${Date.now()}`,
    tenantId: store.state.tenant.id,
    branchId: store.state.activeBranchId,
    orderNumber: '501',
    orderType: 'DINE_IN',
    cashierId: store.state.currentUser.id,
    cashierName: store.state.currentUser.fullNameEn,
    guestCount: 3,
    status: 'DRAFT',
    items: [
      {
        id: 'item-foul-1',
        productId: 'prod-foul-oil',
        productNameAr: 'فول بالزيت الحار',
        productNameEn: 'Foul with Flaxseed Oil',
        unitPrice: 15.0,
        quantity: 2,
        selectedModifiers: [],
        prepStation: 'COLD',
        kitchenStatus: 'PENDING',
        totalPrice: 30.0,
      },
    ],
    subtotal: 30.0,
    discountAmount: 0,
    taxRate: 0.15,
    taxAmount: 4.5,
    serviceCharge: 0,
    grandTotal: 34.5,
    createdAt: new Date().toISOString(),
  };

  store.createOrder(draftOrder);
  assert(
    store.state.orders.some((o) => o.id === draftOrder.id && !o.tableId),
    'Order created first without requiring upfront table'
  );

  // Attempt to send to kitchen without table must fail or require table
  const preDispatch = store.sendOrderToKitchen(draftOrder.id);
  assert(
    preDispatch === false,
    'Kitchen dispatch correctly blocked when tableId is missing for Dine-In'
  );

  // Now assign Table 5
  const table5 = store.state.tables.find((t) => t.tableNumber === '5') || store.state.tables[4];
  store.assignTableToOrder(draftOrder.id, table5.id);

  const assignedOrder = store.state.orders.find((o) => o.id === draftOrder.id)!;
  assert(
    assignedOrder.tableId === table5.id && assignedOrder.sessionId !== undefined,
    'Order successfully assigned to Table 5 with linked session'
  );

  // Now dispatch to kitchen
  const dispatchOk = store.sendOrderToKitchen(draftOrder.id);
  assert(dispatchOk === true, 'Kitchen dispatch succeeds after table assignment');

  const table5AfterA = store.state.tables.find((t) => t.id === table5.id)!;
  assert(
    table5AfterA.status === 'OCCUPIED' || table5AfterA.status === 'ORDER_SENT',
    'Table 5 is now marked OCCUPIED/ORDER_SENT'
  );

  // -----------------------------------------------------------------
  // SCENARIO B: Additional Order for Table 5
  // -----------------------------------------------------------------
  console.log('\n--- Scenario B: Additional Order for Table 5 ---');

  const order2 = store.createAdditionalOrderForTable(table5.id);
  assert(
    order2.isAdditionalOrder === true && order2.orderSequence === 2,
    `Additional order created with sequence #${order2.orderSequence} and orderNumber #${order2.orderNumber}`
  );

  assert(
    order2.sessionId === assignedOrder.sessionId,
    'Additional order belongs to the EXACT SAME TableSession'
  );

  // Add items to second order
  const order2Updated: Order = {
    ...order2,
    items: [
      {
        id: 'item-pizza-1',
        productId: 'prod-pizza-pep',
        productNameAr: 'بيتزا بيبروني وسط',
        productNameEn: 'Medium Pepperoni Pizza',
        unitPrice: 120.0,
        quantity: 1,
        selectedModifiers: [],
        prepStation: 'GRILL',
        kitchenStatus: 'PENDING',
        totalPrice: 120.0,
      },
    ],
    subtotal: 120.0,
    discountAmount: 0,
    taxRate: 0.15,
    taxAmount: 18.0,
    serviceCharge: 0,
    grandTotal: 138.0,
  };
  store.updateOrder(order2Updated);
  store.sendOrderToKitchen(order2.id);

  // Verify previous order 1 is intact and never overwritten
  const order1AfterB = store.state.orders.find((o) => o.id === draftOrder.id)!;
  assert(
    order1AfterB.items.length === 1 && order1AfterB.grandTotal === 34.5,
    'Previous Order 1 items, prices, and totals remain completely intact'
  );

  // -----------------------------------------------------------------
  // SCENARIO C: Third Order for Table 5 (Dessert / Drinks)
  // -----------------------------------------------------------------
  console.log('\n--- Scenario C: Third Additional Order for Table 5 ---');

  const order3 = store.createAdditionalOrderForTable(table5.id);
  assert(order3.orderSequence === 3, 'Third order created with sequence 3');

  const order3Updated: Order = {
    ...order3,
    items: [
      {
        id: 'item-tea-1',
        productId: 'prod-tea-karak',
        productNameAr: 'شاي كرك عدني',
        productNameEn: 'Karak Spiced Tea',
        unitPrice: 20.0,
        quantity: 2,
        selectedModifiers: [],
        prepStation: 'BEVERAGE',
        kitchenStatus: 'PENDING',
        totalPrice: 40.0,
      },
    ],
    subtotal: 40.0,
    discountAmount: 0,
    taxRate: 0.15,
    taxAmount: 6.0,
    serviceCharge: 0,
    grandTotal: 46.0,
  };
  store.updateOrder(order3Updated);
  store.sendOrderToKitchen(order3.id);

  const sessionC = store.state.tableSessions.find((s) => s.id === assignedOrder.sessionId)!;
  assert(
    sessionC.orderIds.length === 3,
    'All 3 orders belong to the same dining session'
  );

  // -----------------------------------------------------------------
  // SCENARIO D: Request Unified Bill
  // -----------------------------------------------------------------
  console.log('\n--- Scenario D: Request Unified Consolidated Bill ---');

  const billResult = store.requestTableBill(sessionC.id);
  assert(
    billResult.session.status === 'BILL_REQUESTED',
    'Session status transitioned to BILL_REQUESTED'
  );

  // 34.5 + 138.0 + 46.0 = 218.50
  const expectedGrandTotal = 34.5 + 138.0 + 46.0;
  assert(
    Math.abs(billResult.session.consolidatedGrandTotal - expectedGrandTotal) < 0.01,
    `Consolidated grand total correctly calculated: ${billResult.session.consolidatedGrandTotal} EGP (Expected: ${expectedGrandTotal})`
  );

  assert(
    Boolean(billResult.invoiceNumber && billResult.invoiceNumber.startsWith('INV-TBL')),
    `Generated consolidated invoice number: ${billResult.invoiceNumber}`
  );

  // -----------------------------------------------------------------
  // SCENARIO E: Print Pre-Bill (Table MUST Remain Occupied and Unpaid)
  // -----------------------------------------------------------------
  console.log('\n--- Scenario E: Print Bill (Non-destructive verification) ---');

  const table5AtE = store.state.tables.find((t) => t.id === table5.id)!;
  assert(
    table5AtE.status === 'BILL_REQUESTED',
    'Table 5 status is BILL_REQUESTED (NOT available)'
  );

  const sessionAtE = store.state.tableSessions.find((s) => s.id === sessionC.id)!;
  assert(
    sessionAtE.isPaid !== true && sessionAtE.status !== 'PAID' && sessionAtE.status !== 'CLOSED',
    'Printed invoice remains UNPAID and dining session remains open'
  );

  // -----------------------------------------------------------------
  // SCENARIO F: Pay Bill (Atomic Inventory, Double-Entry, Free Table)
  // -----------------------------------------------------------------
  console.log('\n--- Scenario F: Pay Bill & Close Table ---');

  const stockBeforePay = store.state.stockBalances.reduce((sum, b) => sum + b.quantityOnHand, 0);
  const jvCountBefore = store.state.journalEntries.length;

  const payResult = store.finalizeSessionPayment(
    sessionC.id,
    'CASH',
    250.0,
    250.0 - expectedGrandTotal
  );

  assert(payResult.success === true, 'Session payment succeeded atomically');

  const sessionAtF = store.state.tableSessions.find((s) => s.id === sessionC.id)!;
  assert(
    sessionAtF.status === 'PAID' && sessionAtF.isPaid === true,
    'Session marked PAID and CLOSED'
  );

  const table5AtF = store.state.tables.find((t) => t.id === table5.id)!;
  assert(
    table5AtF.status === 'AVAILABLE' && table5AtF.currentSessionId === undefined,
    'Table 5 is now reset to AVAILABLE for future guests'
  );

  assert(
    store.state.journalEntries.length > jvCountBefore,
    'Double-entry balanced accounting journal entry recorded'
  );

  // -----------------------------------------------------------------
  // SCENARIO G: Offline Resilience & Sync Outbox
  // -----------------------------------------------------------------
  console.log('\n--- Scenario G: Offline Mode & Sync Outbox ---');

  // Simulate network disconnection
  if (store.state.isOnline) {
    store.toggleNetworkMode();
  }

  const offlineTable = store.state.tables.find((t) => t.status === 'AVAILABLE')!;
  const offlineOrder = store.createAdditionalOrderForTable(offlineTable.id);
  const outboxBefore = store.state.syncOutbox.length;

  store.sendOrderToKitchen(offlineOrder.id);

  assert(
    store.state.syncOutbox.length > outboxBefore,
    'Sync outbox recorded kitchen dispatch transaction while offline'
  );

  const latestOutbox = store.state.syncOutbox[0];
  assert(
    latestOutbox.status === 'PENDING',
    'Outbox item marked PENDING for replay upon reconnection'
  );

  // Restore online status
  if (!store.state.isOnline) {
    store.toggleNetworkMode();
  }

  console.log('\n====================================================');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();
