import { Injectable } from '@angular/core';

import { EntryRow } from '../../models/entry-row.model';
import { Fr01Data } from '../../models/fr01.model';
import { InventoryItemRow } from '../../models/refs.model';
import { Scope3ItemRow } from '../../models/scope3-summary.model';

import { CanonicalCycleData, CfoGhgBundle, CfoGhgItem, Fr032CanonicalRow } from '../../models/canonical-cycle.model';
import { DataEntryDoc, DataEntryService } from './data-entry.service';
import { Fr01Service } from './fr01.service';
import { Fr02Service } from './fr02.service';
import { Fr031Service } from './fr03-1.service';
import { Fr032Service } from './fr03-2.service';
import { Scope3SummaryService } from './scope3-summary.service';
import { computeBlendFromAnnualL, computeBlendFromSpec, resolveBlendKey } from '../sheets/fuel-blend.registry';

type FuelKey = 'B7' | 'B10' | '91/95' | 'E20' | 'LPG' | 'FUEL_OIL' | 'OTHER';

const FUEL_KEYS: FuelKey[] = ['B7', 'B10', '91/95', 'E20', 'LPG', 'FUEL_OIL', 'OTHER'];

function isFuelKey(value: string): value is FuelKey {
  return FUEL_KEYS.includes(value as FuelKey);
}

function isNonNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export interface Fr041SelRow {
  rowNo: number;
  itemId: string;
  itemName: string;
  fuelKey: string;
  evidence: string;
  unit: string;
  qty: number | null;
  efId: string;
}

export interface SplitSummaryRow {
  itemId: string;
  itemName: string;
  fuelKey: string;
  evidence: string;
  dieselL?: number;
  biodieselL?: number;
  biodieselKg?: number;
  gasolineL?: number;
  ethanolL?: number;
  ethanolKg?: number;
  otherQty?: number;
  otherUnit?: string;
}

export interface EfSelectionMap {
  byItemId?: Record<string, string>;
  byFuelKey?: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class CanonicalGhgService {
  constructor(
    private scope3Svc: Scope3SummaryService,
    private fr032Svc: Fr032Service,
    private entrySvc: DataEntryService,
    private fr01Svc: Fr01Service,
    private fr02Svc: Fr02Service,
    private fr031Svc: Fr031Service,
  ) {}

  /**
   * Build canonical datasets for export.
   * - Scope 3 comes from Scope3Screen store.
   * - Scope 1.1/1.2 comes from DataEntryService (localStorage).
   */
  build(cycleId: number, templateKey?: string): CanonicalCycleData {
    const entryDoc = this.entrySvc.load(cycleId);
    // --- V-Sheet data (fixed + subsheets) ---
    const vsheet = this.entrySvc.loadVSheet(cycleId);

    // --- Scope 3 source ---
    const scope3Doc = this.scope3Svc.load(cycleId);
    const scope3Items: Scope3ItemRow[] =
      scope3Doc?.rows?.length ? scope3Doc.rows : this.scope3Svc.getMockRows(cycleId);

    // ensure computed fields exist
    this.computeScope3(scope3Items);

    // --- Scope 1/2 from Data Entry ---
    const inventoryScope1: InventoryItemRow[] = this.buildScope1Inventory(cycleId);
    const inventoryScope2: InventoryItemRow[] = this.buildScope2Inventory(cycleId);

    // --- Scope 3 canonical inventory ---
    const inventoryScope3: InventoryItemRow[] =
      scope3Items.map((it: Scope3ItemRow) => this.mapScope3ToInventory(it));

    // --- merged inventory ---
    const inventory: InventoryItemRow[] = [
      ...inventoryScope1,
      ...inventoryScope2,
      ...inventoryScope3,
      ...this.buildScope11DerivedInventory(entryDoc?.scope1 ?? []),
    ];

    // --- FR-03.2 canonical (significance result per Scope3 item) ---
    const saved = this.fr032Svc.load(cycleId) || {};
    const fr03_2: Fr032CanonicalRow[] = [];

    for (const it of scope3Items) {
      const subScope = this.parseSubScope(it.tgoNo);
      const itemLabel = (it.itemName ?? it.itemLabel) || '';
      const key = `${subScope}|${itemLabel}`;
      const savedRow = saved[key] || {};

      fr03_2.push({
        key,
        subScope,
        isoNo: this.parseIsoNo(it.scopeIso),
        categoryLabel: it.categoryLabel,
        itemLabel,
        ghgTco2e: Number(it.totalTco2e || 0),
        sharePct: Number(it.sharePct || 0),
        assessment: (savedRow as any).assessment ?? '',
        selection: (savedRow as any).selection ?? '',
      });
    }

    const fr01 = this.normalizeFr01(this.fr01Svc.load(cycleId));
    const fr02 = this.fr02Svc.load(cycleId);
    const fr031 = this.fr031Svc.load(cycleId);
    const fr041Selection =
      (entryDoc as any)?.fr041Selection ??
      (entryDoc as any)?.fr041Selections ??
      undefined;
    const cfoGhg = this.buildCfoGhg(entryDoc, scope3Items);

    const templateId = this.normalizeTemplateId(templateKey, (entryDoc as any)?.templateId);
    const scope11HeaderMonths = (entryDoc as any)?.scope11HeaderMonths;
    const rawPeriodYear = (entryDoc as any)?.scope11PeriodYear;
    const scope11PeriodYear = Number.isFinite(Number(rawPeriodYear)) ? Number(rawPeriodYear) : 2566;

    return {
      cycleId,
      templateId,
      inventory,
      fr03_2,
      vsheet,
      evidence: entryDoc?.evidence ?? {},
      scope11HeaderMonths,
      scope11PeriodYear,
      fr01,
      fr02,
      fr031,
      fr041Selection,
      cfoGhg,
    };
  }

  public buildCanonicalForCycle(cycleId: number, templateKey?: string): CanonicalCycleData {
    return this.build(cycleId, templateKey);
  }

  public buildScope11StationaryExport(cycleId: number): CanonicalCycleData {
    return this.build(cycleId);
  }

  public buildScope11StationaryPayload(cycleId: number, rows: EntryRow[]): Record<string, any> {
    const entryDoc = this.entrySvc.load(cycleId);
    const templateId = this.normalizeTemplateId(undefined, (entryDoc as any)?.templateId);
    const headerMonths = (entryDoc as any)?.scope11HeaderMonths;
    const rawPeriodYear = (entryDoc as any)?.scope11PeriodYear;
    const periodYear = Number.isFinite(Number(rawPeriodYear)) ? Number(rawPeriodYear) : 2566;

    const items = rows
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

        return {
          rowId,
          fuelKey,
          label: String(row.itemName || this.getScope1Label(row.subCategoryCode) || '').trim(),
          evidence: String(row.referenceText || '').trim(),
          unit: this.normalizeScope11Unit(row.unit),
          otherType: fuelKey === 'OTHER' ? (String(row.otherType || '').trim() || null) : null,
          months,
        };
      })
      .filter(isNonNull)
      .map(item => ({
        ...item,
        fuelKey: isFuelKey(item.fuelKey) ? item.fuelKey : 'OTHER',
      }));

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

