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

export type ExportDownload = {
  blob: Blob;
  filename: string;
};

export type Scope11PreviewResult = {
  ok: boolean;
  splitEnabled: boolean;
  periodYear?: number | null;
  headerMonths?: Record<string, number | null>;
  itemsPreview: Array<{
    rowId: string;
    label: string;
    evidence: string;
    unit: string;
    months: Record<string, any>;
    total: number | null;
  }>;
  unknown_rowIds?: string[];
  warnings?: Record<string, any>;
  splitRows?: Array<{
    itemLabel: string;
    fuelKey: string;
    evidence: string;
    unit: string;
    total: number | null;
    dieselL: number | null;
    biodieselL: number | null;
    biodieselKg: number | null;
    gasolineL: number | null;
    ethanolL: number | null;
    ethanolKg: number | null;
  }>;
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
  previewVersion?: string | null;
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
      const resp = await firstValueFrom(
        this.api.put<{ updated: boolean; previewVersion?: string | null }>(
          `cycles/${resolvedId}/data`,
          { data }
        )
      );
      return { updated: true, cycleId: resolvedId, previewVersion: resp?.previewVersion ?? null };

    } catch (error: any) {
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

  async exportCycle(id: number): Promise<ExportDownload> {
    const resp = await firstValueFrom(
      this.api.postBlob(`cycles/${id}/export`, {})
    );
    const disposition = resp.headers?.get('content-disposition') ?? '';
    const filename = this.extractFilename(disposition) ?? `export_${id}.xlsx`;
    return { blob: resp.body ?? new Blob(), filename };
  }

  async exportScope11Preview(payload: Record<string, any>): Promise<ExportDownload> {
    const resp = await firstValueFrom(
      this.api.postBlob('exports/scope11/preview', payload)
    );
    const disposition = resp.headers?.get('content-disposition') ?? '';
    const filename = this.extractFilename(disposition) ?? 'SCOPE11_PREVIEW.xlsx';
    return { blob: resp.body ?? new Blob(), filename };
  }

  async exportScope11Xlsx(payload: Record<string, any>): Promise<ExportDownload> {
    const resp = await firstValueFrom(
      this.api.postBlob('exports/scope11/xlsx', payload)
    );
    const disposition = resp.headers?.get('content-disposition') ?? '';
    const filename = this.extractFilename(disposition) ?? 'SCOPE11_EXPORT.xlsx';
    return { blob: resp.body ?? new Blob(), filename };
  }

  async previewScope11Json(payload: Record<string, any>): Promise<Scope11PreviewResult> {
    return firstValueFrom(
      this.api.post<Scope11PreviewResult>('exports/scope11/preview-json', payload)
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

    throw new Error('Missing cycleId');
  }

  private async createDemoCycle(): Promise<CycleDto> {
    const year = new Date().getFullYear();
    return this.createCycle({ year, name: 'Demo Cycle' });
  }

  private isNotFound(error: any): boolean {
    return Number(error?.status) === 404;
  }

  private extractFilename(disposition: string): string | null {
    if (!disposition) return null;
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1].replace(/["']/g, ''));
    }
    const match = disposition.match(/filename=([^;]+)/i);
    if (match?.[1]) {
      return match[1].replace(/["']/g, '').trim();
    }
    return null;
  }
}
