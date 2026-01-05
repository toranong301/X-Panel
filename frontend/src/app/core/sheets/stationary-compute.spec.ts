import { describe, expect, it } from 'vitest';

import { computeStationarySummary } from './stationary-compute';
import { EntryRow } from '../../models/entry-row.model';

const mkRow = (itemName: string, fuelType: string, months: number[], unit = 'L'): EntryRow => ({
  cycleId: '1',
  scope: 'S1',
  categoryCode: '1.1',
  subCategoryCode: fuelType,
  itemName,
  unit,
  months: months.map((qty, idx) => ({ month: idx + 1, qty })),
});

describe('computeStationarySummary', () => {
  it('computes B7 blend totals', () => {
    const row = mkRow('Diesel B7', 'DIESEL_B7_STATIONARY', [0, 0, 0, 0, 170, 0, 0, 0, 180, 0, 0, 190]);
    const summary = computeStationarySummary([row]);
    expect(summary.totalBiodieselKg).toBeCloseTo(32.89, 2);
  });

  it('computes Gasohol 91/95 totals', () => {
    const row = mkRow('Gasohol 91/95', 'GASOHOL_9195_STATIONARY', [0, 5.51, 0, 5.42, 9.83, 5.64, 0, 5.19, 5.08, 5.14, 3.99, 5.75]);
    const summary = computeStationarySummary([row]);
    expect(summary.totalEthanolKg).toBeCloseTo(4.07, 2);
  });

  it('computes Other blend totals with custom density', () => {
    const row = mkRow('Other', 'CUSTOM_OTHER_1', [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    row.blend = {
      dieselPct: 50,
      biodieselPct: 10,
      gasolinePct: 30,
      ethanolPct: 10,
      biodieselDensityKgPerL: 0.88,
      ethanolDensityKgPerL: 0.8,
    };
    const summary = computeStationarySummary([row]);
    expect(summary.totalBiodieselKg).toBeCloseTo(8.8, 2);
    expect(summary.totalEthanolKg).toBeCloseTo(8.0, 2);
  });

  it('normalizes duplicate months using the latest value', () => {
    const row = mkRow('Diesel B7', 'DIESEL_B7_STATIONARY', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    row.months = [
      { month: 1, qty: 10 },
      { month: 1, qty: 20 },
      { month: '2' as unknown as number, qty: 5 },
    ];
    const summary = computeStationarySummary([row]);
    expect(summary.rows[0].totalL).toBe(25);
  });

  it('coerces string month values to numbers', () => {
    const row = mkRow('Diesel B7', 'DIESEL_B7_STATIONARY', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    row.months = [
      { month: 1, qty: '10' as unknown as number },
      { month: 2, qty: '5' as unknown as number },
    ];
    const summary = computeStationarySummary([row]);
    expect(summary.rows[0].totalL).toBe(15);
  });
});
