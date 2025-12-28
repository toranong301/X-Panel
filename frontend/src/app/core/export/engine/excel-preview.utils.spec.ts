import { describe, expect, it } from 'vitest';

import { filterBlankPreviewRows, isPreviewRowBlank } from './excel-preview.utils';
import { SheetPreviewRow } from './excel-preview.service';

const mkRow = (values: Array<string | number | null>): SheetPreviewRow => ({
  rowNumber: 1,
  cells: values.map((value, idx) => ({
    addr: `A${idx + 1}`,
    raw: value,
    formula: null,
    computed: value,
    display: value === null ? '' : String(value),
    calcError: null,
    type: typeof value === 'number' ? 'number' : 'text',
  })),
});

describe('excel-preview blank rows', () => {
  it('treats all empty/zero cells as blank', () => {
    const row = mkRow([null, '', 0, '0.00']);
    expect(isPreviewRowBlank(row)).toBe(true);
  });

  it('keeps rows with any non-empty text', () => {
    const row = mkRow([null, 'Header', 0]);
    expect(isPreviewRowBlank(row)).toBe(false);
  });

  it('filters blank rows from preview', () => {
    const rows = [mkRow(['Header']), mkRow([0, 0]), mkRow(['data'])];
    const filtered = filterBlankPreviewRows(rows);
    expect(filtered).toHaveLength(2);
  });
});
