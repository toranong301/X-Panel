import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';

import { EntryRow } from '../../../models/entry-row.model';
import { resolveBlendKey } from '../../../core/sheets/fuel-blend.registry';
import { DataEntryDoc, DataEntryService } from '../../../core/services/data-entry.service';
import { CycleApiService } from '../../../core/services/cycle-api.service';
import { Scope11PreviewDialogComponent } from '../../../shared/components/scope11-preview-dialog/scope11-preview-dialog.component';

type FuelKey = 'B7' | 'B10' | '91/95' | 'E20' | 'LPG' | 'FUEL_OIL' | 'OTHER';
const FUEL_KEYS: FuelKey[] = ['B7', 'B10', '91/95', 'E20', 'LPG', 'FUEL_OIL', 'OTHER'];

function isFuelKey(value: string): value is FuelKey {
  return FUEL_KEYS.includes(value as FuelKey);
}

type EvidenceType = 'invoice' | 'cash_invoice' | 'po' | 'other';
const EVIDENCE_OPTIONS: Array<{ value: EvidenceType; label: string }> = [
  { value: 'invoice', label: 'ใบกำกับภาษี' },
  { value: 'cash_invoice', label: 'บิลเงินสด/ใบกำกับภาษี' },
  { value: 'po', label: 'ใบสั่งซื้อ' },
  { value: 'other', label: 'อื่นๆ' },
];

