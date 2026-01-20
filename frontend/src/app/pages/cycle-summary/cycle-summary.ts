import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { CycleApiService, CycleSummary } from '../../core/services/cycle-api.service';
import { CycleStateService } from '../../core/services/cycle-state.service';

@Component({
  selector: 'app-cycle-summary',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './cycle-summary.html',
  styleUrls: ['./cycle-summary.scss'],
})
export class CycleSummaryComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private cycleApi = inject(CycleApiService);
  private cycleState = inject(CycleStateService);
  private snackBar = inject(MatSnackBar);

  cycleId = 0;
  loading = false;
  busy = false;
  error: string | null = null;

  summary: CycleSummary | null = null;

  ngOnInit(): void {
    void this.init();
  }

  private async init(): Promise<void> {
    const routeId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);
    this.cycleId = await this.cycleState.resolveCycleId(routeId);
    await this.reload();
  }

  get scope11Summary() {
    return this.summary?.scopes?.find(s => s.scope === '1.1') ?? null;
  }

  async reload(): Promise<void> {
    if (!this.cycleId) return;
    this.loading = true;
    this.error = null;
    try {
      this.summary = await this.cycleApi.getSummary(this.cycleId);
    } catch (e: any) {
      console.error('Load summary failed', e);
      this.error = e?.message || String(e);
      this.snackBar.open(this.error ?? 'Load failed', 'ปิด', { duration: 6000 });
    } finally {
      this.loading = false;
    }
  }

  async recalcScope11(): Promise<void> {
    if (!this.cycleId) return;
    this.busy = true;
    try {
      await this.cycleApi.recalcScope11(this.cycleId);
      await this.reload();
      this.snackBar.open('Recalculated', 'ปิด', { duration: 3000 });
    } catch (e: any) {
      console.error('Recalc failed', e);
      this.snackBar.open(e?.message || 'Recalc failed', 'ปิด', { duration: 6000 });
    } finally {
      this.busy = false;
    }
  }
}

