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
  evidenceType?: string | null;
  evidenceOther?: string | null;
  evidence: string;
  unit: string;
  fuelKey: string;
  otherType?: string | null;
  otherDieselPct?: number | null;
  otherBiodieselPct?: number | null;
  otherGasolinePct?: number | null;
  otherEthanolPct?: number | null;
  otherBiodieselDensityKgPerL?: number | null;
  otherEthanolDensityKgPerL?: number | null;
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
  efCatalog?: string;
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
  efCatalog?: string;
};

export type EfCatalogResponse = {
  ok: boolean;
  catalog?: string;
  options: EfCatalogOption[];
  warning?: string;
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
  locked_at?: string | null;
  locked_reason?: string | null;
};

export type DashboardSectionStatus = {
  hasData: boolean;
  missingEvidenceCount: number;
  missingEfCount: number;
  ok?: boolean;
};

export type DashboardSection = {
  sectionId: string;
  title: string;
  scope: string;
  status?: DashboardSectionStatus;
};

type DashboardSectionsResponse = {
  ok: boolean;
  sections: DashboardSection[];
};

export type ExportDownload = {
  blob: Blob;
  filename: string;
};

export type AttachmentLinkDto = {
  id: number;
  scope: string;
  recordId?: string | null;
};

export type AttachmentDto = {
  id: number;
  kind: string;
  original_name: string;
  mime: string;
  size: number;
  created_at?: string | null;
  links: AttachmentLinkDto[];
};

export type ListAttachmentsResponse = {
  ok: boolean;
  attachments: AttachmentDto[];
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

export type CycleValidationIssue = {
  scope?: string;
  rowId?: string;
  code?: string;
  message?: string;
  [key: string]: any;
};

export type CycleValidationResult = {
  ok: boolean;
  errors: Array<CycleValidationIssue>;
  warnings: Array<CycleValidationIssue>;
};

export type CycleLockResult = {
  ok: boolean;
  locked: boolean;
  locked_at?: string | null;
  message?: string;
  errors?: Array<CycleValidationIssue>;
  warnings?: Array<CycleValidationIssue>;
};

export type CycleSummary = {
  ok: boolean;
  cycleId: number;
  scopes: Array<{
    scope: string;
    tco2eMonths: Record<string, number>;
    totalTco2e: number;
  }>;
};

export type RecalcScope11Result = {
  ok: boolean;
  errors: Array<CycleValidationIssue>;
  results: Array<Record<string, any>>;
  summary: Record<string, any>;
};

/* =======================
 * Service
 * ======================= */

@Injectable({ providedIn: 'root' })
export class CycleApiService {
  private toApiClientPath(endpoint: string): string {
    const ep = String(endpoint || '').trim();
    if (!ep) return '';
    // strip origin (http(s)://host)
    const noOrigin = ep.replace(/^https?:\/\/[^/]+/i, '');
    // ensure leading slash for parsing then strip /api/
    const path = noOrigin.startsWith('/') ? noOrigin : '/' + noOrigin;
    const stripped = path.replace(/^\/api\//i, '/');
    // ApiClient expects relative like "cycles/.."
    return stripped.replace(/^\/+/, '');
  }

  /** map กันกรณี id เดิมหาย (404) แล้วถูกสร้างใหม่ */
  private missingIdMap = new Map<number, number>();

  constructor(private api: ApiClient) {}

  /* ---------- cycles ---------- */

  saveScope11StationaryItems(cycleId: number, items: Scope11StationaryItem[]): Promise<{ ok: boolean; saved?: number }> {
    return firstValueFrom(
      this.api.put<{ ok: boolean; saved?: number }>(`cycles/${cycleId}/scope11/stationary/items`, { items })
    );
  }

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

  getDashboardSections(cycleId: number): Promise<DashboardSection[]> {
    const request = this.api.get<DashboardSectionsResponse>(`cycles/${cycleId}/dashboard/sections`) as Observable<DashboardSectionsResponse>;
    return firstValueFrom(request).then(resp => resp?.sections ?? []);
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
    const path = this.toApiClientPath(endpoint);
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

  getEfCatalog(
    templateKey: string,
    catalog: 'AR5' | 'OTHER',
    scope = 'stationary'
  ): Promise<EfCatalogResponse> {
    const params = { templateKey, catalog, scope };
    const request = this.api.get<EfCatalogResponse>('ef/catalog', { params }) as Observable<EfCatalogResponse>;
    return firstValueFrom(request);
  }

  getCycleEfCatalog(
    cycleId: number,
    catalog: 'AR5' | 'AR5V2' | 'EF1',
    scope = 'stationary'
  ): Promise<EfCatalogResponse> {
    const params = { catalog, scope };
    const request = this.api.get<EfCatalogResponse>(`cycles/${cycleId}/ef/catalog`, { params }) as Observable<EfCatalogResponse>;
    return firstValueFrom(request);
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

  /* ---------- review / lock / summary ---------- */

  getValidations(cycleId: number): Promise<CycleValidationResult> {
    return firstValueFrom(
      this.api.get<CycleValidationResult>(`cycles/${cycleId}/validations`)
    );
  }

  lockCycle(cycleId: number, reason?: string): Promise<CycleLockResult> {
    return firstValueFrom(
      this.api.post<CycleLockResult>(`cycles/${cycleId}/lock`, { reason: reason ?? null })
    );
  }

  unlockCycle(cycleId: number): Promise<CycleLockResult> {
    return firstValueFrom(
      this.api.post<CycleLockResult>(`cycles/${cycleId}/unlock`, {})
    );
  }

  getSummary(cycleId: number): Promise<CycleSummary> {
    return firstValueFrom(
      this.api.get<CycleSummary>(`cycles/${cycleId}/summary`)
    );
  }

  recalcScope11(cycleId: number): Promise<RecalcScope11Result> {
    return firstValueFrom(
      this.api.post<RecalcScope11Result>(`cycles/${cycleId}/scope11/stationary/recalc`, {})
    );
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

  listAttachments(cycleId: number, filter?: { kind?: string | null; scope?: string | null }): Promise<ListAttachmentsResponse> {
    return firstValueFrom(
      this.api.get<ListAttachmentsResponse>(`cycles/${cycleId}/attachments`, {
        kind: filter?.kind ?? null,
        scope: filter?.scope ?? null,
      })
    );
  }

  linkAttachments(cycleId: number, attachmentIds: number[], scope: string, recordId?: string | null): Promise<{ ok: boolean; linked: number }> {
    return firstValueFrom(
      this.api.post<{ ok: boolean; linked: number }>(`cycles/${cycleId}/attachments/link`, {
        attachmentIds,
        scope,
        recordId: recordId ?? null,
      })
    );
  }

  unlinkAttachments(cycleId: number, attachmentIds: number[], scope: string, recordId?: string | null): Promise<{ ok: boolean; unlinked: number }> {
    return firstValueFrom(
      this.api.post<{ ok: boolean; unlinked: number }>(`cycles/${cycleId}/attachments/unlink`, {
        attachmentIds,
        scope,
        recordId: recordId ?? null,
      })
    );
  }

  async downloadAttachment(cycleId: number, attachmentId: number): Promise<ExportDownload> {
    const resp = await firstValueFrom(
      this.api.getBlob(`cycles/${cycleId}/attachments/${attachmentId}/download`)
    );
    const disposition = resp.headers?.get('content-disposition') ?? '';
    const filename = this.extractFilename(disposition) ?? `attachment_${attachmentId}`;
    return { blob: resp.body ?? new Blob(), filename };
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
