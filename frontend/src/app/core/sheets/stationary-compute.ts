import { EntryRow, MonthlyQty } from '../../models/entry-row.model';
import { computeBlendFromAnnualL, computeBlendFromSpec, resolveBlendKey } from './fuel-blend.registry';

export type StationaryComputedRow = {
  row: EntryRow;
  totalL: number;
  dieselL: number;
  biodieselL: number;
  biodieselKg: number;
  gasolineL: number;
  ethanolL: number;
  ethanolKg: number;
  totalKg?: number;
  monthlyKg?: number[];
};

export type StationarySummary = {
  rows: StationaryComputedRow[];
  totalBiodieselKg: number;
  totalEthanolKg: number;
};

const DEFAULT_BIODIESEL_DENSITY = 0.87;
const DEFAULT_ETHANOL_DENSITY = 0.79;

export function computeStationaryRow(row: EntryRow): StationaryComputedRow | null {
  const unit = String(row.unit || '').toLowerCase();
  const months = normalizeMonthValues(row.months);
  const total = months.reduce((sum, v) => sum + v, 0);

  if (unit === 'l') {
    const blendKey = resolveBlendKey(row.subCategoryCode, row.fuelType ?? row.remark);
    const blend =
      blendKey === 'OTHER'
        ? computeBlendFromSpec(total, normalizeBlendSpec(row))
        : computeBlendFromAnnualL(total, blendKey);

    return {
      row,
      totalL: total,
      dieselL: blend.dieselL,
      biodieselL: blend.biodieselL,
      biodieselKg: blend.biodieselKg,
      gasolineL: blend.gasolineL,
      ethanolL: blend.ethanolL,
      ethanolKg: blend.ethanolKg,
    };
  }

  const kgPerUnit = row.unitConversion?.kgPerUnit;
  if (unit === 'ถัง' && kgPerUnit) {
    const monthlyKg = months.map(v => v * kgPerUnit);
    const totalKg = monthlyKg.reduce((sum, v) => sum + v, 0);
    return {
      row,
      totalL: 0,
      dieselL: 0,
      biodieselL: 0,
      biodieselKg: 0,
      gasolineL: 0,
      ethanolL: 0,
      ethanolKg: 0,
      totalKg,
      monthlyKg,
    };
  }

  return {
    row,
    totalL: unit === 'kg' ? total : 0,
    dieselL: 0,
    biodieselL: 0,
    biodieselKg: 0,
    gasolineL: 0,
    ethanolL: 0,
    ethanolKg: 0,
    totalKg: unit === 'kg' ? total : undefined,
  };
}

export function computeStationarySummary(rows: EntryRow[]): StationarySummary {
  const computed = rows
    .filter(r => r.categoryCode === '1.1')
    .map(row => computeStationaryRow(row))
    .filter((row): row is StationaryComputedRow => Boolean(row));

  const totalBiodieselKg = computed.reduce((sum, row) => sum + (row.biodieselKg || 0), 0);
  const totalEthanolKg = computed.reduce((sum, row) => sum + (row.ethanolKg || 0), 0);

  return {
    rows: computed,
    totalBiodieselKg,
    totalEthanolKg,
  };
}

export function normalizeMonthValues(months?: MonthlyQty[]): number[] {
  const normalized = Array(12).fill(0);
  if (!months) return normalized;
  for (const entry of months) {
    const month = Number(entry?.month ?? 0);
    const idx = month - 1;
    if (idx < 0 || idx >= 12) continue;
    normalized[idx] = Number(entry?.qty ?? 0) || 0;
  }
  return normalized;
}

function normalizeBlendSpec(row: EntryRow) {
  const spec = row.blend ?? row.blendSpec;
  const biodieselDensity =
    spec && 'density' in spec
      ? spec.density?.biodieselKgPerL
      : (spec as { biodieselDensityKgPerL?: number } | undefined)?.biodieselDensityKgPerL;
  const ethanolDensity =
    spec && 'density' in spec
      ? spec.density?.ethanolKgPerL
      : (spec as { ethanolDensityKgPerL?: number } | undefined)?.ethanolDensityKgPerL;
  return {
    dieselPct: spec?.dieselPct ?? 100,
    biodieselPct: spec?.biodieselPct ?? 0,
    gasolinePct: spec?.gasolinePct ?? 0,
    ethanolPct: spec?.ethanolPct ?? 0,
    density: {
      biodieselKgPerL: biodieselDensity ?? DEFAULT_BIODIESEL_DENSITY,
      ethanolKgPerL: ethanolDensity ?? DEFAULT_ETHANOL_DENSITY,
    },
  };
}
