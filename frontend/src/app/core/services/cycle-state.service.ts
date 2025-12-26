import { Injectable } from '@angular/core';

import { CycleApiService } from './cycle-api.service';

@Injectable({ providedIn: 'root' })
export class CycleStateService {
  private readonly selectedKey = 'xpanel:selected-cycle-id';

  constructor(private cycleApi: CycleApiService) {}

  async resolveCycleId(preferredId?: number): Promise<number> {
    const cycles = await this.cycleApi.listCycles();
    if (Number.isFinite(preferredId) && (preferredId as number) > 0) {
      const match = cycles.find(c => c.id === preferredId);
      if (match) {
        this.setSelectedCycleId(match.id);
        return match.id;
      }
    }

    const stored = this.readSelectedCycleId();
    if (stored) {
      const match = cycles.find(c => c.id === stored);
      if (match) return stored;
    }

    const created = await this.createDemoCycle();
    return created;
  }

  async getSelectedCycleId(): Promise<number> {
    const cached = this.readSelectedCycleId();
    if (cached) return cached;
    const created = await this.createDemoCycle();
    return created;
  }

  setSelectedCycleId(id: number): void {
    if (typeof localStorage === 'undefined') return;
    if (Number.isFinite(id) && id > 0) {
      localStorage.setItem(this.selectedKey, String(id));
    }
  }

  private readSelectedCycleId(): number | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(this.selectedKey);
    const id = raw ? Number(raw) : NaN;
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  private async createDemoCycle(): Promise<number> {
    const year = new Date().getFullYear();
    const created = await this.cycleApi.createCycle({ year, name: 'Demo Cycle' });
    this.setSelectedCycleId(created.id);
    return created.id;
  }
}
