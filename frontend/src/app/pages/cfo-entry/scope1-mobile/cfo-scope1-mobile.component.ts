import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { CanonicalGhgService } from '../../../core/services/canonical-ghg.service';
import { CycleApiService } from '../../../core/services/cycle-api.service';
import { CycleStateService } from '../../../core/services/cycle-state.service';
import { DataEntryDoc, DataEntryService } from '../../../core/services/data-entry.service';
import { EntryRow } from '../../../models/entry-row.model';
import { EvidenceModel } from '../../../models/evidence.model';
import { EvidenceBlockComponent } from '../../../shared/components/evidence-block/evidence-block.component';
import { Scope12MobileComponent } from '../../data-entry/scope12-mobile/scope12-mobile.component';

@Component({
  selector: 'app-cfo-scope1-mobile',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatDividerModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    Scope12MobileComponent,
    EvidenceBlockComponent,
  ],
  templateUrl: './cfo-scope1-mobile.component.html',
  styleUrls: ['./cfo-scope1-mobile.component.scss'],
})
export class CfoScope1MobileComponent implements OnInit {
  cycleId = 0;
  loading = true;
  saving = false;
  error: string | null = null;

  rows: EntryRow[] = [];
  evidenceModel: EvidenceModel = { notes: [], tables: [], images: [] };

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

  onRowsChange(rows: EntryRow[]): void {
    this.rows = rows ?? [];
    this.persistDraft();
  }

  onEvidenceChange(model: EvidenceModel): void {
    this.evidenceModel = model ?? { notes: [], tables: [], images: [] };
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
        this.router.navigate(['/cycles', updateResult.cycleId, 'cfo', 'scope1-mobile'], { replaceUrl: true });
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

  private async init(): Promise<void> {
    await this.resolveCycleId();
    this.loadDraft();
    this.loading = false;
  }

  private loadDraft(): void {
    const doc = this.entrySvc.load(this.cycleId);
    const scope1 = Array.isArray(doc?.scope1) ? doc?.scope1 : [];
    this.rows = scope1.filter(r => r.categoryCode === '1.2');
    this.evidenceModel = doc?.evidence?.['S1::1.2'] ?? { notes: [], tables: [], images: [] };
  }

  private persistDraft(): void {
    const existing: DataEntryDoc = this.entrySvc.load(this.cycleId) ?? {
      cycleId: this.cycleId,
      scope1: [],
      scope2: [],
      scope3: [],
    };

    const otherScope1Rows = (existing.scope1 ?? []).filter(r => r.categoryCode !== '1.2');
    const evidence = { ...(existing.evidence ?? {}), ['S1::1.2']: this.evidenceModel };

    this.entrySvc.save(this.cycleId, {
      ...existing,
      cycleId: this.cycleId,
      scope1: [...this.rows, ...otherScope1Rows],
      evidence,
    });
  }

  private async resolveCycleId(): Promise<void> {
    const routeId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);
    const resolvedId = await this.cycleState.resolveCycleId(routeId);
    this.cycleId = resolvedId;
    if (routeId !== resolvedId) {
      this.router.navigate(['/cycles', resolvedId, 'cfo', 'scope1-mobile'], { replaceUrl: true });
    }
  }
}
