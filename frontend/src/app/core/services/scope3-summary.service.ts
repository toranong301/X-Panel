import { Injectable } from '@angular/core';
import { safeLocalStorageGet, safeLocalStorageSet } from '../../utils/safe-storage';
import { Scope3ItemRow, Scope3SummaryStore } from '../../models/scope3-summary.model';

@Injectable({ providedIn: 'root' })
export class Scope3SummaryService {
  private key(cycleId: number) {
    return `ghg.scope3.summary.v1.cycle.${cycleId}`;
  }

  private num(v: any, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  private str(v: any, fallback = '') {
    return v === null || v === undefined ? fallback : String(v);
  }

  /** แปลงข้อมูลเก่า/ข้อมูลที่ field ชื่อไม่ตรง ให้กลับมาเป็น shape ปัจจุบัน */
  private normalizeRow(raw: any): Scope3ItemRow {
    const categoryLabel = this.str(raw?.categoryLabel ?? raw?.catLabel ?? '');
    const itemLabel = this.str(raw?.itemLabel ?? raw?.itemName ?? raw?.category ?? '');

    const r: Scope3ItemRow = {
      type: 'item',
      tgoNo: this.str(raw?.tgoNo ?? ''),
      scopeIso: this.str(raw?.scopeIso ?? raw?.isoScope ?? ''),
      categoryLabel,
      order: this.num(raw?.order ?? 0),

      itemLabel,
      unit: this.str(raw?.unit ?? ''),
      quantityPerYear: this.num(raw?.quantityPerYear ?? raw?.quantity ?? 0),

      remark: raw?.remark ?? '',
      dataEvidence: raw?.dataEvidence ?? raw?.dataRef ?? '',
      ef: this.num(raw?.ef ?? raw?.emissionFactor ?? 0),
      efEvidence: raw?.efEvidence ?? raw?.efRef ?? '',

      // computed (อาจมีติดมาจากเก่า)
      totalTco2e: raw?.totalTco2e ?? raw?.ghgTco2e ?? undefined,
      sharePct: raw?.sharePct ?? raw?.pct ?? undefined,

      // refs (ถ้ามี)
      refs: raw?.refs ?? undefined,
    };

    // เติม compat fields ให้จบในตัว
    r.catLabel = r.categoryLabel;
    r.itemName = r.itemLabel;
    r.ghgTco2e = r.totalTco2e;
    r.pct = r.sharePct;

    return r;
  }

  load(cycleId: number): Scope3SummaryStore | null {
    try {
      const raw = safeLocalStorageGet(this.key(cycleId));
      if (!raw) return null;

      const doc = JSON.parse(raw) as Scope3SummaryStore;
      if (!doc?.rows || !Array.isArray(doc.rows)) return null;

      doc.rows = doc.rows.map(r => this.normalizeRow(r));
      return doc;
    } catch {
      return null;
    }
  }

  save(cycleId: number, rows: Scope3ItemRow[]) {
    const normalized = rows.map(r => this.normalizeRow(r));

    const payload: Scope3SummaryStore = {
      rows: normalized,
      updatedAt: new Date().toISOString(),
    };
    safeLocalStorageSet(this.key(cycleId), JSON.stringify(payload));
  }

  // ===== MOCK ตามตารางใหม่ =====
  getMockRows(_cycleId: number): Scope3ItemRow[] {
    return [];
  }
}

