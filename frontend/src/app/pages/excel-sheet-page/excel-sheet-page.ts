import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { CanonicalGhgService } from '../../core/services/canonical-ghg.service';
import { CycleApiService } from '../../core/services/cycle-api.service';
import { CycleStateService } from '../../core/services/cycle-state.service';
import { getSheetConfig } from '../../core/sheet.registry';
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
export class ExcelSheetPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private canonicalSvc = inject(CanonicalGhgService);
  private cycleApi = inject(CycleApiService);
  private cycleState = inject(CycleStateService);
  private snackBar = inject(MatSnackBar);

  cycleId = 0;
  sheetId = this.route.snapshot.data['sheetId'] ?? '';
  title = this.route.snapshot.data['title'] ?? getSheetConfig(this.sheetId)?.label ?? this.sheetId;

  exporting = false;
  exportError: string | null = null;

  ngOnInit(): void {
    void this.resolveCycleId();
  }

  private async resolveCycleId() {
    const routeId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);
    this.cycleId = await this.cycleState.resolveCycleId(routeId);
  }

  async exportSheet() {
    this.exporting = true;
    this.exportError = null;

    try {
      let exportCycleId = this.cycleId;
      try {
        const canonical = this.canonicalSvc.build(this.cycleId);
        const updateResult = await this.cycleApi.updateCycleData(this.cycleId, canonical);
        exportCycleId = updateResult.cycleId;
        this.cycleId = updateResult.cycleId;
        this.cycleState.setSelectedCycleId(updateResult.cycleId);
      } catch (e: any) {
        const status = Number(e?.status);
        if (status !== 423) throw e;
      }

      const download = await this.cycleApi.exportCycle(exportCycleId);
      this.downloadFile(download.blob, download.filename);
      this.snackBar.open('Export สำเร็จ', 'ปิด', { duration: 4000 });
    } catch (e: any) {
      console.error('Export sheet failed', e);
      this.exportError = e?.message || String(e);
      alert('Export ล้มเหลว กรุณาลองใหม่อีกครั้ง');
      this.snackBar.open(this.exportError ?? 'เกิดข้อผิดพลาดในการ Export', 'ปิด', { duration: 6000 });
    } finally {
      this.exporting = false;
    }
  }

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
