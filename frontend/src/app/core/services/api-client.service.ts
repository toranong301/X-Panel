import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/+$/, '');

  constructor(private http: HttpClient) {}

  get<T>(path: string, options?: Record<string, any>) {
    return this.http.get<T>(this.resolve(path), options);
  }

  post<T>(path: string, body: any, options?: Record<string, any>) {
    return this.http.post<T>(this.resolve(path), body, options);
  }

  put<T>(path: string, body: any, options?: Record<string, any>) {
    return this.http.put<T>(this.resolve(path), body, options);
  }

  private resolve(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const clean = path.replace(/^\/+/, '');
    return `${this.baseUrl}/${clean}`;
  }
}
