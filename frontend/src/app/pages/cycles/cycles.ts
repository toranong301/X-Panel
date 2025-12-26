import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
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
})
export class CyclesComponent implements OnInit {
  displayedColumns = ['name', 'baseYear', 'status', 'actions'];

  /** ✅ เริ่มต้นว่างเท่านั้น */
  cycles: Cycle[] = [];

  exportingId: number | null = null;

  constructor(
    private dialog: MatDialog,
    private router: Router,
    private canonicalSvc: CanonicalGhgService,
    private cycleApi: CycleApiService,
    private cycleState: CycleStateService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    // ✅ เลื่อน async logic ออกไปหลัง Angular check รอบแรก
    queueMicrotask(() => {
      this.bootstrap();
    });
  }

  /* =========================
   * Bootstrap
   * ========================= */

  private async bootstrap() {
    try {
      // 1) ensure มี cycle ที่ใช้งานได้
      const selectedId = await this.cycleState.getSelectedCycleId();

      // 2) โหลด cycles จาก backend
      const list = await this.cycleApi.listCycles();
      this.cycles = list;

      // 3) fallback กัน edge case
      if (!this.cycles.some(c => c.id === selectedId)) {
        const year = new Date().getFullYear();
        this.cycles = [
          ...this.cycles,
          { id: selectedId, name: 'Demo Cycle', year },
        ];
      }
    } catch (error: any) {
      console.error('Bootstrap cycle failed', error);
      this.snackBar.open(
        error?.message || 'โหลด Cycle ไม่สำเร็จ',
        'ปิด',
        { duration: 6000 }
      );
    }
  }

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

        this.cycles = [...this.cycles, created];
        this.cycleState.setSelectedCycleId(created.id);

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

      const exportResult = await this.cycleApi.exportCycle(updateResult.cycleId);

      if (exportResult.status === 'completed' && exportResult.download_url) {
        window.open(exportResult.download_url, '_blank');
        this.snackBar.open('Export สำเร็จ', 'ปิด', { duration: 4000 });
      } else if (exportResult.status === 'failed') {
        throw new Error(exportResult.error_message || 'Export failed');
      } else {
        this.snackBar.open('Export กำลังประมวลผล', 'ปิด', { duration: 4000 });
      }
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
}
