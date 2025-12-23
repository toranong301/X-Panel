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

  getQty(row: EntryRow, month: number): number {
    const m = row.months.find(x => x.month === month);
    return m ? m.qty : 0;
  }

  updateQty(row: EntryRow, month: number, value: number) {
    let m = row.months.find(x => x.month === month);

    if (!m) {
      m = { month, qty: 0 };
      row.months.push(m);
    }

    m.qty = Number(value) || 0;
    this.rowsChange.emit(this.rows);
  }

  total(row: EntryRow): number {
    return row.months.reduce((sum, m) => sum + (m.qty || 0), 0);
  }
}
