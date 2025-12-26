import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiClient } from './api-client.service';
import { CanonicalCycleData } from './canonical-ghg.service';

export type CycleDto = {
  id: number;
  year: number;
  name: string;
  data_json?: any;
};

export type ExportDto = {
  id: number;
  cycle_id: number;
  status: string;
  file_path?: string | null;
  download_url?: string | null;
  error_message?: string | null;
};

@Injectable({ providedIn: 'root' })
export class CycleApiService {
  constructor(private api: ApiClient) {}

  createCycle(payload: { year: number; name: string }) {
    return firstValueFrom(this.api.post<CycleDto>('cycles', payload));
  }

  getCycle(id: number) {
    return firstValueFrom(this.api.get<CycleDto>(`cycles/${id}`));
  }

  updateCycleData(id: number, data: CanonicalCycleData | Record<string, any>) {
    return firstValueFrom(this.api.put<{ updated: boolean }>(`cycles/${id}/data`, { data }));
  }

  uploadAttachment(id: number, kind: string, file: File) {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);
    return firstValueFrom(this.api.post<{ id: number }>(`cycles/${id}/attachments`, form));
  }

  exportCycle(id: number) {
    return firstValueFrom(this.api.post<ExportDto>(`cycles/${id}/export`, {}));
  }

  getExport(id: number) {
    return firstValueFrom(this.api.get<ExportDto>(`exports/${id}`));
  }
}
