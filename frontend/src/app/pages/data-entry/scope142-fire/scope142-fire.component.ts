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

  getMonthQty(row: EntryRow, month: number): number {
    const m = (row.months ?? []).find(x => x.month === month);
    return m ? Number(m.qty || 0) : 0;
  }

  updateMonthQty(row: EntryRow, month: number, value: number | string): void {
    const qty = Number(value) || 0;
    let m = (row.months ?? []).find(x => x.month === month);
    if (!m) {
      m = { month, qty: 0 };
      row.months = [...(row.months ?? []), m];
    }
    m.qty = qty;
    this.rowsChange.emit([...this.rows]);
  }

  total(row: EntryRow): number {
    return this.toMonthlyArray(row).reduce((sum, v) => sum + v, 0);
  }

  formatNumber(value: number, zeroAsDash = false, decimals = 2): string {
    if (zeroAsDash && value === 0) return '-';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  slotNo(row: EntryRow): number | undefined {
    return this.parseSlotNo(row.subCategoryCode);
  }

  private toMonthlyArray(row?: EntryRow): number[] {
    const out = Array.from({ length: 12 }, () => 0);
    for (const m of row?.months ?? []) {
      const idx = Number(m.month) - 1;
      if (idx >= 0 && idx < 12) out[idx] = Number(m.qty || 0);
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
}
