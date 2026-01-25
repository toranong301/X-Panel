import { describe, expect, it } from 'vitest';

import { applyTankMonths, TankInjection } from './tank.utils';

describe('tank utils', () => {
  it('adds tank total to the selected month', () => {
    const months = { M1: 10, M2: null };
    const { months: updated, injection } = applyTankMonths(months, null, 'M1', 30);
    expect(updated.M1).toBe(40);
    expect(injection).toEqual({ month: 'M1', value: 30 });
  });

  it('moves injection when target month changes', () => {
    const months = { M1: 50, M2: 20 };
    const previous: TankInjection = { month: 'M1', value: 30 };
    const { months: updated, injection } = applyTankMonths(months, previous, 'M2', 15);
    expect(updated.M1).toBe(20);
    expect(updated.M2).toBe(35);
    expect(injection).toEqual({ month: 'M2', value: 15 });
  });
});
