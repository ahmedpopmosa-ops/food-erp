// Fault-injection worker (P4-6): sells continuously until the parent kills the process at a random moment.
// Uses the built package (dist) exactly as an application would.
const { migrate, PosCore } = require('../dist/index.js');
const { NodeSqliteDriver } = require('../dist/node.js');

const [dbPath, pin, cashId] = process.argv.slice(2);

(async () => {
  const db = new NodeSqliteDriver(dbPath);
  await migrate(db);
  const pos = new PosCore(db, { print: async () => {} });
  await pos.recoverPrintJobs();
  await pos.login('C1', pin);
  try {
    await pos.openCashSession('100');
  } catch (err) {
    if (err.code !== 'session_open') throw err;
  }
  const [item] = await pos.menu();
  process.stdout.write('ready\n');
  for (;;) {
    const order = await pos.openOrder();
    await pos.addItem(order, item.variantId, '1');
    await pos.addItem(order, item.variantId, '2');
    await pos.finalize(order, [{ paymentMethodId: cashId, tendered: '200' }]);
  }
})().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
