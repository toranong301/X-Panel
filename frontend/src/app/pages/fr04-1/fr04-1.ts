import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { ExcelExportEngine, ExportReport } from '../../core/export/engine/excel-export.engine';
import { resolveTemplate } from '../../core/export/registry/template-registry';
import { CanonicalCycleData, CanonicalGhgService } from '../../core/services/canonical-ghg.service';
import { InventoryItemRow } from '../../models/refs.model';

type Fr041Row = {
  type: 'section' | 'group' | 'empty' | 'data';
  label?: string;
  scopeLabel?: string;
  itemLabel?: string;
  unit?: string;
  quantity?: number | null;
  ef?: number | null;
  total?: number | null;
};

@Component({
  selector: 'app-fr04-1',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,

    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './fr04-1.html',
  styleUrls: ['./fr04-1.scss'],
})
export class Fr041Component implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private canonicalSvc = inject(CanonicalGhgService);
  private exportEngine = inject(ExcelExportEngine);
  private snackBar = inject(MatSnackBar);

  cycleId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);

  // templates (add more by registering in resolveTemplate)
  templateId: string = 'MBAX_TGO_11102567';

  // Excel features toggle (some orgs use older Excel versions)
  useModernExcel = false;

  // data preview
  fr041Rows: Fr041Row[] = [];

  // report
  report: ExportReport | null = null;
  exporting = false;
  exportError: string | null = null;

  ngOnInit(): void {
    this.reloadPreview();
  }

  reloadPreview() {
    const canonical = this.canonicalSvc.buildCanonicalForCycle(this.cycleId);
    this.fr041Rows = this.buildFr041Rows(canonical);
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
      console.error('Export FR-04.1 failed', e);
      this.exportError = e?.message || String(e);
      this.snackBar.open(this.exportError ?? 'เกิดข้อผิดพลาดในการ Export', 'ปิด', { duration: 6000 });
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

  private buildFr041Rows(canonical: CanonicalCycleData): Fr041Row[] {
    const rows: Fr041Row[] = [];
    const inventory = (canonical.inventory ?? []) as InventoryItemRow[];

    const scope1 = inventory.filter(item => Number(item.scope) === 1);
    const scope2 = inventory.filter(item => Number(item.scope) === 2);
    const scope3 = inventory.filter(item => Number(item.scope) === 3);

    rows.push({ type: 'section', label: 'ขอบเขต 1' });
    this.pushScope1Groups(rows, scope1);

    rows.push({ type: 'section', label: 'ขอบเขต 2' });
    this.pushItemRows(rows, scope2, 'ยังไม่มีข้อมูลขอบเขต 2');

    rows.push({ type: 'section', label: 'ขอบเขต 3' });
    this.pushItemRows(rows, scope3, 'ยังไม่มีข้อมูลขอบเขต 3');

    return rows;
  }

  private pushScope1Groups(rows: Fr041Row[], items: InventoryItemRow[]) {
    const stationary = items.filter(item => String(item.subScope) === '1.1');
    const mobile = items.filter(item => String(item.subScope) === '1.2');
    const fugitive = items.filter(item => String(item.subScope).startsWith('1.4'));

    rows.push({ type: 'group', label: 'Stationary combustion' });
    this.pushItemRows(rows, stationary, 'ยังไม่มีข้อมูล Stationary combustion');

    rows.push({ type: 'group', label: 'Mobile combustion' });
    this.pushItemRows(rows, mobile, 'ยังไม่มีข้อมูล Mobile combustion');

    rows.push({ type: 'group', label: 'Fugitive' });
    this.pushItemRows(rows, fugitive, 'ยังไม่มีข้อมูล Fugitive');
  }

  private pushItemRows(rows: Fr041Row[], items: InventoryItemRow[], emptyLabel: string) {
    if (!items.length) {
      rows.push({ type: 'empty', label: emptyLabel });
      return;
    }

    const sorted = [...items].sort((a, b) => {
      const scopeCompare = String(a.subScope || '').localeCompare(String(b.subScope || ''));
      if (scopeCompare !== 0) return scopeCompare;
      return String(a.itemLabel || '').localeCompare(String(b.itemLabel || ''));
    });

    for (const item of sorted) {
      const quantity = this.getQuantity(item);
      const ef = Number.isFinite(Number(item.ef)) ? Number(item.ef) : null;
      const total = Number.isFinite(Number(item.totalTco2e))
        ? Number(item.totalTco2e)
        : ef !== null && quantity !== null
          ? (quantity * ef) / 1000
          : null;

      rows.push({
        type: 'data',
        scopeLabel: String(item.subScope || ''),
        itemLabel: String(item.itemLabel || ''),
        unit: String(item.unit || ''),
        quantity,
        ef,
        total,
      });
    }
  }

  private getQuantity(item: InventoryItemRow): number | null {
    if (Number.isFinite(Number(item.quantityPerYear))) return Number(item.quantityPerYear);
    if (Array.isArray(item.quantityMonthly)) {
      return item.quantityMonthly.reduce((sum, v) => sum + Number(v || 0), 0);
    }
    return null;
  }
}
