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
import { Fr01Service } from '../../core/services/fr01.service';
import { InventoryItemRow } from '../../models/refs.model';
import { Fr01Data } from '../../models/fr01.model';

type Fr041Row = {
  type: 'section' | 'group' | 'empty' | 'data';
  no?: number;
  label?: string;
  scopeLabel?: string;
  itemLabel?: string;
  evidence?: string;
  unit?: string;
  quantity?: number | null;
  efCo2?: number | null;
  efCh4?: number | null;
  efN2o?: number | null;
  efTotal?: number | null;
  totalCo2?: number | null;
  totalCh4?: number | null;
  totalN2o?: number | null;
  totalCo2e?: number | null;
  sharePct?: number | null;
  remark?: string;
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
  private fr01Svc = inject(Fr01Service);
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
  fr01Meta: Fr01Data | null = null;
  reportYearLabel = '-';
  dataPeriodLabel = '-';

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
    this.fr01Meta = canonical.fr01 ?? this.fr01Svc.load(this.cycleId);
    this.reportYearLabel = this.getReportYearLabel(this.fr01Meta);
    this.dataPeriodLabel = this.getDataPeriodLabel(this.fr01Meta);
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
      Number(item.scope) === 1,
    );
    const scope2 = inventory.filter(item => Number(item.scope) === 2);
    const scope3 = inventory.filter(item => Number(item.scope) === 3);

    rows.push({ type: 'section', label: 'ขอบเขต 1' });
    this.pushScopeGroups(rows, scope1, 'ขอบเขต 1');

    rows.push({ type: 'section', label: 'ขอบเขต 2' });
    this.pushScopeGroups(rows, scope2, 'ขอบเขต 2');

    rows.push({ type: 'section', label: 'ขอบเขต 3' });
    this.pushScopeGroups(rows, scope3, 'ขอบเขต 3');

    this.applySharePct(rows);
    return rows;
  }

  private pushScopeGroups(rows: Fr041Row[], items: InventoryItemRow[], scopeLabel: string) {
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
      this.pushItemRows(rows, groupItems, 'ยังไม่มีข้อมูล', scopeLabel);
    }
  }

  private pushItemRows(rows: Fr041Row[], items: InventoryItemRow[], emptyLabel: string, scopeLabel: string) {
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
      const efGas = item.efGas ?? {};
      const efCo2 = Number.isFinite(Number(efGas.CO2?.ef)) ? Number(efGas.CO2?.ef) : null;
      const efCh4 = Number.isFinite(Number(efGas.CH4?.ef)) ? Number(efGas.CH4?.ef) : null;
      const efN2o = Number.isFinite(Number(efGas.N2O?.ef)) ? Number(efGas.N2O?.ef) : null;

      const explicitEf = Number.isFinite(Number(item.ef)) ? Number(item.ef) : null;
      const efTotal = explicitEf ?? this.sumEf([efCo2, efCh4, efN2o]);

      const totalCo2 = quantity !== null && efCo2 !== null ? (quantity * efCo2) / 1000 : null;
      const totalCh4 = quantity !== null && efCh4 !== null ? (quantity * efCh4) / 1000 : null;
      const totalN2o = quantity !== null && efN2o !== null ? (quantity * efN2o) / 1000 : null;
      const totalCo2e = Number.isFinite(Number(item.totalTco2e))
        ? Number(item.totalTco2e)
        : efTotal !== null && quantity !== null
          ? (quantity * efTotal) / 1000
          : null;

      rows.push({
        type: 'data',
        scopeLabel,
        itemLabel: String(item.itemLabel || ''),
        evidence: String(item.dataEvidence || ''),
        unit: String(item.unit || ''),
        quantity,
        efCo2,
        efCh4,
        efN2o,
        efTotal,
        totalCo2,
        totalCh4,
        totalN2o,
        totalCo2e,
        remark: String(item.remark || ''),
        sharePct: null,
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

  private sumEf(values: Array<number | null>): number | null {
    const filtered = values.filter(v => Number.isFinite(Number(v))) as number[];
    if (!filtered.length) return null;
    return filtered.reduce((sum, v) => sum + Number(v), 0);
  }

  private applySharePct(rows: Fr041Row[]) {
    const dataRows = rows.filter(r => r.type === 'data');
    const total = dataRows.reduce((sum, row) => sum + Number(row.totalCo2e || 0), 0);
    let counter = 1;
    for (const row of dataRows) {
      row.no = counter++;
      row.sharePct = total > 0 && row.totalCo2e !== null ? (Number(row.totalCo2e) / total) * 100 : null;
    }
  }

  private getReportYearLabel(meta: Fr01Data | null): string {
    const date = meta?.dataPeriod?.end || meta?.dataPeriod?.start || meta?.preparedDate;
    if (!date) return '-';
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return '-';
    return String(parsed.getFullYear());
  }

  private getDataPeriodLabel(meta: Fr01Data | null): string {
    if (!meta?.dataPeriod?.start && !meta?.dataPeriod?.end) return '-';
    const start = meta?.dataPeriod?.start ? this.formatDate(meta.dataPeriod.start) : '-';
    const end = meta?.dataPeriod?.end ? this.formatDate(meta.dataPeriod.end) : '-';
    return `${start} ถึง ${end}`;
  }

  formatDate(value?: string): string {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('th-TH');
  }
}
