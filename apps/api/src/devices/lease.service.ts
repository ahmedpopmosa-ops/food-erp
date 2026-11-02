import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { LeaseClaims, LicenseLease } from '@ros/contracts';
import { config } from '../config';

const DAY = 24 * 3600_000;

/**
 * Signs the offline license lease a POS needs to keep selling (ADR-0009). Ed25519 over the base64url JSON
 * claims. The POS verifies it with WebCrypto and refuses new sales once `valid_until` has passed.
 */
@Injectable()
export class LeaseService {
  private readonly logger = new Logger('LeaseService');
  private readonly privateKey: KeyObject;
  readonly publicKeySpki: string;
  readonly kid: string;

  constructor() {
    const configured = config().LEASE_SIGNING_KEY;
    if (configured) {
      this.privateKey = createPrivateKey({ key: Buffer.from(configured, 'base64'), format: 'der', type: 'pkcs8' });
    } else {
      this.privateKey = generateKeyPairSync('ed25519').privateKey;
      if (config().NODE_ENV === 'development')
        this.logger.warn('LEASE_SIGNING_KEY not set: using an ephemeral key (leases die on restart)');
    }
    const spki = createPublicKey(this.privateKey).export({ format: 'der', type: 'spki' });
    this.publicKeySpki = spki.toString('base64');
    this.kid = createHash('sha256').update(spki).digest('hex').slice(0, 16);
  }

  issue(
    device: { tenantId: string; branchId: string; deviceId: string },
    leaseDays: number,
    now = Date.now(),
  ): LicenseLease {
    const claims: LeaseClaims = {
      tenant_id: device.tenantId,
      branch_id: device.branchId,
      device_id: device.deviceId,
      issued_at: new Date(now).toISOString(),
      valid_until: new Date(now + leaseDays * DAY).toISOString(),
    };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = sign(null, Buffer.from(payload), this.privateKey).toString('base64url');
    return { payload, signature, kid: this.kid };
  }
}
