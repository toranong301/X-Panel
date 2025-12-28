import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BehaviorSubject, catchError, from, of, shareReplay, switchMap } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';

import { CanonicalGhgService } from '../../core/services/canonical-ghg.service';
import { Cycle, CycleApiService } from '../../core/services/cycle-api.service';
import { CycleStateService } from '../../core/services/cycle-state.service';
import { CreateCycleDialogComponent } from './create-cycle-dialog/create-cycle-dialog';

@Component({
  selector: 'app-cycles',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './cycles.html',
  styleUrls: ['./cycles.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CyclesComponent {
  displayedColumns = ['name', 'baseYear', 'status', 'actions'];

  private reload$ = new BehaviorSubject<void>(undefined);
  cycles$ = this.reload$.pipe(
    switchMap(() =>
      from(this.cycleApi.listCycles()).pipe(
        catchError((error: any) => {
          console.error('Load cycles failed', error);
          this.snackBar.open(
            error?.message || 'โหลด Cycle ไม่สำเร็จ',
            'ปิด',
            { duration: 6000 }
          );
          return of([] as Cycle[]);
        })
      )
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  exportingId: number | null = null;

  constructor(
    private dialog: MatDialog,
    private router: Router,
    private canonicalSvc: CanonicalGhgService,
    private cycleApi: CycleApiService,
    private cycleState: CycleStateService,
    private snackBar: MatSnackBar,
  ) {}

  /* =========================
   * Actions
   * ========================= */

  createCycle() {
    const ref = this.dialog.open(CreateCycleDialogComponent, {
      width: '400px',
    });

    ref.afterClosed().subscribe(async result => {
      if (!result) return;

      try {
        const created = await this.cycleApi.createCycle({
          name: result.name!,
          year: Number(result.baseYear!),
        });

        this.cycleState.setSelectedCycleId(created.id);
        this.reload$.next();

        this.router.navigate(['/cycles', created.id, 'data-entry']);
      } catch (error: any) {
        console.error('Create cycle failed', error);
        this.snackBar.open(
          error?.message || 'เกิดข้อผิดพลาดในการสร้าง Cycle',
          'ปิด',
          { duration: 6000 }
        );
      }
    });
  }

  openCycle(cycle: Cycle) {
    this.cycleState.setSelectedCycleId(cycle.id);
    this.router.navigate(['/cycles', cycle.id, 'data-entry']);
  }

  async exportAll(cycle: Cycle) {
    this.exportingId = cycle.id;
    try {
      const canonical = this.canonicalSvc.build(cycle.id);
      const updateResult = await this.cycleApi.updateCycleData(cycle.id, canonical);
      this.cycleState.setSelectedCycleId(updateResult.cycleId);

      const download = await this.cycleApi.exportCycle(updateResult.cycleId);
      this.downloadFile(download.blob, download.filename);
      this.snackBar.open('Export สำเร็จ', 'ปิด', { duration: 4000 });
    } catch (error: any) {
      console.error('Export all failed', error);
      this.snackBar.open(
        error?.message || 'เกิดข้อผิดพลาดในการ Export',
        'ปิด',
        { duration: 6000 }
      );
    } finally {
      this.exportingId = null;
    }
  }

  /* =========================
   * Navigation
   * ========================= */

  goFr01(c: Cycle) { this.router.navigate(['/cycles', c.id, 'fr01']); }
  goFr02(c: Cycle) { this.router.navigate(['/cycles', c.id, 'fr02']); }
  goFr031(c: Cycle) { this.router.navigate(['/cycles', c.id, 'fr03-1']); }
  goFr032(c: Cycle) { this.router.navigate(['/cycles', c.id, 'fr03-2']); }
  goScreenScope3(c: Cycle) { this.router.navigate(['/cycles', c.id, 'scope3-screen']); }
  goFr041(c: Cycle) { this.router.navigate(['/cycles', c.id, 'fr04-1']); }

  private downloadFile(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
