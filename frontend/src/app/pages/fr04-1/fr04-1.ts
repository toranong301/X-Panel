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
import { DataEntryService } from '../../core/services/data-entry.service';
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
  private dataEntrySvc = inject(DataEntryService);
  private exportEngine = inject(ExcelExportEngine);
  private snackBar = inject(MatSnackBar);

  cycleId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);

  // templates (add more by registering in resolveTemplate)
  templateOptions = [
    { key: 'MBAX_TGO_11102567::demo', label: 'MBAX-TGO-11102567 (Demo)' },
  ];
  templateKey = this.templateOptions[0]?.key ?? 'MBAX_TGO_11102567::demo';

  // Excel features toggle (some orgs use older Excel versions)
  useModernExcel = false;

  // data preview
  fr041Rows: Fr041Row[] = [];
  scope1RowCount = 0;
  hasScope1Data = false;
  selectedScope3: any[] = [];

  // report
  report: ExportReport | null = null;
  exporting = false;
  exportError: string | null = null;

  ngOnInit(): void {
    this.reloadPreview();
  }

  reloadPreview() {
    this.dataEntrySvc.load(this.cycleId);
    const canonical = this.canonicalSvc.build(this.cycleId);
    this.fr041Rows = this.buildFr041Rows(canonical);
    this.scope1RowCount = this.fr041Rows.filter(row => row.type === 'data').length;
    this.hasScope1Data = this.scope1RowCount > 0;
  }

  async exportVSheet() {
    this.exporting = true;
    this.exportError = null;
    this.report = null;

    try {
      const canonical = await this.canonicalSvc.build(this.cycleId);
      const bundle = resolveTemplate(this.templateKey);
      const selections = { significantScope3Top6: this.selectedScope3 };

      const outputName = `V-Sheet_${bundle.spec.templateId}_cycle-${this.cycleId}.xlsx`;
      console.log(bundle.templateUrl, outputName);

      this.report = await this.exportEngine.exportFromUrl({
        templateUrl: bundle.templateUrl,
        templateSpec: bundle.spec,
        adapter: bundle.adapter,
        canonical,
        selections,
        outputName,
        excelFeaturesOverride: {
          dynamicArray: this.useModernExcel,
          xlookup: this.useModernExcel,
        },
      });
    } catch (e: any) {
      console.error('Export FR-04.1 failed', e);
      alert('Export ล้มเหลว กรุณาลองใหม่อีกครั้ง');
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

    const scope1 = inventory.filter(item =>
      Number(item.scope) === 1 &&
      (String(item.subScope) === '1.1' || String(item.subScope) === '1.2'),
    );

    rows.push({ type: 'section', label: 'ขอบเขต 1' });
    this.pushScope1Groups(rows, scope1);

    return rows;
  }

  private pushScope1Groups(rows: Fr041Row[], items: InventoryItemRow[]) {
    if (!items.length) {
      rows.push({ type: 'empty', label: 'ยังไม่มีข้อมูล กรุณากรอก Data-entry ก่อน' });
      return;
    }

    const sorted = [...items].sort((a, b) => {
      const scopeCompare = String(a.subScope || '').localeCompare(String(b.subScope || ''));
      if (scopeCompare !== 0) return scopeCompare;
      return String(a.itemLabel || '').localeCompare(String(b.itemLabel || ''));
    });

    const grouped = new Map<string, InventoryItemRow[]>();
    for (const item of sorted) {
      const label = String(item.categoryLabel || 'อื่น ๆ');
      const list = grouped.get(label) ?? [];
      list.push(item);
      grouped.set(label, list);
    }

    for (const [label, groupItems] of grouped.entries()) {
      rows.push({ type: 'group', label });
      this.pushItemRows(rows, groupItems, 'ยังไม่มีข้อมูล');
    }
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
        scopeLabel: 'ขอบเขต 1',
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
