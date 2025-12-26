import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { CanonicalGhgService } from '../../../core/services/canonical-ghg.service';
import { CycleApiService } from '../../../core/services/cycle-api.service';
import { ExcelSheetReviewDialogComponent } from '../../../shared/components/excel-sheet-review-dialog/excel-sheet-review-dialog.component';
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
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
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

  exporting = false;
  readonly templateKey = 'MBAX_TGO_11102567::demo';
  readonly sheetName = '1.2 Mobile';

  constructor(
    private dialog: MatDialog,
    private canonicalSvc: CanonicalGhgService,
    private cycleApi: CycleApiService,
    private snackBar: MatSnackBar,
  ) {}

  openReview() {
    this.dialog.open(ExcelSheetReviewDialogComponent, {
      width: '90vw',
      maxWidth: '1200px',
      data: {
        title: 'Review: 1.2 Mobile',
        sheetName: this.sheetName,
        templateKey: this.templateKey,
        cycleId: this.cycleId,
        range: 'A1:AA70',
      },
    });
  }

  async exportSheet() {
    this.exporting = true;
    try {
      const canonical = this.canonicalSvc.build(this.cycleId);
      const updateResult = await this.cycleApi.updateCycleData(this.cycleId, canonical);
      this.cycleId = updateResult.cycleId;
      const exportResult = await this.cycleApi.exportCycle(updateResult.cycleId);

      if (exportResult.status === 'completed' && exportResult.download_url) {
        window.open(exportResult.download_url, '_blank');
        this.snackBar.open('Export สำเร็จ', 'ปิด', { duration: 4000 });
      } else if (exportResult.status === 'failed') {
        throw new Error(exportResult.error_message || 'Export failed');
      } else {
        this.snackBar.open('Export กำลังประมวลผล', 'ปิด', { duration: 4000 });
      }
    } catch (error: any) {
      console.error('Export sheet failed', error);
      alert('Export ล้มเหลว กรุณาลองใหม่อีกครั้ง');
      this.snackBar.open(error?.message || 'เกิดข้อผิดพลาดในการ Export', 'ปิด', { duration: 6000 });
    } finally {
      this.exporting = false;
    }
  }

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
      itemName: this.labelFor(key),
      unit: 'L',
      months: createEmptyMonths(),
      dataSourceType: 'ORG',
    };

    this.rows = [...this.rows, row];
    this.rowsChange.emit(this.rows);
  }

  removeRow(row: EntryRow) {
    this.rows = this.rows.filter(r => r !== row);
    this.rowsChange.emit(this.rows);
  }

  updateItemName(row: EntryRow, value: string) {
    row.itemName = value;
    this.rowsChange.emit(this.rows);
  }

  updateEvidence(row: EntryRow, value: string) {
    row.referenceText = value;
    this.rowsChange.emit(this.rows);
  }

  getMonthQty(row: EntryRow, month: number): number {
    const m = row.months.find(x => x.month === month);
    return m ? m.qty : 0;
  }

  updateMonthQty(row: EntryRow, month: number, value: number | string) {
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

  totalAll(key: Exclude<FuelKey, 'DIESEL_B7_OFFROAD'>): number {
    return this.groupRows(key).reduce((sum, row) => sum + this.total(row), 0);
  }

  getOffroadRow(): EntryRow | undefined {
    return this.rows.find(r => this.parseKey(r.subCategoryCode).fuelKey === 'DIESEL_B7_OFFROAD');
  }

  ensureOffroadRow(): EntryRow {
    let row = this.getOffroadRow();
    if (row) return row;

    row = {
      cycleId: String(this.cycleId),
      scope: 'S1',
      categoryCode: '1.2',
      subCategoryCode: 'DIESEL_B7_OFFROAD',
      itemName: LABELS.DIESEL_B7_OFFROAD,
      unit: 'L',
      months: createEmptyMonths(),
      dataSourceType: 'ORG',
    };

    this.rows = [...this.rows, row];
    this.rowsChange.emit(this.rows);
    return row;
  }

  private parseKey(code?: string): { fuelKey?: FuelKey; slotNo?: number } {
    const raw = String(code || '').trim();
    if (!raw) return {};
    const [k, n] = raw.split('#');
    const fuelKey = k as FuelKey;
    const slotNo = n ? Number(n) : undefined;
    return { fuelKey, slotNo: Number.isFinite(slotNo) ? slotNo : undefined };
  }
}
