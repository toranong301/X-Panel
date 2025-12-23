import { Injectable } from '@angular/core';
import { Fr032SavedMap } from '../../models/fr03-2.model';

const LS_KEY = (cycleId: number) => `fr03-2:${cycleId}`;

@Injectable({ providedIn: 'root' })
export class Fr032Service {
  load(cycleId: number): Fr032SavedMap | null {
    try {
      const raw = localStorage.getItem(LS_KEY(cycleId));
      return raw ? (JSON.parse(raw) as Fr032SavedMap) : null;
    } catch {
      return null;
    }
  }

  save(cycleId: number, data: Fr032SavedMap) {
    localStorage.setItem(LS_KEY(cycleId), JSON.stringify(data));
  }

  clear(cycleId: number) {
    localStorage.removeItem(LS_KEY(cycleId));
  }
}
