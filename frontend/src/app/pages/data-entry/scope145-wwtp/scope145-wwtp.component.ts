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
