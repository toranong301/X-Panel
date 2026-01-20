import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, combineLatest, distinctUntilChanged, finalize, from, map, of, shareReplay, startWith, switchMap, tap } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';

import { CycleApiService, Scope11StationaryItem, Scope11StationaryItemsResponse } from '../../../core/services/cycle-api.service';
import { CycleStateService } from '../../../core/services/cycle-state.service';
import { computeBlendFromAnnualL, FuelBlendKey, resolveBlendKey } from '../../../core/sheets/fuel-blend.registry';

type StationaryRow = Scope11StationaryItem & {
  include?: boolean;
};

const SCOPE11_ROW_META: Record<string, { label: string; fuelKey: string; unit: 'L' | 'kg' }> = {
  DIESEL_B7_STATIONARY: { label: 'Diesel B7', fuelKey: 'B7', unit: 'L' },
  GASOHOL_9195_STATIONARY: { label: 'Gasohol 91/95', fuelKey: '91/95', unit: 'L' },
  ACETYLENE_TANK5_MAINT_2: { label: 'Acetylene Tank5 (Maint 2)', fuelKey: 'OTHER', unit: 'L' },
  ACETYLENE_TANK5_MAINT_3: { label: 'Acetylene Tank5 (Maint 3)', fuelKey: 'OTHER', unit: 'L' },
};

type SplitPreviewRow = {
  rowId: string;
  itemLabel: string;
  fuelKey: string;
  otherType?: string | null;
  evidence: string;
  unit: string;
  total: number | null;
  dieselL: number | null;
  biodieselL: number | null;
  biodieselKg: number | null;
  gasolineL: number | null;
  ethanolL: number | null;
  ethanolKg: number | null;
};

