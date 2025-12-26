import { Injectable } from '@angular/core';
import { catchError, firstValueFrom, throwError, timeout } from 'rxjs';

import { ApiClient } from '../../services/api-client.service';
import { CanonicalGhgService } from '../../services/canonical-ghg.service';
import { CycleApiService } from '../../services/cycle-api.service';
import { CycleStateService } from '../../services/cycle-state.service';
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
    private cycleState: CycleStateService,
  ) {}

  async loadSheet(params: {
    cycleId: number;
    templateKey: string;
    sheetName: string;
    range?: string;
    signal?: AbortSignal;
  }): Promise<SheetPreview> {
    const resolvedCycleId = params.cycleId > 0
      ? params.cycleId
      : await this.cycleState.getSelectedCycleId();
    const canonical = this.canonicalSvc.build(resolvedCycleId);
    const updateResult = await this.cycleApi.updateCycleData(resolvedCycleId, canonical);
    this.cycleState.setSelectedCycleId(updateResult.cycleId);

    const bundle = resolveTemplate(params.templateKey);
    const resolvedSheetName = (bundle.spec.sheets[params.sheetName]?.name ?? params.sheetName).trim();

    const paramsMap: Record<string, string> = {
      sheet: resolvedSheetName,
    };
    const trimmedRange = params.range?.trim();
    if (trimmedRange) paramsMap['range'] = trimmedRange;

    const request$ = this.api.get<SheetPreview>(`cycles/${updateResult.cycleId}/preview`, {
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
        const status = Number(err?.status);
        const message = err?.error?.message || err?.message;
        if (status === 404) {
          return throwError(() => new Error(message || 'Preview data not found.'));
        }
        if (status === 422) {
          return throwError(() => new Error(message || 'Invalid preview request.'));
        }
        if (status === 500) {
          return throwError(() => new Error(message || 'Preview failed. Please try again.'));
        }
        return throwError(() => err);
      }),
    );

    return firstValueFrom(request$);
  }
}
