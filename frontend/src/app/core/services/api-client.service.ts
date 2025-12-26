import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

type Query = Record<string, string | number | boolean | null | undefined>;

@Injectable({ providedIn: 'root' })
export class ApiClient {
  /**
   * DEV: '/api' (ผ่าน Angular proxy → http://127.0.0.1:8000)
   * PROD: 'https://api.test-demo-platform-cfo.ecoxpanel.com/api'
   */
  private readonly baseUrl = (environment.apiBaseUrl || '/api').replace(/\/+$/, '');

  constructor(private http: HttpClient) {}

  private buildHeaders(extra?: Record<string, string>) {
    let headers = new HttpHeaders(extra ?? {});
    // ส่ง API key ทุกครั้งถ้ามี
    if (environment.apiKey && environment.apiKey.trim().length > 0) {
      headers = headers.set('X-API-KEY', environment.apiKey.trim());
    }
    return headers;
  }

  private buildParams(query?: Query) {
    let params = new HttpParams();
    if (!query) return params;

    for (const [k, v] of Object.entries(query)) {
      if (v === null || v === undefined) continue;
      params = params.set(k, String(v));
    }
    return params;
  }

  /** ใช้กับ path แบบ 'cycles/1' (ไม่ต้องใส่ /api) */
  get<T>(path: string, query?: Query, extraHeaders?: Record<string, string>) {
    const url = this.makeUrl(path);
    return this.http.get<T>(url, {
      headers: this.buildHeaders(extraHeaders),
      params: this.buildParams(query),
    });
  }

  post<T>(path: string, body: any, extraHeaders?: Record<string, string>) {
    const url = this.makeUrl(path);
    return this.http.post<T>(url, body, {
      headers: this.buildHeaders(extraHeaders),
    });
  }

  put<T>(path: string, body: any, extraHeaders?: Record<string, string>) {
    const url = this.makeUrl(path);
    return this.http.put<T>(url, body, {
      headers: this.buildHeaders(extraHeaders),
    });
  }

  delete<T>(path: string, extraHeaders?: Record<string, string>) {
    const url = this.makeUrl(path);
    return this.http.delete<T>(url, {
      headers: this.buildHeaders(extraHeaders),
    });
  }

  /** รวม baseUrl + path ให้ชัวร์ ไม่ซ้อน / */
  private makeUrl(path: string) {
    const p = String(path || '').replace(/^\/+/, '');
    return `${this.baseUrl}/${p}`;
  }
}
