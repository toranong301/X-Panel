import { Injectable } from '@angular/core';
import { safeLocalStorageGet, safeLocalStorageRemove, safeLocalStorageSet } from '../../utils/safe-storage';
import { Fr032SavedMap } from '../../models/fr03-2.model';

const LS_KEY = (cycleId: number) => `fr03-2:${cycleId}`;

@Injectable({ providedIn: 'root' })
export class Fr032Service {
  load(cycleId: number): Fr032SavedMap | null {
    try {
      const raw = safeLocalStorageGet(LS_KEY(cycleId));
      return raw ? (JSON.parse(raw) as Fr032SavedMap) : null;
    } catch {
      return null;
    }
  }

  save(cycleId: number, data: Fr032SavedMap) {
    safeLocalStorageSet(LS_KEY(cycleId), JSON.stringify(data));
  }

  clear(cycleId: number) {
    safeLocalStorageRemove(LS_KEY(cycleId));
  }
}
