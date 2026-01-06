import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { CycleApiService } from '../../../core/services/cycle-api.service';
import { DataEntryDoc, DataEntryService } from '../../../core/services/data-entry.service';
import { SHEET_REGISTRY } from '../../../core/sheet.registry';
import { getSheetItemOptions } from '../../../core/sheets/sheet-item.registry';
import { FUEL_BLEND_RULES, FuelBlendKey, findBlendRule, resolveBlendKey } from '../../../core/sheets/fuel-blend.registry';
import { computeStationarySummary, normalizeMonthValues } from '../../../core/sheets/stationary-compute';
import { OtherBlendDialogComponent, OtherBlendSpec } from '../../../shared/components/other-blend-dialog/other-blend-dialog.component';
import { Scope11PreviewDialogComponent } from '../../../shared/components/scope11-preview-dialog/scope11-preview-dialog.component';
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
export class Scope11StationaryComponent implements OnInit {
  @Input() cycleId = 0;
  @Input() set rows(value: EntryRow[]) {
    this._rows = value ?? [];
    this._rows.forEach(row => {
      this.normalizeRowMonths(row);
      this.ensureOtherType(row);
    });
  }
  get rows(): EntryRow[] {
    return this._rows;
  }
  @Output() rowsChange = new EventEmitter<EntryRow[]>();

