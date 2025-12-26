import { Injectable } from '@angular/core';
import { catchError, firstValueFrom, throwError, timeout } from 'rxjs';

import { ApiClient } from '../../services/api-client.service';
import { CanonicalGhgService } from '../../services/canonical-ghg.service';
import { CycleApiService } from '../../services/cycle-api.service';
import { resolveTemplate } from '../registry/template-registry';

export type SheetPreviewCell = {
  display: string;
  type: 'text' | 'number' | 'formula';
};

export type SheetPreviewRow = {
  rowNumber: number;
  cells: SheetPreviewCell[];
};

export type SheetPreview = {
  sheetName: string;
  columns: string[];
  rows: SheetPreviewRow[];
  range: string;
};

@Injectable({ providedIn: 'root' })
export class ExcelPreviewService {
  private readonly PREVIEW_TIMEOUT_MS = 15000;

  constructor(
    private api: ApiClient,
    private canonicalSvc: CanonicalGhgService,
    private cycleApi: CycleApiService,
  ) {}

  async loadSheet(params: {
    cycleId: number;
    templateKey: string;
    sheetName: string;
    range?: string;
    signal?: AbortSignal;
  }): Promise<SheetPreview> {
    const canonical = this.canonicalSvc.build(params.cycleId);
    await this.cycleApi.updateCycleData(params.cycleId, canonical);

    const bundle = resolveTemplate(params.templateKey);
    const resolvedSheetName = bundle.spec.sheets[params.sheetName]?.name ?? params.sheetName;

    const paramsMap: Record<string, string> = {
      sheet: resolvedSheetName,
    };
    if (params.range) paramsMap['range'] = params.range;

    const request$ = this.api.get<SheetPreview>(`cycles/${params.cycleId}/preview`, {
      params: paramsMap,
      signal: params.signal,
    }).pipe(
      timeout({ first: this.PREVIEW_TIMEOUT_MS }),
      catchError(err => {
        if (err?.name === 'TimeoutError') {
          return throwError(() => new Error('Preview timed out. Please try again.'));
        }
        if (err?.name === 'AbortError') {
          return throwError(() => new Error('Preview cancelled.'));
        }
        return throwError(() => err);
      }),
    );

    return firstValueFrom(request$);
  }
}