  /**
   * Build FR-04.1 selection rows (rowNo starts at 11 to match template main block).
   * - Split rows are emitted only when qty > 0 to keep empty inputs empty.
   * - efId comes from map (itemId first, then fuelKey). Missing efId stays empty.
   */
  public buildFr041SelectionRows(
    splitRows: SplitSummaryRow[],
    efMap: EfSelectionMap,
    startRowNo = 11,
  ): Fr041SelRow[] {
    const out: Fr041SelRow[] = [];
    let rowNo = startRowNo;

    const pickEfId = (itemId: string, fuelKey: string): string => {
      const byItem = efMap?.byItemId?.[itemId];
      if (byItem) return byItem;
      const byFuel = efMap?.byFuelKey?.[fuelKey];
      if (byFuel) return byFuel;
      return '';
    };

    const push = (r: SplitSummaryRow, labelSuffix: string, unit: string, qty: number | undefined, efId: string) => {
      if (!Number.isFinite(Number(qty)) || Number(qty) <= 0) return;
      out.push({
        rowNo,
        itemId: String(r.itemId ?? ''),
        itemName: labelSuffix ? `${r.itemName} ${labelSuffix}` : String(r.itemName ?? ''),
        fuelKey: String(r.fuelKey ?? ''),
        evidence: String(r.evidence ?? ''),
        unit: unit || '',
        qty: Math.round(Number(qty) * 100) / 100,
        efId: String(efId ?? ''),
      });
      rowNo += 1;
    };

    for (const r of splitRows || []) {
      const efId = pickEfId(String(r.itemId ?? ''), String(r.fuelKey ?? ''));

      push(r, '(Diesel)', 'L', r.dieselL, efId);
      push(r, '(Biodiesel)', 'L', r.biodieselL, efId);
      push(r, '(Biodiesel)', 'kg', r.biodieselKg, efId);
      push(r, '(Gasoline)', 'L', r.gasolineL, efId);
      push(r, '(Ethanol)', 'L', r.ethanolL, efId);
      push(r, '(Ethanol)', 'kg', r.ethanolKg, efId);

      if (Number.isFinite(Number(r.otherQty)) && Number(r.otherQty) > 0) {
        push(r, '', r.otherUnit || 'L', r.otherQty, efId);
      }
    }

    return out;
  }

