import { Injectable } from '@angular/core';
import { VSheetDataDoc } from '../vsheet/vsheet.schema';
import { EvidenceModel } from '../../models/evidence.model';
import { EntryRow } from '../../models/entry-row.model';
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from '../../utils/safe-storage';

export interface DataEntryDoc {
  cycleId: number;
  scope1: EntryRow[];
  scope2: EntryRow[];
  scope3: EntryRow[];
  fr041Selection?: any[];
  efViewOptions?: any[];
  scope11HeaderMonths?: Record<string, number | null>;
  scope11PeriodYear?: number | null;
  cfoFixed?: VSheetDataDoc['cfoFixed'];
  subsheets?: VSheetDataDoc['subsheets'];
  evidence?: Record<string, EvidenceModel>;
}

@Injectable({ providedIn: 'root' })
export class DataEntryService {
  private key(cycleId: number) {
    return `xpanel:data-entry:${cycleId}`;
  }

  load(cycleId: number): DataEntryDoc | null {
    const raw = safeLocalStorageGet(this.key(cycleId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DataEntryDoc;
    } catch {
      return null;
    }
  }

  save(cycleId: number, doc: DataEntryDoc): void {
    safeLocalStorageSet(this.key(cycleId), JSON.stringify(doc));
  }

  loadVSheet(cycleId: number): VSheetDataDoc {
    const doc = this.load(cycleId);
    return {
      cfoFixed: doc?.cfoFixed ?? {},
      subsheets: doc?.subsheets ?? {},
    };
  }

  saveVSheet(cycleId: number, vsheet: VSheetDataDoc): void {
    const existing = this.load(cycleId) ?? {
      cycleId,
      scope1: [],
      scope2: [],
      scope3: [],
    };

    this.save(cycleId, {
      ...existing,
      cfoFixed: vsheet.cfoFixed ?? {},
      subsheets: vsheet.subsheets ?? {},
    });
  }

  clear(cycleId: number): void {
    safeLocalStorageRemove(this.key(cycleId));
  }
}
