import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { CanonicalGhgService } from '../../../core/services/canonical-ghg.service';
import { CycleStateService } from '../../../core/services/cycle-state.service';
import { CycleApiService } from '../../../core/services/cycle-api.service';
import { DataEntryDoc, DataEntryService } from '../../../core/services/data-entry.service';
import { EntryRow } from '../../../models/entry-row.model';
import { EvidenceModel } from '../../../models/evidence.model';
import { EvidenceBlockComponent } from '../../../shared/components/evidence-block/evidence-block.component';
import { createEmptyMonths } from '../../../models/entry-row.helpers';

type MonthKey = { month: number; qty: number };

@Component({
  selector: 'app-cfo-scope2-electricity',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatDividerModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    EvidenceBlockComponent,
  ],
  templateUrl: './cfo-scope2-electricity.component.html',
  styleUrls: ['./cfo-scope2-electricity.component.scss'],
})
export class CfoScope2ElectricityComponent implements OnInit {
  cycleId = 0;
  loading = true;
  saving = false;
  error: string | null = null;

  rows: EntryRow[] = [];
  evidenceModel: EvidenceModel = { notes: [], tables: [], images: [] };

  readonly months = Array.from({ length: 12 }, (_, i) => i + 1);

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

  addRow(): void {
    const slotNo = this.nextSlotNo();
    const row: EntryRow = {
      cycleId: String(this.cycleId),
      scope: 'S2',
      categoryCode: '2.1',
      subCategoryCode: `ELECTRICITY#${slotNo}`,
      itemName: '',
      unit: 'kWh',
      months: createEmptyMonths(),
      dataSourceType: 'ORG',
      remark: '',
      referenceText: '',
    };
    this.rows = [...this.rows, row];
    this.persistDraft();
  }

  removeRow(row: EntryRow): void {
    this.rows = this.rows.filter(r => r !== row);
    this.persistDraft();
  }

  updateText(row: EntryRow, field: 'itemName' | 'unit' | 'referenceText' | 'remark', value: string): void {
    (row as any)[field] = value;
    this.persistDraft();
  }

  getMonthQty(row: EntryRow, month: number): number | null {
    const m = (row.months ?? []).find(x => Number(x?.month) === month);
    return m && Number.isFinite(Number(m.qty)) ? Number(m.qty) : null;
  }

  updateMonthQty(row: EntryRow, month: number, raw: any): void {
    const qty = this.parseNumberOrNull(raw);
    const existing = Array.isArray(row.months) ? row.months : [];
    const otherMonths = existing.filter(x => Number(x?.month) !== month);
    row.months = qty === null
      ? otherMonths
      : [...otherMonths, { month, qty } as MonthKey].sort((a, b) => a.month - b.month);
    this.persistDraft();
  }

  total(row: EntryRow): number | null {
    const values = (row.months ?? [])
      .map(m => this.parseNumberOrNull(m?.qty))
      .filter((v): v is number => v !== null);
    if (!values.length) return null;
    return values.reduce((sum, v) => sum + v, 0);
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
        this.router.navigate(['/cycles', updateResult.cycleId, 'cfo', 'scope2-electricity'], { replaceUrl: true });
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
    const scope2 = Array.isArray(doc?.scope2) ? doc?.scope2 : [];
    this.rows = scope2.filter(r => r.categoryCode === '2.1');
    this.evidenceModel = doc?.evidence?.['S2::2.1'] ?? { notes: [], tables: [], images: [] };
  }

  private persistDraft(): void {
    if (!this.cycleId) return;
    const existing: DataEntryDoc = this.entrySvc.load(this.cycleId) ?? {
      cycleId: this.cycleId,
      scope1: [],
      scope2: [],
      scope3: [],
    };
    const otherScope2 = (existing.scope2 ?? []).filter(r => r.categoryCode !== '2.1');
    const evidence = { ...(existing.evidence ?? {}), ['S2::2.1']: this.evidenceModel };
    this.entrySvc.save(this.cycleId, {
      ...existing,
      cycleId: this.cycleId,
      scope2: [...this.rows, ...otherScope2],
      evidence,
    });
  }

  private nextSlotNo(): number {
    const used = new Set(
      (this.rows ?? [])
        .map(r => this.parseSlotNo(r.subCategoryCode))
        .filter((v): v is number => Number.isFinite(Number(v)))
    );
    for (let i = 1; i <= 99; i++) {
      if (!used.has(i)) return i;
    }
    return 1;
  }

  private parseSlotNo(subCategoryCode?: string): number | null {
    const raw = String(subCategoryCode ?? '').trim();
    if (!raw) return null;
    const [, slotRaw] = raw.split('#');
    const n = slotRaw ? Number(slotRaw) : NaN;
    return Number.isFinite(n) ? n : null;
  }

  private parseNumberOrNull(raw: any): number | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const s = String(raw).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  private async resolveCycleId(): Promise<void> {
    const routeId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);
    const resolvedId = await this.cycleState.resolveCycleId(routeId);
    this.cycleId = resolvedId;
    if (routeId !== resolvedId) {
      this.router.navigate(['/cycles', resolvedId, 'cfo', 'scope2-electricity'], { replaceUrl: true });
    }
  }
}
