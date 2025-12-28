import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { CanonicalGhgService } from '../../../core/services/canonical-ghg.service';
import { CycleApiService } from '../../../core/services/cycle-api.service';
import { CycleStateService } from '../../../core/services/cycle-state.service';
import { DataEntryDoc, DataEntryService } from '../../../core/services/data-entry.service';
import { SHEET_REGISTRY } from '../../../core/sheet.registry';
import { getSheetItemOptions } from '../../../core/sheets/sheet-item.registry';
import { FUEL_BLEND_RULES, FuelBlendKey, findBlendRule, resolveBlendKey } from '../../../core/sheets/fuel-blend.registry';
import { computeStationarySummary, normalizeMonthValues } from '../../../core/sheets/stationary-compute';
import { ExcelSheetReviewDialogComponent } from '../../../shared/components/excel-sheet-review-dialog/excel-sheet-review-dialog.component';
import { OtherBlendDialogComponent, OtherBlendSpec } from '../../../shared/components/other-blend-dialog/other-blend-dialog.component';
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
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  templateUrl: './scope11-stationary.component.html',
  styleUrls: ['./scope11-stationary.component.scss'],
})
export class Scope11StationaryComponent {
  @Input() cycleId = 0;
  @Input() set rows(value: EntryRow[]) {
    this._rows = value ?? [];
    this._rows.forEach(row => this.normalizeRowMonths(row));
  }
  get rows(): EntryRow[] {
    return this._rows;
  }
  @Output() rowsChange = new EventEmitter<EntryRow[]>();

  readonly months = Array.from({ length: 12 }, (_, i) => i + 1);

  readonly typeOptions = FUEL_BLEND_RULES;
  readonly evidenceOptions = [
    'ใบกำกับภาษี',
    'บิลเงินสด/ใบกำกับภาษี',
    'ใบสั่งซื้อ',
    'Fleet card/ใบเสร็จรับเงิน',
    'ใบแจ้งหนี้',
    'การประมาณการ',
    'Other',
  ];
  readonly unitOptions = ['L', 'kg', 'ถัง', 'm3', 'kWh', 'people', 'days', 'Other'];

