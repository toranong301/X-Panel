import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';

import { EntryRow } from '../../../models/entry-row.model';

@Component({
  selector: 'app-monthly-entry-grid',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
  ],
  templateUrl: './monthly-entry-grid.component.html',
})
export class MonthlyEntryGridComponent implements OnInit {

  @Input() rows: EntryRow[] = [];
  @Input() readonly = false;

  @Output() rowsChange = new EventEmitter<EntryRow[]>();

  months: number[] = Array.from({ length: 12 }, (_, i) => i + 1);

  displayedColumns: string[] = [];

  ngOnInit() {
    this.displayedColumns = [
      'item',
      ...this.months.map(m => 'm' + m),
      'total',
    ];
  }

  getQty(row: EntryRow, month: number): number | null {
    const m = row.months.find(x => Number(x?.month) === month);
    return m && Number.isFinite(Number(m.qty)) ? Number(m.qty) : null;
  }

  updateQty(row: EntryRow, month: number, raw: any) {
    const qty = this.parseNumberOrNull(raw);
    const existing = Array.isArray(row.months) ? row.months : [];
    const otherMonths = existing.filter(x => Number(x?.month) !== month);
    row.months = qty === null
      ? otherMonths
      : [...otherMonths, { month, qty }].sort((a, b) => a.month - b.month);
    this.rowsChange.emit(this.rows ?? []);
  }

  total(row: EntryRow): number | null {
    const values = (row.months ?? [])
      .map(m => this.parseNumberOrNull(m?.qty))
      .filter((v): v is number => v !== null);
    if (!values.length) return null;
    return values.reduce((sum, v) => sum + v, 0);
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
