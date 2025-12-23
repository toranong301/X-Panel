import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { createEmptyMonths } from '../../../models/entry-row.helpers';
import { EntryRow } from '../../../models/entry-row.model';
import { MonthlyEntryGridComponent } from '../monthly-entry-grid/monthly-entry-grid.component';

@Component({
  selector: 'app-category-section',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MonthlyEntryGridComponent,
  ],
  templateUrl: './category-section.component.html',
  styleUrls: ['./category-section.component.scss'],
})
export class CategorySectionComponent {

  /** --- meta info จาก V-Sheet --- */
  @Input() scope!: 'S1' | 'S2' | 'S3';
  @Input() categoryCode!: string;        // เช่น 1.1, 1.4.5, 3.7
  @Input() title!: string;
  @Input() description?: string;

  /** --- data --- */
  @Input() cycleId!: number;
  @Input() rows: EntryRow[] = [];

  /** --- state --- */
  @Input() readonly = false;

  /** --- output --- */
  @Output() rowsChange = new EventEmitter<EntryRow[]>();

  /** เพิ่ม activity ใหม่ใน category นี้ */
  addRow() {
    const newRow: EntryRow = {
      cycleId: String(this.cycleId),
      scope: this.scope,
      categoryCode: this.categoryCode,
      itemName: 'New activity',
      unit: '',
      months: createEmptyMonths(),
      dataSourceType: 'ORG',
    };

    this.rows = [...this.rows, newRow];
    this.rowsChange.emit(this.rows);
  }

  /** ลบ activity */
  removeRow(index: number) {
    if (this.readonly) return;

    this.rows = this.rows.filter((_, i) => i !== index);
    this.rowsChange.emit(this.rows);
  }
}
