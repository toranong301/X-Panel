import { Injectable } from '@angular/core';
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from '../../utils/safe-storage';
import { Fr031Data } from '../../models/fr03-1.model';

@Injectable({ providedIn: 'root' })
export class Fr031Service {
  private key(cycleId: number) {
    return `xpanel:fr03_1:${cycleId}`;
  }

  load(cycleId: number): Fr031Data | null {
    const raw = safeLocalStorageGet(this.key(cycleId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Fr031Data;
    } catch {
      return null;
    }
  }

  save(cycleId: number, data: Fr031Data): void {
    safeLocalStorageSet(this.key(cycleId), JSON.stringify(data));
  }

  clear(cycleId: number): void {
    safeLocalStorageRemove(this.key(cycleId));
  }
}
