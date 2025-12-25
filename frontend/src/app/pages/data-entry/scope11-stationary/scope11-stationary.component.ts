import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { ExcelExportEngine } from '../../../core/export/engine/excel-export.engine';
import { resolveTemplate } from '../../../core/export/registry/template-registry';
import { CanonicalGhgService } from '../../../core/services/canonical-ghg.service';
import { ExcelSheetReviewDialogComponent } from '../../../shared/components/excel-sheet-review-dialog/excel-sheet-review-dialog.component';
import { EntryRow } from '../../../models/entry-row.model';
import { createEmptyMonths } from '../../../models/entry-row.helpers';

@Component({
  selector: 'app-scope11-stationary',
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
  templateUrl: './scope11-stationary.component.html',
  styleUrls: ['./scope11-stationary.component.scss'],
})
export class Scope11StationaryComponent {
  @Input() cycleId = 0;
  @Input() rows: EntryRow[] = [];
  @Output() rowsChange = new EventEmitter<EntryRow[]>();

  readonly months = Array.from({ length: 12 }, (_, i) => i + 1);

  readonly dieselCode = 'DIESEL_B7_STATIONARY';
  readonly gasoholCode = 'GASOHOL_9195_STATIONARY';
  readonly acetyleneMaint2Code = 'ACETYLENE_TANK5_MAINT_2';
  readonly acetyleneMaint3Code = 'ACETYLENE_TANK5_MAINT_3';

  exporting = false;
  readonly templateKey = 'MBAX_TGO_11102567::demo';
  readonly sheetName = '1.1 Stationary ';

  constructor(
    private dialog: MatDialog,
    private exportEngine: ExcelExportEngine,
    private canonicalSvc: CanonicalGhgService,
    private snackBar: MatSnackBar,
  ) {}

  openReview() {
    this.dialog.open(ExcelSheetReviewDialogComponent, {
      width: '90vw',
      maxWidth: '1200px',
      data: {
        title: 'Review: 1.1 Stationary',
        sheetName: this.sheetName,
        templateKey: this.templateKey,
        cycleId: this.cycleId,
        // Keep the preview lightweight; the full template has formatting down to 1000+ rows.
        range: 'A1:P60',
      },
    });
  }

  async exportSheet() {
    this.exporting = true;
    try {
      const canonical = this.canonicalSvc.buildScope11StationaryExport(this.cycleId);
      const bundle = resolveTemplate(this.templateKey);
      const outputName = `MBAX_1.1_Stationary_cycle-${this.cycleId}.xlsx`;

      await this.exportEngine.exportScope11StationaryFromUrl({
        templateUrl: bundle.templateUrl,
        templateSpec: bundle.spec,
        adapter: bundle.adapter,
        canonical,
        outputName,
        sheetName: this.sheetName,
      });

      this.snackBar.open('Export 1.1 Stationary สำเร็จ', 'ปิด', { duration: 4000 });
    } catch (error: any) {
      console.error('Export sheet failed', error);
      alert('Export ล้มเหลว กรุณาลองใหม่อีกครั้ง');
      this.snackBar.open(error?.message || 'เกิดข้อผิดพลาดในการ Export', 'ปิด', { duration: 6000 });
    } finally {
      this.exporting = false;
    }
  }

  getEvidence(code: string): string {
    return this.getRow(code)?.referenceText ?? '';
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

  updateMonthQty(code: string, month: number, value: number) {
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

  acetyleneTotalKgMonths(): number[] {
    return this.monthlyForCode(this.acetyleneMaint2Code).map((v, idx) =>
      v * 5 + this.monthlyForCode(this.acetyleneMaint3Code)[idx] * 5
    );
  }

  acetyleneMaint2KgMonths(): number[] {
    return this.monthlyForCode(this.acetyleneMaint2Code).map(v => v * 5);
  }

  acetyleneMaint3KgMonths(): number[] {
    return this.monthlyForCode(this.acetyleneMaint3Code).map(v => v * 5);
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

  get acetyleneSummaryEvidence(): string {
    const list = [
      this.getEvidence(this.acetyleneMaint2Code),
      this.getEvidence(this.acetyleneMaint3Code),
    ].filter(Boolean);
    return list.join(', ');
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
      categoryCode: '1.1',
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

  private monthlyForCode(code: string): number[] {
    const row = this.getRow(code);
    const out = Array.from({ length: 12 }, () => 0);
    for (const m of row?.months ?? []) {
      const idx = Number(m.month) - 1;
      if (idx >= 0 && idx < 12) out[idx] = Number(m.qty || 0);
    }
    return out;
  }
}
