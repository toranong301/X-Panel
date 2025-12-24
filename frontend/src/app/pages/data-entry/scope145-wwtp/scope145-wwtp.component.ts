import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { createEmptyMonths } from '../../../models/entry-row.helpers';
import { EntryRow } from '../../../models/entry-row.model';
import { EvidenceModel } from '../../../models/evidence.model';
import { EvidenceBlockComponent } from '../../../shared/components/evidence-block/evidence-block.component';

const DEFAULT_QUAL_UNIT = 'mg/l';
const DEFAULT_METER_UNIT = 'm3';

@Component({
  selector: 'app-scope145-wwtp',
  standalone: true,
  imports: [CommonModule, FormsModule, EvidenceBlockComponent],
  templateUrl: './scope145-wwtp.component.html',
  styleUrls: ['./scope145-wwtp.component.scss'],
})
export class Scope145WwtpComponent {
  @Input() cycleId = 0;
  @Input() rows: EntryRow[] = [];
  @Output() rowsChange = new EventEmitter<EntryRow[]>();

  @Input() evidenceModel: EvidenceModel = { notes: [], tables: [], images: [] };
  @Output() evidenceModelChange = new EventEmitter<EvidenceModel>();

  readonly months = Array.from({ length: 12 }, (_, i) => i + 1);

  qualityRows(): EntryRow[] {
    return this.sortedRows('WWTP_QUAL');
  }

  meterRows(): EntryRow[] {
    return this.sortedRows('WWTP_METER');
  }

  addRowQual(): void {
    this.addRow('WWTP_QUAL', {
      unit: DEFAULT_QUAL_UNIT,
      itemName: '',
      location: '',
      referenceText: '',
      remark: '',
    });
  }

  addRowMeter(): void {
    this.addRow('WWTP_METER', {
      unit: DEFAULT_METER_UNIT,
      itemName: '',
      referenceText: '',
    });
  }

  removeRow(row: EntryRow): void {
    this.rows = this.rows.filter(r => r !== row);
    this.rowsChange.emit([...this.rows]);
  }

  updateField(
    row: EntryRow,
    field: keyof Pick<EntryRow, 'itemName' | 'location' | 'referenceText' | 'unit' | 'remark'>,
    value: string
  ): void {
    (row as any)[field] = value;
    this.rowsChange.emit([...this.rows]);
  }

  getStandard(row: EntryRow): string {
    return String(row.remark ?? '');
  }

  updateStandard(row: EntryRow, value: string): void {
    row.remark = String(value ?? '');
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

  private addRow(
    prefix: 'WWTP_QUAL' | 'WWTP_METER',
    defaults: Partial<EntryRow>
  ): void {
    const used = new Set(
      this.rows
        .filter(r => String(r.subCategoryCode ?? '').startsWith(prefix))
        .map(r => this.parseSlotNo(r.subCategoryCode))
        .filter(Boolean) as number[]
    );
    let slotNo = 1;
    while (used.has(slotNo)) slotNo += 1;

    const row: EntryRow = {
      cycleId: String(this.cycleId),
      scope: 'S1',
      categoryCode: '1.4.5',
      subCategoryCode: `${prefix}#${slotNo}`,
      itemName: '',
      unit: prefix === 'WWTP_QUAL' ? DEFAULT_QUAL_UNIT : DEFAULT_METER_UNIT,
      months: createEmptyMonths(),
      dataSourceType: 'ORG',
      ...defaults,
    };

    this.rows = [...this.rows, row];
    this.rowsChange.emit([...this.rows]);
  }

  private sortedRows(prefix: 'WWTP_QUAL' | 'WWTP_METER'): EntryRow[] {
    return this.rows
      .filter(r => String(r.subCategoryCode ?? '').startsWith(prefix))
      .sort((a, b) => (this.parseSlotNo(a.subCategoryCode) ?? 0) - (this.parseSlotNo(b.subCategoryCode) ?? 0));
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
