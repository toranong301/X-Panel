import { Injectable } from '@angular/core';
import { Fr02Data } from '../../models/fr02.model';

@Injectable({ providedIn: 'root' })
export class Fr02Service {
  private key(cycleId: number) {
    return `xpanel:fr02:${cycleId}`;
  }

  load(cycleId: number): Fr02Data | null {
    const raw = localStorage.getItem(this.key(cycleId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Fr02Data;
    } catch {
      return null;
    }
  }

  save(cycleId: number, data: Fr02Data) {
    localStorage.setItem(this.key(cycleId), JSON.stringify(data));
  }

  clear(cycleId: number) {
    localStorage.removeItem(this.key(cycleId));
  }
}
