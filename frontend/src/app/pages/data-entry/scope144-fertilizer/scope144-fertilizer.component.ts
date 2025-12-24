import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { createEmptyMonths } from '../../../models/entry-row.helpers';
import { EntryRow } from '../../../models/entry-row.model';
import { EvidenceModel } from '../../../models/evidence.model';
import { EvidenceBlockComponent } from '../../../shared/components/evidence-block/evidence-block.component';

const DEFAULT_UNIT = 'Kg';

@Component({
  selector: 'app-scope144-fertilizer',
  standalone: true,
  imports: [CommonModule, FormsModule, EvidenceBlockComponent],
  templateUrl: './scope144-fertilizer.component.html',
  styleUrls: ['./scope144-fertilizer.component.scss'],
})
export class Scope144FertilizerComponent {
  @Input() cycleId = 0;
  @Input() rows: EntryRow[] = [];
  @Output() rowsChange = new EventEmitter<EntryRow[]>();

  @Input() evidenceModel: EvidenceModel = { notes: [], tables: [], images: [] };
  @Output() evidenceModelChange = new EventEmitter<EvidenceModel>();

  readonly months = Array.from({ length: 12 }, (_, i) => i + 1);

  addRow(): void {
    const used = new Set(this.rows.map(row => this.parseSlotNo(row.subCategoryCode)).filter(Boolean) as number[]);
    let slotNo = 1;
    while (used.has(slotNo)) slotNo += 1;

    const row: EntryRow = {
      cycleId: String(this.cycleId),
      scope: 'S1',
      categoryCode: '1.4.4',
      subCategoryCode: `FERTILIZER#${slotNo}`,
      itemName: '',
      unit: DEFAULT_UNIT,
      referenceText: '',
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

  updateField(row: EntryRow, field: keyof Pick<EntryRow, 'itemName' | 'referenceText' | 'unit'>, value: string): void {
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

  formatNumber(value: number, decimals = 2): string {
    return Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
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
