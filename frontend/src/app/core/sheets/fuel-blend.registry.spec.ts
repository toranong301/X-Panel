import { describe, expect, it } from 'vitest';

import { computeBlendFromAnnualL, computeBlendFromSpec } from './fuel-blend.registry';

describe('FuelBlendRegistry', () => {
  it('computes B7 blend totals (540 L)', () => {
    const result = computeBlendFromAnnualL(540, 'B7');
    expect(result.biodieselKg).toBeCloseTo(32.89, 2);
    expect(result.dieselL).toBeCloseTo(502.2, 2);
  });

  it('computes 91/95 blend totals (51.55 L)', () => {
    const result = computeBlendFromAnnualL(51.55, 'GASOHOL_9195');
    expect(result.ethanolKg).toBeCloseTo(4.07, 2);
    expect(result.gasolineL).toBeCloseTo(46.39, 2);
  });

  it('computes Other blend totals with custom densities', () => {
    const result = computeBlendFromSpec(100, {
      dieselPct: 50,
      biodieselPct: 10,
      gasolinePct: 30,
      ethanolPct: 10,
      density: {
        biodieselKgPerL: 0.88,
        ethanolKgPerL: 0.8,
      },
    });
    expect(result.biodieselKg).toBeCloseTo(8.8, 2);
    expect(result.ethanolKg).toBeCloseTo(8.0, 2);
  });

  it('validates pct sum for other blend settings', () => {
    const sum = 50 + 10 + 30 + 10;
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01);
  });
});
