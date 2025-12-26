import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { CanonicalGhgService } from '../../core/services/canonical-ghg.service';
import { CycleApiService, ExportDto } from '../../core/services/cycle-api.service';
import { ExcelSheetPreviewComponent } from '../../shared/components/excel-sheet-preview/excel-sheet-preview.component';

@Component({
  selector: 'app-excel-sheet-page',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    ExcelSheetPreviewComponent,
  ],
  templateUrl: './excel-sheet-page.html',
  styleUrls: ['./excel-sheet-page.scss'],
})
export class ExcelSheetPageComponent {
  private route = inject(ActivatedRoute);
  private canonicalSvc = inject(CanonicalGhgService);
  private cycleApi = inject(CycleApiService);
  private snackBar = inject(MatSnackBar);

  cycleId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);
  templateKey = 'MBAX_TGO_11102567::demo';
  sheetName = this.route.snapshot.data['sheetName'] ?? '';
  title = this.route.snapshot.data['title'] ?? this.sheetName;
  range = this.route.snapshot.data['range'] as string | undefined;

  exporting = false;
  exportError: string | null = null;
  report: ExportDto | null = null;

  async exportSheet() {
    this.exporting = true;
    this.exportError = null;
    this.report = null;

    try {
      const canonical = this.canonicalSvc.build(this.cycleId);
      const updateResult = await this.cycleApi.updateCycleData(this.cycleId, canonical);
      this.cycleId = updateResult.cycleId;
      this.report = await this.cycleApi.exportCycle(updateResult.cycleId);

      if (this.report.status === 'completed' && this.report.download_url) {
        window.open(this.report.download_url, '_blank');
        this.snackBar.open('Export สำเร็จ', 'ปิด', { duration: 4000 });
      } else if (this.report.status === 'failed') {
        throw new Error(this.report.error_message || 'Export failed');
      } else {
        this.snackBar.open('Export กำลังประมวลผล', 'ปิด', { duration: 4000 });
      }
    } catch (e: any) {
      console.error('Export sheet failed', e);
      this.exportError = e?.message || String(e);
      alert('Export ล้มเหลว กรุณาลองใหม่อีกครั้ง');
      this.snackBar.open(this.exportError ?? 'เกิดข้อผิดพลาดในการ Export', 'ปิด', { duration: 6000 });
    } finally {
      this.exporting = false;
    }
  }
}
