import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

import { CanonicalGhgService } from '../../../core/services/canonical-ghg.service';
import { CycleApiService } from '../../../core/services/cycle-api.service';
import { CycleStateService } from '../../../core/services/cycle-state.service';
import { Scope3SummaryService } from '../../../core/services/scope3-summary.service';
import { Scope3GroupRow, Scope3ItemRow, Scope3ScreenRow } from '../../../models/scope3-summary.model';

@Component({
  selector: 'app-cfo-scope3',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './cfo-scope3.component.html',
  styleUrls: ['./cfo-scope3.component.scss'],
})
export class CfoScope3Component implements OnInit {
  cycleId = 0;
  sectionId: string | null = null;
  loading = true;
  saving = false;
  error: string | null = null;

  itemRows: Scope3ItemRow[] = [];
  screenRows: Scope3ScreenRow[] = [];

  displayedColumns = [
    'tgoNo',
    'scopeIso',
    'category',
    'unit',
    'quantity',
    'remark',
    'dataEvidence',
    'ef',
    'ghg',
    'pct',
    'efEvidence',
  ];

  totalScope3Tco2e = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cycleState: CycleStateService,
    private svc: Scope3SummaryService,
    private canonicalSvc: CanonicalGhgService,
    private cycleApi: CycleApiService,
  ) {}

  ngOnInit(): void {
    setTimeout(() => void this.init());
  }

  onCellChange(): void {
    this.recalc();
    this.rebuildScreenRows();
  }

  async saveAndSync(): Promise<void> {
    if (!this.cycleId) return;

    this.saving = true;
    this.error = null;
    try {
      this.svc.save(this.cycleId, this.itemRows);
      const canonical = this.canonicalSvc.build(this.cycleId);
      const updateResult = await this.cycleApi.updateCycleData(this.cycleId, canonical);
      if (updateResult.cycleId !== this.cycleId) {
        this.cycleId = updateResult.cycleId;
        if (this.sectionId) {
          this.router.navigate(['/cycles', updateResult.cycleId, 'cfo', 'scope3', this.sectionId], { replaceUrl: true });
        } else {
          this.router.navigate(['/cycles', updateResult.cycleId, 'cfo', 'scope3'], { replaceUrl: true });
        }
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

  resetToMock(): void {
    if (!confirm('Reset เป็น mock dataset? (ข้อมูลที่ save ไว้จะถูกแทนที่)')) return;
    this.itemRows = this.svc.getMockRows(this.cycleId);
    this.recalc();
    this.rebuildScreenRows();
    this.svc.save(this.cycleId, this.itemRows);
  }

  private async init(): Promise<void> {
    await this.resolveCycleId();
    this.sectionId = this.normalizeSectionId(this.route.snapshot.paramMap.get('sectionId'));

    const saved = this.svc.load(this.cycleId);
    this.itemRows = saved?.rows?.length ? saved.rows : this.svc.getMockRows(this.cycleId);
    this.recalc();
    this.rebuildScreenRows();

    this.loading = false;
  }

  private rebuildScreenRows(): void {
    const groupMap = new Map<string, Scope3GroupRow>();

    const items = this.filteredItems();
    for (const r of items) {
      const key = r.tgoNo;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          type: 'group',
          tgoNo: r.tgoNo,
          scopeIso: r.scopeIso,
          categoryLabel: r.categoryLabel,
          order: Number(r.order || 0),
        });
      }
    }

    const groups = [...groupMap.values()].sort((a, b) => a.order - b.order);

    const out: Scope3ScreenRow[] = [];
    for (const g of groups) {
      out.push(g);
      out.push(...items.filter(x => x.tgoNo === g.tgoNo));
    }

    this.screenRows = out;
  }

  private recalc(): void {
    const items = this.filteredItems();

    for (const r of items) {
      const qty = Number(r.quantityPerYear || 0);
      const ef = Number(r.ef || 0);
      r.totalTco2e = (qty * ef) / 1000;
      r.ghgTco2e = r.totalTco2e;
      r.catLabel = r.categoryLabel;
      r.itemName = r.itemLabel;
    }

    const total = items.reduce((s, r) => s + Number(r.totalTco2e || 0), 0);
    this.totalScope3Tco2e = total;

    for (const r of items) {
      r.sharePct = total > 0 ? (Number(r.totalTco2e || 0) / total) * 100 : 0;
      r.pct = r.sharePct;
    }
  }

  private filteredItems(): Scope3ItemRow[] {
    if (!this.sectionId) return this.itemRows;
    const key = `Scope ${this.sectionId}`;
    return this.itemRows.filter(r => String(r.tgoNo ?? '') === key);
  }

  private normalizeSectionId(raw: any): string | null {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    if (/^3\.\d+(?:\.\d+)?$/.test(s)) return s;
    return null;
  }

  private async resolveCycleId(): Promise<void> {
    const routeId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);
    const resolvedId = await this.cycleState.resolveCycleId(routeId);
    this.cycleId = resolvedId;
    if (routeId !== resolvedId) {
      const sectionId = this.route.snapshot.paramMap.get('sectionId');
      if (sectionId) {
        this.router.navigate(['/cycles', resolvedId, 'cfo', 'scope3', sectionId], { replaceUrl: true });
      } else {
        this.router.navigate(['/cycles', resolvedId, 'cfo', 'scope3'], { replaceUrl: true });
      }
    }
  }
}
