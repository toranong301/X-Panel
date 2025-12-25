import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { ExcelExportEngine, ExportReport } from '../../core/export/engine/excel-export.engine';
import { resolveTemplate } from '../../core/export/registry/template-registry';
import { CanonicalGhgService } from '../../core/services/canonical-ghg.service';
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
  private exportEngine = inject(ExcelExportEngine);
  private snackBar = inject(MatSnackBar);

  cycleId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);
  templateKey = 'MBAX_TGO_11102567::demo';
  sheetName = this.route.snapshot.data['sheetName'] ?? '';
  title = this.route.snapshot.data['title'] ?? this.sheetName;
  range = this.route.snapshot.data['range'] as string | undefined;

  exporting = false;
  exportError: string | null = null;
  report: ExportReport | null = null;

  async exportSheet() {
    this.exporting = true;
    this.exportError = null;
    this.report = null;

    try {
      const canonical = this.canonicalSvc.build(this.cycleId);
      const bundle = resolveTemplate(this.templateKey);
      const outputName = `V-Sheet_${bundle.spec.templateId}_${this.sheetName}_cycle-${this.cycleId}.xlsx`;

      this.report = await this.exportEngine.exportFromUrl({
        templateUrl: bundle.templateUrl,
        templateSpec: bundle.spec,
        adapter: bundle.adapter,
        canonical,
        outputName,
      });

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
}