@Component({
  selector: 'app-scope11-stationary',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
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

  readonly unitOptions: Array<'L' | 'kg'> = ['L', 'kg'];
  readonly evidenceOptions = EVIDENCE_OPTIONS;
  private newRowSeq = 0;

  constructor(
    private dialog: MatDialog,
    private cycleApi: CycleApiService,
    private snackBar: MatSnackBar,
    private dataEntrySvc: DataEntryService,
    private cdr: ChangeDetectorRef,
  ) {}

  addRow(): void {
    const rowId = this.nextCustomRowId();
    const row: EntryRow = {
      cycleId: String(this.cycleId),
      scope: 'S1',
      categoryCode: '1.1',
      subCategoryCode: rowId,
      itemName: '',
      unit: 'L',
      months: [],
      dataSourceType: 'ORG',
      otherType: null,
      blendSpec: { dieselPct: 100, biodieselPct: 0, gasolinePct: 0, ethanolPct: 0 },
    };

    this.rows = [...this.rows, row];
    this.rowsChange.emit(this.rows);
  }

  removeRow(row: EntryRow): void {
    this.rows = this.rows.filter(r => r !== row);
    this.rowsChange.emit(this.rows);
  }

  trackRow(_index: number, row: EntryRow): string {
    return String(row.subCategoryCode ?? row.id ?? _index);
  }

  setField(row: EntryRow, patch: Partial<EntryRow>): void {
    Object.assign(row, patch);
    this.rowsChange.emit(this.rows);
  }

  getMonthQty(row: EntryRow, month: number): number | null {
    const m = row.months?.find(x => Number(x?.month) === month);
    return m && Number.isFinite(Number(m.qty)) ? Number(m.qty) : null;
  }

  setMonthQty(row: EntryRow, month: number, raw: any): void {
    const normalized = this.parseNumberOrNull(raw);
    const existing = Array.isArray(row.months) ? row.months : [];
    const otherMonths = existing.filter(x => Number(x?.month) !== month);
    row.months = normalized === null
      ? otherMonths
      : [...otherMonths, { month, qty: normalized }].sort((a, b) => a.month - b.month);
    this.rowsChange.emit(this.rows);
  }

  total(row: EntryRow): number | null {
    const values = (row.months ?? [])
      .map(m => this.parseNumberOrNull(m?.qty))
      .filter((v): v is number => v !== null);
    if (!values.length) return null;
    return values.reduce((sum, v) => sum + v, 0);
  }

  evidenceTypeFor(row: EntryRow): EvidenceType {
    const ref = String(row.referenceText ?? '').trim();
    if (!ref) return 'invoice';
    const byLabel = EVIDENCE_OPTIONS.find(opt => opt.value !== 'other' && opt.label === ref);
    if (byLabel) return byLabel.value;
    return 'other';
  }

  setEvidenceType(row: EntryRow, value: EvidenceType): void {
    if (value === 'other') {
      if (this.evidenceTypeFor(row) !== 'other') row.referenceText = '';
      this.rowsChange.emit(this.rows);
      return;
    }
    const opt = EVIDENCE_OPTIONS.find(x => x.value === value);
    row.referenceText = opt?.label ?? '';
    this.rowsChange.emit(this.rows);
  }

  updateTypeText(row: EntryRow, value: string): void {
    row.otherType = String(value ?? '').trim() || null;
    this.rowsChange.emit(this.rows);
  }

  updateBlendSpecPct(row: EntryRow, field: 'dieselPct' | 'biodieselPct' | 'gasolinePct' | 'ethanolPct', raw: any): void {
    if (!row.blendSpec) row.blendSpec = {};
    const normalized = this.parseNumberOrNull(raw);
    (row.blendSpec as any)[field] = normalized === null ? undefined : normalized;
    this.rowsChange.emit(this.rows);
  }

  isOtherRow(row: EntryRow): boolean {
    const key = String(resolveBlendKey(row.subCategoryCode, row.fuelType ?? row.remark)).trim();
    return key === 'OTHER';
  }

  getOtherBlendError(row: EntryRow): string | null {
    if (!this.isOtherRow(row)) return null;
    if (this.normalizeScope11Unit(row.unit) !== 'L') return null;
    const hasQty = (row.months ?? []).some(m => this.parseNumberOrNull(m?.qty) !== null);
    if (!hasQty) return null;

    const spec = row.blendSpec ?? {};
    const diesel = this.parseNumberOrNull(spec?.dieselPct) ?? 100;
    const biodiesel = this.parseNumberOrNull(spec?.biodieselPct) ?? 0;
    const gasoline = this.parseNumberOrNull(spec?.gasolinePct) ?? 0;
    const ethanol = this.parseNumberOrNull(spec?.ethanolPct) ?? 0;

    const values = [diesel, biodiesel, gasoline, ethanol];
    if (values.some(v => !Number.isFinite(v))) return 'Blend percent must be a number';
    if (values.some(v => v < 0 || v > 100)) return 'Blend percent must be 0..100';

    const sum = diesel + biodiesel + gasoline + ethanol;
    if (Math.abs(sum - 100) > 1e-6) return 'Blend percent must sum to 100';
    return null;
  }

  hasOtherBlendErrors(): boolean {
    return (this.rows ?? []).some(r => this.getOtherBlendError(r) !== null);
  }

  async openReview(): Promise<void> {
    if (!Number.isFinite(this.cycleId) || this.cycleId <= 0) {
      this.snackBar.open('Missing cycleId', 'ปิด', { duration: 4000 });
      return;
    }
    if (this.hasOtherBlendErrors()) {
      this.snackBar.open('กรุณาแก้ Blend % ให้ครบ 100% ก่อน Review', 'ปิด', { duration: 6000 });
      return;
    }

    try {
      this.persistScopeRows();
      const payload = this.buildPreviewPayload();
      const preview = await this.cycleApi.previewScope11Json(payload);

      this.dialog.open(Scope11PreviewDialogComponent, {
        width: '95vw',
        maxWidth: '1400px',
        data: {
          ok: preview?.ok ?? false,
          periodYear: preview?.periodYear ?? null,
          headerMonths: preview?.headerMonths ?? null,
          itemsPreview: preview?.itemsPreview ?? [],
          splitRows: preview?.splitRows ?? [],
          unknown_rowIds: preview?.unknown_rowIds ?? [],
          missing_fields: (preview as any)?.missing_fields ?? [],
        },
      });
    } catch (error: any) {
      console.error('Scope 1.1 preview failed', error);
      this.snackBar.open(error?.message || 'ไม่สามารถโหลดตัวอย่างฟอร์มได้', 'ปิด', { duration: 6000 });
    } finally {
      this.cdr.markForCheck();
    }
  }

  private nextCustomRowId(): string {
    const used = new Set((this.rows ?? []).map(r => String(r.subCategoryCode ?? '').trim()).filter(Boolean));
    this.newRowSeq += 1;
    const base = `CUSTOM_${Date.now()}_${this.newRowSeq}`;
    if (!used.has(base)) return base;
    for (let i = 1; i <= 999; i++) {
      const key = `CUSTOM_${Date.now()}_${this.newRowSeq}_${i}`;
      if (!used.has(key)) return key;
    }
    return `CUSTOM_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  private persistScopeRows(): void {
    const existing: DataEntryDoc = this.dataEntrySvc.load(this.cycleId) ?? {
      cycleId: this.cycleId,
      scope1: [],
      scope2: [],
      scope3: [],
    };
    const otherScope1 = (existing.scope1 ?? []).filter(r => r.categoryCode !== '1.1');
    const scope11Rows = (this.rows ?? []).filter(r => r.categoryCode === '1.1');
    this.dataEntrySvc.save(this.cycleId, {
      ...existing,
      cycleId: this.cycleId,
      scope1: [...scope11Rows, ...otherScope1],
    });
  }

  private buildPreviewPayload(): Record<string, any> {
    const entryDoc = this.dataEntrySvc.load(this.cycleId) as any;
    const templateId = this.normalizeTemplateId(undefined, entryDoc?.templateId);
    const headerMonths = entryDoc?.scope11HeaderMonths;
    const rawPeriodYear = entryDoc?.scope11PeriodYear;
    const periodYear = Number.isFinite(Number(rawPeriodYear)) ? Number(rawPeriodYear) : 2566;

    const items = (this.rows ?? [])
      .filter(r => r.categoryCode === '1.1')
      .filter(r => !this.isDerivedScope11FuelKey(r.subCategoryCode))
      .map(row => {
        const rowId = String(row.subCategoryCode || row.id || '').trim();
        if (!rowId) return null;

        const months: Record<string, number | null> = {};
        for (const entry of row.months ?? []) {
          const idx = Number(entry?.month ?? 0);
          if (idx < 1 || idx > 12) continue;
          const qty = this.parseNumberOrNull(entry?.qty);
          if (qty === null) continue;
          months[`M${idx}`] = qty;
        }

        const fuelKey = String(resolveBlendKey(row.subCategoryCode, row.fuelType ?? row.remark)).trim();
        const normalizedFuelKey = isFuelKey(fuelKey) ? fuelKey : 'OTHER';
        return {
          rowId,
          fuelKey: normalizedFuelKey,
          label: String(row.itemName || '').trim(),
          evidence: String(row.referenceText || '').trim(),
          unit: this.normalizeScope11Unit(row.unit),
          otherType: normalizedFuelKey === 'OTHER' ? (String(row.otherType || '').trim() || null) : null,
          months,
          blendSpec: row.blendSpec ?? null,
        };
      })
      .filter((x): x is any => Boolean(x));

    const splitEnabled = items.some(
      item => item.unit === 'L' && Object.keys(item.months || {}).length > 0
    );

    return {
      templateId,
      periodYear,
      headerMonths,
      splitEnabled,
      items,
    };
  }

  private isDerivedScope11FuelKey(code?: string): boolean {
    const raw = String(code || '').trim().toUpperCase();
    return raw === 'BIODIESEL_STATIONARY' || raw === 'ETHANOL_STATIONARY';
  }

  private normalizeScope11Unit(unit?: string): 'L' | 'kg' {
    const raw = String(unit || '').trim().toLowerCase();
    return raw === 'kg' ? 'kg' : 'L';
  }

  private parseNumberOrNull(value: any): number | null {
    if (value == null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }

  private normalizeTemplateId(templateKey?: string, fallback?: string): string | undefined {
    const raw = String(templateKey || fallback || '').trim();
    if (!raw) return 'MBAX_TGO_11102567';
    const normalized = raw.split('::')[0].trim().toUpperCase();
    return normalized || 'MBAX_TGO_11102567';
  }
}
