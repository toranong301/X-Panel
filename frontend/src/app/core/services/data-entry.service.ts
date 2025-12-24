import { Injectable } from '@angular/core';
import { EntryRow } from '../../models/entry-row.model';

export interface DataEntryDoc {
  cycleId: number;
  scope1: EntryRow[];
  scope2: EntryRow[];
  scope3: EntryRow[];
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class DataEntryService {
  private key(cycleId: number) {
    return `xpanel:data-entry:${cycleId}`;
  }

  load(cycleId: number): DataEntryDoc | null {
    const raw = localStorage.getItem(this.key(cycleId));
    if (!raw) return null;

    try {
      const doc = JSON.parse(raw) as DataEntryDoc;
      return {
        cycleId,
        scope1: Array.isArray(doc.scope1) ? doc.scope1 : [],
        scope2: Array.isArray(doc.scope2) ? doc.scope2 : [],
        scope3: Array.isArray(doc.scope3) ? doc.scope3 : [],
        updatedAt: doc.updatedAt,
      };
    } catch {
      return null;
    }
  }

  save(cycleId: number, doc: Omit<DataEntryDoc, 'cycleId'>): void {
    const payload: DataEntryDoc = {
      cycleId,
      scope1: doc.scope1 ?? [],
      scope2: doc.scope2 ?? [],
      scope3: doc.scope3 ?? [],
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(this.key(cycleId), JSON.stringify(payload));
  }

  clear(cycleId: number): void {
    localStorage.removeItem(this.key(cycleId));
  }
}
