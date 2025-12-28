import { Injectable } from '@angular/core';

import { Cycle, CycleApiService } from './cycle-api.service';

@Injectable({ providedIn: 'root' })
export class CycleStateService {
  private readonly selectedKey = 'xpanel:selected-cycle-id';

  constructor(private cycleApi: CycleApiService) {}

  /**
   * resolve cycleId จากลำดับ:
   * 1) preferredId (ถ้ามีและยังอยู่จริง)
   * 2) localStorage
   * 3) create demo cycle ใหม่
   */
  async resolveCycleId(preferredId?: number): Promise<number> {
    // 1) preferredId (trust route/state, do not auto-create)
    if (Number.isFinite(preferredId) && (preferredId as number) > 0) {
      this.setSelectedCycleId(preferredId as number);
      return preferredId as number;
    }

    // 2) localStorage (use last known id even if API is down)
    const stored = this.readSelectedCycleId();
    if (stored) return stored;

    return 0;
  }

  /**
   * ใช้ทั่วไปในหน้า UI
   * ได้ cycleId ที่ "มีจริงเสมอ"
   */
  async getSelectedCycleId(): Promise<number> {
    const cached = this.readSelectedCycleId();
    if (cached) return cached;
    return 0;
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
    const created = await this.cycleApi.createCycle({
      year,
      name: 'Demo Cycle',
    });
    this.setSelectedCycleId(created.id);
    return created.id;
  }

  private async safeListCycles(): Promise<Cycle[]> {
    try {
      return await this.cycleApi.listCycles();
    } catch (error) {
      console.warn('Failed to load cycles list', error);
      return [];
    }
  }
}