  // ✅ Scope 1.1 + 1.2: สร้าง InventoryItemRow ที่มี quantityMonthly + fuelKey + slotNo
  private buildScope1Inventory(cycleId: number): InventoryItemRow[] {
    const doc = this.entrySvc.load(cycleId);
    const rows = (doc?.scope1 ?? []).filter(r => r.scope === 'S1');

    return rows
      .filter(r =>
        r.categoryCode === '1.1' ||
        r.categoryCode === '1.2' ||
        r.categoryCode === '1.4.1' ||
        r.categoryCode === '1.4.2' ||
        r.categoryCode === '1.4.3' ||
        r.categoryCode === '1.4.4' ||
        r.categoryCode === '1.4.5',
      )
      .map(r => this.mapEntryRowToInventory(r, 1));
  }

  private buildScope2Inventory(cycleId: number): InventoryItemRow[] {
    const doc = this.entrySvc.load(cycleId);
    const rows = (doc?.scope2 ?? []).filter(r => r.scope === 'S2');

    return rows
      .filter(r => r.categoryCode === '2.1')
      .map(r => this.mapEntryRowToInventory(r, 2));
  }

  private buildScope11DerivedInventory(scope1Rows: EntryRow[]): InventoryItemRow[] {
    const rows = scope1Rows.filter(r => r.categoryCode === '1.1');
    let biodieselKg = 0;
    let ethanolKg = 0;

    for (const row of rows) {
      if (String(row.unit || '').toLowerCase() !== 'l') continue;
      if (row.computed?.biodieselKg !== undefined || row.computed?.ethanolKg !== undefined) {
        biodieselKg += Number(row.computed?.biodieselKg || 0);
        ethanolKg += Number(row.computed?.ethanolKg || 0);
        continue;
      }
      const annualL = this.sumEntryRowMonths(row);
      if (!annualL) continue;
      const blendKey = resolveBlendKey(row.subCategoryCode, row.remark);
      const blend = blendKey === 'OTHER'
        ? computeBlendFromSpec(annualL, row.blendSpec)
        : computeBlendFromAnnualL(annualL, blendKey);
      biodieselKg += blend.biodieselKg;
      ethanolKg += blend.ethanolKg;
    }

    const items: InventoryItemRow[] = [];
    if (biodieselKg > 0) {
      items.push({
        id: 'S1:1.1:biodiesel_stationary',
        scope: 1,
        subScope: '1.1',
        tgoNo: 'Scope 1.1',
        isoScope: '',
        categoryLabel: 'Stationary combustion',
        itemLabel: 'Biodiesel (Stationary combustion)',
        unit: 'kg',
        quantityPerYear: biodieselKg,
        fuelKey: 'BIODIESEL_STATIONARY',
      });
    }
    if (ethanolKg > 0) {
      items.push({
        id: 'S1:1.1:biogasoline_ethanol_stationary',
        scope: 1,
        subScope: '1.1',
        tgoNo: 'Scope 1.1',
        isoScope: '',
        categoryLabel: 'Stationary combustion',
        itemLabel: 'Biogasoline (Ethanol) (Stationary combustion)',
        unit: 'kg',
        quantityPerYear: ethanolKg,
        fuelKey: 'ETHANOL_STATIONARY',
      });
    }

    return items;
  }

