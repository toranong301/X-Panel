import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';

import { ExcelExportEngine } from '../../core/export/engine/excel-export.engine';
import { resolveTemplate } from '../../core/export/registry/template-registry';
import { CanonicalGhgService } from '../../core/services/canonical-ghg.service';
import { CreateCycleDialogComponent } from './create-cycle-dialog/create-cycle-dialog';

@Component({
  selector: 'app-cycles',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule],
  templateUrl: './cycles.html',
  styleUrls: ['./cycles.scss'],
})
export class CyclesComponent {
  displayedColumns = ['name', 'baseYear', 'status', 'actions'];

  cycles = [
    { id: 1, name: 'GHG Inventory 2024', baseYear: 2023, status: 'Draft' },
    { id: 2, name: 'GHG Inventory 2025', baseYear: 2024, status: 'Locked' },
  ];

  exportingId: number | null = null;

  constructor(
    private dialog: MatDialog,
    private router: Router,
    private exportEngine: ExcelExportEngine,
    private canonicalSvc: CanonicalGhgService,
    private snackBar: MatSnackBar,
  ) {}

  createCycle() {
    const ref = this.dialog.open(CreateCycleDialogComponent, {
      width: '400px',
    });

    ref.afterClosed().subscribe(result => {
      if (!result) return;

      const newId =
        this.cycles.length > 0
          ? Math.max(...this.cycles.map(c => c.id)) + 1
          : 1;

      const newCycle = {
        id: newId,
        name: result.name!,
        baseYear: result.baseYear!,
        status: 'Draft' as const,
      };

      this.cycles = [...this.cycles, newCycle];

      // 🎯 Auto-Navigate
      this.router.navigate(['/cycles', newId, 'data-entry']);
    });
  }

  openCycle(cycle: { id: number }) {
    this.router.navigate(['/cycles', cycle.id, 'data-entry']);
  }

  async exportAll(cycle: { id: number }) {
    this.exportingId = cycle.id;
    try {
      const canonical = this.canonicalSvc.build(cycle.id);
      const bundle = resolveTemplate('MBAX_TGO_11102567::demo');
      const outputName = `V-Sheet_${bundle.spec.templateId}_cycle-${cycle.id}.xlsx`;

      await this.exportEngine.exportFromUrl({
        templateUrl: bundle.templateUrl,
        templateSpec: bundle.spec,
        adapter: bundle.adapter,
        canonical,
        outputName,
      });

      this.snackBar.open('Export สำเร็จ', 'ปิด', { duration: 4000 });
    } catch (error: any) {
      console.error('Export all failed', error);
      alert('Export ล้มเหลว กรุณาลองใหม่อีกครั้ง');
      this.snackBar.open(error?.message || 'เกิดข้อผิดพลาดในการ Export', 'ปิด', { duration: 6000 });
    } finally {
      this.exportingId = null;
    }
  }

  goFr01(c: { id: number }) {
    this.router.navigate(['/cycles', c.id, 'fr01']);
  }

  goFr02(c: { id: number }) {
    this.router.navigate(['/cycles', c.id, 'fr02']);
  }

  goFr031(c: { id: number }) {
    this.router.navigate(['/cycles', c.id, 'fr03-1']);
  }

  goFr032(c: { id: number }) {
    this.router.navigate(['/cycles', c.id, 'fr03-2']);
  }

  goScreenScope3(c: { id: number }) {
    this.router.navigate(['/cycles', c.id, 'scope3-screen']);
  }

  goFr041(c: { id: number }) {
    this.router.navigate(['/cycles', c.id, 'fr04-1']);
  }
}