  readonly months = Array.from({ length: 12 }, (_, i) => i + 1);
  headerMonths: Record<string, number | null> = this.createHeaderMonths();
  periodYear: number | null = 2566;

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
  reviewing = false;
  readonly sheetId = SHEET_REGISTRY['SCOPE1_STATIONARY'].sheetId;
  readonly monthCols = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];
  readonly scope11RowMap: Record<string, number> = {
    DIESEL_B7_STATIONARY: 9,
    GASOHOL_9195_STATIONARY: 10,
    ACETYLENE_TANK5_MAINT_2: 12,
    ACETYLENE_TANK5_MAINT_3: 14,
  };
  private _rows: EntryRow[] = [];
  readonly trackByRow = (_: number, row: EntryRow) => row.id ?? row.subCategoryCode ?? row.itemName ?? _;
  readonly trackByMonth = (_: number, month: number) => month;

  constructor(
    private dialog: MatDialog,
    private cycleApi: CycleApiService,
    private snackBar: MatSnackBar,
    private dataEntrySvc: DataEntryService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.restoreHeaderMonths();
    this.restorePeriodYear();
  }

  async openReview() {
    if (this.reviewing) return;
    this.reviewing = true;
    try {
      const validationError = this.getFirstBlendError();
      if (validationError) {
        this.snackBar.open(validationError, 'ปิด', { duration: 6000 });
        return;
      }
      const scope11Rows = this.persistScopeRows();
      const payload = this.buildScope11Payload(scope11Rows);
      const preview = await this.cycleApi.previewScope11Json(payload);
      const previewData = {
        ...preview,
        headerMonths: payload.headerMonths,
        periodYear: payload.periodYear,
      };
      this.dialog.open(Scope11PreviewDialogComponent, {
        width: '95vw',
        maxWidth: '1400px',
        height: '85vh',
        maxHeight: '90vh',
        data: previewData,
      });
    } catch (error: any) {
      console.error('Review preview failed', error);
      this.snackBar.open(
        error?.message || 'ไม่สามารถโหลดตัวอย่างฟอร์มได้',
        'ปิด',
        { duration: 6000 }
      );
    } finally {
      setTimeout(() => {
        this.reviewing = false;
        this.cdr.markForCheck();
      }, 0);
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
      const scope11Rows = this.persistScopeRows();
      const payload = this.buildScope11Payload(scope11Rows);
      const download = await this.cycleApi.exportScope11Xlsx(payload);
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
      row.remark = value === 'OTHER' ? (row.otherType ?? row.remark ?? '') : selectedLabel;
    } else {
      row.remark = value === 'OTHER' ? (row.otherType ?? row.remark ?? '') : '';
      row.subCategoryCode = this.buildCustomFuelKey(value, row.id);
    }
    row.fuelType = selectedLabel || value;
    if (value !== 'OTHER') {
      row.otherType = null;
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
    row.otherType = value;
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

  updateMonthQty(row: EntryRow, month: number, value: number | string | null) {
    const normalized = this.parseNumberOrNull(value);
    if (normalized === null) {
      row.months = row.months.filter(x => x.month !== month);
      this.rowsChange.emit(this.rows);
      return;
    }

    let m = row.months.find(x => x.month === month);
    if (!m) {
      m = { month, qty: 0 };
      row.months.push(m);
    }
    m.qty = normalized;
    this.normalizeRowMonths(row);
    this.rowsChange.emit(this.rows);
  }

  total(row: EntryRow): number {
    return this.getNormalizedMonths(row).reduce((sum: number, m) => sum + (m ?? 0), 0);
  }

  getHeaderMonthValue(month: number): number | null {
    return this.parseNumberOrNull(this.headerMonths[`M${month}`]);
  }

  updateHeaderMonth(month: number, value: number | string | null) {
    const key = `M${month}`;
    const normalized = this.parseNumberOrNull(value);
    if (normalized === null) {
      this.headerMonths[key] = null;
      this.persistHeaderMonths();
      return;
    }
    this.headerMonths[key] = normalized;
    this.persistHeaderMonths();
  }

  getPeriodYearValue(): number | null {
    return this.periodYear;
  }

  updatePeriodYear(value: number | string | null) {
    const normalized = this.normalizePeriodYear(value);
    this.periodYear = normalized;
    this.persistHeaderMonths();
  }

  headerMonthsTotal(): number | null {
    const values = Object.values(this.serializeHeaderMonths()).filter(
      v => v !== null && v !== undefined && Number.isFinite(v)
    );
    if (!values.length) return null;
    return values.reduce((sum: number, v) => sum + (v ?? 0), 0);
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

  formatFixed2(value: number | string | null | undefined): string {
    const normalized = this.parseNumberOrNull(value);
    if (normalized === null) return '';
    return normalized.toFixed(2);
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

  private persistScopeRows(): EntryRow[] {
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
      scope11HeaderMonths: this.serializeHeaderMonths(),
      scope11PeriodYear: this.periodYear,
    });
    return scope11Rows;
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

  private getNormalizedMonths(row: EntryRow): Array<number | null> {
    return normalizeMonthValues(row.months);
  }

  private buildScope11Payload(rows: EntryRow[]): {
    splitEnabled: boolean;
    periodYear: number | null;
    headerMonths: Record<string, number | null>;
    items: Array<{
      rowId: string;
      fuelKey: FuelBlendKey;
      label: string;
      evidence: string;
      unit: 'L' | 'kg';
      blendProfile: string;
      otherType?: string | null;
      months: Record<string, number | null>;
    }>;
  } {
    const items = [];
    for (const row of rows) {
      const rowId = this.getFuelKey(row) || row.id;
      if (!rowId) continue;
      const fuelKey = this.getTypeChoice(row);
      const blendProfile = this.buildBlendProfile(fuelKey);
      const months: Record<string, number | null> = {};
      for (const entry of row.months ?? []) {
        const idx = Number(entry?.month ?? 0);
        const qty = this.parseNumberOrNull(entry?.qty);
        if (idx < 1 || idx > 12) continue;
        if (qty === null) continue;
        months[`M${idx}`] = qty;
      }
      items.push({
        rowId,
        fuelKey,
        label: String(row.itemName || this.defaultLabelFor(rowId) || '').trim(),
        evidence: String(row.referenceText || '').trim(),
        unit: this.normalizeUnit(row.unit),
        blendProfile,
        otherType: fuelKey === 'OTHER' ? (String(row.otherType || '').trim() || null) : null,
        months,
      });
    }

    return {
      splitEnabled: this.shouldEnableSplit(items),
      periodYear: this.periodYear,
      headerMonths: this.serializeHeaderMonths(),
      items,
    };
  }

  private normalizeUnit(unit?: string): 'L' | 'kg' {
    const raw = String(unit || '').trim().toLowerCase();
    return raw === 'kg' ? 'kg' : 'L';
  }

  private buildBlendProfile(key: FuelBlendKey): string {
    const map: Record<FuelBlendKey, string> = {
      B7: 'B7',
      B10: 'B10',
      '91/95': 'GASOHOL_91_95',
      E20: 'GASOHOL_E20',
      LPG: 'NONE',
      FUEL_OIL: 'NONE',
      OTHER: 'NONE',
    };
    return map[key] ?? 'NONE';
  }

  private shouldEnableSplit(items: Array<{ unit: 'L' | 'kg'; months: Record<string, number | null> }>): boolean {
    return items.some(item => item.unit === 'L' && Object.keys(item.months || {}).length > 0);
  }

  private normalizeRowMonths(row: EntryRow): void {
    const cleaned = [];
    for (const entry of row.months ?? []) {
      const month = Number(entry?.month ?? 0);
      const qty = this.parseNumberOrNull(entry?.qty);
      if (!Number.isFinite(month) || month < 1 || month > 12) continue;
      if (qty === null) continue;
      cleaned.push({ month, qty });
    }
    row.months = cleaned;
  }

  private ensureOtherType(row: EntryRow): void {
    if (row.otherType) return;
    if (this.getTypeChoice(row) !== 'OTHER') return;
    const remark = String(row.remark ?? '').trim();
    if (remark) {
      row.otherType = remark;
    }
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
    return null;
  }
  private isRowEmpty(row: EntryRow): boolean {
    const hasMonths = this.getNormalizedMonths(row).some(qty => qty !== null);
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

  private createHeaderMonths(): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    for (const m of this.months) {
      out[`M${m}`] = null;
    }
    return out;
  }

  private serializeHeaderMonths(): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    for (const m of this.months) {
      const key = `M${m}`;
      out[key] = this.parseNumberOrNull(this.headerMonths[key]);
    }
    return out;
  }

  private restoreHeaderMonths(): void {
    const saved = (this.dataEntrySvc.load(this.cycleId) as any)?.scope11HeaderMonths;
    if (!saved) return;
    const restored: Record<string, number | null> = {};
    for (const m of this.months) {
      const key = `M${m}`;
      restored[key] = this.parseNumberOrNull(saved?.[key]);
    }
    this.headerMonths = restored;
  }

  private restorePeriodYear(): void {
    const saved = (this.dataEntrySvc.load(this.cycleId) as any)?.scope11PeriodYear;
    this.periodYear = this.normalizePeriodYear(saved) ?? this.periodYear;
  }

  private parseNumberOrNull(value: any): number | null {
    if (value == null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }

  private normalizePeriodYear(value: any): number | null {
    const normalized = this.parseNumberOrNull(value);
    if (normalized === null) return null;
    return Math.trunc(normalized);
  }

  private persistHeaderMonths(): void {
    const existing = this.dataEntrySvc.load(this.cycleId) ?? {
      cycleId: this.cycleId,
      scope1: [],
      scope2: [],
      scope3: [],
    };
    this.dataEntrySvc.save(this.cycleId, {
      ...existing,
      cycleId: this.cycleId,
      scope11HeaderMonths: this.serializeHeaderMonths(),
      scope11PeriodYear: this.periodYear,
    });
  }
}
