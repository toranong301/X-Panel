import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { createEmptyMonths } from '../../../models/entry-row.helpers';
import { EntryRow } from '../../../models/entry-row.model';

const DIESEL_B7_ONROAD = 'DIESEL_B7_ONROAD';
const DIESEL_B10_ONROAD = 'DIESEL_B10_ONROAD';
const GASOHOL_9195 = 'GASOHOL_9195';
const GASOHOL_E20 = 'GASOHOL_E20';
const DIESEL_B7_OFFROAD = 'DIESEL_B7_OFFROAD';

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
  readonly dieselB7Slots = Array.from({ length: 14 }, (_, i) => i + 1);
  readonly dieselB10Slots = Array.from({ length: 14 }, (_, i) => i + 1);
  readonly gasohol9195Slots = Array.from({ length: 6 }, (_, i) => i + 1);
  readonly gasoholE20Slots = Array.from({ length: 6 }, (_, i) => i + 1);
  readonly dieselB7OnroadCode = DIESEL_B7_ONROAD;
  readonly dieselB10OnroadCode = DIESEL_B10_ONROAD;
  readonly gasohol9195Code = GASOHOL_9195;
  readonly gasoholE20Code = GASOHOL_E20;
  readonly dieselB7OffroadCode = DIESEL_B7_OFFROAD;

  getEvidence(code: string): string {
    return this.getRow(code)?.referenceText ?? '';
  }

  updateEvidence(code: string, value: string) {
    const row = this.ensureRow(code);
    if (!row) return;
    row.referenceText = value;
    this.rowsChange.emit(this.rows);
  }

  getItemName(code: string): string {
    return this.getRow(code)?.itemName ?? '';
  }

  updateItemName(code: string, value: string) {
    const row = this.ensureRow(code);
    if (!row) return;
    row.itemName = value;
    this.rowsChange.emit(this.rows);
  }

  getLocation(code: string): string {
    return this.getRow(code)?.location ?? '';
  }

  updateLocation(code: string, value: string) {
    const row = this.ensureRow(code);
    if (!row) return;
    row.location = value;
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

  totalForCodes(codes: string[]): number {
    return codes.reduce((sum, code) => sum + this.totalForCode(code), 0);
  }

  formatNumber(value: number, zeroAsDash = false, decimals = 2): string {
    if (zeroAsDash && value === 0) return '-';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  evidenceForCodes(codes: string[]): string {
    for (const code of codes) {
      const evidence = this.getEvidence(code);
      if (evidence) return evidence;
    }
    return '';
  }

  monthlyForCode(code: string): number[] {
    const row = this.getRow(code);
    return this.toMonthlyArray(row);
  }

  monthlyTotalsForCodes(codes: string[]): number[] {
    const totals = Array.from({ length: 12 }, () => 0);
    for (const code of codes) {
      const monthly = this.monthlyForCode(code);
      monthly.forEach((value, idx) => {
        totals[idx] += value;
      });
    }
    return totals;
  }

  dieselB7OnroadCodes(): string[] {
    return this.dieselB7Slots.map(slot => this.slotCode(DIESEL_B7_ONROAD, slot));
  }

  dieselB10OnroadCodes(): string[] {
    return this.dieselB10Slots.map(slot => this.slotCode(DIESEL_B10_ONROAD, slot));
  }

  gasohol9195Codes(): string[] {
    return this.gasohol9195Slots.map(slot => this.slotCode(GASOHOL_9195, slot));
  }

  gasoholE20Codes(): string[] {
    return this.gasoholE20Slots.map(slot => this.slotCode(GASOHOL_E20, slot));
  }

  forkliftCodes(): string[] {
    return [DIESEL_B7_OFFROAD];
  }

  dieselB7SummaryEvidence(): string {
    return this.evidenceForCodes(this.dieselB7OnroadCodes());
  }

  dieselB10SummaryEvidence(): string {
    return this.evidenceForCodes(this.dieselB10OnroadCodes());
  }

  gasohol9195SummaryEvidence(): string {
    return this.evidenceForCodes(this.gasohol9195Codes());
  }

  gasoholE20SummaryEvidence(): string {
    return this.evidenceForCodes(this.gasoholE20Codes());
  }

  forkliftSummaryEvidence(): string {
    return this.evidenceForCodes(this.forkliftCodes());
  }

  private getRow(code: string): EntryRow | undefined {
    return this.rows.find(r => r.subCategoryCode === code);
  }

  private ensureRow(code: string): EntryRow | undefined {
    let row = this.getRow(code);
    if (row) return row;

    row = {
      cycleId: String(this.cycleId),
      scope: 'S1',
      categoryCode: '1.2',
      subCategoryCode: code,
      itemName: '',
      unit: 'L',
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

  slotCode(prefix: string, slot: number): string {
    return `${prefix}#${slot}`;
  }
}
