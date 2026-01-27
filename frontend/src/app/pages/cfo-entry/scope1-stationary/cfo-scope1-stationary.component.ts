import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, catchError, combineLatest, distinctUntilChanged, finalize, forkJoin, from, map, of, shareReplay, startWith, switchMap, tap } from 'rxjs';

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
import { FuelBlendKey, computeBlendFromAnnualL, resolveBlendKey } from '../../../core/sheets/fuel-blend.registry';
import { applyTankMonths, TankInjection } from './tank.utils';

type StationaryRow = Scope11StationaryItem & {
  include?: boolean;
  tankInjection?: TankInjection | null;
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
  splitPreviewToggle = false;

  rows: StationaryRow[] = [];
  private selectedRowIds = new Set<string>();
  showEmptyRows = false;

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
    private cdr: ChangeDetectorRef,
  ) {
    this.cycleId$ = this.route.paramMap.pipe(
      map(params => Number(params.get('id') ?? params.get('cycleId') ?? 0)),
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
    this.setLoading(false);
    this.loadError = 'Missing cycle id';
    this.rows = [];
    this.rebuildColumns();
    return of(undefined);
  }

  this.setLoading(true);
  console.log('START loadAll loading=true');
  this.loadError = null;

  return forkJoin({
    cycle: from(this.cycleApi.getCycle(cycleId)).pipe(catchError(() => of(null))),
    resp: from(this.cycleApi.getScope11StationaryItems(cycleId)), // ถ้าพังให้ไป catchError ด้านล่าง
    fr041: from(this.cycleApi.getFr041Config(cycleId)).pipe(catchError(() => of(null))),
  }).pipe(
      tap(({ cycle, resp, fr041 }) => {
        this.templateId = String((cycle as any)?.template_id ?? '');
        this.year = Number.isFinite(Number((cycle as any)?.year)) ? Number((cycle as any)?.year) : null;

        const selected = new Set<string>(
          (fr041 as any)?.selectedRowIds?.map((v: any) => String(v)) ?? []
        );
        this.selectedRowIds = selected;

        const data: Scope11StationaryItemsResponse = resp as any;
        this.splitEnabled = Boolean(data?.splitEnabled);
        this.rows = (Array.isArray(data?.items) ? data.items : []).map(item => this.normalizeRow(item, selected));
        this.rebuildColumns();
      }),
    catchError((e: any) => {
      console.error('scope1-stationary load failed', e);
      this.rows = [];
      this.rebuildColumns();
      // โชว์รายละเอียดให้เห็นชัดกว่าของเดิม
      this.loadError = e?.error?.message ?? e?.message ?? `Load failed (${e?.status ?? 'unknown'})`;
      return of(undefined);
    }),
    finalize(() => {
      this.setLoading(false);
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
      tankModeEnabled: false,
      tankCount: null,
      kgPerTank: null,
      tankTargetMonth: null,
      computedKg: null,
      tankInjection: null,
      include: false,
    };

    this.rows = [...this.rows, row];
    this.recalcRowTotal(row);
  }

  removeRow(row: StationaryRow): void {
    this.rows = this.rows.filter(r => r.rowId !== row.rowId);
    this.selectedRowIds.delete(row.rowId);
  }

  trackRow(_i: number, row: StationaryRow): string {
    return row.rowId;
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
    const normalized = String(fuelKey || '').trim().toUpperCase();
    row.fuelKey = normalized;
    if (normalized !== 'OTHER') {
      row.otherType = null;
      row.tankModeEnabled = false;
      row.tankCount = null;
      row.kgPerTank = null;
      row.tankTargetMonth = null;
      row.computedKg = null;
      row.tankInjection = null;
      this.applyTankMode(row);
    }
  }

  setTankMode(row: StationaryRow, enabled: boolean): void {
    row.tankModeEnabled = enabled;
    if (!enabled) {
      row.computedKg = null;
    }
    this.applyTankMode(row);
  }

  setTankCount(row: StationaryRow, raw: any): void {
    row.tankCount = this.normalizeNumber(raw);
    this.applyTankMode(row);
  }

  setKgPerTank(row: StationaryRow, raw: any): void {
    row.kgPerTank = this.normalizeNumber(raw);
    this.applyTankMode(row);
  }

  setTankTargetMonth(row: StationaryRow, value: string): void {
    row.tankTargetMonth = this.normalizeTankTargetMonth(value);
    this.applyTankMode(row);
  }

  private calculateTankTotal(row: StationaryRow): number | null {
    const count = this.normalizeNumber(row.tankCount);
    const kg = this.normalizeNumber(row.kgPerTank);
    if (count === null || kg === null) return null;
    return count * kg;
  }

  private applyTankMode(row: StationaryRow): void {
    const computed = row.tankModeEnabled ? this.calculateTankTotal(row) : null;
    row.computedKg = computed;
    const target = row.tankModeEnabled ? row.tankTargetMonth ?? null : null;
    const { months, injection } = applyTankMonths(
      row.months ?? this.emptyMonths(),
      row.tankInjection ?? null,
      target,
      computed,
    );
    row.months = months;
    row.tankInjection = injection;
    this.recalcRowTotal(row);
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
        tankModeEnabled: Boolean(row.tankModeEnabled),
        tankCount: row.tankCount ?? null,
        kgPerTank: row.kgPerTank ?? null,
        tankTargetMonth: row.tankTargetMonth ?? null,
        computedKg: row.computedKg ?? null,
        months: row.months ?? this.emptyMonths(),
        total: row.total ?? null,
      }));

      await this.cycleApi.saveScope11StationaryItems(cycleId, items);

      this.reload();
    } catch (e: any) {
      console.error(e);
      this.saveError = e?.message || 'Save failed';
    } finally {
      this.saving = false;
    }
  }

  private normalizeRow(it: Scope11StationaryItem, selected: Set<string>): StationaryRow {
    const months: Record<string, number | null> = this.emptyMonths();
    const src = it.months ?? {};
    for (const k of this.monthKeys) {
      months[k] = this.normalizeNumber((src as any)[k]);
    }

    const evidenceType = this.normalizeEvidenceType((it as any).evidenceType ?? null, it.evidence ?? '');
    const evidenceOther = evidenceType === 'other' ? (String((it as any).evidenceOther ?? it.evidence ?? '').trim() || '') : null;

    const tankModeEnabled = Boolean((it as any).tankModeEnabled ?? false);
    const tankCount = this.normalizeNumber((it as any).tankCount);
    const kgPerTank = this.normalizeNumber((it as any).kgPerTank);
    const tankTargetMonth = this.normalizeTankTargetMonth((it as any).tankTargetMonth);
    const computedKg = this.normalizeNumber((it as any).computedKg);
    const tankInjection =
      tankModeEnabled && tankTargetMonth && computedKg !== null
        ? { month: tankTargetMonth, value: computedKg }
        : null;

    const row: StationaryRow = {
      rowId: it.rowId,
      itemLabel: (it.itemLabel ?? '').trim() ? (it.itemLabel ?? '') : '',
      evidenceType,
      evidenceOther,
      evidence: this.resolveEvidenceLabel(evidenceType, evidenceOther),
      unit: String(it.unit || '').toLowerCase() === 'kg' ? 'kg' : 'L',
      fuelKey: String(it.fuelKey || '').trim().toUpperCase(),
      otherType: it.otherType ?? null,
      otherDieselPct: this.normalizeNumber((it as any).otherDieselPct),
      otherBiodieselPct: this.normalizeNumber((it as any).otherBiodieselPct),
      otherGasolinePct: this.normalizeNumber((it as any).otherGasolinePct),
      otherEthanolPct: this.normalizeNumber((it as any).otherEthanolPct),
      otherBiodieselDensityKgPerL: this.normalizeNumber((it as any).otherBiodieselDensityKgPerL),
      otherEthanolDensityKgPerL: this.normalizeNumber((it as any).otherEthanolDensityKgPerL),
      months,
      total: it.total ?? null,
      tankModeEnabled,
      tankCount,
      kgPerTank,
      tankTargetMonth,
      computedKg,
      tankInjection,
      include: selected.has(it.rowId),
    };
    this.recalcRowTotal(row);
    return row;
  }

  private rebuildColumns(): void {
    this.displayedColumns = [
      'include',
      'itemLabel',
      'evidence',
      'unit',
      'total',
      ...this.monthKeys,
      'actions',
    ];
  }

  private setLoading(value: boolean): void {
    this.loading = value;
    this.cdr.markForCheck();
  }

  get visibleRows(): StationaryRow[] {
    if (this.showEmptyRows) {
      return this.rows;
    }
    return this.rows.filter(row => this.hasUserData(row));
  }

  private hasUserData(row: StationaryRow): boolean {
    const label = String(row.itemLabel ?? '').trim();
    if (label) return true;
    if (String(row.evidence ?? '').trim()) return true;
    if (String(row.evidenceOther ?? '').trim()) return true;
    if (row.total !== null && Number.isFinite(Number(row.total))) return true;
    return this.hasAnyMonthValue(row.months ?? {});
  }

  private hasAnyMonthValue(months: Record<string, number | null>): boolean {
    for (const key of this.monthKeys) {
      const value = months[key];
      if (value !== null && Number.isFinite(Number(value))) {
        return true;
      }
    }
    return false;
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
    return this.splitPreviewToggle || this.templateId.toLowerCase().includes('mbax');
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

  private normalizeTankTargetMonth(raw: any): string | null {
    const value = String(raw ?? '').trim().toUpperCase();
    if (!value) return null;
    return /^M(1[0-2]|[1-9])$/.test(value) ? value : null;
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
