import { describe, expect, it } from 'vitest';
import { defineStateMachine, InvalidTransitionError, subscriptionStatus, tenantStatus } from './state-machine';

describe('state machines', () => {
  it('allows only listed transitions', () => {
    const m = defineStateMachine<'a' | 'b' | 'c'>('test', { a: ['b'], b: ['c'], c: [] });
    expect(m.can('a', 'b')).toBe(true);
    expect(m.can('a', 'c')).toBe(false);
    expect(() => m.assert('c', 'a')).toThrow(InvalidTransitionError);
    expect(m.isTerminal('c')).toBe(true);
  });

  it('closed tenants are terminal', () => {
    expect(tenantStatus.isTerminal('closed')).toBe(true);
    expect(tenantStatus.can('suspended', 'active')).toBe(true);
  });

  it('subscriptions follow the documented lifecycle', () => {
    expect(subscriptionStatus.can('trialing', 'active')).toBe(true);
    expect(subscriptionStatus.can('past_due', 'grace')).toBe(true);
    expect(subscriptionStatus.can('trialing', 'suspended')).toBe(false);
    expect(subscriptionStatus.can('cancelled', 'active')).toBe(false);
  });
});
