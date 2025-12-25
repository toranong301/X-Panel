import { Injectable } from '@angular/core';

import { EvidenceModel } from '../../models/evidence.model';
import { EntryRow } from '../../models/entry-row.model';
import { InventoryItemRow, Scope3SignificanceRow } from '../../models/refs.model';
import { Scope3ItemRow } from '../../models/scope3-summary.model';
import { Fr01Data } from '../../models/fr01.model';

import { VSheetDataDoc } from '../vsheet/vsheet.schema';
import { DataEntryService } from './data-entry.service';
import { Fr01Service } from './fr01.service';
import { Fr032Service } from './fr03-2.service';
import { Scope3SummaryService } from './scope3-summary.service';

export interface Fr032CanonicalRow extends Scope3SignificanceRow {
  isoNo: string;
}

export interface CanonicalCycleData {
  inventory: InventoryItemRow[];
  fr03_2: Fr032CanonicalRow[];
  vsheet: VSheetDataDoc;
  evidence?: Record<string, EvidenceModel>;
  fr01?: Fr01Data | null;
}

@Injectable({ providedIn: 'root' })
export class CanonicalGhgService {
  constructor(
    private scope3Svc: Scope3SummaryService,
    private fr032Svc: Fr032Service,
    private entrySvc: DataEntryService,
    private fr01Svc: Fr01Service,
  ) {}

  /**
   * Build canonical datasets for export.
   * - Scope 3 comes from Scope3Screen store.
   * - Scope 1.1/1.2 comes from DataEntryService (localStorage).
   */
  build(cycleId: number): CanonicalCycleData {
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

    const fr01 = this.fr01Svc.load(cycleId);
    return { inventory, fr03_2, vsheet, evidence: entryDoc?.evidence ?? {}, fr01 };
  }

  public buildCanonicalForCycle(cycleId: number): CanonicalCycleData {
    return this.build(cycleId);
  }

  // ✅ Scope 1.1 + 1.2: สร้าง InventoryItemRow ที่มี quantityMonthly + fuelKey + slotNo
  private buildScope1Inventory(cycleId: number): InventoryItemRow[] {
    const doc = this.entrySvc.load(cycleId);
    const rows = (doc?.scope1 ?? []).filter(r => r.scope === 'S1');

    return rows
      .filter(r =>
        r.categoryCode === '1.1' ||
        r.categoryCode === '1.2' ||
        r.categoryCode === '1.4.2' ||
        r.categoryCode === '1.4.3' ||
        r.categoryCode === '1.4.4' ||
        r.categoryCode === '1.4.5',
      )
      .map(r => this.mapEntryRowToInventory(r, 1));
  }

  private buildScope2Inventory(_cycleId: number): InventoryItemRow[] {
    return []; // ยังไม่ทำในงานนี้
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
      r.categoryCode;
    const standard = r.categoryCode === '1.4.5' ? String(r.remark ?? '').trim() : '';
    const remark =
      r.categoryCode === '1.4.5'
        ? [r.location ?? '', standard ? `standard=${standard}` : ''].filter(Boolean).join(' | ')
        : r.categoryCode === '1.4.4'
          ? (r.location ?? r.itemName ?? '')
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

      fuelKey,
      quantityMonthly: monthly,
      slotNo,
    };
  }

  private toMonthlyArray(months: { month: number; qty: number }[]): number[] {
    const out = Array.from({ length: 12 }, () => 0);
    for (const m of months || []) {
      const idx = Number(m.month) - 1;
      if (idx >= 0 && idx < 12) out[idx] = Number((m as any).qty || 0);
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
    const fuelKey = String(k || '').trim();
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
}

function slug(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]+/g, '');
}
