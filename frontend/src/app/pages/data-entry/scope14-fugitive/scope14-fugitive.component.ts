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
import { CycleStateService } from '../../../core/services/cycle-state.service';
import { SHEET_REGISTRY } from '../../../core/sheet.registry';
import { ExcelSheetReviewDialogComponent } from '../../../shared/components/excel-sheet-review-dialog/excel-sheet-review-dialog.component';
import { createEmptyMonths } from '../../../models/entry-row.helpers';
import { EntryRow } from '../../../models/entry-row.model';

@Component({
  selector: 'app-scope14-fugitive',
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
  templateUrl: './scope14-fugitive.component.html',
  styleUrls: ['./scope14-fugitive.component.scss'],
})
export class Scope14FugitiveComponent {
  @Input() cycleId = 0;
  @Input() rows: EntryRow[] = [];
  @Output() rowsChange = new EventEmitter<EntryRow[]>();

  readonly months = Array.from({ length: 12 }, (_, i) => i + 1);

  exporting = false;
  readonly sheetId = SHEET_REGISTRY['SCOPE1_FUGITIVE'].sheetId;

  constructor(
    private dialog: MatDialog,
    private canonicalSvc: CanonicalGhgService,
    private cycleApi: CycleApiService,
    private cycleState: CycleStateService,
    private snackBar: MatSnackBar,
  ) {}

  openReview() {
    this.dialog.open(ExcelSheetReviewDialogComponent, {
      width: '90vw',
      maxWidth: '1200px',
      data: {
        title: 'Review: 1.4 Fugitive Emission',
        sheetId: this.sheetId,
        cycleId: this.cycleId,
      },
    });
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

  getMonthQty(code: string, month: number): number | null {
    const row = this.getRow(code);
    if (!row) return null;
    const m = row.months.find(x => Number(x?.month) === month);
    return m && Number.isFinite(Number(m.qty)) ? Number(m.qty) : null;
  }

  updateMonthQty(code: string, month: number, value: number | string) {
    const row = this.ensureRow(code);
    if (!row) return;
    const normalized = this.parseNumberOrNull(value);
    const existing = Array.isArray(row.months) ? row.months : [];
    const otherMonths = existing.filter(x => Number(x?.month) !== month);
    row.months = normalized === null
      ? otherMonths
      : [...otherMonths, { month, qty: normalized }].sort((a, b) => a.month - b.month);
    this.rowsChange.emit(this.rows);
  }

  totalForCode(code: string): number | null {
    const row = this.getRow(code);
    if (!row) return null;

    const values = (row.months ?? [])
      .map(m => this.parseNumberOrNull(m?.qty))
      .filter((v): v is number => v !== null);
    if (!values.length) return null;
    return values.reduce((sum, v) => sum + v, 0);
  }

  monthlyForCode(code: string): Array<number | null> {
    const row = this.getRow(code);
    return this.toMonthlyArray(row);
  }

  formatNumber(value: number | null, zeroAsDash = false, decimals = 2): string {
    if (!Number.isFinite(Number(value))) return '';
    if (zeroAsDash && Number(value) === 0) return '-';
    return Number(value).toLocaleString('en-US', {
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

  private toMonthlyArray(row?: EntryRow): Array<number | null> {
    const out: Array<number | null> = Array.from({ length: 12 }, () => null);
    for (const m of row?.months ?? []) {
      const idx = Number(m.month) - 1;
      if (idx >= 0 && idx < 12) out[idx] = this.parseNumberOrNull(m.qty);
    }
    return out;
  }

  private parseNumberOrNull(raw: any): number | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const s = String(raw).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
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
