import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export type Query = Record<string, string | number | boolean | null | undefined>;

export type ApiGetOptions = {
  /** params แบบ map หรือ HttpParams */
  params?: Record<string, any> | HttpParams;
  /** AbortSignal (ถ้า HttpClient backend รองรับ) */
  signal?: AbortSignal;
  /** header เพิ่มเติม */
  headers?: Record<string, string>;
};

@Injectable({ providedIn: 'root' })
export class ApiClient {
  /**
   * DEV: '/api' (ผ่าน proxy)
   * PROD: 'https://api.test-demo-platform-cfo.ecoxpanel.com/api'
   */
  private readonly baseUrl = (environment.apiBaseUrl || '/api').replace(/\/+$/, '');

  constructor(private http: HttpClient) {}

  private buildHeaders(extra?: Record<string, string>) {
    let headers = new HttpHeaders(extra ?? {});
    if (environment.apiKey && environment.apiKey.trim().length > 0) {
      headers = headers.set('X-API-KEY', environment.apiKey.trim());
    }
    return headers;
  }

  private buildParamsFromRecord(rec?: Record<string, any>) {
    let params = new HttpParams();
    if (!rec) return params;
    for (const [k, v] of Object.entries(rec)) {
      if (v === null || v === undefined) continue;
      params = params.set(k, String(v));
    }
    return params;
  }

  private makeUrl(path: string) {
    const p = String(path || '').replace(/^\/+/, '');
    return `${this.baseUrl}/${p}`;
  }

  // -------- GET (รองรับ 2 รูปแบบ) --------
  get<T>(path: string, query?: Query, extraHeaders?: Record<string, string>): any;
  get<T>(path: string, options?: ApiGetOptions): any;
  get<T>(path: string, arg2?: any, arg3?: any) {
    const url = this.makeUrl(path);

    // รูปแบบ 1: get(path, { params, signal, headers })
    if (arg2 && (typeof arg2 === 'object') && ('params' in arg2 || 'signal' in arg2 || 'headers' in arg2)) {
      const opts = arg2 as ApiGetOptions;

      const params =
        opts.params instanceof HttpParams
          ? opts.params
          : this.buildParamsFromRecord(opts.params as Record<string, any> | undefined);

      // หมายเหตุ: signal จะส่งต่อแบบ any เพื่อให้เข้ากับ type ของ HttpClient ในแต่ละเวอร์ชัน
      return this.http.get<T>(url, {
        headers: this.buildHeaders(opts.headers),
        params,
        ...(opts.signal ? ({ signal: opts.signal } as any) : {}),
      });
    }

    // รูปแบบ 2: get(path, queryMap, extraHeaders)
    const query = (arg2 as Query | undefined) ?? undefined;
    const extraHeaders = (arg3 as Record<string, string> | undefined) ?? undefined;

    return this.http.get<T>(url, {
      headers: this.buildHeaders(extraHeaders),
      params: this.buildParamsFromRecord(query as any),
    });
  }

  // -------- POST / PUT / DELETE --------
  post<T>(path: string, body: any, extraHeaders?: Record<string, string>) {
    const url = this.makeUrl(path);
    return this.http.post<T>(url, body, { headers: this.buildHeaders(extraHeaders) });
  }

  put<T>(path: string, body: any, extraHeaders?: Record<string, string>) {
    const url = this.makeUrl(path);
    return this.http.put<T>(url, body, { headers: this.buildHeaders(extraHeaders) });
  }

  delete<T>(path: string, extraHeaders?: Record<string, string>) {
    const url = this.makeUrl(path);
    return this.http.delete<T>(url, { headers: this.buildHeaders(extraHeaders) });
  }
}