  private mapEntryRowToInventory(r: EntryRow, scopeNo: 1 | 2 | 3): InventoryItemRow {
    const monthly = this.toMonthlyArray(r.months || []);
    const qtyYear = monthly.reduce((s, n) => s + Number(n || 0), 0);
    const efValue = Number.isFinite(Number(r.snapshotEfValue)) ? Number(r.snapshotEfValue) : undefined;
    const totalTco2e = efValue !== undefined ? (qtyYear * efValue) / 1000 : undefined;

    const { fuelKey, slotNo } = this.parseFuelKeyAndSlot(r.subCategoryCode);
    const fallbackLabel = this.getScope1Label(fuelKey);
    const itemLabel = r.itemName || fallbackLabel || '';

    const categoryLabel =
      r.categoryCode === '1.1' ? 'Stationary combustion' :
      r.categoryCode === '1.2' ? 'Mobile combustion' :
      r.categoryCode === '2.1' ? 'Purchased electricity' :
      r.categoryCode;
    const standard = r.categoryCode === '1.4.5' ? String(r.remark ?? '').trim() : '';
    const remark =
      r.categoryCode === '1.4.5'
        ? [r.location ?? '', standard ? `standard=${standard}` : ''].filter(Boolean).join(' | ')
        : r.categoryCode === '1.4.4'
          ? (r.location ?? r.itemName ?? '')
          : r.categoryCode === '2.1'
            ? String(r.remark ?? '').trim()
          : (r.location ?? '');

    return {
      id: r.id || `${r.scope}:${r.categoryCode}:${slug(r.itemName)}:${fuelKey ?? ''}:${slotNo ?? ''}`,
      scope: scopeNo,
      subScope: r.categoryCode,          // '1.1' | '1.2'
      tgoNo: `Scope ${r.categoryCode}`,  // ให้ filter แบบเดิมใน adapter ผ่านแน่นอน
      isoScope: '',
      categoryLabel,
      itemLabel,
      unit: r.categoryCode === '1.4.4' ? 'Kg' : r.unit,
      quantityPerYear: qtyYear,
      ef: efValue,
      totalTco2e,
      remark,
      dataEvidence: r.referenceText ?? '',
      otherType: r.otherType ?? null,

      fuelKey,
      quantityMonthly: monthly,
      slotNo,
      blendSpec: r.blendSpec,
      blend: r.blend,
      computed: r.computed,
      unitConversion: r.unitConversion,
      fuelType: r.fuelType,
    };
  }

  private toMonthlyArray(months: { month: number; qty: number }[]): number[] {
    const out = Array.from({ length: 12 }, () => Number.NaN);
    for (const m of months || []) {
      const idx = Number(m.month) - 1;
      if (idx < 0 || idx >= 12) continue;
      const value = this.parseNumberOrNull((m as any).qty);
      if (value !== null) out[idx] = value;
    }
    return out;
  }

  /**
   * รองรับรูปแบบ subCategoryCode:
   * - "DIESEL_B7_ONROAD#3" => fuelKey=DIESEL_B7_ONROAD, slotNo=3
   * - "DIESEL_B7_STATIONARY" => fuelKey อย่างเดียว
   */
  private parseFuelKeyAndSlot(subCategoryCode?: string): { fuelKey?: string; slotNo?: number } {
    const raw = String(subCategoryCode || '').trim();
    if (!raw) return {};

    const [k, n] = raw.split('#');
    const fuelKey = String(k || '').trim().toUpperCase();
    const slotNo = n ? Number(n) : undefined;

    return {
      fuelKey: fuelKey || undefined,
      slotNo: Number.isFinite(slotNo) ? slotNo : undefined,
    };
  }

