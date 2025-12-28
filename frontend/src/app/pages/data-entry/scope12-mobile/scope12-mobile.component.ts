import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { CanonicalGhgService } from '../../../core/services/canonical-ghg.service';
import { CycleApiService } from '../../../core/services/cycle-api.service';
import { CycleStateService } from '../../../core/services/cycle-state.service';
import { DataEntryDoc, DataEntryService } from '../../../core/services/data-entry.service';
import { SHEET_REGISTRY } from '../../../core/sheet.registry';
import { getSheetItemOptions, SheetItemOption } from '../../../core/sheets/sheet-item.registry';
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
    MatAutocompleteModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatSelectModule,
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
  readonly sheetId = SHEET_REGISTRY['SCOPE1_MOBILE'].sheetId;

  constructor(
    private dialog: MatDialog,
    private canonicalSvc: CanonicalGhgService,
    private cycleApi: CycleApiService,
    private cycleState: CycleStateService,
    private snackBar: MatSnackBar,
    private dataEntrySvc: DataEntryService,
  ) {}

  async openReview() {
    try {
      this.persistScopeRows();
      const canonical = this.canonicalSvc.build(this.cycleId);
      const updateResult = await this.cycleApi.updateCycleData(this.cycleId, canonical);
      this.cycleId = updateResult.cycleId;
      this.cycleState.setSelectedCycleId(updateResult.cycleId);
      this.dialog.open(ExcelSheetReviewDialogComponent, {
        width: '90vw',
        maxWidth: '1200px',
        data: {
          title: 'Review: 1.2 Mobile',
          sheetId: this.sheetId,
          cycleId: this.cycleId,
          cacheKey: Date.now(),
        },
      });
    } catch (error: any) {
      console.error('Review preview failed', error);
      this.snackBar.open(
        error?.message || 'ไม่สามารถโหลดตัวอย่างฟอร์มได้',
        'ปิด',
        { duration: 6000 }
      );
    }
  }

  async exportSheet() {
    this.exporting = true;
    try {
      const canonical = this.canonicalSvc.build(this.cycleId);
      const updateResult = await this.cycleApi.updateCycleData(this.cycleId, canonical);
      this.cycleId = updateResult.cycleId;
      this.cycleState.setSelectedCycleId(updateResult.cycleId);
      const download = await this.cycleApi.exportCycle(updateResult.cycleId);
      this.downloadFile(download.blob, download.filename);
      this.snackBar.open('Export สำเร็จ', 'ปิด', { duration: 4000 });
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

  itemOptions(): SheetItemOption[] {
    return getSheetItemOptions(this.sheetId, '1.2');
  }

  filteredOptions(row: EntryRow): SheetItemOption[] {
    const options = this.itemOptions();
    const query = String(row.itemName || '').trim().toLowerCase();
    if (!query) return options;
    return options.filter(option =>
      option.defaultLabel.toLowerCase().includes(query) ||
      option.fuelKey.toLowerCase().includes(query)
    );
  }

  updateFuelKey(row: EntryRow, fuelKey: FuelKey) {
    const parsed = this.parseKey(row.subCategoryCode);
    const slotNo = this.resolveSlotNo(fuelKey, parsed.slotNo, row);
    if (fuelKey === 'DIESEL_B7_OFFROAD') {
      row.subCategoryCode = fuelKey;
    } else {
      row.subCategoryCode = `${fuelKey}#${slotNo}`;
    }
    const defaultLabel = LABELS[fuelKey];
    if (!row.itemName || row.itemName === LABELS[parsed.fuelKey as FuelKey] || row.itemName === '') {
      row.itemName = defaultLabel;
    }
    const option = this.itemOptions().find(item => item.fuelKey === fuelKey);
    if (option?.unit) {
      row.unit = option.unit;
    }
    this.rowsChange.emit(this.rows);
  }

  selectItemLabel(row: EntryRow, option?: SheetItemOption) {
    if (!option) return;
    row.itemName = option.defaultLabel;
    this.updateFuelKey(row, option.fuelKey as FuelKey);
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

  private resolveSlotNo(
    fuelKey: Exclude<FuelKey, 'DIESEL_B7_OFFROAD'> | FuelKey,
    currentSlot: number | undefined,
    currentRow: EntryRow
  ): number {
    if (fuelKey === 'DIESEL_B7_OFFROAD') return 0;
    const max = MAX_SLOTS[fuelKey as Exclude<FuelKey, 'DIESEL_B7_OFFROAD'>];
    const used = new Set(
      this.rows
        .filter(r => r !== currentRow && this.parseKey(r.subCategoryCode).fuelKey === fuelKey)
        .map(r => this.parseKey(r.subCategoryCode).slotNo)
        .filter(Boolean) as number[]
    );
    if (currentSlot && currentSlot >= 1 && currentSlot <= max && !used.has(currentSlot)) {
      return currentSlot;
    }
    for (let i = 1; i <= max; i++) {
      if (!used.has(i)) return i;
    }
    return 1;
  }

  parseKey(code?: string): { fuelKey?: FuelKey; slotNo?: number } {
    const raw = String(code || '').trim();
    if (!raw) return {};
    const [k, n] = raw.split('#');
    const fuelKey = k as FuelKey;
    const slotNo = n ? Number(n) : undefined;
    return { fuelKey, slotNo: Number.isFinite(slotNo) ? slotNo : undefined };
  }

  private persistScopeRows(): void {
    const existing: DataEntryDoc = this.dataEntrySvc.load(this.cycleId) ?? {
      cycleId: this.cycleId,
      scope1: [],
      scope2: [],
      scope3: [],
    };
    const otherScope1 = (existing.scope1 ?? []).filter(r => r.categoryCode !== '1.2');
    const scope12Rows = this.rows.filter(r => r.categoryCode === '1.2');
    this.dataEntrySvc.save(this.cycleId, {
      ...existing,
      cycleId: this.cycleId,
      scope1: [...scope12Rows, ...otherScope1],
    });
  }

  private downloadFile(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
