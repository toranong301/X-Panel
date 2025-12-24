import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { createEmptyMonths } from '../../../models/entry-row.helpers';
import { EntryRow } from '../../../models/entry-row.model';

type FuelKey =
  | 'DIESEL_B7_ONROAD'
  | 'DIESEL_B10_ONROAD'
  | 'GASOHOL_9195'
  | 'GASOHOL_E20'
  | 'DIESEL_B7_OFFROAD';

const MAX_SLOTS: Record<Exclude<FuelKey, 'DIESEL_B7_OFFROAD'>, number> = {
  DIESEL_B7_ONROAD: 14,
  DIESEL_B10_ONROAD: 14,
  GASOHOL_9195: 6,
  GASOHOL_E20: 6,
};

const LABELS: Record<FuelKey, string> = {
  DIESEL_B7_ONROAD: 'Diesel B7 on-road',
  DIESEL_B10_ONROAD: 'Diesel B10 on-road',
  GASOHOL_9195: 'Gasohol 91/95',
  GASOHOL_E20: 'Gasohol E20',
  DIESEL_B7_OFFROAD: 'Diesel B7 off-road (forklift)',
};

@Component({
  selector: 'app-scope12-mobile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scope12-mobile.component.html',
  styleUrls: ['./scope12-mobile.component.scss'],
})
export class Scope12MobileComponent {
  @Input() cycleId = 0;
  @Input() rows: EntryRow[] = [];
  @Output() rowsChange = new EventEmitter<EntryRow[]>();

  readonly months = Array.from({ length: 12 }, (_, i) => i + 1);

  readonly groups: Array<Exclude<FuelKey, 'DIESEL_B7_OFFROAD'>> = [
    'DIESEL_B7_ONROAD',
    'DIESEL_B10_ONROAD',
    'GASOHOL_9195',
    'GASOHOL_E20',
  ];

  labelFor(key: FuelKey): string {
    return LABELS[key];
  }

  /** rows ในแต่ละกลุ่ม (sort ตาม slotNo) */
  groupRows(key: Exclude<FuelKey, 'DIESEL_B7_OFFROAD'>): EntryRow[] {
    return this.rows
      .filter(r => this.parseKey(r.subCategoryCode).fuelKey === key)
      .sort((a, b) => (this.parseKey(a.subCategoryCode).slotNo ?? 0) - (this.parseKey(b.subCategoryCode).slotNo ?? 0));
  }

  canAdd(key: Exclude<FuelKey, 'DIESEL_B7_OFFROAD'>): boolean {
    const used = new Set(this.groupRows(key).map(r => this.parseKey(r.subCategoryCode).slotNo).filter(Boolean) as number[]);
    return used.size < MAX_SLOTS[key];
  }

  addRow(key: Exclude<FuelKey, 'DIESEL_B7_OFFROAD'>) {
    const max = MAX_SLOTS[key];
    const used = new Set(this.groupRows(key).map(r => this.parseKey(r.subCategoryCode).slotNo).filter(Boolean) as number[]);
    let slotNo: number | undefined;
    for (let i = 1; i <= max; i++) {
      if (!used.has(i)) {
        slotNo = i;
        break;
      }
    }
    if (!slotNo) return;

    const row: EntryRow = {
      cycleId: String(this.cycleId),
      scope: 'S1',
      categoryCode: '1.2',
      subCategoryCode: `${key}#${slotNo}`,
      itemName: '',
      unit: 'L',
      months: createEmptyMonths(),
      dataSourceType: 'ORG',
    };

    this.rows = [...this.rows, row];
    this.rowsChange.emit(this.rows);
  }

  removeRow(row: EntryRow) {
    // ไม่ให้ลบ forklift โดยไม่ตั้งใจ: ถ้าต้องการให้ลบได้ ให้เอา if นี้ออก
    if ((row.subCategoryCode ?? '').trim() === 'DIESEL_B7_OFFROAD') return;
    this.rows = this.rows.filter(r => r !== row);
    this.rowsChange.emit(this.rows);
  }

  getForkliftRow(): EntryRow {
    let row = this.rows.find(r => (r.subCategoryCode ?? '') === 'DIESEL_B7_OFFROAD');
    if (row) return row;

    row = {
      cycleId: String(this.cycleId),
      scope: 'S1',
      categoryCode: '1.2',
      subCategoryCode: 'DIESEL_B7_OFFROAD',
      itemName: '',
      unit: 'L',
      months: createEmptyMonths(),
      dataSourceType: 'ORG',
    };

    this.rows = [...this.rows, row];
    this.rowsChange.emit(this.rows);
    return row;
  }

  /** -------- cell helpers -------- */

  slotLabel(row: EntryRow): string {
    const { fuelKey, slotNo } = this.parseKey(row.subCategoryCode);
    if (!fuelKey) return '';
    return fuelKey === 'DIESEL_B7_OFFROAD' ? '' : `#${slotNo ?? ''}`;
  }

  total(row: EntryRow): number {
    return this.toMonthlyArray(row).reduce((s, n) => s + n, 0);
  }

  getMonthQty(row: EntryRow, month: number): number {
    const m = (row.months ?? []).find(x => x.month === month);
    return m ? Number(m.qty || 0) : 0;
  }

  updateMonthQty(row: EntryRow, month: number, value: number | string) {
    const qty = Number(value) || 0;
    let m = (row.months ?? []).find(x => x.month === month);
    if (!m) {
      m = { month, qty: 0 };
      row.months = [...(row.months ?? []), m];
    }
    m.qty = qty;
    this.rowsChange.emit(this.rows);
  }

  updateField(row: EntryRow, field: keyof Pick<EntryRow, 'itemName' | 'location' | 'referenceText'>, value: string) {
    (row as any)[field] = value;
    this.rowsChange.emit(this.rows);
  }

  formatNumber(value: number, zeroAsDash = false, decimals = 2): string {
    if (zeroAsDash && value === 0) return '-';
    return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  }

  private toMonthlyArray(row?: EntryRow): number[] {
    const out = Array.from({ length: 12 }, () => 0);
    for (const m of row?.months ?? []) {
      const idx = Number(m.month) - 1;
      if (idx >= 0 && idx < 12) out[idx] = Number(m.qty || 0);
    }
    return out;
  }

  private parseKey(subCategoryCode?: string): { fuelKey?: FuelKey; slotNo?: number } {
    const raw = String(subCategoryCode ?? '').trim();
    if (!raw) return {};
    if (raw === 'DIESEL_B7_OFFROAD') return { fuelKey: 'DIESEL_B7_OFFROAD' };

    const [k, n] = raw.split('#');
    const fuelKey = (k || '').trim() as FuelKey;
    const slotNo = n ? Number(n) : undefined;
    return {
      fuelKey: fuelKey || undefined,
      slotNo: Number.isFinite(slotNo) ? slotNo : undefined,
    };
  }
}