  private getScope1Label(fuelKey?: string): string {
    if (!fuelKey) return '';
    const labels: Record<string, string> = {
      DIESEL_B7_STATIONARY: 'น้ำมัน Diesel B7 (Fire Pump)',
      GASOHOL_9195_STATIONARY: 'น้ำมัน Gasohol 91/95 (เครื่องตัดหญ้า)',
      ACETYLENE_TANK5_MAINT_2: 'Acetylene gas (5 kg) ในงานการซ่อมบำรุง 2',
      ACETYLENE_TANK5_MAINT_3: 'Acetylene gas (5 kg) ในงานการซ่อมบำรุง 3',
      DIESEL_B7_ONROAD: 'Diesel B7 on-road',
      DIESEL_B10_ONROAD: 'Diesel B10 on-road',
      GASOHOL_9195: 'Gasohol 91/95',
      GASOHOL_E20: 'Gasohol E20',
      DIESEL_B7_OFFROAD: 'Diesel B7 off-road (forklift)',
    };
    return labels[String(fuelKey || '').trim().toUpperCase()] ?? '';
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

  private mapScope3ToInventory(it: Scope3ItemRow): InventoryItemRow {
    const subScope = this.parseSubScope(it.tgoNo);
    const itemLabel = (it.itemName ?? it.itemLabel) || '';

    return {
      id: `S3:${subScope}:${slug(itemLabel)}`,
      scope: 3,
      subScope,
      tgoNo: it.tgoNo,
      isoScope: it.scopeIso,
      categoryLabel: it.categoryLabel,
      itemLabel,
      unit: it.unit,
      quantityPerYear: Number(it.quantityPerYear || 0),
      remark: it.remark ?? '',
      dataEvidence: it.dataEvidence ?? '',
      ef: Number(it.ef || 0),
      efEvidence: it.efEvidence ?? '',
      totalTco2e: Number(it.totalTco2e || 0),
      sharePct: Number(it.sharePct || 0),
      trace: it.refs ? {
        itemLabel: it.refs.itemLabel,
        unit: it.refs.unit,
        quantity: it.refs.quantityPerYear,
        dataEvidence: it.refs.dataEvidence,
        ef: it.refs.ef,
        efEvidence: it.refs.efEvidence,
      } : undefined,
    };
  }

  private computeScope3(items: Scope3ItemRow[]) {
    for (const r of items) {
      const qty = Number(r.quantityPerYear || 0);
      const ef = Number(r.ef || 0);
      r.totalTco2e = (qty * ef) / 1000;
      r.ghgTco2e = r.totalTco2e;
    }
    const total = items.reduce((s, r) => s + Number(r.totalTco2e || 0), 0);
    for (const r of items) {
      r.sharePct = total > 0 ? (Number(r.totalTco2e || 0) / total) * 100 : 0;
      r.pct = r.sharePct;
    }
  }

  private parseSubScope(tgoNo: string): string {
    return String(tgoNo || '').replace(/scope\s*/i, '').trim();
  }

  private parseIsoNo(scopeIso: string): string {
    const m = String(scopeIso || '').match(/(\d+(?:\.\d+)?)/);
    return m ? m[1] : '';
  }

  private buildCfoGhg(entryDoc: DataEntryDoc | null, scope3Items: Scope3ItemRow[]): CfoGhgBundle {
    const scope1Rows: EntryRow[] = entryDoc?.scope1 ?? [];
    const scope2Rows: EntryRow[] = entryDoc?.scope2 ?? [];

    return {
      scope1: scope1Rows.map(row => this.mapEntryRowToCfoItem(row, 1)),
      scope2: scope2Rows.map(row => this.mapEntryRowToCfoItem(row, 2)),
      scope3: scope3Items.map(item => this.mapScope3ToCfoItem(item)),
    };
  }

  private mapEntryRowToCfoItem(row: EntryRow, scope: 1 | 2 | 3): CfoGhgItem {
    const quantity = this.sumEntryRowMonths(row);
    const remark = String(row.remark ?? row.location ?? '').trim();
    const evidence = String(row.referenceText ?? '').trim();

    return {
      scope,
      subScope: String(row.categoryCode ?? '').trim(),
      activity: String(row.itemName ?? '').trim(),
      quantity,
      unit: String(row.unit ?? '').trim(),
      evidence: evidence || undefined,
      remark: remark || undefined,
    };
  }

  private mapScope3ToCfoItem(item: Scope3ItemRow): CfoGhgItem {
    const activity = String(item.itemName ?? item.itemLabel ?? '').trim();
    const subScope = this.parseSubScope(item.tgoNo);
    const evidence = String(item.dataEvidence ?? '').trim();
    const remark = String(item.remark ?? '').trim();

    return {
      scope: 3,
      subScope,
      activity,
      quantity: Number(item.quantityPerYear ?? 0) || 0,
      unit: String(item.unit ?? '').trim(),
      evidence: evidence || undefined,
      remark: remark || undefined,
    };
  }

  private sumEntryRowMonths(row: EntryRow): number {
    const months = Array.isArray(row.months) ? row.months : [];
    return months.reduce((sum, m) => sum + Number(m?.qty ?? 0), 0);
  }

  private normalizeFr01(input: Fr01Data | null): Fr01Data | null {
    if (!input) return null;
    const dataPeriod = input.dataPeriod ?? {
      start: (input as any).periodStart,
      end: (input as any).periodEnd,
    };
    const baseYearPeriod = input.baseYearPeriod ?? {
      start: (input as any).baseYearStart,
      end: (input as any).baseYearEnd,
    };

    return {
      ...input,
      orgName: input.orgName ?? (input as any).organizationName ?? '',
      preparedBy: input.preparedBy ?? (input as any).preparerName ?? '',
      dataPeriod,
      baseYearPeriod,
      orgInfoLines: input.orgInfoLines ?? (input as any).products ?? [],
      contactAddress: input.contactAddress ?? (input as any).address ?? '',
    };
  }

  private normalizeTemplateId(templateKey?: string, fallback?: string): string | undefined {
    const raw = String(templateKey || fallback || '').trim();
    if (!raw) return 'MBAX_TGO_11102567';
    const normalized = raw.split('::')[0].trim().toUpperCase();
    return normalized || 'MBAX_TGO_11102567';
  }
}

function slug(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]+/g, '');
}
