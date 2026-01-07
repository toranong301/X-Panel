import { Injectable } from '@angular/core';
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from '../../utils/safe-storage';
import { Fr01Data } from '../../models/fr01.model';

@Injectable({ providedIn: 'root' })
export class Fr01Service {
  private key(cycleId: number) {
    return `xpanel:fr01:${cycleId}`;
  }

  load(cycleId: number): Fr01Data | null {
    const raw = safeLocalStorageGet(this.key(cycleId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Fr01Data;
    } catch {
      return null;
    }
  }

  save(cycleId: number, data: Fr01Data): void {
    safeLocalStorageSet(this.key(cycleId), JSON.stringify(data));
  }

  clear(cycleId: number): void {
    safeLocalStorageRemove(this.key(cycleId));
  }
}
