export class InvalidTransitionError extends Error {
  readonly code = 'invalid_state_transition';

  constructor(
    readonly machine: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`${machine}: transition ${from} -> ${to} is not allowed`);
  }
}

/**
 * Declares the permitted transitions of a document type (doc 07 §2). Anything not listed is rejected,
 * so adding a state never silently opens a path.
 */
export function defineStateMachine<S extends string>(name: string, transitions: Record<S, readonly S[]>) {
  return {
    name,
    states: Object.keys(transitions) as S[],
    can(from: S, to: S): boolean {
      return transitions[from]?.includes(to) ?? false;
    },
    assert(from: S, to: S): void {
      if (!this.can(from, to)) throw new InvalidTransitionError(name, from, to);
    },
    isTerminal(state: S): boolean {
      return (transitions[state]?.length ?? 0) === 0;
    },
  };
}

export const branchStatus = defineStateMachine<'active' | 'closed'>('branch', {
  active: ['closed'],
  closed: ['active'],
});

export const membershipStatus = defineStateMachine<'invited' | 'active' | 'disabled'>('membership', {
  invited: ['active', 'disabled'],
  active: ['disabled'],
  disabled: ['active'],
});

export const tenantStatus = defineStateMachine<'onboarding' | 'active' | 'suspended' | 'closed'>('tenant', {
  onboarding: ['active', 'closed'],
  active: ['suspended', 'closed'],
  suspended: ['active', 'closed'],
  closed: [],
});

export const subscriptionStatus = defineStateMachine<
  'trialing' | 'active' | 'past_due' | 'grace' | 'suspended' | 'cancelled' | 'expired'
>('subscription', {
  trialing: ['active', 'expired'],
  active: ['past_due', 'cancelled'],
  past_due: ['active', 'grace'],
  grace: ['active', 'suspended'],
  suspended: ['active', 'cancelled'],
  cancelled: [],
  expired: [],
});
