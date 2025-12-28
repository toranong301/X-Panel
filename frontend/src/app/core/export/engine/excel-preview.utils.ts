import { SheetPreviewRow } from './excel-preview.service';

export function isPreviewRowBlank(row: SheetPreviewRow): boolean {
  return row.cells.every(cell => {
    const value = cell.display ?? cell.computed ?? cell.raw ?? '';
    if (value === null || value === undefined) return true;
    if (typeof value === 'number') return value === 0;
    const text = String(value).trim();
    if (text === '') return true;
    return /^0+(\.0+)?$/.test(text);
  });
}

export function filterBlankPreviewRows(rows: SheetPreviewRow[]): SheetPreviewRow[] {
  return rows.filter(row => !isPreviewRowBlank(row));
}
