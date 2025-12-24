import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { createEmptyMonths } from '../../../models/entry-row.helpers';
import { EntryRow } from '../../../models/entry-row.model';

const DIESEL_CODE = 'DIESEL_B7_STATIONARY';
const GASOHOL_CODE = 'GASOHOL_9195_STATIONARY';
const ACETYLENE_MAINT2_CODE = 'ACETYLENE_TANK5_MAINT_2';
const ACETYLENE_MAINT3_CODE = 'ACETYLENE_TANK5_MAINT_3';

@Component({
  selector: 'app-scope11-stationary',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scope11-stationary.component.html',
  styleUrls: ['./scope11-stationary.component.scss'],
})
export class Scope11StationaryComponent {
  @Input() cycleId = 0;
  @Input() rows: EntryRow[] = [];
  @Output() rowsChange = new EventEmitter<EntryRow[]>();

  readonly months = Array.from({ length: 12 }, (_, i) => i + 1);
  readonly evidenceOptions = ['ใบกำกับภาษี', 'บิลเงินสด/ใบกำกับภาษี', 'ใบสั่งซื้อ'];

  readonly dieselCode = DIESEL_CODE;
  readonly gasoholCode = GASOHOL_CODE;
  readonly acetyleneMaint2Code = ACETYLENE_MAINT2_CODE;
  readonly acetyleneMaint3Code = ACETYLENE_MAINT3_CODE;

  get dieselRow(): EntryRow | undefined {
    return this.getRow(DIESEL_CODE);
  }

  get gasoholRow(): EntryRow | undefined {
    return this.getRow(GASOHOL_CODE);
  }

  get acetyleneMaint2Row(): EntryRow | undefined {
    return this.getRow(ACETYLENE_MAINT2_CODE);
  }

  get acetyleneMaint3Row(): EntryRow | undefined {
    return this.getRow(ACETYLENE_MAINT3_CODE);
  }

  updateEvidence(code: string, value: string) {
    const row = this.ensureRow(code);
    if (!row) return;
    row.referenceText = value;
    this.rowsChange.emit(this.rows);
  }

  getEvidence(code: string): string {
    return this.getRow(code)?.referenceText ?? '';
  }

  getMonthQty(code: string, month: number): number {
    const row = this.getRow(code);
    if (!row) return 0;
    const m = row.months.find(x => x.month === month);
    return m ? m.qty : 0;
  }

  updateMonthQty(code: string, month: number, value: number | string) {
    const row = this.ensureRow(code);
    if (!row) return;
    let m = row.months.find(x => x.month === month);
    if (!m) {
      m = { month, qty: 0 };
      row.months.push(m);
    }
    m.qty = Number(value) || 0;
    this.rowsChange.emit(this.rows);
  }

  totalForCode(code: string): number {
    return this.monthlyForCode(code).reduce((sum, v) => sum + v, 0);
  }

  monthlyForCode(code: string): number[] {
    const row = this.getRow(code);
    return this.toMonthlyArray(row);
  }

  acetyleneMaint2KgMonths(): number[] {
    return this.monthlyForCode(ACETYLENE_MAINT2_CODE).map(v => v * 5);
  }

  acetyleneMaint3KgMonths(): number[] {
    return this.monthlyForCode(ACETYLENE_MAINT3_CODE).map(v => v * 5);
  }

  acetyleneTotalKgMonths(): number[] {
    const maint2 = this.acetyleneMaint2KgMonths();
    const maint3 = this.acetyleneMaint3KgMonths();
    return maint2.map((v, i) => v + (maint3[i] ?? 0));
  }

  totalFromMonths(months: number[]): number {
    return months.reduce((sum, v) => sum + v, 0);
  }

  formatNumber(value: number, zeroAsDash = false, decimals = 2): string {
    if (zeroAsDash && value === 0) return '-';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  private getRow(code: string): EntryRow | undefined {
    return this.rows.find(r => r.subCategoryCode === code);
  }

  private ensureRow(code: string): EntryRow | undefined {
    let row = this.getRow(code);
    if (row) return row;

    const defaults: Record<string, { itemName: string; unit: string }> = {
      [DIESEL_CODE]: { itemName: 'น้ำมัน Diesel B7 (Fire Pump)', unit: 'L' },
      [GASOHOL_CODE]: { itemName: 'น้ำมัน Gasohol 91/95 (เครื่องตัดหญ้า)', unit: 'L' },
      [ACETYLENE_MAINT2_CODE]: { itemName: 'Acetylene gas (5 kg) ในงานการซ่อมบำรุง 2', unit: 'ถัง' },
      [ACETYLENE_MAINT3_CODE]: { itemName: 'Acetylene gas (5 kg) ในงานการซ่อมบำรุง 3', unit: 'ถัง' },
    };

    const def = defaults[code];
    if (!def) return undefined;

    row = {
      cycleId: String(this.cycleId),
      scope: 'S1',
      categoryCode: '1.1',
      subCategoryCode: code,
      itemName: def.itemName,
      unit: def.unit,
      months: createEmptyMonths(),
      dataSourceType: 'ORG',
    };

    this.rows = [...this.rows, row];
    this.rowsChange.emit(this.rows);
    return row;
  }

  private toMonthlyArray(row?: EntryRow): number[] {
    const out = Array.from({ length: 12 }, () => 0);
    for (const m of row?.months ?? []) {
      const idx = Number(m.month) - 1;
      if (idx >= 0 && idx < 12) out[idx] = Number(m.qty || 0);
    }
    return out;
  }
}
