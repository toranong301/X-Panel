import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';

import { CanonicalGhgService } from '../../../core/services/canonical-ghg.service';
import { CycleApiService } from '../../../core/services/cycle-api.service';
import { CycleStateService } from '../../../core/services/cycle-state.service';
import { DataEntryDoc, DataEntryService } from '../../../core/services/data-entry.service';
import { EntryRow } from '../../../models/entry-row.model';
import { EvidenceModel } from '../../../models/evidence.model';
import { EvidenceBlockComponent } from '../../../shared/components/evidence-block/evidence-block.component';
import { Scope14FugitiveComponent } from '../../data-entry/scope14-fugitive/scope14-fugitive.component';
import { Scope142FireComponent } from '../../data-entry/scope142-fire/scope142-fire.component';
import { Scope143SepticComponent } from '../../data-entry/scope143-septic/scope143-septic.component';
import { Scope144FertilizerComponent } from '../../data-entry/scope144-fertilizer/scope144-fertilizer.component';
import { Scope145WwtpComponent } from '../../data-entry/scope145-wwtp/scope145-wwtp.component';

type FugitiveKey = '1.4.1' | '1.4.2' | '1.4.3' | '1.4.4' | '1.4.5';

@Component({
  selector: 'app-cfo-scope1-fugitive',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatCardModule,
    MatDividerModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    Scope14FugitiveComponent,
    Scope142FireComponent,
    Scope143SepticComponent,
    Scope144FertilizerComponent,
    Scope145WwtpComponent,
    EvidenceBlockComponent,
  ],
  templateUrl: './cfo-scope1-fugitive.component.html',
  styleUrls: ['./cfo-scope1-fugitive.component.scss'],
})
export class CfoScope1FugitiveComponent implements OnInit {
  cycleId = 0;
  loading = true;
  saving = false;
  error: string | null = null;

  activeTab = 0;

  scope141Rows: EntryRow[] = [];
  scope142Rows: EntryRow[] = [];
  scope143Rows: EntryRow[] = [];
  scope144Rows: EntryRow[] = [];
  scope145Rows: EntryRow[] = [];

  evidenceMap: Record<string, EvidenceModel> = {};

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cycleState: CycleStateService,
    private entrySvc: DataEntryService,
    private canonicalSvc: CanonicalGhgService,
    private cycleApi: CycleApiService,
  ) {}

  ngOnInit(): void {
    setTimeout(() => void this.init());
  }

  onRowsChange(key: FugitiveKey, rows: EntryRow[]): void {
    if (key === '1.4.1') this.scope141Rows = rows ?? [];
    if (key === '1.4.2') this.scope142Rows = rows ?? [];
    if (key === '1.4.3') this.scope143Rows = rows ?? [];
    if (key === '1.4.4') this.scope144Rows = rows ?? [];
    if (key === '1.4.5') this.scope145Rows = rows ?? [];
    this.persistDraft();
  }

  evidenceFor(key: string): EvidenceModel {
    return this.evidenceMap[key] ?? { notes: [], tables: [], images: [] };
  }

  onEvidenceChange(key: string, model: EvidenceModel): void {
    this.evidenceMap = { ...this.evidenceMap, [key]: model ?? { notes: [], tables: [], images: [] } };
    this.persistDraft();
  }

  async saveAndSync(): Promise<void> {
    if (!this.cycleId) return;

    this.saving = true;
    this.error = null;
    try {
      this.persistDraft();
      const canonical = this.canonicalSvc.build(this.cycleId);
      const updateResult = await this.cycleApi.updateCycleData(this.cycleId, canonical);
      if (updateResult.cycleId !== this.cycleId) {
        this.cycleId = updateResult.cycleId;
        this.router.navigate(['/cycles', updateResult.cycleId, 'cfo', 'scope1-fugitive'], { replaceUrl: true });
      }
      alert('Saved ✅ (synced to backend)');
    } catch (error: any) {
      console.error('Save sync failed', error);
      this.error = error?.message || 'Sync failed';
      alert('Saved locally แต่ sync ไป backend ไม่สำเร็จ');
    } finally {
      this.saving = false;
    }
  }

  onTabChange(index: number): void {
    this.activeTab = index;
    const subScope = this.keyFromTab(index);
    if (!subScope) return;
    this.router.navigate(['/cycles', this.cycleId, 'cfo', 'scope1-fugitive', subScope], { replaceUrl: true });
  }

  private async init(): Promise<void> {
    await this.resolveCycleId();
    this.loadDraft();
    this.activeTab = this.tabFromKey(this.route.snapshot.paramMap.get('subScope'));
    this.loading = false;
  }

  private loadDraft(): void {
    const doc = this.entrySvc.load(this.cycleId);
    const scope1 = Array.isArray(doc?.scope1) ? doc?.scope1 : [];

    this.scope141Rows = scope1.filter(r => r.categoryCode === '1.4.1');
    this.scope142Rows = scope1.filter(r => r.categoryCode === '1.4.2');
    this.scope143Rows = scope1.filter(r => r.categoryCode === '1.4.3');
    this.scope144Rows = scope1.filter(r => r.categoryCode === '1.4.4');
    this.scope145Rows = scope1.filter(r => r.categoryCode === '1.4.5');

    this.evidenceMap = doc?.evidence ?? {};
  }

  private persistDraft(): void {
    if (!this.cycleId) return;
    const existing: DataEntryDoc = this.entrySvc.load(this.cycleId) ?? {
      cycleId: this.cycleId,
      scope1: [],
      scope2: [],
      scope3: [],
    };

    const otherScope1 = (existing.scope1 ?? []).filter(
      r => !['1.4.1', '1.4.2', '1.4.3', '1.4.4', '1.4.5'].includes(r.categoryCode)
    );

    this.entrySvc.save(this.cycleId, {
      ...existing,
      cycleId: this.cycleId,
      scope1: [
        ...this.scope141Rows,
        ...this.scope142Rows,
        ...this.scope143Rows,
        ...this.scope144Rows,
        ...this.scope145Rows,
        ...otherScope1,
      ],
      evidence: this.evidenceMap,
    });
  }

  private tabFromKey(raw?: string | null): number {
    const key = String(raw ?? '').trim();
    if (key === '1.4.2') return 1;
    if (key === '1.4.3') return 2;
    if (key === '1.4.4') return 3;
    if (key === '1.4.5') return 4;
    return 0;
  }

  private keyFromTab(index: number): FugitiveKey | null {
    if (index === 1) return '1.4.2';
    if (index === 2) return '1.4.3';
    if (index === 3) return '1.4.4';
    if (index === 4) return '1.4.5';
    return '1.4.1';
  }

  private async resolveCycleId(): Promise<void> {
    const routeId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);
    const resolvedId = await this.cycleState.resolveCycleId(routeId);
    this.cycleId = resolvedId;
    if (routeId !== resolvedId) {
      const sub = this.route.snapshot.paramMap.get('subScope');
      this.router.navigate(
        sub
          ? ['/cycles', resolvedId, 'cfo', 'scope1-fugitive', sub]
          : ['/cycles', resolvedId, 'cfo', 'scope1-fugitive'],
        { replaceUrl: true }
      );
    }
  }
}

