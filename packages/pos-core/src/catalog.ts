import type { PullChange, PullEntityType } from '@ros/contracts';
import type { PriceRow } from '@ros/domain';
import type { SqlDriver, Statement } from './driver';

type Row = Record<string, unknown>;

/** Reference data pulled from the server, stored as JSON per entity (docs/06 §6). */
export class ReferenceStore {
  constructor(private readonly db: SqlDriver) {}

  /** Statements applying one pull page; the caller commits them with the new cursor in one batch. */
  changeStatements(changes: PullChange[]): Statement[] {
    return changes.map((c) =>
      c.op === 'delete'
        ? { sql: 'DELETE FROM ref_entities WHERE entity_type = ? AND id = ?', params: [c.entity_type, c.id] }
        : {
            sql: `INSERT INTO ref_entities (entity_type, id, data) VALUES (?, ?, ?)
                  ON CONFLICT (entity_type, id) DO UPDATE SET data = excluded.data`,
            params: [c.entity_type, c.id, JSON.stringify(c.data)],
          },
    );
  }

  async list<T = Row>(type: PullEntityType): Promise<T[]> {
    const rows = await this.db.all<{ data: string }>('SELECT data FROM ref_entities WHERE entity_type = ?', [type]);
    return rows.map((r) => JSON.parse(r.data) as T);
  }

  async get<T = Row>(type: PullEntityType, id: string): Promise<T | undefined> {
    const rows = await this.db.all<{ data: string }>('SELECT data FROM ref_entities WHERE entity_type = ? AND id = ?', [
      type,
      id,
    ]);
    return rows[0] ? (JSON.parse(rows[0].data) as T) : undefined;
  }

  async prices(variantId: string): Promise<PriceRow[]> {
    const rows = await this.list<{
      id: string;
      variantId: string;
      branchId: string | null;
      channel: PriceRow['channel'];
      price: string;
      validFrom: string;
      validTo: string | null;
    }>('product_price');
    return rows
      .filter((p) => p.variantId === variantId)
      .map((p) => ({
        id: p.id,
        variantId: p.variantId,
        branchId: p.branchId,
        channel: p.channel,
        price: p.price,
        validFrom: p.validFrom,
        validTo: p.validTo,
      }));
  }

  /** Sale tax rates of a tax category in effect at `at`, in application order. */
  async taxRates(taxCategoryId: string, at: string): Promise<{ taxRateId: string; rate: string }[]> {
    const links = (
      await this.list<{ taxCategoryId: string; taxRateId: string; appliesTo: string; sequence: number }>(
        'tax_category_rate',
      )
    )
      .filter((l) => l.taxCategoryId === taxCategoryId && l.appliesTo === 'sale')
      .sort((a, b) => a.sequence - b.sequence);
    const t = Date.parse(at);
    const out: { taxRateId: string; rate: string }[] = [];
    for (const l of links) {
      const rate = await this.get<{ rate: string; validFrom: string; validTo: string | null }>('tax_rate', l.taxRateId);
      if (rate && Date.parse(rate.validFrom) <= t && (!rate.validTo || Date.parse(rate.validTo) > t)) {
        out.push({ taxRateId: l.taxRateId, rate: normaliseRate(rate.rate) });
      }
    }
    return out;
  }
}

/** "0.14" from Prisma's "0.14" / "0.140000". */
export const normaliseRate = (rate: string) => (rate.includes('.') ? rate.replace(/0+$/, '').replace(/\.$/, '') : rate);
