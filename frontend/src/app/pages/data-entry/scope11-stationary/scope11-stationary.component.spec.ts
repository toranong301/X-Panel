import { describe, expect, it } from 'vitest';

import { Scope11StationaryComponent } from './scope11-stationary.component';
import { EntryRow } from '../../../models/entry-row.model';

const makeComponent = (overrides?: {
  dialog?: any;
  canonicalSvc?: any;
  cycleApi?: any;
  cycleState?: any;
  snackBar?: any;
  dataEntrySvc?: any;
}) => {
  const dialog = overrides?.dialog ?? { open: () => ({}) };
  const canonicalSvc = overrides?.canonicalSvc ?? { buildScope11StationaryExport: () => ({}) };
  const cycleApi = overrides?.cycleApi ?? { updateCycleData: async () => ({ cycleId: 1, previewVersion: 'v1' }) };
  const cycleState = overrides?.cycleState ?? { setSelectedCycleId: () => {} };
  const snackBar = overrides?.snackBar ?? { open: () => {} };
  const dataEntrySvc = overrides?.dataEntrySvc ?? { load: () => null, save: () => {} };

  return new Scope11StationaryComponent(
    dialog,
    canonicalSvc,
    cycleApi,
    cycleState,
    snackBar,
    dataEntrySvc,
  );
};

const makeRow = (overrides: Partial<EntryRow> = {}): EntryRow => ({
  cycleId: '1',
  scope: 'S1',
  categoryCode: '1.1',
  subCategoryCode: 'CUSTOM_OTHER_1',
  itemName: '',
  unit: 'L',
  months: [],
  dataSourceType: 'ORG',
  ...overrides,
});

describe('Scope11StationaryComponent', () => {
  it('does not block review for non-L OTHER rows', () => {
    const component = makeComponent();
    const row = makeRow({
      subCategoryCode: 'ACETYLENE_TANK5_MAINT_2',
      unit: 'kg',
    });
    component.rows = [row];
    expect(component.hasOtherBlendErrors()).toBe(false);
  });

  it('does not block review for empty OTHER rows', () => {
    const component = makeComponent();
    const row = makeRow({
      subCategoryCode: 'CUSTOM_OTHER_1',
      unit: 'L',
      months: [],
    });
    component.rows = [row];
    expect(component.hasOtherBlendErrors()).toBe(false);
  });

  it('blocks review for OTHER rows with invalid blend specs', () => {
    const component = makeComponent();
    const row = makeRow({
      subCategoryCode: 'CUSTOM_OTHER_1',
      unit: 'L',
      months: [{ month: 1, qty: 10 }],
      blendSpec: {
        dieselPct: 80,
        biodieselPct: 10,
        gasolinePct: 5,
        ethanolPct: 0,
      },
    });
    component.rows = [row];
    expect(component.getOtherBlendError(row)).not.toBeNull();
    expect(component.hasOtherBlendErrors()).toBe(true);
  });

  it('allows OTHER rows with missing densities', () => {
    const component = makeComponent();
    const row = makeRow({
      subCategoryCode: 'CUSTOM_OTHER_1',
      unit: 'L',
      months: [{ month: 1, qty: 10 }],
      blendSpec: {
        dieselPct: 50,
        biodieselPct: 10,
        gasolinePct: 30,
        ethanolPct: 10,
      },
    });
    component.rows = [row];
    expect(component.getOtherBlendError(row)).toBeNull();
    expect(component.hasOtherBlendErrors()).toBe(false);
  });

  it('saves before opening preview', async () => {
    const calls: string[] = [];
    const component = makeComponent({
      dialog: { open: () => { calls.push('preview'); return {}; } },
      cycleApi: { updateCycleData: async () => { calls.push('save'); return { cycleId: 1, previewVersion: 'v1' }; } },
    });
    component.rows = [];
    await component.openReview();
    expect(calls).toEqual(['save', 'preview']);
  });
});
