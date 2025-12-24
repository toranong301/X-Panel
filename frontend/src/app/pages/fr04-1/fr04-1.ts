import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';

import { ExcelExportEngine, ExportReport } from '../../core/export/engine/excel-export.engine';
import { resolveTemplate } from '../../core/export/registry/template-registry';
import { CanonicalGhgService } from '../../core/services/canonical-ghg.service';
import { Scope3SignificanceRow } from '../../models/refs.model';

@Component({
  selector: 'app-fr04-1',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,

    MatCardModule,
    MatDividerModule,
    MatTableModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
  ],
  templateUrl: './fr04-1.html',
  styleUrls: ['./fr04-1.scss'],
})
export class Fr041Component implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private canonicalSvc = inject(CanonicalGhgService);
  private exportEngine = inject(ExcelExportEngine);

  cycleId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);

  // templates (add more by registering in resolveTemplate)
  templateId: string = 'MBAX_TGO_11102567';

  // Excel features toggle (some orgs use older Excel versions)
  useModernExcel = false;

  // data preview
  selectedScope3: any[] = [];

  // report
  report: ExportReport | null = null;
  exporting = false;
  exportError: string | null = null;

  displayedColumns = ['subScope', 'isoNo', 'itemLabel', 'ghgTco2e', 'sharePct', 'assessment', 'selection'];
  previewRows: Scope3SignificanceRow[] = [];
  ngOnInit(): void {
    this.reloadPreview();
  }

  reloadPreview() {
   const canonical = this.canonicalSvc.buildCanonicalForCycle(this.cycleId);

// ดึงจาก canonical.fr03_2 ตรงๆ (นี่คือ FR-03.2 canonical)
const sig = (canonical.fr03_2 ?? [])
  .filter((r: Scope3SignificanceRow) =>
    r.assessment === 'มีนัยสำคัญ' && r.selection === 'เลือกประเมิน'
  )
  .sort((a: Scope3SignificanceRow, b: Scope3SignificanceRow) =>
    Number(b.ghgTco2e || 0) - Number(a.ghgTco2e || 0)
  )
  .slice(0, 6);

this.previewRows = sig;
  }

  async exportVSheet() {
    this.exporting = true;
    this.exportError = null;
    this.report = null;

    try {
      const canonical = this.canonicalSvc.build(this.cycleId);
      const bundle = resolveTemplate(this.templateId);

      const filename = `V-Sheet_${this.templateId}_cycle-${this.cycleId}.xlsx`;

      this.report = await this.exportEngine.exportFromUrl({
        templateUrl: bundle.templateUrl,
        spec: bundle.spec,
        adapter: bundle.adapter,
        canonical,
        filename,
        excelFeaturesOverride: {
          dynamicArray: this.useModernExcel,
          xlookup: this.useModernExcel,
        },
      });
    } catch (e: any) {
      this.exportError = e?.message || String(e);
    } finally {
      this.exporting = false;
      this.reloadPreview();
    }
  }

  goFr032() {
    this.router.navigate(['/cycles', this.cycleId, 'fr03-2']);
  }

  goScope3Screen() {
    this.router.navigate(['/cycles', this.cycleId, 'scope3-screen']);
  }

  fmt(n: any, digits = 2) {
    if (n === null || n === undefined) return '';
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
}
