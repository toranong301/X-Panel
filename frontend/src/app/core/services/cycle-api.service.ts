import { Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

import { CanonicalCycleData } from '../../models/canonical-cycle.model';
import { ApiClient } from './api-client.service';

/* =======================
 * Types
 * ======================= */

export interface Cycle {
  id: number;
  year?: number;
  name?: string;
  template_id?: string;
}

export interface TemplateInfo {
  id: string;
  label: string;
}

export interface TemplateSetInfo {
  id: string;
  label: string;
  templates?: string[];
}

export interface TemplatesResponse {
  templates: TemplateInfo[];
}

export interface TemplateSetsResponse {
  templateSets: TemplateSetInfo[];
}

export type Scope11StationaryItem = {
  rowId: string;
  itemLabel: string;
  evidence: string;
  unit: string;
  fuelKey: string;
  otherType?: string | null;
  months: Record<string, number | null>;
  total?: number | null;

  // added for FR-04.1 merged sources display
  sectionId?: string;
  sectionTitle?: string;
  scope?: string | null;
};



export type Scope11StationaryItemsResponse = {
  ok: boolean;
  splitEnabled: boolean;
  periodYear?: number | null;
  headerMonths?: Record<string, number | null>;
  items: Scope11StationaryItem[];
};

export type EfAr5Option = {
  efCatalog?: 'AR5' | 'OTHER';
  efId: string;
  Name?: string;
  Unit?: string;
  CO2?: any;
  'Fossil CH4'?: any;
  CH4?: any;
  N2O?: any;
  Total?: any;
  Source?: any;
  [key: string]: any;
};

type EfAr5Response = {
  ok: boolean;
  options: EfAr5Option[];
};

export type EfCatalogOption = EfAr5Option & {
  efCatalog?: 'AR5' | 'OTHER';
};

type EfCatalogResponse = {
  ok: boolean;
  catalog?: string;
  options: EfCatalogOption[];
};

export type Fr041Source = {
  sectionId: string;
  sectionTitle: string;
  sheetName: string;
  endpoint: string;
  scope?: string | null;
  sourceType?: string | null;
  itemCountIncluded?: number | null;
};

type Fr041SourcesResponse = {
  ok: boolean;
  sources: Fr041Source[];
};

export type Scope3SummaryCategory = {
  sectionId: string;
  title: string;
  hasData: boolean;
  itemCount: number;
  totalQty?: number | null;
  unitHint?: string | null;
};

type Scope3SummaryResponse = {
  ok: boolean;
  categories: Scope3SummaryCategory[];
};

export type Scope3ItemsResponse = {
  ok: boolean;
  sectionId: string;
  items: Array<{
    itemId: string;
    itemName: string;
    evidence: string;
    unit: string;
    qty: number | null;
    activityKey?: string;
  }>;
};

export type Fr032SelectionRow = {
  itemId?: string;
  itemName?: string;
  include: boolean;
  reason?: string;
  efCatalog?: string;
  efId?: string;
};

type Fr032SelectionResponse = {
  ok: boolean;
  sectionId: string;
  selections: Fr032SelectionRow[];
};

export type Fr041Config = {
  ok?: boolean;
  sheetId?: string;
  section?: string;
  selectedRowIds: string[];
  options?: Record<string, any>;
};

export type CycleDto = {
  id: number;
  year: number;
  name: string;
  data_json?: any;
  template_id?: string;
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

export type TemplateProfile = TemplateInfo & {
  uiFlags?: Record<string, any>;
  previewRanges?: Record<string, any>;
};

/* =======================
 * Service
 * ======================= */

@Injectable({ providedIn: 'root' })
export class CycleApiService {
  private normalizeApiEndpoint(endpoint: string): string {
  let ep = String(endpoint || '').trim();
  if (!ep) return '';

  // drop host if someone passed full URL
  ep = ep.replace(/^https?:\/\/[^/]+/i, '');

  // remove leading slashes
  ep = ep.replace(/^\/+/, '');

  // "/api/xxx" or "api/xxx" -> "xxx" (ApiClient already targets /api)
  if (ep.startsWith('api/')) ep = ep.substring(4);

  return ep;
}

  /** map กันกรณี id เดิมหาย (404) แล้วถูกสร้างใหม่ */
  private missingIdMap = new Map<number, number>();

  constructor(private api: ApiClient) {}

  /* ---------- cycles ---------- */

  listCycles(): Promise<Cycle[]> {
    return firstValueFrom(
      this.api.get<Cycle[]>('cycles')
    );
  }

  getTemplates(): Promise<TemplateInfo[]> {
    const request = this.api.get<TemplatesResponse>('templates') as unknown as Observable<TemplatesResponse>;
    return firstValueFrom(request).then((resp: TemplatesResponse | undefined) => resp?.templates ?? []);
  }

  listTemplates(): Promise<TemplateProfile[]> {
    return this.getTemplates().then(resp => resp as TemplateProfile[]);
  }

  getTemplateSets(): Promise<TemplateSetInfo[]> {
    const request = this.api.get<TemplateSetsResponse>('template-sets') as unknown as Observable<TemplateSetsResponse>;
    return firstValueFrom(request).then((resp: TemplateSetsResponse | undefined) => resp?.templateSets ?? []);
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

  updateCycleTemplate(id: number, templateId: string): Promise<{ updated: boolean; templateId: string }> {
    return firstValueFrom(
      this.api.put<{ updated: boolean; templateId: string }>(`cycles/${id}/template`, { templateId })
    );
  }

  getScope11StationaryItems(cycleId: number): Promise<Scope11StationaryItemsResponse> {
    return firstValueFrom(
      this.api.get<Scope11StationaryItemsResponse>(`cycles/${cycleId}/scope11/stationary/items`)
    );
  }

  async getFr041SourceItems(endpoint: string): Promise<any> {
  const path = this.normalizeApiEndpoint(endpoint);
  if (!path) throw new Error('Missing endpoint');
  return await firstValueFrom(this.api.get<any>(path));
}

  getScope3Summary(cycleId: number): Promise<Scope3SummaryCategory[]> {
    const request = this.api.get<Scope3SummaryResponse>(`cycles/${cycleId}/scope3/summary`) as Observable<Scope3SummaryResponse>;
    return firstValueFrom(request).then(resp => resp?.categories ?? []);
  }

  getScope3Items(cycleId: number, sectionId: string): Promise<Scope3ItemsResponse> {
    return firstValueFrom(
      this.api.get<Scope3ItemsResponse>(`cycles/${cycleId}/scope3/${sectionId}/items`)
    );
  }

  getFr032Selection(cycleId: number, sectionId: string): Promise<Fr032SelectionRow[]> {
    const request = this.api.get<Fr032SelectionResponse>(
      `cycles/${cycleId}/fr032/selection`,
      { params: { sectionId } }
    ) as Observable<Fr032SelectionResponse>;
    return firstValueFrom(request).then(resp => resp?.selections ?? []);
  }

  saveFr032Selection(cycleId: number, sectionId: string, selections: Fr032SelectionRow[]): Promise<Fr032SelectionRow[]> {
    const payload = { sectionId, selections };
    const request = this.api.post<Fr032SelectionResponse>(`cycles/${cycleId}/fr032/selection`, payload) as Observable<Fr032SelectionResponse>;
    return firstValueFrom(request).then(resp => resp?.selections ?? []);
  }

  getFr041Config(cycleId: number): Promise<Fr041Config> {
    return firstValueFrom(
      this.api.get<Fr041Config>(`cycles/${cycleId}/fr041/config`)
    );
  }

  getFr041Sources(cycleId: number): Promise<Fr041Source[]> {
    const request = this.api.get<Fr041SourcesResponse>(`cycles/${cycleId}/fr041/sources`) as Observable<Fr041SourcesResponse>;
    return firstValueFrom(request).then(resp => resp?.sources ?? []);
  }

  updateFr041Config(cycleId: number, payload: { selectedRowIds: string[]; options?: Record<string, any> }): Promise<Fr041Config> {
    return firstValueFrom(
      this.api.put<Fr041Config>(`cycles/${cycleId}/fr041/config`, payload)
    );
  }

  getEfAr5Options(templateKey: string, section = 'stationary'): Promise<EfAr5Option[]> {
    const params = { templateKey, section };
    const request = this.api.get<EfAr5Response>('ef/ar5', { params }) as Observable<EfAr5Response>;
    return firstValueFrom(request).then(resp => resp?.options ?? []);
  }

  getEfCatalog(templateKey: string, catalog: 'AR5' | 'OTHER', scope = 'stationary'): Promise<EfCatalogOption[]> {
    const params = { templateKey, catalog, scope };
    const request = this.api.get<EfCatalogResponse>('ef/catalog', { params }) as Observable<EfCatalogResponse>;
    return firstValueFrom(request).then(resp => resp?.options ?? []);
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
