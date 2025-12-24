import { Injectable } from '@angular/core';
import { EntryRow } from '../../models/entry-row.model';

export interface DataEntryDoc {
  cycleId: number;
  scope1: EntryRow[];
  scope2: EntryRow[];
  scope3: EntryRow[];
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
      return JSON.parse(raw) as DataEntryDoc;
    } catch {
      return null;
    }
  }

  save(cycleId: number, doc: DataEntryDoc): void {
    localStorage.setItem(this.key(cycleId), JSON.stringify(doc));
  }

  clear(cycleId: number): void {
    localStorage.removeItem(this.key(cycleId));
  }
}
