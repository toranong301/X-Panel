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

  formatNumber(value: number | null, decimals = 2): string {
    if (!Number.isFinite(Number(value))) return '';
    return Number(value).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
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
