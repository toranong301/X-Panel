import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { createEmptyMonths } from '../../../models/entry-row.helpers';
import { EntryRow } from '../../../models/entry-row.model';

const GROUPS = [
  { no: 1, label: '#1 โรงงานแหลมฉบัง (6 วัน/สัปดาห์)' },
  { no: 2, label: '#2 สำนักงานกรุงเทพ (5 วัน/สัปดาห์)' },
  { no: 3, label: '#3 รปภ (7 วัน/สัปดาห์)' },
  { no: 4, label: '#4 พยาบาล (7 วัน/สัปดาห์)' },
];

const MONTH_LABELS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

@Component({
  selector: 'app-scope143-septic',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scope143-septic.component.html',
  styleUrls: ['./scope143-septic.component.scss'],
})
export class Scope143SepticComponent implements OnChanges {
  @Input() cycleId = 0;
  @Input() rows: EntryRow[] = [];
  @Output() rowsChange = new EventEmitter<EntryRow[]>();

  readonly groups = GROUPS;
  readonly months = Array.from({ length: 12 }, (_, i) => i + 1);
  readonly monthLabels = MONTH_LABELS;
  readonly daysInMonth = DAYS_IN_MONTH;

  ngOnChanges(): void {
    this.ensureDefaults();
  }

  getPeopleRow(groupNo: number): EntryRow | undefined {
    return this.findRow(groupNo, 'PEOPLE');
  }

  getDaysOffRow(groupNo: number): EntryRow | undefined {
    return this.findRow(groupNo, 'OFF');
  }

  getMonthQty(row: EntryRow | undefined, month: number): number {
    if (!row) return 0;
    const m = (row.months ?? []).find(x => x.month === month);
    return m ? Number(m.qty || 0) : 0;
  }

  updateMonthQty(row: EntryRow | undefined, month: number, value: number | string): void {
    if (!row) return;
    const qty = Number(value) || 0;
    let m = (row.months ?? []).find(x => x.month === month);
    if (!m) {
      m = { month, qty: 0 };
      row.months = [...(row.months ?? []), m];
    }
    m.qty = qty;
    this.rowsChange.emit([...this.rows]);
  }

  workingDays(monthIndex: number, daysOff: number): number {
    return Math.max(0, this.daysInMonth[monthIndex] - (Number(daysOff) || 0));
  }

  manDay(people: number, workingDays: number): number {
    return (Number(people) || 0) * (Number(workingDays) || 0);
  }

  tow(manDay: number): number {
    return Number(manDay) || 0;
  }

  ch4(tow: number): number {
    return Number(tow) || 0;
  }

  formatNumber(value: number, decimals = 2): string {
    return Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  private ensureDefaults(): void {
    let next = [...this.rows];
    let changed = false;

    for (const group of this.groups) {
      const peopleKey = this.makeSubCode(group.no, 'PEOPLE');
      if (!next.find(r => r.subCategoryCode === peopleKey)) {
        next = [...next, this.createRow(group.no, 'PEOPLE', group.label, 'people')];
        changed = true;
      }

      const offKey = this.makeSubCode(group.no, 'OFF');
      if (!next.find(r => r.subCategoryCode === offKey)) {
        next = [...next, this.createRow(group.no, 'OFF', group.label, 'days')];
        changed = true;
      }
    }

    if (changed) {
      this.rows = next;
      this.rowsChange.emit([...this.rows]);
    }
  }

  private findRow(groupNo: number, kind: 'PEOPLE' | 'OFF'): EntryRow | undefined {
    const subCategoryCode = this.makeSubCode(groupNo, kind);
    return this.rows.find(r => r.subCategoryCode === subCategoryCode);
  }

  private makeSubCode(groupNo: number, kind: 'PEOPLE' | 'OFF'): string {
    return kind === 'PEOPLE' ? `SEPTIC_P#${groupNo}` : `SEPTIC_OFF#${groupNo}`;
  }

  private createRow(groupNo: number, kind: 'PEOPLE' | 'OFF', label: string, unit: string): EntryRow {
    return {
      cycleId: String(this.cycleId),
      scope: 'S1',
      categoryCode: '1.4.3',
      subCategoryCode: this.makeSubCode(groupNo, kind),
      itemName: label,
      unit,
      months: createEmptyMonths(),
      dataSourceType: 'ORG',
    };
  }
}
