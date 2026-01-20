import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { createEmptyMonths } from '../../../models/entry-row.helpers';
import { EntryRow } from '../../../models/entry-row.model';

const DEFAULT_UNIT = 'kg';

@Component({
  selector: 'app-scope142-fire',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scope142-fire.component.html',
  styleUrls: ['./scope142-fire.component.scss'],
})
export class Scope142FireComponent {
  @Input() cycleId = 0;
  @Input() rows: EntryRow[] = [];
  @Output() rowsChange = new EventEmitter<EntryRow[]>();

  readonly months = Array.from({ length: 12 }, (_, i) => i + 1);

  addRow(): void {
    const used = new Set(this.rows.map(row => this.parseSlotNo(row.subCategoryCode)).filter(Boolean) as number[]);
    let slotNo = 1;
    while (used.has(slotNo)) slotNo += 1;

    const row: EntryRow = {
      cycleId: String(this.cycleId),
      scope: 'S1',
      categoryCode: '1.4.2',
      subCategoryCode: `FIRE_EXT_AGENT#${slotNo}`,
      id: `S1-142-${slotNo}`,
      itemName: '',
      unit: DEFAULT_UNIT,
      months: createEmptyMonths(),
      dataSourceType: 'ORG',
    };

    this.rows = [...this.rows, row];
    this.rowsChange.emit([...this.rows]);
  }

  removeRow(row: EntryRow): void {
    this.rows = this.rows.filter(r => r !== row);
    this.rowsChange.emit([...this.rows]);
  }

  updateField(row: EntryRow, field: keyof Pick<EntryRow, 'itemName' | 'location' | 'referenceText' | 'unit'>, value: string): void {
    (row as any)[field] = value;
    this.rowsChange.emit([...this.rows]);
  }

  getMonthQty(row: EntryRow, month: number): number | null {
    const m = (row.months ?? []).find(x => Number(x?.month) === month);
    return m && Number.isFinite(Number(m.qty)) ? Number(m.qty) : null;
  }

  updateMonthQty(row: EntryRow, month: number, value: number | string): void {
    const qty = this.parseNumberOrNull(value);
    const existing = Array.isArray(row.months) ? row.months : [];
    const otherMonths = existing.filter(x => Number(x?.month) !== month);
    row.months = qty === null
      ? otherMonths
      : [...otherMonths, { month, qty }].sort((a, b) => a.month - b.month);
    this.rowsChange.emit([...this.rows]);
  }

  total(row: EntryRow): number | null {
    const values = (row.months ?? [])
      .map(m => this.parseNumberOrNull(m?.qty))
      .filter((v): v is number => v !== null);
    if (!values.length) return null;
    return values.reduce((sum, v) => sum + v, 0);
  }

  formatNumber(value: number | null, zeroAsDash = false, decimals = 2): string {
    if (!Number.isFinite(Number(value))) return '';
    if (zeroAsDash && Number(value) === 0) return '-';
    return Number(value).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  slotNo(row: EntryRow): number | undefined {
    return this.parseSlotNo(row.subCategoryCode);
  }

  private toMonthlyArray(row?: EntryRow): Array<number | null> {
    const out: Array<number | null> = Array.from({ length: 12 }, () => null);
    for (const m of row?.months ?? []) {
      const idx = Number(m.month) - 1;
      if (idx >= 0 && idx < 12) out[idx] = this.parseNumberOrNull(m.qty);
    }
    return out;
  }

  private parseSlotNo(subCategoryCode?: string): number | undefined {
    const raw = String(subCategoryCode ?? '').trim();
    if (!raw) return undefined;
    const [, slotRaw] = raw.split('#');
    const slotNo = slotRaw ? Number(slotRaw) : undefined;
    return Number.isFinite(slotNo) ? slotNo : undefined;
  }

  private parseNumberOrNull(raw: any): number | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const s = String(raw).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
}
