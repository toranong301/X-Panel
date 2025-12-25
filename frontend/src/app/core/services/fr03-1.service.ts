import { Injectable } from '@angular/core';
import { Fr031Data } from '../../models/fr03-1.model';

@Injectable({ providedIn: 'root' })
export class Fr031Service {
  private key(cycleId: number) {
    return `xpanel:fr03_1:${cycleId}`;
  }

  load(cycleId: number): Fr031Data | null {
    const raw = localStorage.getItem(this.key(cycleId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Fr031Data;
    } catch {
      return null;
    }
  }

  save(cycleId: number, data: Fr031Data): void {
    localStorage.setItem(this.key(cycleId), JSON.stringify(data));
  }

  clear(cycleId: number): void {
    localStorage.removeItem(this.key(cycleId));
  }
}
