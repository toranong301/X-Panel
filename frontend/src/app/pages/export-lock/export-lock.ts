import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { CycleApiService, CycleDto, CycleSummary, CycleValidationResult } from '../../core/services/cycle-api.service';
import { CycleStateService } from '../../core/services/cycle-state.service';

@Component({
  selector: 'app-export-lock',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './export-lock.html',
  styleUrls: ['./export-lock.scss'],
})
export class ExportLock implements OnInit {
  private route = inject(ActivatedRoute);
  private cycleApi = inject(CycleApiService);
  private cycleState = inject(CycleStateService);
  private snackBar = inject(MatSnackBar);

  cycleId = 0;
  loading = false;
  busy = false;

  cycle: CycleDto | null = null;
  validations: CycleValidationResult | null = null;
  summary: CycleSummary | null = null;

  lockReason = '';
  error: string | null = null;

  ngOnInit(): void {
    void this.init();
  }

  get isLocked(): boolean {
    return Boolean(this.cycle?.locked_at);
  }

  get hasErrors(): boolean {
    return (this.validations?.errors?.length ?? 0) > 0;
  }

  get scope11Summary() {
    return this.summary?.scopes?.find(s => s.scope === '1.1') ?? null;
  }

  private async init(): Promise<void> {
    const routeId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);
    this.cycleId = await this.cycleState.resolveCycleId(routeId);
    await this.reloadAll();
  }

  async reloadAll(): Promise<void> {
    if (!this.cycleId) return;
    this.loading = true;
    this.error = null;
    try {
      const [cycle, validations, summary] = await Promise.all([
        this.cycleApi.getCycle(this.cycleId),
        this.cycleApi.getValidations(this.cycleId),
        this.cycleApi.getSummary(this.cycleId),
      ]);
      this.cycle = cycle;
      this.validations = validations;
      this.summary = summary;
    } catch (e: any) {
      console.error('Load review/lock failed', e);
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
      await this.reloadAll();
      this.snackBar.open('Recalculated', 'ปิด', { duration: 3000 });
    } catch (e: any) {
      console.error('Recalc failed', e);
      this.snackBar.open(e?.message || 'Recalc failed', 'ปิด', { duration: 6000 });
    } finally {
      this.busy = false;
    }
  }

  async lock(): Promise<void> {
    if (!this.cycleId) return;
    this.busy = true;
    try {
      const resp = await this.cycleApi.lockCycle(this.cycleId, this.lockReason);
      if (!resp?.ok) {
        throw new Error((resp as any)?.message || 'Lock failed');
      }
      await this.reloadAll();
      this.snackBar.open('Locked', 'ปิด', { duration: 3000 });
    } catch (e: any) {
      console.error('Lock failed', e);
      this.snackBar.open(e?.message || 'Lock failed', 'ปิด', { duration: 6000 });
    } finally {
      this.busy = false;
    }
  }

  async unlock(): Promise<void> {
    if (!this.cycleId) return;
    this.busy = true;
    try {
      const resp = await this.cycleApi.unlockCycle(this.cycleId);
      if (!resp?.ok) {
        throw new Error((resp as any)?.message || 'Unlock failed');
      }
      await this.reloadAll();
      this.snackBar.open('Unlocked', 'ปิด', { duration: 3000 });
    } catch (e: any) {
      console.error('Unlock failed', e);
      this.snackBar.open(e?.message || 'Unlock failed', 'ปิด', { duration: 6000 });
    } finally {
      this.busy = false;
    }
  }

}
