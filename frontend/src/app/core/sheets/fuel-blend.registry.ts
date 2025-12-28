export type FuelBlendKey =
  | 'B7'
  | 'B10'
  | 'GASOHOL_9195'
  | 'E20'
  | 'LPG'
  | 'FUEL_OIL'
  | 'OTHER';

export type FuelBlendRule = {
  key: FuelBlendKey;
  label: string;
  dieselFrac: number;
  biodieselFrac: number;
  gasolineFrac: number;
  ethanolFrac: number;
};

export const FUEL_BLEND_RULES: FuelBlendRule[] = [
  { key: 'B7', label: 'B7', dieselFrac: 0.93, biodieselFrac: 0.07, gasolineFrac: 0, ethanolFrac: 0 },
  { key: 'B10', label: 'B10', dieselFrac: 0.9, biodieselFrac: 0.1, gasolineFrac: 0, ethanolFrac: 0 },
  { key: 'GASOHOL_9195', label: '91/95', dieselFrac: 0, biodieselFrac: 0, gasolineFrac: 0.9, ethanolFrac: 0.1 },
  { key: 'E20', label: 'E20', dieselFrac: 0, biodieselFrac: 0, gasolineFrac: 0.8, ethanolFrac: 0.2 },
  { key: 'LPG', label: 'LPG', dieselFrac: 0, biodieselFrac: 0, gasolineFrac: 0, ethanolFrac: 0 },
  { key: 'FUEL_OIL', label: 'น้ำมันเตา', dieselFrac: 1, biodieselFrac: 0, gasolineFrac: 0, ethanolFrac: 0 },
  { key: 'OTHER', label: 'Other', dieselFrac: 1, biodieselFrac: 0, gasolineFrac: 0, ethanolFrac: 0 },
];

export const FUEL_DENSITY = {
  biodieselKgPerL: 0.87,
  ethanolKgPerL: 0.79,
};

export function findBlendRule(key: FuelBlendKey): FuelBlendRule {
  return FUEL_BLEND_RULES.find(rule => rule.key === key) ?? FUEL_BLEND_RULES[FUEL_BLEND_RULES.length - 1];
}

export function resolveBlendKey(fuelKey?: string, typeLabel?: string): FuelBlendKey {
  const raw = String(fuelKey || '').trim().toUpperCase();
  const type = String(typeLabel || '').trim().toUpperCase();

  if (type === 'B7') return 'B7';
  if (type === 'B10') return 'B10';
  if (type === '91/95' || type === '91-95') return 'GASOHOL_9195';
  if (type === 'E20') return 'E20';
  if (type === 'LPG') return 'LPG';
  if (type === 'น้ำมันเตา' || type === 'FUEL OIL') return 'FUEL_OIL';

  if (raw.includes('DIESEL_B7')) return 'B7';
  if (raw.includes('DIESEL_B10')) return 'B10';
  if (raw.includes('GASOHOL_9195')) return 'GASOHOL_9195';
  if (raw.includes('GASOHOL_E20')) return 'E20';
  if (raw.includes('LPG')) return 'LPG';
  if (raw.includes('FUEL_OIL') || raw.includes('OIL')) return 'FUEL_OIL';
  if (raw.startsWith('CUSTOM_B7')) return 'B7';
  if (raw.startsWith('CUSTOM_B10')) return 'B10';
  if (raw.startsWith('CUSTOM_GASOHOL_9195') || raw.startsWith('CUSTOM_9195')) return 'GASOHOL_9195';
  if (raw.startsWith('CUSTOM_E20')) return 'E20';
  if (raw.includes('ACETYLENE')) return 'OTHER';
  return 'OTHER';
}

export function computeBlendFromAnnualL(annualL: number, key: FuelBlendKey) {
  const rule = findBlendRule(key);
  const dieselL = annualL * rule.dieselFrac;
  const biodieselL = annualL * rule.biodieselFrac;
  const gasolineL = annualL * rule.gasolineFrac;
  const ethanolL = annualL * rule.ethanolFrac;
  return {
    dieselL,
    biodieselL,
    biodieselKg: biodieselL * FUEL_DENSITY.biodieselKgPerL,
    gasolineL,
    ethanolL,
    ethanolKg: ethanolL * FUEL_DENSITY.ethanolKgPerL,
  };
}

export function computeBlendFromSpec(
  annualL: number,
  spec?: {
    dieselPct?: number;
    biodieselPct?: number;
    gasolinePct?: number;
    ethanolPct?: number;
    density?: {
      biodieselKgPerL?: number;
      ethanolKgPerL?: number;
      dieselKgPerL?: number;
      gasolineKgPerL?: number;
    };
  }
) {
  const dieselPct = Number(spec?.dieselPct ?? 100);
  const biodieselPct = Number(spec?.biodieselPct ?? 0);
  const gasolinePct = Number(spec?.gasolinePct ?? 0);
  const ethanolPct = Number(spec?.ethanolPct ?? 0);

  const dieselFrac = dieselPct / 100;
  const biodieselFrac = biodieselPct / 100;
  const gasolineFrac = gasolinePct / 100;
  const ethanolFrac = ethanolPct / 100;

  const biodieselKgPerL = Number(spec?.density?.biodieselKgPerL ?? FUEL_DENSITY.biodieselKgPerL);
  const ethanolKgPerL = Number(spec?.density?.ethanolKgPerL ?? FUEL_DENSITY.ethanolKgPerL);

  const dieselL = annualL * dieselFrac;
  const biodieselL = annualL * biodieselFrac;
  const gasolineL = annualL * gasolineFrac;
  const ethanolL = annualL * ethanolFrac;

  return {
    dieselL,
    biodieselL,
    biodieselKg: biodieselL * biodieselKgPerL,
    gasolineL,
    ethanolL,
    ethanolKg: ethanolL * ethanolKgPerL,
  };
}