@Component({
  selector: 'app-cfo-scope1-stationary',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './cfo-scope1-stationary.component.html',
  styleUrls: ['./cfo-scope1-stationary.component.scss'],
})
export class CfoScope1StationaryComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  readonly cycleId$: Observable<number>;

  private readonly reload$ = new Subject<void>();

  templateId = '';
  year: number | null = null;

  loading = true;
  saving = false;
  loadError: string | null = null;
  saveError: string | null = null;

  splitEnabled = false;

  rows: StationaryRow[] = [];
  private selectedRowIds = new Set<string>();

  readonly monthKeys: string[] = [
    'M1', 'M2', 'M3', 'M4', 'M5', 'M6',
    'M7', 'M8', 'M9', 'M10', 'M11', 'M12',
  ];

  displayedColumns: string[] = [];
  private nextCustom = 1;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cycleState: CycleStateService,
    private cycleApi: CycleApiService,
  ) {
    this.cycleId$ = this.route.paramMap.pipe(
      map(params => Number(params.get('cycleId') || 0)),
      distinctUntilChanged(),
      switchMap(routeId =>
        from(this.cycleState.resolveCycleId(routeId)).pipe(
          catchError(() => of(routeId)),
          tap(resolvedId => {
            if (routeId !== resolvedId) {
              Promise.resolve().then(() => {
                this.router.navigate(['/cycles', resolvedId, 'cfo', 'scope1-stationary'], { replaceUrl: true });
              });
            }
          })
        )
      ),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  ngOnInit(): void {
    combineLatest([
      this.cycleId$,
      this.reload$.pipe(startWith(undefined)),
    ])
      .pipe(
        switchMap(([cycleId]) => this.loadAll$(cycleId)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  reload(): void {
    this.reload$.next();
  }

  private loadAll$(cycleId: number) {
    if (!cycleId) {
      this.loading = false;
      return of(undefined);
    }

    this.loading = true;
    this.loadError = null;

    return from(
      Promise.all([
        this.cycleApi.getCycle(cycleId).catch(() => null),
        this.cycleApi.getScope11StationaryItems(cycleId),
        this.cycleApi.getFr041Config(cycleId).catch(() => null),
      ])
    ).pipe(
      tap(([cycle, resp, fr041]) => {
        this.templateId = String((cycle as any)?.template_id ?? '');
        this.year = Number.isFinite(Number((cycle as any)?.year)) ? Number((cycle as any).year) : null;

        const selected = new Set<string>(
          (fr041 as any)?.selectedRowIds?.map((v: any) => String(v)) ?? []
        );
        this.selectedRowIds = selected;

        const data: Scope11StationaryItemsResponse = resp as any;
        this.splitEnabled = Boolean(data?.splitEnabled);
        this.rows = (data.items ?? []).map(item => this.normalizeRow(item, selected));
        this.rebuildColumns();
      }),
      catchError((e: any) => {
        console.error(e);
        this.rows = [];
        this.rebuildColumns();
        this.loadError = e?.message || 'Load failed';
        return of(undefined);
      }),
      finalize(() => {
        this.loading = false;
      })
    );
  }

  addRow(): void {
    const rowId = `CUSTOM_${this.nextCustom++}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const months: Record<string, number | null> = this.emptyMonths();

    const row: StationaryRow = {
      rowId,
      itemLabel: '',
      evidenceType: 'invoice',
      evidenceOther: null,
      evidence: this.resolveEvidenceLabel('invoice', null),
      unit: 'L',
      fuelKey: 'B7',
      otherType: null,
      otherDieselPct: null,
      otherBiodieselPct: null,
      otherGasolinePct: null,
      otherEthanolPct: null,
      otherBiodieselDensityKgPerL: null,
      otherEthanolDensityKgPerL: null,
      months,
      total: null,
      include: false,
    };

    this.rows = [...this.rows, row];
    this.recalcRowTotal(row);
  }

  removeRow(row: StationaryRow): void {
    if (this.isFixedRow(row)) return;
    this.rows = this.rows.filter(r => r.rowId !== row.rowId);
    this.selectedRowIds.delete(row.rowId);
  }

  trackRow(_i: number, row: StationaryRow): string {
    return row.rowId;
  }

  isFixedRow(row: StationaryRow): boolean {
    const key = String(row.rowId || '').trim().toUpperCase();
    return Boolean(SCOPE11_ROW_META[key]);
  }

  setMonth(row: StationaryRow, key: string, raw: any): void {
    const next = this.normalizeNumber(raw);
    row.months = { ...(row.months ?? {}), [key]: next };
    this.recalcRowTotal(row);
  }

  setEvidenceType(row: StationaryRow, type: string): void {
    const normalized = this.normalizeEvidenceType(type);
    row.evidenceType = normalized;
    row.evidenceOther = normalized === 'other' ? (row.evidenceOther ?? '') : null;
    row.evidence = this.resolveEvidenceLabel(normalized, row.evidenceOther);
  }

  setEvidenceOther(row: StationaryRow, other: string): void {
    row.evidenceOther = other;
    row.evidenceType = 'other';
    row.evidence = this.resolveEvidenceLabel('other', other);
  }

  setFuelKey(row: StationaryRow, fuelKey: string): void {
    if (this.isFixedRow(row)) return;
    const normalized = String(fuelKey || '').trim().toUpperCase();
    row.fuelKey = normalized;
    if (normalized !== 'OTHER') {
      row.otherType = null;
    }
  }

  toggleInclude(row: StationaryRow, checked: boolean): void {
    row.include = checked;
    if (checked) {
      this.selectedRowIds.add(row.rowId);
    } else {
      this.selectedRowIds.delete(row.rowId);
    }
  }

  private recalcRowTotal(row: StationaryRow): void {
    row.total = this.calcTotal(row.months ?? {});
  }

  async save(cycleId: number): Promise<void> {
    if (!cycleId) return;

    this.saving = true;
    this.saveError = null;

    try {
      const items: Scope11StationaryItem[] = this.rows.map(row => ({
        rowId: row.rowId,
        itemLabel: row.itemLabel ?? '',
        evidenceType: row.evidenceType ?? null,
        evidenceOther: row.evidenceType === 'other' ? (row.evidenceOther ?? '') : null,
        evidence: this.resolveEvidenceLabel(row.evidenceType ?? 'invoice', row.evidenceOther ?? null),
        unit: row.unit ?? 'L',
        fuelKey: row.fuelKey ?? '',
        otherType: row.fuelKey === 'OTHER' ? (row.otherType ?? null) : null,
        otherDieselPct: row.fuelKey === 'OTHER' ? (row.otherDieselPct ?? null) : null,
        otherBiodieselPct: row.fuelKey === 'OTHER' ? (row.otherBiodieselPct ?? null) : null,
        otherGasolinePct: row.fuelKey === 'OTHER' ? (row.otherGasolinePct ?? null) : null,
        otherEthanolPct: row.fuelKey === 'OTHER' ? (row.otherEthanolPct ?? null) : null,
        otherBiodieselDensityKgPerL: row.fuelKey === 'OTHER' ? (row.otherBiodieselDensityKgPerL ?? null) : null,
        otherEthanolDensityKgPerL: row.fuelKey === 'OTHER' ? (row.otherEthanolDensityKgPerL ?? null) : null,
        months: row.months ?? this.emptyMonths(),
        total: row.total ?? null,
      }));

      await this.cycleApi.saveScope11StationaryItems(cycleId, items);

      // persist Include selection (FR-04.1) without touching Excel
      await this.cycleApi.updateFr041Config(cycleId, {
        selectedRowIds: Array.from(this.selectedRowIds.values()),
      });

      this.reload();
    } catch (e: any) {
      console.error(e);
      this.saveError = e?.message || 'Save failed';
    } finally {
      this.saving = false;
    }
  }

  private normalizeRow(it: Scope11StationaryItem, selected: Set<string>): StationaryRow {
    const meta = SCOPE11_ROW_META[String(it.rowId || '').trim().toUpperCase()] ?? null;

    const months: Record<string, number | null> = this.emptyMonths();
    const src = it.months ?? {};
    for (const k of this.monthKeys) {
      months[k] = this.normalizeNumber((src as any)[k]);
    }

    const evidenceType = this.normalizeEvidenceType((it as any).evidenceType ?? null, it.evidence ?? '');
    const evidenceOther = evidenceType === 'other' ? (String((it as any).evidenceOther ?? it.evidence ?? '').trim() || '') : null;

    const row: StationaryRow = {
      rowId: it.rowId,
      itemLabel: (it.itemLabel ?? '').trim() ? (it.itemLabel ?? '') : (meta?.label ?? ''),
      evidenceType,
      evidenceOther,
      evidence: this.resolveEvidenceLabel(evidenceType, evidenceOther),
      unit: meta?.unit ?? (String(it.unit || '').toLowerCase() === 'kg' ? 'kg' : 'L'),
      fuelKey: meta?.fuelKey ?? String(it.fuelKey || '').trim().toUpperCase(),
      otherType: it.otherType ?? null,
      otherDieselPct: this.normalizeNumber((it as any).otherDieselPct),
      otherBiodieselPct: this.normalizeNumber((it as any).otherBiodieselPct),
      otherGasolinePct: this.normalizeNumber((it as any).otherGasolinePct),
      otherEthanolPct: this.normalizeNumber((it as any).otherEthanolPct),
      otherBiodieselDensityKgPerL: this.normalizeNumber((it as any).otherBiodieselDensityKgPerL),
      otherEthanolDensityKgPerL: this.normalizeNumber((it as any).otherEthanolDensityKgPerL),
      months,
      total: it.total ?? null,
      include: selected.has(it.rowId),
    };
    this.recalcRowTotal(row);
    return row;
  }

  private rebuildColumns(): void {
    this.displayedColumns = [
      'include',
      'itemLabel',
      'fuelKey',
      'evidence',
      'unit',
      ...this.monthKeys,
      'total',
      'actions',
    ];
  }

  get splitPreviewRows(): SplitPreviewRow[] {
    const allowed: FuelBlendKey[] = ['B7', 'B10', '91/95', 'E20'];
    return (this.rows ?? []).map(row => {
      const total = this.calcTotal(row.months ?? {});
      const fuelKey = String(row.fuelKey || '').trim().toUpperCase();
      const unit = row.unit ?? '';

      const base: SplitPreviewRow = {
        rowId: row.rowId,
        itemLabel: row.itemLabel || row.rowId,
        fuelKey,
        otherType: row.otherType ?? null,
        evidence: row.evidence || '',
        unit,
        total,
        dieselL: null,
        biodieselL: null,
        biodieselKg: null,
        gasolineL: null,
        ethanolL: null,
        ethanolKg: null,
      };

      if (String(unit).toLowerCase() !== 'l' || total === null) return base;

      const blendKey = resolveBlendKey(fuelKey, row.otherType ?? undefined);
      if (!allowed.includes(blendKey)) return base;

      const blend = computeBlendFromAnnualL(total, blendKey);
      return {
        ...base,
        dieselL: blend.dieselL,
        biodieselL: blend.biodieselL,
        biodieselKg: blend.biodieselKg,
        gasolineL: blend.gasolineL,
        ethanolL: blend.ethanolL,
        ethanolKg: blend.ethanolKg,
      };
    });
  }

  get showSplitPreview(): boolean {
    return this.splitEnabled || this.templateId.toLowerCase().includes('mbax');
  }

  get otherBlendRows(): StationaryRow[] {
    return (this.rows ?? []).filter(row => String(row.fuelKey || '').trim().toUpperCase() === 'OTHER');
  }

  setOtherBlendNumber(
    row: StationaryRow,
    field:
      | 'otherDieselPct'
      | 'otherBiodieselPct'
      | 'otherGasolinePct'
      | 'otherEthanolPct'
      | 'otherBiodieselDensityKgPerL'
      | 'otherEthanolDensityKgPerL',
    raw: any
  ): void {
    (row as any)[field] = this.normalizeNumber(raw);
  }

  formatFixed2(value: number | null | undefined): string {
    if (!Number.isFinite(Number(value))) return '';
    return Number(value).toFixed(2);
  }

  private calcTotal(months: Record<string, number | null>): number | null {
    let total = 0;
    let hasValue = false;
    for (const k of this.monthKeys) {
      const v = months[k];
      if (!Number.isFinite(Number(v))) continue;
      hasValue = true;
      total += Number(v);
    }
    return hasValue ? total : null;
  }

  private emptyMonths(): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    for (const k of this.monthKeys) out[k] = null;
    return out;
  }

  private normalizeNumber(raw: any): number | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const s = String(raw).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  private normalizeEvidenceType(rawType: any, rawEvidence?: any): string {
    const type = String(rawType ?? '').trim().toLowerCase();
    if (['invoice', 'cash_invoice', 'po', 'other'].includes(type)) return type;

    const evidence = String(rawEvidence ?? '').trim();
    if (evidence === 'ใบกำกับภาษี') return 'invoice';
    if (evidence === 'บิลเงินสด/ใบกำกับภาษี') return 'cash_invoice';
    if (evidence === 'ใบสั่งซื้อ') return 'po';
    if (evidence !== '') return 'other';
    return 'invoice';
  }

  private resolveEvidenceLabel(type: string, otherText: string | null): string {
    if (type === 'invoice') return 'ใบกำกับภาษี';
    if (type === 'cash_invoice') return 'บิลเงินสด/ใบกำกับภาษี';
    if (type === 'po') return 'ใบสั่งซื้อ';
    if (type === 'other') return String(otherText ?? '').trim();
    return '';
  }
}
