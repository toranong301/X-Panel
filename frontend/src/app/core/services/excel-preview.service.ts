import { HttpClient, HttpParams } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { CFO_SHEETS, CfoSheetConfig } from '../cfo-sheet.registry';
import { API_BASE_URL } from './api-base-url.token';



export interface ExcelPreviewResult {
  sheet: string;
  range: string;
  values: any[][]; // ตารางข้อมูลจาก backend
}

@Injectable({ providedIn: 'root' })
export class ExcelPreviewService {
  constructor(
    private http: HttpClient,
    @Inject(API_BASE_URL) private baseUrl: string
  ) {}

  /**
   * Preview generic (ใช้กับทุกชีต)
   */
  previewByConfig(
    cycleId: number,
    config: CfoSheetConfig
  ): Observable<ExcelPreviewResult> {
    const params = new HttpParams().set('sheetId', config.sheetId);

    const base = String(this.baseUrl || '/api').replace(/\/+$/, '');
    return this.http
      .get<ExcelPreviewResult>(`${base}/cycles/${cycleId}/preview`, { params })
      .pipe(
        catchError(err => {
          if (err?.status === 400 || err?.status === 422) {
            return throwError(() => ({
              type: 'INVALID_SHEET',
              message: `ไม่พบชีต "${config.label}" ใน Excel Template`,
              originalError: err,
            }));
          }

          return throwError(() => err);
        })
      );
  }

  /**
   * Helper: Scope 1.1 Stationary Combustion
   */
  previewScope1Stationary(cycleId: number): Observable<ExcelPreviewResult> {
    return this.previewByConfig(cycleId, CFO_SHEETS['SCOPE1_STATIONARY']);
  }
}
