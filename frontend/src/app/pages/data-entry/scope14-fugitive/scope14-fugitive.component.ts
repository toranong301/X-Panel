import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { createEmptyMonths } from '../../../models/entry-row.helpers';
import { EntryRow } from '../../../models/entry-row.model';

@Component({
  selector: 'app-scope14-fugitive',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scope14-fugitive.component.html',
  styleUrls: ['./scope14-fugitive.component.scss'],
})
export class Scope14FugitiveComponent {
  @Input() cycleId = 0;
  @Input() rows: EntryRow[] = [];
  @Output() rowsChange = new EventEmitter<EntryRow[]>();

  readonly months = Array.from({ length: 12 }, (_, i) => i + 1);

  getRow(code: string): EntryRow | undefined {
    return this.rows.find(r => r.subCategoryCode === code);
  }

  updateItemName(code: string, value: string) {
    const row = this.ensureRow(code);
    if (!row) return;
    row.itemName = value;
    this.rowsChange.emit(this.rows);
  }

  updateLocation(code: string, value: string) {
    const row = this.ensureRow(code);
    if (!row) return;
    row.location = value;
    this.rowsChange.emit(this.rows);
  }

  updateEvidence(code: string, value: string) {
    const row = this.ensureRow(code);
    if (!row) return;
    row.referenceText = value;
    this.rowsChange.emit(this.rows);
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

  formatNumber(value: number, zeroAsDash = false, decimals = 2): string {
    if (zeroAsDash && value === 0) return '-';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  private ensureRow(code: string): EntryRow | undefined {
    let row = this.getRow(code);
    if (row) return row;
    row = {
      cycleId: String(this.cycleId),
      scope: 'S1',
      categoryCode: '1.4.1',
      subCategoryCode: code,
      itemName: '',
      unit: 'kg',
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
