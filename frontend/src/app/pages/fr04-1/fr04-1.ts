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
import { computeBlendFromAnnualL, FuelBlendKey, resolveBlendKey } from '../../core/sheets/fuel-blend.registry';
import { Fr01Data } from '../../models/fr01.model';
import { ExcelSheetPreviewComponent } from '../../shared/components/excel-sheet-preview/excel-sheet-preview.component';

type Fr041AvailableItem = Scope11StationaryItem & {
   sectionId?: string;
   sectionTitle?: string;
   scope?: string | null | undefined;
 };
type Fr041SelectionComponent = 'DIESEL_L' | 'BIODIESEL_KG' | 'GASOLINE_L' | 'ETHANOL_KG';
type Fr041SelectionLine = {
  lineId: string;
  parentRowId: string;
  component: Fr041SelectionComponent;
  include: boolean;
  efCatalog: string | null;
  efId: string | null;
  qty: number | null;
  unit: 'L' | 'kg';
  itemLabel: string;
  evidence: string;
  fuelKey: string;
  sectionId?: string | null;
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
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveQueued = false;
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
  selectionLines: Fr041SelectionLine[] = [];
  missingEfCount = 0;
  selectionSaving = false;
  previewKey = 0;
  previewEnabled = true;
  efOptions: EfCatalogOption[] = [];
  efCatalogWarning: string | null = null;
  cycleYear: number | null = null;
  fr041ConfigOptions: Record<string, any> | null = null;

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
      this.cycleYear = Number.isFinite(Number(cycle?.year)) ? Number(cycle?.year) : null;
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
    try {
      const s = await this.cycleApi.getFr041Sources(this.cycleId);
      this.sources = Array.isArray(s) ? s : [];

      if (!this.sources.length) {
        // fallback so page never blocks on empty sources
        this.sources = [{
          sectionId: '1.1',
          sectionTitle: '1.1 Stationary combustion',
          sheetName: '1.1 Stationary',
          endpoint: `/api/cycles/${this.cycleId}/scope11/stationary/items`,
          scope: 'stationary',
          sourceType: 'scope11',
          itemCountIncluded: 0,
        }];
        console.warn('FR-04.1 sources empty; using fallback 1.1 source');
      }
    } catch (error: any) {
      console.error('Load FR-04.1 sources failed', error);
      // fallback on error as well
      this.sources = [{
        sectionId: '1.1',
        sectionTitle: '1.1 Stationary combustion',
        sheetName: '1.1 Stationary',
        endpoint: `/api/cycles/${this.cycleId}/scope11/stationary/items`,
        scope: 'stationary',
        sourceType: 'scope11',
        itemCountIncluded: 0,
      }];
      console.warn('FR-04.1 sources failed; using fallback 1.1 source');
    } finally {
      this.sourcesLoading = false;
    }
  }


  private async loadFr041Data() {
    this.scope11Loading = true;
    this.scope11LoadError = null;
    try {
      const endpoints = (this.sources || []).filter(src => !!src.endpoint);
      console.log('FR-04.1 loading endpoints', endpoints.map(src => src.endpoint));
      if (!endpoints.length) {
        this.availableItems = [];
        this.scope11Items = [];
        this.scope11SplitEnabled = false;
        this.scope11PeriodYear = null;
        this.scope11HeaderMonths = null;
        this.scope11LoadError = 'ไม่พบ Sources สำหรับ FR-04.1 (fr041/sources ว่าง)';
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
      const allItemFailed = itemResults.every(result => !result?.resp);

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

        if (allItemFailed) {
          const msg = 'โหลดรายการไม่สำเร็จ (endpoint error)';
          this.scope11LoadError = msg;
          this.snackBar.open(msg, 'ปิด', { duration: 6000 });
        } else if (hasItemError) {
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
      const scope11Items = this.extractSourceItems(scope11Resp);
      this.scope11Items = scope11Items.length ? scope11Items : this.availableItems;
      this.scope11SplitEnabled = Boolean(scope11Resp?.splitEnabled);
      this.scope11PeriodYear = scope11Resp?.periodYear ?? null;
      this.scope11HeaderMonths = scope11Resp?.headerMonths ?? null;

      this.applySelectionConfig(configResult, this.scope11Items);
      this.syncFr041SelectionLocal();
      console.log('FR-04.1 load done', {
        availableItems: this.availableItems.length,
        scope11LoadError: this.scope11LoadError,
      });
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
      const download = await this.cycleApi.exportCycle(this.cycleId);
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
    if (!templateSetId || templateSetId === this.templateSetId) return;
    this.templateSetId = templateSetId;

    // ให้ mat-select ปิด overlay ก่อน แล้วค่อย save (กันค้าง)
    setTimeout(() => {
      void this.saveFr041Config();
    }, 0);
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
    const options = config?.options && typeof config.options === 'object' ? config.options : {};
    this.fr041ConfigOptions = options;

    const rawSelections = Array.isArray(options['selections_v2']) ? options['selections_v2'] : [];
    this.selectionLines = this.buildSelectionLines(items, rawSelections);

    if (!rawSelections.length && config?.selectedRowIds?.length) {
      this.ensureLegacyIncludes(config.selectedRowIds);
    }

    this.updateSelectedRowIdsFromSelectionLines();
    this.updateMissingEfCount();

    const fromTemplateSet = String(options?.['templateSetId'] ?? '').trim();
    if (fromTemplateSet) {
      this.templateSetId = fromTemplateSet;
    }
  }

  private ensureLegacyIncludes(rowIds: string[]): void {
    const included = new Set(rowIds);
    this.selectionLines.forEach(line => {
      if (!included.has(line.parentRowId)) return;
      if (line.component !== 'DIESEL_L') return;
      line.include = true;
    });
  }

  private buildSelectionLines(items: Fr041AvailableItem[], selections: any[]): Fr041SelectionLine[] {
    const selectionMap = new Map<string, any>();
    for (const sel of selections || []) {
      const lineId = String(sel?.lineId ?? '').trim();
      if (!lineId) continue;
      selectionMap.set(lineId, sel);
    }
    const result: Fr041SelectionLine[] = [];
    for (const item of items) {
      const components = this.componentsForFuelKey(item.fuelKey);
      for (const component of components) {
        const lineId = `${item.rowId || ''}::${component}`;
        const existing = selectionMap.get(lineId);
        result.push({
          lineId,
          parentRowId: item.rowId,
          component,
          include: Boolean(existing?.include),
          efCatalog: this.normalizeValue(existing?.efCatalog),
          efId: this.normalizeValue(existing?.efId),
          qty: this.resolveComponentQty(item, component),
          unit: this.componentUnit(component),
          itemLabel: item.itemLabel || item.rowId,
          evidence: item.evidence || '',
          fuelKey: item.fuelKey || '',
          sectionId: item.sectionId ?? null,
        });
      }
    }
    return result;
  }

  private updateSelectedRowIdsFromSelectionLines(): void {
    const set = new Set<string>();
    for (const line of this.selectionLines) {
      if (line.include) {
        set.add(line.parentRowId);
      }
    }
    this.selectedRowIds = set;
  }

  private updateMissingEfCount(): void {
    this.missingEfCount = this.selectionLines.reduce((count, line) => {
      if (!line.include) return count;
      if (!line.efCatalog || !line.efId) return count + 1;
      return count;
    }, 0);
  }

  private normalizeValue(value: any): string | null {
    const text = String(value ?? '').trim();
    return text === '' ? null : text;
  }

  private componentUnit(component: Fr041SelectionComponent): 'L' | 'kg' {
    return component.endsWith('_KG') ? 'kg' : 'L';
  }

  componentLabel(component: Fr041SelectionComponent): string {
    switch (component) {
      case 'DIESEL_L':
        return 'Diesel';
      case 'BIODIESEL_KG':
        return 'Biodiesel';
      case 'GASOLINE_L':
        return 'Gasoline';
      case 'ETHANOL_KG':
        return 'Ethanol';
    }
    return component;
  }

  private resolveComponentQty(item: Scope11StationaryItem, component: Fr041SelectionComponent): number | null {
    const total = this.resolveTotal(item);
    if (total === null || !Number.isFinite(total)) {
      return null;
    }
    const unit = String(item.unit || '').trim().toLowerCase();
    if (unit !== 'l' && (component === 'DIESEL_L' || component === 'GASOLINE_L')) {
      return null;
    }
    const blendKey = resolveBlendKey(item.fuelKey ?? '', item.otherType ?? undefined);
    const supported = ['B7', 'B10', '91/95', 'E20'];
    if (!supported.includes(blendKey)) {
      if (component === 'DIESEL_L') {
        return total;
      }
      return null;
    }
    const blend = computeBlendFromAnnualL(total, blendKey as FuelBlendKey);
    switch (component) {
      case 'DIESEL_L':
        return blend.dieselL;
      case 'BIODIESEL_KG':
        return blend.biodieselKg;
      case 'GASOLINE_L':
        return blend.gasolineL;
      case 'ETHANOL_KG':
        return blend.ethanolKg;
    }
    return null;
  }

  private componentsForFuelKey(fuelKey?: string): Fr041SelectionComponent[] {
    const normalized = this.normalizeFuelKey(fuelKey);
    if (['B7', 'B10'].includes(normalized)) {
      return ['DIESEL_L', 'BIODIESEL_KG'];
    }
    if (['91/95', 'E20'].includes(normalized)) {
      return ['GASOLINE_L', 'ETHANOL_KG'];
    }
    if (normalized === 'OTHER') {
      return ['DIESEL_L'];
    }
    return ['DIESEL_L'];
  }

  private normalizeFuelKey(fuelKey?: string): string {
    const raw = String(fuelKey || '').trim().toUpperCase();
    if (!raw) return 'OTHER';
    if (raw.includes('DIESEL_B7')) return 'B7';
    if (raw.includes('DIESEL_B10')) return 'B10';
    if (raw.includes('91/95') || raw.includes('9195')) return '91/95';
    if (raw.includes('E20')) return 'E20';
    if (raw.includes('OTHER')) return 'OTHER';
    return raw;
  }

  efOptionsForCatalog(catalog: string | null | undefined): EfCatalogOption[] {
    if (!catalog) return [];
    return this.efOptions.filter(option => (option.efCatalog ?? '').toUpperCase() === catalog.toUpperCase());
  }

  toggleLineInclude(line: Fr041SelectionLine, checked: boolean): void {
    line.include = checked;
    if (!checked) {
      line.efCatalog = null;
      line.efId = null;
    }
    this.handleLineChange();
  }

  setLineEfCatalog(line: Fr041SelectionLine, catalog: string | null): void {
    line.efCatalog = this.normalizeValue(catalog);
    line.efId = null;
    this.handleLineChange();
  }

  setLineEfId(line: Fr041SelectionLine, efId: string | null): void {
    line.efId = this.normalizeValue(efId);
    this.handleLineChange();
  }

  private handleLineChange(): void {
    this.updateSelectedRowIdsFromSelectionLines();
    this.updateMissingEfCount();
    this.syncFr041SelectionLocal();
    this.queueSaveFr041Config();
  }

  private buildEfSelectionMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const line of this.selectionLines) {
      if (!line.include || !line.efId) continue;
      if (!map[line.parentRowId]) map[line.parentRowId] = line.efId;
    }
    return map;
  }

  private queueSaveFr041Config() {
    this.saveQueued = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flushSaveFr041Config(), 150);
  }

  private async flushSaveFr041Config() {
    if (!this.saveQueued) return;
    if (this.selectionSaving) return;
    this.saveQueued = false;
    await this.saveFr041Config();
    if (this.saveQueued) await this.flushSaveFr041Config();
  }

  private async saveFr041Config(options?: { reloadPreview?: boolean }) {
    if (!this.cycleId) return;
    this.selectionSaving = true;
    const reloadPreview = options?.reloadPreview !== false;
    let slowSaveTimer: ReturnType<typeof setTimeout> | null = null;
    let timerStarted = false;
    const timerLabel = 'FR041 PUT config';
    try {
      this.syncFr041SelectionLocal();
      const selectionsPayload = this.selectionLines.map(line => ({
        lineId: line.lineId,
        parentRowId: line.parentRowId,
        component: line.component,
        include: line.include,
        efCatalog: line.efCatalog ?? null,
        efId: line.efId ?? null,
      }));
      const payload = {
        selectedRowIds: Array.from(this.selectedRowIds.values()),
        options: {
          templateSetId: this.templateSetId,
          selections_v2: selectionsPayload,
        },
      };
      slowSaveTimer = setTimeout(() => {
        console.log('FR-04.1 save config taking >2s', payload);
      }, 2000);
      console.time(timerLabel);
      timerStarted = true;
      await Promise.race([
        this.cycleApi.updateFr041Config(this.cycleId, payload),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Save timeout (10s)')), 10000)),
      ]);
      if (reloadPreview) {
}
    } catch (error: any) {
      console.error('Save FR-04.1 config failed', error);
      const msg = error?.message || 'บันทึกการเลือกไม่สำเร็จ';
      this.scope11LoadError = msg;
      this.snackBar.open(msg, 'ปิด', { duration: 6000 });
    } finally {
      if (timerStarted) console.timeEnd(timerLabel);
      if (slowSaveTimer) clearTimeout(slowSaveTimer);
      this.selectionSaving = false;
    }
  }

  async loadEfOptions() {
    try {
      const catalogs = this.allowedEfCatalogs;
      const responses = await Promise.all(
        catalogs.map(catalog =>
          this.cycleApi.getCycleEfCatalog(this.cycleId, catalog as 'AR5' | 'AR5V2' | 'EF1', 'stationary').catch(() => null)
        )
      );
      const optionsMap = new Map<string, EfCatalogOption>();
      const warnings: string[] = [];
      for (let i = 0; i < catalogs.length; i++) {
        const catalog = catalogs[i];
        const resp = responses[i];
        if (!resp) continue;
        const responseCatalog = resp.catalog?.trim() || catalog;
        for (const opt of resp.options ?? []) {
          const key = String(opt?.efId || '').trim();
          if (!key) continue;
          if (optionsMap.has(key)) continue;
          optionsMap.set(key, {
            ...opt,
            efCatalog: opt.efCatalog || responseCatalog,
          });
        }
        if (resp.warning) {
          warnings.push(String(resp.warning));
        }
      }
      this.efOptions = Array.from(optionsMap.values());
      this.efCatalogWarning = warnings.length ? warnings.join(' | ') : null;
    } catch (error: any) {
      console.error('Load EF options failed', error);
      this.efOptions = [];
      this.efCatalogWarning = null;
    }
  }

  get allowedEfCatalogs(): Array<'AR5' | 'AR5V2' | 'EF1'> {
    if (this.cycleYear !== null && this.cycleYear >= 2026) {
      return ['AR5V2', 'EF1'];
    }
    return ['AR5', 'EF1'];
  }

  getEfIdForItem(item: Scope11StationaryItem): string {
    if (!item?.rowId) return '';
    const line = this.selectionLines.find(
      line => line.parentRowId === item.rowId && line.include && line.efId
    );
    if (line?.efId) return line.efId;
    return this.defaultEfIdForFuelKey(item.fuelKey);
  }

  private defaultEfIdForFuelKey(fuelKey: string): string {
    const key = String(fuelKey || '').trim().toUpperCase();
    if (key === 'B7' || key === 'B10') return 'SC_GAS_DIESEL_OIL_L';
    if (key === '91/95' || key === 'E20') return 'SC_MOTOR_GASOLINE_L';
    if (key === 'LPG') return 'SC_LPG_L';
    return '';
  }  togglePreview(): void {
    this.previewEnabled = !this.previewEnabled;
  }

  refreshPreview(): void {
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

    const efMap = { byItemId: this.buildEfSelectionMap() };
    const rows = this.canonicalSvc.buildFr041SelectionRows(splitRows, efMap, 11);

    this.dataEntrySvc.save(this.cycleId, {
      ...entryDoc,
      fr041Selection: rows,
    });
  }
}
