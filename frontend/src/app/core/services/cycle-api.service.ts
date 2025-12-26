import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiClient } from './api-client.service';
import { CanonicalCycleData } from '../../models/canonical-cycle.model';

/* =======================
 * Types
 * ======================= */

export interface Cycle {
  id: number;
  year?: number;
  name?: string;
}

export type CycleDto = {
  id: number;
  year: number;
  name: string;
  data_json?: any;
};

export type ExportDto = {
  id: number;
  cycle_id: number;
  status: string;
  file_path?: string | null;
  download_url?: string | null;
  error_message?: string | null;
};

export type CycleUpdateResult = {
  updated: boolean;
  cycleId: number;
  created?: boolean;
};

/* =======================
 * Service
 * ======================= */

@Injectable({ providedIn: 'root' })
export class CycleApiService {
  /** map กันกรณี id เดิมหาย (404) แล้วถูกสร้างใหม่ */
  private missingIdMap = new Map<number, number>();

  constructor(private api: ApiClient) {}

  /* ---------- cycles ---------- */

  listCycles(): Promise<Cycle[]> {
    return firstValueFrom(
      this.api.get<Cycle[]>('cycles')
    );
  }

  createCycle(payload: { year: number; name: string }): Promise<CycleDto> {
    return firstValueFrom(
      this.api.post<CycleDto>('cycles', payload)
    );
  }

  getCycle(id: number): Promise<CycleDto> {
    return firstValueFrom(
      this.api.get<CycleDto>(`cycles/${id}`)
    );
  }

  /* ---------- update data (auto-create + retry) ---------- */

  async updateCycleData(
    id: number,
    data: CanonicalCycleData | Record<string, any>
  ): Promise<CycleUpdateResult> {

    const resolvedId = await this.resolveCycleId(id);

    try {
      await firstValueFrom(
        this.api.put<{ updated: boolean }>(
          `cycles/${resolvedId}/data`,
          { data }
        )
      );
      return { updated: true, cycleId: resolvedId };

    } catch (error: any) {
      if (this.isNotFound(error)) {
        const created = await this.createDemoCycle();

        if (Number.isFinite(id) && id > 0) {
          this.missingIdMap.set(id, created.id);
        }

        await firstValueFrom(
          this.api.put<{ updated: boolean }>(
            `cycles/${created.id}/data`,
            { data }
          )
        );

        return { updated: true, cycleId: created.id, created: true };
      }

      throw error;
    }
  }

  /* ---------- attachments ---------- */

  uploadAttachment(id: number, kind: string, file: File) {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);

    return firstValueFrom(
      this.api.post<{ id: number }>(
        `cycles/${id}/attachments`,
        form
      )
    );
  }

  /* ---------- export ---------- */

  exportCycle(id: number): Promise<ExportDto> {
    return firstValueFrom(
      this.api.post<ExportDto>(`cycles/${id}/export`, {})
    );
  }

  getExport(id: number): Promise<ExportDto> {
    return firstValueFrom(
      this.api.get<ExportDto>(`exports/${id}`)
    );
  }

  /* =======================
   * helpers
   * ======================= */

  private async resolveCycleId(id: number): Promise<number> {
    if (Number.isFinite(id) && id > 0) {
      const mapped = this.missingIdMap.get(id);
      return mapped ?? id;
    }

    const created = await this.createDemoCycle();
    return created.id;
  }

  private async createDemoCycle(): Promise<CycleDto> {
    const year = new Date().getFullYear();
    return this.createCycle({ year, name: 'Demo Cycle' });
  }

  private isNotFound(error: any): boolean {
    return Number(error?.status) === 404;
  }
}
