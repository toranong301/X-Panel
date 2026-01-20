import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';

import { CycleApiService } from '../../../core/services/cycle-api.service';
import { CycleStateService } from '../../../core/services/cycle-state.service';

type ScopeOption = { label: string; value: string };

@Component({
  selector: 'app-cfo-evidence-vault',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './cfo-evidence-vault.component.html',
  styleUrls: ['./cfo-evidence-vault.component.scss'],
})
export class CfoEvidenceVaultComponent implements OnInit {
  cycleId = 0;
  loading = true;
  saving = false;
  error: string | null = null;

  kindFilter = '';
  scopeFilter = '';

  uploadKind = 'evidence';
  uploadFile: File | null = null;

  linkScope = '';
  linkRecordId = '';

  scopeOptions: ScopeOption[] = [
    { label: '— (All / Unfiltered)', value: '' },
  ];

  attachments: Array<{
    id: number;
    kind: string;
    original_name: string;
    mime: string;
    size: number;
    created_at?: string | null;
    links: Array<{ id: number; scope: string; recordId?: string | null }>;
  }> = [];

  selected = new Set<number>();

  displayedColumns = ['select', 'name', 'kind', 'size', 'links', 'createdAt', 'actions'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cycleState: CycleStateService,
    private cycleApi: CycleApiService
  ) {}

  ngOnInit(): void {
    setTimeout(() => void this.init());
  }

  toggleAll(checked: boolean): void {
    if (!checked) {
      this.selected.clear();
      return;
    }
    for (const a of this.attachments) this.selected.add(a.id);
  }

  toggleOne(id: number, checked: boolean): void {
    if (checked) this.selected.add(id);
    else this.selected.delete(id);
  }

  allSelected(): boolean {
    return this.attachments.length > 0 && this.selected.size === this.attachments.length;
  }

  someSelected(): boolean {
    return this.selected.size > 0 && this.selected.size < this.attachments.length;
  }

  onFileSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input?.files?.[0] ?? null;
    this.uploadFile = file;
  }

  async upload(): Promise<void> {
    if (!this.cycleId || !this.uploadFile) return;

    this.saving = true;
    this.error = null;
    try {
      await this.cycleApi.uploadAttachment(this.cycleId, this.uploadKind || 'evidence', this.uploadFile);
      this.uploadFile = null;
      await this.reload();
    } catch (error: any) {
      console.error('Upload failed', error);
      this.error = error?.message || 'Upload failed';
    } finally {
      this.saving = false;
    }
  }

  async applyFilters(): Promise<void> {
    await this.reload();
  }

  async clearFilters(): Promise<void> {
    this.kindFilter = '';
    this.scopeFilter = '';
    await this.reload();
  }

  async linkSelected(): Promise<void> {
    if (!this.cycleId) return;
    if (!this.selected.size) return;
    const scope = String(this.linkScope || '').trim();
    if (!scope) return;

    this.saving = true;
    this.error = null;
    try {
      await this.cycleApi.linkAttachments(this.cycleId, Array.from(this.selected), scope, this.linkRecordId || null);
      await this.reload();
    } catch (error: any) {
      console.error('Link failed', error);
      this.error = error?.message || 'Link failed';
    } finally {
      this.saving = false;
    }
  }

  async unlinkSelected(): Promise<void> {
    if (!this.cycleId) return;
    if (!this.selected.size) return;
    const scope = String(this.linkScope || '').trim();
    if (!scope) return;

    this.saving = true;
    this.error = null;
    try {
      await this.cycleApi.unlinkAttachments(this.cycleId, Array.from(this.selected), scope, this.linkRecordId || null);
      await this.reload();
    } catch (error: any) {
      console.error('Unlink failed', error);
      this.error = error?.message || 'Unlink failed';
    } finally {
      this.saving = false;
    }
  }

  async download(attId: number, fallbackName: string): Promise<void> {
    if (!this.cycleId || !attId) return;
    try {
      const resp = await this.cycleApi.downloadAttachment(this.cycleId, attId);
      this.downloadFile(resp.blob, resp.filename || fallbackName || `attachment_${attId}`);
    } catch (error) {
      console.error('Download failed', error);
      alert('Download failed');
    }
  }

  formatBytes(n: number | null | undefined): string {
    const value = Number(n);
    if (!Number.isFinite(value) || value < 0) return '-';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  linkLabel(att: any): string {
    const links = Array.isArray(att?.links) ? att.links : [];
    if (!links.length) return '-';
    return links
      .map((l: any) => (l?.recordId ? `${l.scope}#${l.recordId}` : String(l.scope || '')))
      .filter(Boolean)
      .join(', ');
  }

  private async init(): Promise<void> {
    await this.resolveCycleId();
    await this.loadScopeOptions();
    await this.reload();
    this.loading = false;
  }

  private async resolveCycleId(): Promise<void> {
    const routeId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);
    const resolvedId = await this.cycleState.resolveCycleId(routeId);
    this.cycleId = resolvedId;
    if (routeId !== resolvedId) {
      this.router.navigate(['/cycles', resolvedId, 'cfo', 'evidence'], { replaceUrl: true });
    }
  }

  private async loadScopeOptions(): Promise<void> {
    try {
      const sections = await this.cycleApi.getDashboardSections(this.cycleId);
      const opts: ScopeOption[] = [{ label: '— (All / Unfiltered)', value: '' }];

      const seen = new Set<string>();
      for (const s of sections) {
        const scope = String((s as any).scope ?? '').trim();
        const sectionId = String((s as any).sectionId ?? '').trim();
        if (!scope || !sectionId) continue;
        const key = `${scope}::${sectionId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        opts.push({
          label: `${key} — ${String((s as any).title ?? '')}`.trim(),
          value: key,
        });
      }

      this.scopeOptions = opts;
      this.linkScope = this.linkScope || (opts[1]?.value ?? '');
    } catch (error) {
      this.scopeOptions = [{ label: '— (All / Unfiltered)', value: '' }];
    }
  }

  private async reload(): Promise<void> {
    this.selected.clear();
    this.error = null;
    try {
      const kind = String(this.kindFilter || '').trim() || null;
      const scope = String(this.scopeFilter || '').trim() || null;
      const resp = await this.cycleApi.listAttachments(this.cycleId, { kind, scope });
      this.attachments = Array.isArray(resp?.attachments) ? resp.attachments : [];
    } catch (error: any) {
      console.error('Load attachments failed', error);
      this.error = error?.message || 'Load failed';
      this.attachments = [];
    }
  }

  private downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