  exporting = false;
  readonly sheetId = SHEET_REGISTRY['SCOPE1_STATIONARY'].sheetId;
  private _rows: EntryRow[] = [];

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
      const validationError = this.getFirstBlendError();
      if (validationError) {
        this.snackBar.open(validationError, 'ปิด', { duration: 6000 });
        return;
      }
      this.persistScopeRows();
      const canonical = this.canonicalSvc.buildScope11StationaryExport(this.cycleId);
      const updateResult = await this.cycleApi.updateCycleData(this.cycleId, canonical);
      this.cycleId = updateResult.cycleId;
      this.cycleState.setSelectedCycleId(updateResult.cycleId);
      this.dialog.open(ExcelSheetReviewDialogComponent, {
        width: '90vw',
        maxWidth: '1200px',
        data: {
          title: 'Review: 1.1 Stationary',
          sheetId: this.sheetId,
          cycleId: this.cycleId,
          cacheKey: updateResult.previewVersion ?? Date.now(),
          skipSave: true,
          hideBlankRows: true,
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
      const validationError = this.getFirstBlendError();
      if (validationError) {
        this.snackBar.open(validationError, 'ปิด', { duration: 6000 });
        return;
      }
      const canonical = this.canonicalSvc.buildScope11StationaryExport(this.cycleId);
      const updateResult = await this.cycleApi.updateCycleData(this.cycleId, canonical);
      this.cycleId = updateResult.cycleId;
      this.cycleState.setSelectedCycleId(updateResult.cycleId);
      const download = await this.cycleApi.exportCycle(updateResult.cycleId);
      this.downloadFile(download.blob, download.filename);
      this.snackBar.open('Export 1.1 Stationary สำเร็จ', 'ปิด', { duration: 4000 });
    } catch (error: any) {
      console.error('Export sheet failed', error);
      alert('Export ล้มเหลว กรุณาลองใหม่อีกครั้ง');
      this.snackBar.open(error?.message || 'เกิดข้อผิดพลาดในการ Export', 'ปิด', { duration: 6000 });
    } finally {
      this.exporting = false;
    }
  }

  get rowsView(): EntryRow[] {
    return this.rows;
  }

  addRow() {
    const row: EntryRow = {
      id: this.buildRowId(),
      cycleId: String(this.cycleId),
      scope: 'S1',
      categoryCode: '1.1',
      subCategoryCode: this.buildCustomFuelKey('OTHER'),
      itemName: '',
      unit: 'L',
      months: createEmptyMonths(),
      dataSourceType: 'ORG',
    };
    this.rows = [...this.rows, row];
    this.rowsChange.emit(this.rows);
  }

  removeRow(row: EntryRow) {
    if (this.isDefaultRow(row)) return;
    this.rows = this.rows.filter(r => r !== row);
    this.rowsChange.emit(this.rows);
  }

  isDefaultRow(row: EntryRow): boolean {
    const defaults = getSheetItemOptions(this.sheetId, '1.1').map(opt => opt.fuelKey);
    return defaults.includes(this.getFuelKey(row));
  }

  getEvidenceChoice(row: EntryRow): string {
    const text = String(row.referenceText || '').trim();
    return this.evidenceOptions.includes(text) ? text : 'Other';
  }

  updateEvidenceChoice(row: EntryRow, value: string) {
    if (value === 'Other') {
      row.referenceText = row.referenceText && !this.evidenceOptions.includes(row.referenceText)
        ? row.referenceText
        : '';
    } else {
      row.referenceText = value;
    }
    this.rowsChange.emit(this.rows);
  }

  updateEvidenceText(row: EntryRow, value: string) {
    row.referenceText = value;
    this.rowsChange.emit(this.rows);
  }

  getTypeChoice(row: EntryRow): FuelBlendKey {
    return resolveBlendKey(this.getFuelKey(row), row.remark);
  }

  updateTypeChoice(row: EntryRow, value: FuelBlendKey) {
    const selectedLabel = this.typeOptions.find(opt => opt.key === value)?.label ?? '';
    if (this.isDefaultRow(row)) {
      row.remark = value === 'OTHER' ? '' : selectedLabel;
    } else {
      row.remark = value === 'OTHER' ? row.remark : '';
      row.subCategoryCode = this.buildCustomFuelKey(value, row.id);
    }
    row.fuelType = selectedLabel || value;
    if (value !== 'OTHER') {
      row.blendSpec = undefined;
      row.blend = undefined;
    }
    this.rowsChange.emit(this.rows);
  }

  openBlendDialog(row: EntryRow) {
    const ref = this.dialog.open(OtherBlendDialogComponent, {
      width: '520px',
      data: {
        blendSpec: row.blendSpec ?? undefined,
      },
    });

    ref.afterClosed().subscribe((result?: OtherBlendSpec) => {
      if (!result) return;
      row.blendSpec = result;
      row.blend = {
        dieselPct: result.dieselPct,
        biodieselPct: result.biodieselPct,
        gasolinePct: result.gasolinePct,
        ethanolPct: result.ethanolPct,
        biodieselDensityKgPerL: result.density?.biodieselKgPerL,
        ethanolDensityKgPerL: result.density?.ethanolKgPerL,
      };
      this.rowsChange.emit(this.rows);
    });
  }

  blendBadge(row: EntryRow): string {
    if (!row.blendSpec) return '';
    const pct = row.blendSpec;
    const parts = [
      `D${pct.dieselPct ?? 0}`,
      `BD${pct.biodieselPct ?? 0}`,
      `G${pct.gasolinePct ?? 0}`,
      `E${pct.ethanolPct ?? 0}`,
    ];
    return parts.join('/');
  }

  updateTypeText(row: EntryRow, value: string) {
    row.remark = value;
    this.rowsChange.emit(this.rows);
  }

  updateItemName(row: EntryRow, value: string) {
    row.itemName = value;
    this.rowsChange.emit(this.rows);
  }

  updateUnit(row: EntryRow, value: string) {
    if (value === 'Other') {
      row.unit = row.unit && !this.unitOptions.includes(row.unit) ? row.unit : '';
    } else {
      row.unit = value;
    }
    this.rowsChange.emit(this.rows);
  }

  getUnitChoice(row: EntryRow): string {
    return this.unitOptions.includes(row.unit) ? row.unit : 'Other';
  }

  updateUnitText(row: EntryRow, value: string) {
    row.unit = value;
    this.rowsChange.emit(this.rows);
  }

  updateKgPerUnit(row: EntryRow, value: number | string) {
    const kgPerUnit = Number(value);
    row.unitConversion = {
      ...(row.unitConversion ?? {}),
      kgPerUnit: Number.isFinite(kgPerUnit) ? kgPerUnit : undefined,
    };
    this.rowsChange.emit(this.rows);
  }

  getMonthQty(row: EntryRow, month: number): number {
    return this.getNormalizedMonths(row)[month - 1] ?? 0;
  }

  updateMonthQty(row: EntryRow, month: number, value: number) {
    let m = row.months.find(x => x.month === month);
    if (!m) {
      m = { month, qty: 0 };
      row.months.push(m);
    }
    m.qty = Number(value) || 0;
    this.normalizeRowMonths(row);
    this.rowsChange.emit(this.rows);
  }

  total(row: EntryRow): number {
    return this.getNormalizedMonths(row).reduce((sum, m) => sum + m, 0);
  }

  acetyleneKgTotal(row: EntryRow): number {
    const kgPerUnit = this.getKgPerUnit(row);
    if (!kgPerUnit) return 0;
    return this.total(row) * kgPerUnit;
  }

  isAcetyleneRow(row: EntryRow): boolean {
    const key = this.getFuelKey(row);
    if (key.startsWith('ACETYLENE_TANK5')) return true;
    const label = String(row.itemName || '').toLowerCase();
    return label.includes('acetylene') && label.includes('5');
  }

  getKgPerUnit(row: EntryRow): number | null {
    if (row.unitConversion?.kgPerUnit) return row.unitConversion.kgPerUnit;
    if (this.isAcetyleneRow(row)) return 5;
    return null;
  }

  formatNumber(value: number, zeroAsDash = false, decimals = 2): string {
    if (zeroAsDash && value === 0) return '-';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  get blendRows() {
    const summary = computeStationarySummary(this.rowsView);
    return summary.rows
      .filter(item => String(item.row.unit || '').toLowerCase() === 'l')
      .map(item => ({
        row: item.row,
        rule: findBlendRule(resolveBlendKey(this.getFuelKey(item.row), item.row.fuelType ?? item.row.remark)),
        annualL: item.totalL,
        dieselL: item.dieselL,
        biodieselL: item.biodieselL,
        biodieselKg: item.biodieselKg,
        gasolineL: item.gasolineL,
        ethanolL: item.ethanolL,
        ethanolKg: item.ethanolKg,
      }));
  }

  totalBiodieselKg(): number {
    return computeStationarySummary(this.rowsView).totalBiodieselKg;
  }

  totalEthanolKg(): number {
    return computeStationarySummary(this.rowsView).totalEthanolKg;
  }

  hasOtherBlendErrors(): boolean {
    return this.rows.some(row => Boolean(this.getOtherBlendError(row)));
  }

  private getFuelKey(row: EntryRow): string {
    return String(row.subCategoryCode || '').trim();
  }

  private buildRowId(): string {
    return `S11_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private buildCustomFuelKey(key: FuelBlendKey, seed?: string): string {
    const suffix = (seed || this.buildRowId()).replace(/[^a-z0-9]/gi, '').slice(-6);
    return `CUSTOM_${key}_${suffix}`.toUpperCase();
  }

  private persistScopeRows(): void {
    const existing: DataEntryDoc = this.dataEntrySvc.load(this.cycleId) ?? {
      cycleId: this.cycleId,
      scope1: [],
      scope2: [],
      scope3: [],
    };
    const otherScope1 = (existing.scope1 ?? []).filter(r => r.categoryCode !== '1.1');
    const scope11Rows = this.rows
      .filter(r => r.categoryCode === '1.1')
      .filter(r => !this.isRowEmpty(r))
      .map(row => {
        this.normalizeRowMonths(row);
        return this.applyComputedFields(row);
      });
    this.dataEntrySvc.save(this.cycleId, {
      ...existing,
      cycleId: this.cycleId,
      scope1: [...scope11Rows, ...otherScope1],
    });
  }

  private applyComputedFields(row: EntryRow): EntryRow {
    const summary = computeStationarySummary([row]);
    const computedRow = summary.rows[0];
    if (computedRow) {
      row.computed = {
        totalL: computedRow.totalL,
        dieselL: computedRow.dieselL,
        biodieselL: computedRow.biodieselL,
        biodieselKg: computedRow.biodieselKg,
        gasolineL: computedRow.gasolineL,
        ethanolL: computedRow.ethanolL,
        ethanolKg: computedRow.ethanolKg,
      };
    } else {
      row.computed = undefined;
    }
    return row;
  }

  private getNormalizedMonths(row: EntryRow): number[] {
    return normalizeMonthValues(row.months);
  }

  private normalizeRowMonths(row: EntryRow): void {
    const normalized = normalizeMonthValues(row.months);
    row.months = normalized.map((qty, idx) => ({
      month: idx + 1,
      qty,
    }));
  }

  private getFirstBlendError(): string | null {
    for (const row of this.rows) {
      const error = this.getOtherBlendError(row);
      if (error) {
        const label = String(row.itemName || row.remark || 'รายการนี้');
        return `${label}: ${error}`;
      }
    }
    return null;
  }

  getOtherBlendError(row: EntryRow): string | null {
    if (resolveBlendKey(this.getFuelKey(row), row.fuelType ?? row.remark) !== 'OTHER') {
      return null;
    }
    const spec = row.blendSpec;
    if (!spec) return 'ต้องกำหนดสัดส่วนเชื้อเพลิง (Blend)';
    const sum =
      Number(spec.dieselPct || 0)
      + Number(spec.biodieselPct || 0)
      + Number(spec.gasolinePct || 0)
      + Number(spec.ethanolPct || 0);
    if (Math.abs(sum - 100) > 0.01) return 'สัดส่วนต้องรวม 100%';
    const biodiesel = spec.density?.biodieselKgPerL;
    const ethanol = spec.density?.ethanolKgPerL;
    if (!biodiesel || biodiesel <= 0 || !ethanol || ethanol <= 0) {
      return 'กรุณาระบุความหนาแน่นของ Biodiesel/Ethanol';
    }
    return null;
  }
  private isRowEmpty(row: EntryRow): boolean {
    const hasMonths = this.getNormalizedMonths(row).some(qty => qty !== 0);
    const hasEvidence = Boolean(String(row.referenceText || '').trim());
    const label = String(row.itemName || '').trim();
    const defaultLabel = this.defaultLabelFor(this.getFuelKey(row));
    const hasCustomLabel = label !== '' && label !== defaultLabel;
    return !hasMonths && !hasEvidence && !hasCustomLabel;
  }

  private defaultLabelFor(code: string): string {
    const options = getSheetItemOptions(this.sheetId, '1.1');
    return options.find(option => option.fuelKey === code)?.defaultLabel ?? '';
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
