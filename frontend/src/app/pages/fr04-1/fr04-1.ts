import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { CanonicalGhgService, SplitSummaryRow } from '../../core/services/canonical-ghg.service';
import {
  CycleApiService,
  EfAr5Option,
  EfCatalogOption,
  Fr041Config,
  Fr041Source,
  Scope11StationaryItem,
  TemplateInfo,
  TemplateProfile,
  TemplateSetInfo,
} from '../../core/services/cycle-api.service';
import { CycleStateService } from '../../core/services/cycle-state.service';
import { DataEntryService } from '../../core/services/data-entry.service';
import { Fr01Service } from '../../core/services/fr01.service';
import { SHEET_REGISTRY } from '../../core/sheet.registry';
import { computeBlendFromAnnualL, FuelBlendKey } from '../../core/sheets/fuel-blend.registry';
import { Fr01Data } from '../../models/fr01.model';
import { ExcelSheetPreviewComponent } from '../../shared/components/excel-sheet-preview/excel-sheet-preview.component';

type Fr041AvailableItem = Scope11StationaryItem & {
   sectionId?: string;
   sectionTitle?: string;
   scope?: string;
 };
@Component({
  selector: 'app-fr04-1',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,

    MatCardModule,
    MatCheckboxModule,
    MatDividerModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    ExcelSheetPreviewComponent,
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
  private cycleApi = inject(CycleApiService);
  private cycleState = inject(CycleStateService);
  private snackBar = inject(MatSnackBar);
  private withTimeout<T>(p: Promise<T>, ms = 12000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Request timeout after ${ms}ms`)), ms)),
  ]);
}


  cycleId = 0;
  readonly sheetId = SHEET_REGISTRY['FR041'].sheetId;

  templateKey = 'mbax';
  useModernExcel = false;
  templates: TemplateInfo[] = [];
  templateId = 'mbax';
  templateLoading = false;
  templateStyle = 'default';

  templateSets: TemplateSetInfo[] = [];
  templateSetId = 'vsheet_base';
  templateSetLoading = false;

  sources: Fr041Source[] = [];
  sourcesLoading = false;

  availableItems: Fr041AvailableItem[] = [];

  scope11Items: Scope11StationaryItem[] = [];
  scope11Loading = false;
  scope11LoadError: string | null = null;
  scope11SplitEnabled = false;
  scope11PeriodYear: number | null = null;
  scope11HeaderMonths: Record<string, number | null> | null = null;
  selectedRowIds = new Set<string>();
  selectionSaving = false;
  previewKey = 0;
  efOptions: EfAr5Option[] = [];
  efSelectionByRowId: Record<string, string> = {};

  selectedScope3: any[] = [];
  fr01Meta: Fr01Data | null = null;
  reportYearLabel = '-';
  dataPeriodLabel = '-';

  // report
  exporting = false;
  exportError: string | null = null;

  ngOnInit(): void {
    void this.resolveCycleId();
    void this.loadTemplates();
    void this.loadTemplateSets();
  }

  private async resolveCycleId() {
    const routeId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);
    this.cycleId = await this.cycleState.resolveCycleId(routeId);
    await this.loadTemplateState();
    await this.loadSources();
    await this.loadEfOptions();
    await this.loadFr041Data();
    this.reloadPreview();
  }

  private async loadTemplateState() {
    this.templateLoading = true;
    try {
      const cycle = await this.cycleApi.getCycle(this.cycleId);
      this.templateId = String(cycle?.template_id || 'mbax');
      this.templateKey = this.templateId;
      this.templateStyle = this.resolveTemplateStyle(this.templateId, this.templates);
    } catch (error: any) {
      console.error('Load template state failed', error);
      this.snackBar.open(error?.message || 'โหลด Template ไม่สำเร็จ', 'ปิด', { duration: 6000 });
    } finally {
      this.templateLoading = false;
    }
  }

  private async loadTemplates() {
    try {
      this.templates = await this.cycleApi.getTemplates();
      this.templateStyle = this.resolveTemplateStyle(this.templateId, this.templates);
    } catch (error: any) {
      console.error('Load templates failed', error);
      this.snackBar.open(error?.message || 'โหลด Template ไม่สำเร็จ', 'ปิด', { duration: 6000 });
    }
  }

  private async loadTemplateSets() {
    this.templateSetLoading = true;
    try {
      this.templateSets = await this.cycleApi.getTemplateSets();
    } catch (error: any) {
      console.error('Load template sets failed', error);
      this.snackBar.open(error?.message || 'โหลด Template Set ไม่สำเร็จ', 'ปิด', { duration: 6000 });
    } finally {
      this.templateSetLoading = false;
    }
  }

  private async loadSources() {
  if (!this.cycleId) return;

  this.sourcesLoading = true;
  // เคลียร์ error เก่า
  this.scope11LoadError = null;

  try {
    const sources = await this.cycleApi.getFr041Sources(this.cycleId);

    // กันเคส resp แปลก/ไม่เป็น array
    this.sources = Array.isArray(sources) ? sources : [];

    if (!this.sources.length) {
      const msg = 'ไม่พบ Sources สำหรับ FR-04.1 (fr041/sources ว่าง)';
      this.scope11LoadError = msg;
      this.snackBar.open(msg, 'ปิด', { duration: 8000 });
    }
  } catch (error: any) {
    console.error('Load FR-04.1 sources failed', error);

    const msg =
      error?.error?.message || // กรณี HttpErrorResponse จาก backend
      error?.message ||
      'โหลด FR-04.1 sources ไม่สำเร็จ';

    this.sources = [];
    this.scope11LoadError = msg;
    this.snackBar.open(msg, 'ปิด', { duration: 8000 });
  } finally {
    this.sourcesLoading = false;
  }
}


  private async loadFr041Data() {
    this.scope11Loading = true;
    this.scope11LoadError = null;
    try {
      const endpoints = (this.sources || []).filter(src => !!src.endpoint);
      if (!endpoints.length) {
        this.availableItems = [];
        this.scope11Items = [];
        this.scope11SplitEnabled = false;
        this.scope11PeriodYear = null;
        this.scope11HeaderMonths = null;
        return;
      }

      const configResult = await this.cycleApi.getFr041Config(this.cycleId).catch(error => {
        console.error('Load FR-04.1 config failed', error);
        return null;
      });

      const itemResults = await Promise.all(endpoints.map(async source => {
        try {
          const resp = await this.cycleApi.getFr041SourceItems(source.endpoint);
          return { source, resp };
        } catch (error: any) {
          console.error('Load source items failed', source, error);
          return { source, resp: null, error };
        }
      }));

      const merged: Fr041AvailableItem[] = [];
      let scope11Resp: any = null;
      let hasItemError = false;

      for (const result of itemResults) {
        if (!result?.resp) {
          hasItemError = true;
          continue;
        }
        if (result.source?.sectionId === '1.1') {
          scope11Resp = result.resp;
        }
        const items = this.extractSourceItems(result.resp);
        if (!items.length) {
          continue;
        }
        for (const it of items) {
          merged.push({
            ...it,
            sectionId: result.source?.sectionId,
            sectionTitle: result.source?.sectionTitle,
            scope: result.source?.scope,
          } as any);
        }
      }

        if (hasItemError) {
          const msg = 'โหลดรายการบางรายการไม่สำเร็จ';
          this.scope11LoadError = msg;
          this.snackBar.open(msg, 'ปิด', { duration: 6000 });
        }

        if (!merged.length) {
          const scope11Items = this.extractSourceItems(scope11Resp);
          if (!scope11Items.length) {
            scope11Resp = await this.cycleApi.getScope11StationaryItems(this.cycleId).catch(() => null);
          }
          const fallbackItems = this.extractSourceItems(scope11Resp);
          if (fallbackItems.length) {
            const fallbackSource = this.sources.find(src => src.sectionId === '1.1');
            for (const it of fallbackItems) {
              merged.push({
                ...it,
                sectionId: fallbackSource?.sectionId ?? '1.1',
                sectionTitle: fallbackSource?.sectionTitle ?? '1.1 Stationary combustion',
                scope: fallbackSource?.scope ?? 'stationary',
              } as any);
            }
          }
        }

        this.availableItems = merged;
      this.scope11Items = this.extractSourceItems(scope11Resp);
      this.scope11SplitEnabled = Boolean(scope11Resp?.splitEnabled);
      this.scope11PeriodYear = scope11Resp?.periodYear ?? null;
      this.scope11HeaderMonths = scope11Resp?.headerMonths ?? null;

      this.applySelectionConfig(configResult, this.availableItems);
      this.syncFr041SelectionLocal();
    } catch (error: any) {
      console.error('Load FR-04.1 data failed', error);
      const msg = error?.message || 'โหลดรายการ Scope 1.1 ไม่สำเร็จ';
      this.scope11LoadError = msg;
      this.snackBar.open(msg, 'ปิด', { duration: 6000 });
    } finally {
      this.scope11Loading = false;
    }
  }

  private extractSourceItems(resp: any): Scope11StationaryItem[] {
    if (Array.isArray(resp)) return resp as Scope11StationaryItem[];
    if (Array.isArray(resp?.items)) return resp.items as Scope11StationaryItem[];
    if (Array.isArray(resp?.data?.items)) return resp.data.items as Scope11StationaryItem[];
    return [];
  }

  reloadPreview() {
    this.dataEntrySvc.load(this.cycleId);
    const canonical = this.canonicalSvc.build(this.cycleId);
    this.fr01Meta = canonical.fr01 ?? this.fr01Svc.load(this.cycleId);
    this.reportYearLabel = this.getReportYearLabel(this.fr01Meta);
    this.dataPeriodLabel = this.getDataPeriodLabel(this.fr01Meta);
  }

  async exportVSheet() {
    this.exporting = true;
    this.exportError = null;

    try {
      const canonical = await this.canonicalSvc.build(this.cycleId);
      const updateResult = await this.cycleApi.updateCycleData(this.cycleId, canonical);
      this.cycleId = updateResult.cycleId;
      this.cycleState.setSelectedCycleId(updateResult.cycleId);
      const download = await this.cycleApi.exportCycle(updateResult.cycleId);
      this.downloadFile(download.blob, download.filename);
      this.snackBar.open('Export สำเร็จ', 'ปิด', { duration: 4000 });
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

  private downloadFile(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async changeTemplate(templateId: string) {
    try {
      await this.cycleApi.updateCycleTemplate(this.cycleId, templateId);
      this.templateId = templateId;
      this.templateKey = templateId;
      this.templateStyle = this.resolveTemplateStyle(this.templateId, this.templates);
      await this.loadEfOptions();
      this.snackBar.open('Template updated', 'ปิด', { duration: 3000 });
      this.reloadPreview();
    } catch (error: any) {
      console.error('Update template failed', error);
      this.snackBar.open(error?.message || 'อัปเดต Template ไม่สำเร็จ', 'ปิด', { duration: 6000 });
    }
  }

  async changeTemplateSet(templateSetId: string) {
    if (!templateSetId) return;
    this.templateSetId = templateSetId;
    await this.saveFr041Config();
  }

  toggleSelection(item: Fr041AvailableItem, checked: boolean) {
    if (!item?.rowId) return;
    const next = new Set(this.selectedRowIds);
    if (checked) {
      next.add(item.rowId);
      if (!this.efSelectionByRowId[item.rowId]) {
        const efId = this.defaultEfIdForFuelKey(item.fuelKey);
        if (efId) {
          this.efSelectionByRowId = { ...this.efSelectionByRowId, [item.rowId]: efId };
        }
      }
    } else {
      next.delete(item.rowId);
    }
    this.selectedRowIds = next;
    void this.saveFr041Config();
  }

  isSelected(item: Fr041AvailableItem): boolean {
    return Boolean(item?.rowId && this.selectedRowIds.has(item.rowId));
  }

  get selectedItems(): Fr041AvailableItem[] {
    if (!this.availableItems.length) return [];
    return this.availableItems.filter(item => this.selectedRowIds.has(item.rowId));
  }

  get selectedSummaryRows() {
    const allowed: FuelBlendKey[] = ['B7', 'B10', '91/95', 'E20'];
    return this.selectedItems.map(item => {
      const fuelKeyRaw = String(item.fuelKey || '').toUpperCase();
      const fuelKey = fuelKeyRaw || '-';
      const unit = item.unit || '-';
      const total = this.resolveTotal(item);
      const row = {
        itemId: item.rowId,
        itemLabel: item.itemLabel || item.rowId,
        fuelKey,
        otherType: item.otherType,
        evidence: item.evidence || '-',
        unit,
        total,
        dieselL: null as number | null,
        biodieselL: null as number | null,
        biodieselKg: null as number | null,
        gasolineL: null as number | null,
        ethanolL: null as number | null,
        ethanolKg: null as number | null,
        efId: this.getEfIdForItem(item),
      };

      if (String(unit).toLowerCase() !== 'l' || total === null) return row;
      if (!allowed.includes(fuelKeyRaw as FuelBlendKey)) return row;

      const blend = computeBlendFromAnnualL(total, fuelKeyRaw as FuelBlendKey);
      return {
        ...row,
        dieselL: blend.dieselL,
        biodieselL: blend.biodieselL,
        biodieselKg: blend.biodieselKg,
        gasolineL: blend.gasolineL,
        ethanolL: blend.ethanolL,
        ethanolKg: blend.ethanolKg,
      };
    });
  }

  sumMonths(months: Record<string, number | null> | undefined): number | null {
    if (!months) return null;
    let total = 0;
    let hasValue = false;
    for (let i = 1; i <= 12; i++) {
      const value = months[`M${i}`];
      if (Number.isFinite(Number(value))) {
        hasValue = true;
        total += Number(value);
      }
    }
    return hasValue ? total : null;
  }

  private resolveTotal(item: Scope11StationaryItem): number | null {
    if (Number.isFinite(Number(item.total))) {
      return Number(item.total);
    }
    return this.sumMonths(item.months);
  }

  formatFixed2(value: number | string | null | undefined): string {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) return '';
    return normalized.toFixed(2);
  }

  get monthsHeader(): number[] {
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }

  periodYearLabel(): string {
    if (this.scope11PeriodYear) return String(this.scope11PeriodYear);
    return this.reportYearLabel || '-';
  }

  get templateStyleClass(): string {
    return this.templateStyle === 'mbax' ? 'card--compact' : 'card--standard';
  }

  get templateOptions(): TemplateInfo[] {
    return this.templates;
  }

  private resolveTemplateStyle(templateId: string, templates: TemplateInfo[]): string {
    const profile = templates.find(t => t.id === templateId);
    const uiFlags = (profile as TemplateProfile | undefined)?.uiFlags;
    const style = String(uiFlags?.['compactSummaryStyle'] ?? '').trim();
    return style || 'default';
  }

  private applySelectionConfig(config: Fr041Config | null, items: Fr041AvailableItem[]) {
    const rowIds = new Set(items.map(item => item.rowId));
    const selected = (config?.selectedRowIds ?? []).filter(rowId => rowIds.has(rowId));
    this.selectedRowIds = new Set(selected);

    const fromOptions = String(config?.options?.['templateSetId'] ?? '').trim();
    if (fromOptions) {
      this.templateSetId = fromOptions;
    }

    const efOptions = config?.options?.['efSelectionByRowId'];
    if (efOptions && typeof efOptions === 'object') {
      this.efSelectionByRowId = { ...(efOptions as Record<string, string>) };
    }

    if (this.selectedRowIds.size) {
      const next = { ...this.efSelectionByRowId };
      for (const item of items) {
        if (!this.selectedRowIds.has(item.rowId)) continue;
        if (next[item.rowId]) continue;
        const efId = this.defaultEfIdForFuelKey(item.fuelKey);
        if (efId) next[item.rowId] = efId;
      }
      this.efSelectionByRowId = next;
    }
  }

  private async saveFr041Config() {
    if (!this.cycleId) return;
    this.selectionSaving = true;
    try {
      this.syncFr041SelectionLocal();
      const payload = {
        selectedRowIds: Array.from(this.selectedRowIds.values()),
        options: {
          templateSetId: this.templateSetId,
          efSelectionByRowId: this.efSelectionByRowId,
        },
      };
      await this.withTimeout(this.cycleApi.updateFr041Config(this.cycleId, payload), 12000);
      this.previewKey += 1;
    } catch (error: any) {
      console.error('Save FR-04.1 config failed', error);
      this.snackBar.open(error?.message || 'บันทึกการเลือกไม่สำเร็จ', 'ปิด', { duration: 6000 });
    } finally {
      this.selectionSaving = false;
    }
  }

  async loadEfOptions() {
    try {
      const ar5 = await this.cycleApi.getEfCatalog(this.templateKey, 'AR5', 'stationary');
      if (Array.isArray(ar5) && ar5.length) {
        this.efOptions = ar5 as EfCatalogOption[];
        return;
      }
      const other = await this.cycleApi.getEfCatalog(this.templateKey, 'OTHER', 'stationary');
      this.efOptions = Array.isArray(other) ? other : [];
    } catch (error: any) {
      console.error('Load EF options failed', error);
      this.efOptions = [];
    }
  }

  onEfChangeByRowId(rowId: string, efId: string): void {
    if (!rowId) return;
    this.efSelectionByRowId = { ...this.efSelectionByRowId, [rowId]: efId };
    void this.saveFr041Config();
  }

  getEfIdForItem(item: Scope11StationaryItem): string {
    if (!item?.rowId) return '';
    const picked = this.efSelectionByRowId[item.rowId];
    return picked ?? this.defaultEfIdForFuelKey(item.fuelKey);
  }

  private defaultEfIdForFuelKey(fuelKey: string): string {
    const key = String(fuelKey || '').trim().toUpperCase();
    if (key === 'B7' || key === 'B10') return 'SC_GAS_DIESEL_OIL_L';
    if (key === '91/95' || key === 'E20') return 'SC_MOTOR_GASOLINE_L';
    if (key === 'LPG') return 'SC_LPG_L';
    return '';
  }

  private syncFr041SelectionLocal(): void {
    if (!this.cycleId) return;
    const entryDoc = this.dataEntrySvc.load(this.cycleId) ?? {
      cycleId: this.cycleId,
      scope1: [],
      scope2: [],
      scope3: [],
    };

    const splitRows: SplitSummaryRow[] = this.selectedSummaryRows.map(row => {
      const splitValues = [
        row.dieselL,
        row.biodieselL,
        row.biodieselKg,
        row.gasolineL,
        row.ethanolL,
        row.ethanolKg,
      ];
      const hasSplit = splitValues.some(value => Number.isFinite(Number(value)));
      const otherQty = !hasSplit && Number.isFinite(Number(row.total)) ? Number(row.total) : undefined;
      return {
        itemId: String((row as any).itemId ?? ''),
        itemName: String(row.itemLabel ?? ''),
        fuelKey: String(row.fuelKey ?? ''),
        evidence: String(row.evidence ?? ''),
        dieselL: row.dieselL ?? undefined,
        biodieselL: row.biodieselL ?? undefined,
        biodieselKg: row.biodieselKg ?? undefined,
        gasolineL: row.gasolineL ?? undefined,
        ethanolL: row.ethanolL ?? undefined,
        ethanolKg: row.ethanolKg ?? undefined,
        otherQty,
        otherUnit: String(row.unit ?? ''),
      };
    });

    const efMap = { byItemId: { ...this.efSelectionByRowId } };
    const rows = this.canonicalSvc.buildFr041SelectionRows(splitRows, efMap, 11);

    this.dataEntrySvc.save(this.cycleId, {
      ...entryDoc,
      fr041Selection: rows,
    });
  }
}
