import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { CFO_SHEETS, CfoSheetConfig } from '../config/cfo-sheet.registry';

export interface ExcelPreviewResult {
  sheet: string;
  range: string;
  values: any[][]; // ตารางข้อมูลจาก backend
}

@Injectable({ providedIn: 'root' })
export class ExcelPreviewService {
  constructor(private http: HttpClient) {}

  /**
   * Preview generic (ใช้กับทุกชีต)
   */
  previewByConfig(
    cycleId: number,
    config: CfoSheetConfig
  ): Observable<ExcelPreviewResult> {
    const params = new HttpParams()
      .set('sheet', config.sheetName)
      .set('range', config.previewRange);

    return this.http
      .get<ExcelPreviewResult>(`/api/cycles/${cycleId}/preview`, { params })
      .pipe(
        catchError(err => {
          // 422 = sheet / range ไม่ตรง template
          if (err?.status === 422) {
            return throwError(() => ({
              type: 'INVALID_SHEET',
              message: `ไม่พบชีต "${config.sheetName}" ใน Excel Template`,
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
    return this.previewByConfig(cycleId, CFO_SHEETS.SCOPE1_STATIONARY);
  }
}
