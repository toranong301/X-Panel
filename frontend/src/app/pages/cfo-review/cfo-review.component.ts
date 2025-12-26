import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';

import { CanonicalGhgService } from '../../core/services/canonical-ghg.service';
import { CycleStateService } from '../../core/services/cycle-state.service';
import { CanonicalCycleData, CfoGhgItem } from '../../models/canonical-cycle.model';

type CfoSubScopeGroup = {
  subScope: string;
  items: CfoGhgItem[];
  total: number;
};

type CfoScopeGroup = {
  scope: 1 | 2 | 3;
  subScopes: CfoSubScopeGroup[];
  total: number;
};

@Component({
  selector: 'app-cfo-review',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './cfo-review.component.html',
  styleUrls: ['./cfo-review.component.scss'],
})
export class CfoReviewComponent implements OnInit {
  cycleId = 0;
  loading = false;
  error: string | null = null;
  groups: CfoScopeGroup[] = [];
  displayedColumns = ['activity', 'quantity', 'unit', 'evidence', 'remark'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private canonicalSvc: CanonicalGhgService,
    private cycleState: CycleStateService,
  ) {}

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const routeId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);
      const resolvedId = await this.cycleState.resolveCycleId(routeId);
      this.cycleId = resolvedId;
      if (routeId !== resolvedId) {
        this.router.navigate(['/cycles', resolvedId, 'cfo', 'review'], { replaceUrl: true });
      }

      const canonical: CanonicalCycleData = this.canonicalSvc.build(resolvedId);
      this.groups = this.groupCanonical(canonical);
    } catch (error: any) {
      this.error = error?.message || String(error);
    } finally {
      this.loading = false;
    }
  }

  private groupCanonical(canonical: CanonicalCycleData): CfoScopeGroup[] {
    const buckets: Array<{ scope: 1 | 2 | 3; items: CfoGhgItem[] }> = [
      { scope: 1, items: canonical.cfoGhg.scope1 ?? [] },
      { scope: 2, items: canonical.cfoGhg.scope2 ?? [] },
      { scope: 3, items: canonical.cfoGhg.scope3 ?? [] },
    ];

    return buckets.map(bucket => {
      const bySubScope = new Map<string, CfoGhgItem[]>();
      for (const item of bucket.items) {
        const key = item.subScope || '-';
        const list = bySubScope.get(key) ?? [];
        list.push(item);
        bySubScope.set(key, list);
      }

      const subScopes: CfoSubScopeGroup[] = [];
      for (const [subScope, items] of bySubScope.entries()) {
        const total = items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);
        subScopes.push({ subScope, items, total });
      }

      subScopes.sort((a, b) => a.subScope.localeCompare(b.subScope));

      const total = subScopes.reduce((sum, g) => sum + g.total, 0);
      return { scope: bucket.scope, subScopes, total };
    });
  }
}
