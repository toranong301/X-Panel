import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
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

import { CanonicalGhgService, Fr041SelRow } from '../../core/services/canonical-ghg.service';
import {
  CycleApiService,
  EfViewOption,
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
  sourceItemLabel: string;
  evidence: string;
  fuelKey: string;
  sectionId?: string | null;
};

type Fr041EfValues = {
  co2: number | null;
  fossilCh4: number | null;
  ch4: number | null;
  n2o: number | null;
  sf6: number | null;
  nf3: number | null;
  hfcs: number | null;
  pfcs: number | null;
  other: number | null;
};

type Fr041MainRow = {
  lineId: string;
  parentRowId: string;
  itemLabel: string;
  sourceItemLabel?: string | null;
  evidence: string;
  unit: 'L' | 'kg';
  qty: number | null;
  efCatalog: string | null;
  efId: string | null;
  ef: Fr041EfValues | null;
  totalKgCo2ePerUnit: number | null;
  multiplyTonCo2e: number | null;
  missingEf?: boolean;
};

const MAIN_TABLE_GWP = {
  fossilCh4: 30,
  ch4: 28,
  n2o: 265,
  sf6: 23500,
  nf3: 16100,
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
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Fr041Component implements OnInit {
  private cdr = inject(ChangeDetectorRef);
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
  mainRows: Fr041MainRow[] = [];
  selectionSaving = false;
  previewKey = 0;
  previewEnabled = false;
  efOptions: EfViewOption[] = [];
  efOptionsByKey = new Map<string, EfViewOption>();
  efCatalogWarning: string | null = null;
  efOptionsLoading = false;
  cycleYear: number | null = null;
  fr041ConfigOptions: Record<string, any> | null = null;

  selectedScope3: any[] = [];
  fr01Meta: Fr01Data | null = null;
  reportYearLabel = '-';
  dataPeriodLabel = '-';

  // report
  exporting = false;
  exportError: string | null = null;
  exportingMode: 'lean' | 'full-lite' | 'full' | null = null;

  ngOnInit(): void {
    void this.resolveCycleId();
    void this.loadTemplates();
    void this.loadTemplateSets();
  }

  private queueStateUpdate(update: () => void): void {
    Promise.resolve().then(() => {
      update();
      this.cdr.markForCheck();
    });
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
    this.queueStateUpdate(() => {
      this.templateLoading = true;
    });
    try {
      const cycle = await this.cycleApi.getCycle(this.cycleId);
      const cycleYear = Number.isFinite(Number(cycle?.year)) ? Number(cycle?.year) : null;
      const templateId = String(cycle?.template_id || 'mbax');
      const templateStyle = this.resolveTemplateStyle(templateId, this.templates);
      this.queueStateUpdate(() => {
        this.cycleYear = cycleYear;
        this.templateId = templateId;
        this.templateKey = templateId;
        this.templateStyle = templateStyle;
      });
    } catch (error: any) {
      console.error('Load template state failed', error);
      this.snackBar.open(error?.message || 'โหลด Template ไม่สำเร็จ', 'ปิด', { duration: 6000 });
    } finally {
      this.queueStateUpdate(() => {
        this.templateLoading = false;
      });
    }
  }

  private async loadTemplates() {
    try {
      const templates = await this.cycleApi.getTemplates();
      const templateStyle = this.resolveTemplateStyle(this.templateId, templates);
      this.queueStateUpdate(() => {
        this.templates = templates;
        this.templateStyle = templateStyle;
      });
    } catch (error: any) {
      console.error('Load templates failed', error);
      this.snackBar.open(error?.message || 'โหลด Template ไม่สำเร็จ', 'ปิด', { duration: 6000 });
    }
  }

  private async loadTemplateSets() {
    this.queueStateUpdate(() => {
      this.templateSetLoading = true;
    });
    try {
      const templateSets = await this.cycleApi.getTemplateSets();
      this.queueStateUpdate(() => {
        this.templateSets = templateSets;
      });
    } catch (error: any) {
      console.error('Load template sets failed', error);
      this.snackBar.open(error?.message || 'โหลด Template Set ไม่สำเร็จ', 'ปิด', { duration: 6000 });
    } finally {
      this.queueStateUpdate(() => {
        this.templateSetLoading = false;
      });
    }
  }

  private async loadSources() {
    if (!this.cycleId) return;
    this.queueStateUpdate(() => {
      this.sourcesLoading = true;
    });
    try {
      const sources = [{
        sectionId: '1.1',
        sectionTitle: '1.1 Stationary combustion',
        sheetName: '1.1 Stationary',
        endpoint: `/api/cycles/${this.cycleId}/scope11/stationary/items`,
        scope: 'stationary',
        sourceType: 'scope11',
        itemCountIncluded: 0,
      }];
      this.queueStateUpdate(() => {
        this.sources = sources;
      });
    } finally {
      this.queueStateUpdate(() => {
        this.sourcesLoading = false;
      });
    }
  }


  private async loadFr041Data() {
    this.queueStateUpdate(() => {
      this.scope11Loading = true;
      this.scope11LoadError = null;
    });
    try {
      const endpoint = `/api/cycles/${this.cycleId}/scope11/stationary/items`;
      console.log('FR-04.1 loading endpoint', endpoint);

      const configResult = await this.cycleApi.getFr041Config(this.cycleId).catch(error => {
        console.error('Load FR-04.1 config failed', error);
        return null;
      });

      const scope11Resp = await this.cycleApi.getFr041SourceItems(endpoint);
      const items = this.extractSourceItems(scope11Resp);
      const availableItems = items.map(item => ({
        ...item,
        sectionId: '1.1',
        sectionTitle: '1.1 Stationary combustion',
        scope: 'stationary',
      }));

      this.queueStateUpdate(() => {
        this.availableItems = availableItems;
        this.scope11Items = availableItems;
        this.scope11SplitEnabled = Boolean(scope11Resp?.splitEnabled);
        this.scope11PeriodYear = scope11Resp?.periodYear ?? null;
        this.scope11HeaderMonths = scope11Resp?.headerMonths ?? null;
        this.applySelectionConfig(configResult, availableItems);
        this.syncFr041SelectionLocal();
      });
    } catch (error: any) {
      console.error('Load FR-04.1 data failed', error);
      const msg = error?.message || 'โหลดรายการ Scope 1.1 ไม่สำเร็จ';
      this.queueStateUpdate(() => {
        this.scope11LoadError = msg;
      });
      this.snackBar.open(msg, 'ปิด', { duration: 6000 });
    } finally {
      this.queueStateUpdate(() => {
        this.scope11Loading = false;
      });
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
    const fr01Meta = canonical.fr01 ?? this.fr01Svc.load(this.cycleId);
    const reportYearLabel = this.getReportYearLabel(fr01Meta);
    const dataPeriodLabel = this.getDataPeriodLabel(fr01Meta);
    this.queueStateUpdate(() => {
      this.fr01Meta = fr01Meta;
      this.reportYearLabel = reportYearLabel;
      this.dataPeriodLabel = dataPeriodLabel;
    });
  }

  async exportVSheet(mode: 'lean' | 'full-lite' | 'full') {
    this.exporting = true;
    this.exportError = null;
    this.exportingMode = mode;

    try {
      const download = await this.cycleApi.exportCycleWithMode(this.cycleId, mode);
      this.downloadFile(download.blob, download.filename);
      this.snackBar.open(`Export ${this.formatModeLabel(mode)} สำเร็จ`, 'ปิด', { duration: 4000 });
    } catch (e: any) {
      console.error('Export FR-04.1 failed', e);
      this.exportError = await this.readHttpErrorMessage(e);
      this.snackBar.open(this.exportError, 'ปิด', { duration: 10000 });
    } finally {
      this.exporting = false;
      this.exportingMode = null;
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

  private async readHttpErrorMessage(e: any): Promise<string> {
    try {
      const err = e?.error;
      let payload: any = null;
      if (err instanceof Blob && err.type?.includes('application/json')) {
        const text = await err.text();
        try {
          payload = JSON.parse(text);
        } catch {
          payload = text;
        }
      } else if (typeof err === 'object' && err) {
        payload = err;
      }

      if (payload && typeof payload === 'object') {
        console.log('EXPORT_ERROR_PAYLOAD', payload);
      }

      const baseMessage = (payload?.message ?? e?.message ?? 'Export failed').toString();
      const extras: string[] = [];
      if (payload?.mode) extras.push(`mode=${payload.mode}`);
      if (payload?.cycle_id) extras.push(`cycle=${payload.cycle_id}`);
      const errorsPreview = this.formatErrorsPreview(payload?.errors);
      if (errorsPreview) extras.push(errorsPreview);
      return extras.length ? `${baseMessage} (${extras.join(' | ')})` : baseMessage;
    } catch {
      return e?.message || 'Export failed (unknown error)';
    }
  }

  private formatErrorsPreview(errors: any): string | null {
    if (!errors) return null;
    const entries = Array.isArray(errors)
      ? errors
      : typeof errors === 'object'
        ? Object.entries(errors).map(([key, value]) => `${key}: ${value}`)
        : [String(errors)];
    const preview = entries.slice(0, 3).join('; ');
    return preview ? `errors: ${preview}` : null;
  }

  private formatModeLabel(mode: 'lean' | 'full-lite' | 'full'): string {
    switch (mode) {
      case 'lean':
        return 'Lean';
      case 'full-lite':
        return 'Full-lite';
      case 'full':
        return 'Full';
    }
  }

  async changeTemplate(templateId: string) {
    try {
      await this.cycleApi.updateCycleTemplate(this.cycleId, templateId);
      const templateStyle = this.resolveTemplateStyle(templateId, this.templates);
      this.queueStateUpdate(() => {
        this.templateId = templateId;
        this.templateKey = templateId;
        this.templateStyle = templateStyle;
      });
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
    this.queueStateUpdate(() => {
      this.templateSetId = templateSetId;
    });

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
      const blendKey = resolveBlendKey(item.fuelKey ?? '', item.otherType ?? undefined);
      if (!allowed.includes(blendKey)) return row;

      const blend = computeBlendFromAnnualL(total, blendKey);
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

  get templateOptions(): TemplateInfo[] {
    return this.templates;
  }

  get templateStyleClass(): string {
    return this.templateStyle === 'mbax' ? 'card--compact' : 'card--standard';
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
    this.rebuildMainRows();

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
        const qty = this.resolveComponentQty(item, component);
        const hasQty = Number.isFinite(Number(qty)) && Number(qty) > 0;
        const include = existing ? Boolean(existing?.include) : hasQty;
        const defaultCatalog = this.defaultCatalogForComponent(component);
        const existingCatalog = this.normalizeValue(existing?.efCatalog);
        const efCatalog = existingCatalog ?? defaultCatalog;
        const existingEfId = this.normalizeValue(existing?.efId);
        let efId = existingEfId;
        if (!efId && efCatalog && include) {
          efId = this.defaultEfIdForComponent(component, efCatalog);
        }
        const sourceItemLabel = String(item.itemLabel ?? '').trim();
        result.push({
          lineId,
          parentRowId: item.rowId,
          component,
          include,
          efCatalog,
          efId,
          qty,
          unit: this.componentUnit(component),
          itemLabel: this.componentMainLabel(component),
          sourceItemLabel,
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

  private rebuildMainRows(): void {
    const rows = this.buildMainRowsFromSelectionLines();
    this.queueStateUpdate(() => {
      this.mainRows = rows;
    });
  }

  get fr041MainRowsStationary(): Fr041MainRow[] {
    return this.buildMainRowsFromSelectionLines();
  }

  private buildMainRowsFromSelectionLines(): Fr041MainRow[] {
    const rows: Fr041MainRow[] = [];
    for (const line of this.selectionLines) {
      if (!line.include) continue;
      if (String(line.sectionId ?? '') !== '1.1') continue;

      const efOption = this.getEfOption(line);
      const ef = efOption ? this.mapEfOptionToValues(efOption) : null;
      const missingEf = !line.efCatalog || !line.efId || !efOption;
      const qty = Number.isFinite(Number(line.qty)) ? Number(line.qty) : null;
      const totalKgCo2ePerUnit = this.resolveEfTotal(efOption, ef);
      const multiplyTonCo2e =
        qty !== null && totalKgCo2ePerUnit !== null ? (qty * totalKgCo2ePerUnit) / 1000 : null;

      rows.push({
        lineId: line.lineId,
        parentRowId: line.parentRowId,
        itemLabel: this.resolveMainItemLabel(line),
        sourceItemLabel: line.sourceItemLabel ?? null,
        evidence: line.evidence || '',
        unit: line.unit,
        qty,
        efCatalog: line.efCatalog ?? null,
        efId: line.efId ?? null,
        ef,
        totalKgCo2ePerUnit,
        multiplyTonCo2e,
        missingEf,
      });
    }
    return rows;
  }

  private getEfOption(line: Fr041SelectionLine): EfViewOption | null {
    const efKey = this.buildEfKey(line.efCatalog, line.efId);
    if (!efKey) return null;
    return this.efOptionsByKey.get(efKey) ?? null;
  }

  private mapEfOptionToValues(option: EfViewOption): Fr041EfValues {
    return {
      co2: this.readEfNumber((option as any)?.CO2 ?? (option as any)?.co2),
      fossilCh4: this.readEfNumber(
        (option as any)?.['Fossil CH4'] ?? (option as any)?.FossilCH4 ?? (option as any)?.fossil_ch4 ?? (option as any)?.fossilCh4
      ),
      ch4: this.readEfNumber((option as any)?.CH4 ?? (option as any)?.ch4),
      n2o: this.readEfNumber((option as any)?.N2O ?? (option as any)?.n2o),
      sf6: this.readEfNumber((option as any)?.SF6 ?? (option as any)?.sf6),
      nf3: this.readEfNumber((option as any)?.NF3 ?? (option as any)?.nf3),
      hfcs: this.readEfNumber((option as any)?.HFCs ?? (option as any)?.hfcs),
      pfcs: this.readEfNumber((option as any)?.PFCs ?? (option as any)?.pfcs),
      other: this.readEfNumber((option as any)?.Other ?? (option as any)?.other),
    };
  }

  private resolveEfTotal(option: EfViewOption | null, ef: Fr041EfValues | null): number | null {
    const total = this.readEfNumber((option as any)?.Total ?? (option as any)?.total);
    if (total !== null) return total;
    if (!ef) return null;
    const values = [
      ef.co2,
      ef.fossilCh4,
      ef.ch4,
      ef.n2o,
      ef.sf6,
      ef.nf3,
      ef.hfcs,
      ef.pfcs,
      ef.other,
    ];
    const hasValue = values.some(value => value !== null);
    if (!hasValue) return null;
    return (
      (ef.co2 ?? 0) +
      (ef.fossilCh4 ?? 0) * MAIN_TABLE_GWP.fossilCh4 +
      (ef.ch4 ?? 0) * MAIN_TABLE_GWP.ch4 +
      (ef.n2o ?? 0) * MAIN_TABLE_GWP.n2o +
      (ef.sf6 ?? 0) * MAIN_TABLE_GWP.sf6 +
      (ef.nf3 ?? 0) * MAIN_TABLE_GWP.nf3 +
      (ef.hfcs ?? 0) +
      (ef.pfcs ?? 0) +
      (ef.other ?? 0)
    );
  }

  private readEfNumber(value: any): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private normalizeValue(value: any): string | null {
    const text = String(value ?? '').trim();
    return text === '' ? null : text;
  }

  private normalizeEfCatalog(value: any): string | null {
    const text = this.normalizeValue(value);
    return text ? text.toUpperCase() : null;
  }

  private buildEfKey(catalog: string | null | undefined, efId: string | null | undefined): string | null {
    const cat = this.normalizeEfCatalog(catalog);
    const id = this.normalizeValue(efId);
    if (!cat || !id) return null;
    return `${cat}::${id}`;
  }

  private parseEfKey(value: string): { catalog: string; efId: string } | null {
    const parts = value.split('::');
    if (parts.length !== 2) return null;
    const catalog = this.normalizeEfCatalog(parts[0]);
    const efId = this.normalizeValue(parts[1]);
    if (!catalog || !efId) return null;
    return { catalog, efId };
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
        return 'Biogasoline (Ethanol)';
    }
    return component;
  }

  private componentMainLabel(component: Fr041SelectionComponent): string {
    switch (component) {
      case 'DIESEL_L':
        return 'Diesel (Stationary combustion)';
      case 'BIODIESEL_KG':
        return 'Biodiesel (Stationary combustion)';
      case 'GASOLINE_L':
        return 'Gasoline (Stationary combustion)';
      case 'ETHANOL_KG':
        return 'Biogasoline (Ethanol) (Stationary combustion)';
    }
    return component;
  }

  private resolveMainItemLabel(line: Fr041SelectionLine): string {
    const label = String(line.itemLabel ?? '').trim();
    if (label) return label;
    return this.componentMainLabel(line.component);
  }

  lineEfKey(line: Fr041SelectionLine): string {
    return this.buildEfKey(line.efCatalog, line.efId) ?? '';
  }

  private resolveComponentQty(item: Scope11StationaryItem, component: Fr041SelectionComponent): number | null {
    const total = this.resolveTotal(item);
    if (total === null || !Number.isFinite(total)) {
      return null;
    }
    const unit = String(item.unit || '').trim().toLowerCase();
    if (unit !== 'l') {
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

  private defaultCatalogForComponent(component: Fr041SelectionComponent): string {
    if (component === 'BIODIESEL_KG' || component === 'ETHANOL_KG') {
      return 'EF1';
    }
    return this.allowedEfCatalogs[0];
  }

  private defaultEfIdForComponent(component: Fr041SelectionComponent, catalog: string): string | null {
    if (catalog.toUpperCase() !== 'EF1') return null;
    const map: Partial<Record<Fr041SelectionComponent, string>> = {
      BIODIESEL_KG: 'EF1_STATIONARY_BIODIESEL_KG',
      ETHANOL_KG: 'EF1_STATIONARY_ETHANOL_KG',
    };
    const efId = map[component];
    if (!efId) return null;
    const efKey = this.buildEfKey('EF1', efId);
    if (!efKey) return null;
    return this.efOptionsByKey.has(efKey) ? efId : null;
  }

  efOptionsForCatalog(catalog: string | null | undefined): EfViewOption[] {
    if (!catalog) return [];
    return this.efOptions.filter(option => String(option.catalog ?? '').toUpperCase() === catalog.toUpperCase());
  }

  toggleLineInclude(line: Fr041SelectionLine, checked: boolean): void {
    line.include = checked;
    if (!checked) {
      line.efCatalog = null;
      line.efId = null;
    } else {
      if (!line.efCatalog) {
        line.efCatalog = this.defaultCatalogForComponent(line.component);
      }
      if (line.efCatalog && !line.efId) {
        line.efId = this.defaultEfIdForComponent(line.component, line.efCatalog);
      }
    }
    this.handleLineChange();
  }

  setLineEfCatalog(line: Fr041SelectionLine, catalog: string | null): void {
    line.efCatalog = this.normalizeValue(catalog);
    line.efId = null;
    if (line.efCatalog) {
      line.efId = this.defaultEfIdForComponent(line.component, line.efCatalog);
    }
    this.handleLineChange();
  }

  setLineEfId(line: Fr041SelectionLine, efId: string | null): void {
    const normalized = this.normalizeValue(efId);
    if (!normalized) {
      line.efId = null;
      this.handleLineChange();
      return;
    }
    const parsed = this.parseEfKey(normalized);
    if (parsed) {
      line.efCatalog = parsed.catalog;
      line.efId = parsed.efId;
    } else {
      line.efId = normalized;
    }
    this.handleLineChange();
  }

  private handleLineChange(): void {
    this.updateSelectedRowIdsFromSelectionLines();
    this.updateMissingEfCount();
    this.syncFr041SelectionLocal();
    this.rebuildMainRows();
    this.queueSaveFr041Config();
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
        this.reloadPreview();
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
    this.queueStateUpdate(() => {
      this.efOptionsLoading = true;
    });
    try {
      const response = await this.cycleApi.getCycleEfView(this.cycleId, 'stationary');
      const allowed = new Set(this.allowedEfCatalogs.map(catalog => catalog.toUpperCase()));
      const optionsByKey = new Map<string, EfViewOption>();
      const options: EfViewOption[] = [];
      for (const option of response?.options ?? []) {
        const efKey = String(option?.efKey ?? '').trim();
        const catalog = String(option?.catalog ?? '').trim().toUpperCase();
        if (!efKey || !catalog || !allowed.has(catalog)) continue;
        if (optionsByKey.has(efKey)) continue;
        const normalized: EfViewOption = {
          ...option,
          efKey,
          catalog: catalog as EfViewOption['catalog'],
        };
        optionsByKey.set(efKey, normalized);
        options.push(normalized);
      }
      const warningText = response?.warning ? String(response.warning) : null;

      const entryDoc = this.dataEntrySvc.load(this.cycleId) ?? {
        cycleId: this.cycleId,
        scope1: [],
        scope2: [],
        scope3: [],
      };
      this.dataEntrySvc.save(this.cycleId, {
        ...entryDoc,
        efViewOptions: options,
      });
      this.queueStateUpdate(() => {
        this.efOptions = options;
        this.efOptionsByKey = optionsByKey;
        this.efCatalogWarning = warningText;
        this.applyDefaultEfIdsFromOptions();
        this.rebuildMainRows();
      });
    } catch (error: any) {
      console.error('Load EF options failed', error);
      this.queueStateUpdate(() => {
        this.efOptions = [];
        this.efOptionsByKey = new Map<string, EfViewOption>();
        this.efCatalogWarning = null;
      });
    } finally {
      this.queueStateUpdate(() => {
        this.efOptionsLoading = false;
      });
    }
  }

  get allowedEfCatalogs(): Array<'AR5' | 'AR5V2' | 'EF1'> {
    if (this.cycleYear !== null && this.cycleYear >= 2026) {
      return ['AR5V2', 'EF1'];
    }
    return ['AR5', 'EF1'];
  }

  private applyDefaultEfIdsFromOptions(): void {
    let changed = false;
    for (const line of this.selectionLines) {
      if (!line.include) continue;
      if (!line.efCatalog || line.efCatalog.toUpperCase() !== 'EF1') continue;
      if (line.efId) continue;
      const defaultId = this.defaultEfIdForComponent(line.component, line.efCatalog);
      if (!defaultId) continue;
      line.efId = defaultId;
      changed = true;
    }
    if (changed) {
      this.updateMissingEfCount();
      this.syncFr041SelectionLocal();
      this.queueSaveFr041Config();
    }
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
  }

  togglePreview(): void {
    const next = !this.previewEnabled;
    this.queueStateUpdate(() => {
      this.previewEnabled = next;
    });
  }

  refreshPreview(): void {
    this.previewKey += 1;
  }



  private syncFr041SelectionLocal(): void {
    if (!this.cycleId) return;
    const entryDoc = this.dataEntrySvc.load(this.cycleId) ?? {
      cycleId: this.cycleId,
      scope1: [],
      scope2: [],
      scope3: [],
    };

    const rows: Fr041SelRow[] = [];
    let rowNo = 11;
    for (const line of this.selectionLines) {
      if (!line.include) continue;
      if (String(line.sectionId ?? '') !== '1.1') continue;
      const qty = Number.isFinite(Number(line.qty)) ? Number(line.qty) : null;
      const row: Fr041SelRow = {
        rowNo,
        rowId: String(line.parentRowId ?? ''),
        itemId: String(line.lineId ?? ''),
        itemName: this.resolveMainItemLabel(line),
        fuelKey: String(line.fuelKey ?? ''),
        evidence: String(line.evidence ?? ''),
        unit: String(line.unit ?? ''),
        qty,
        efId: String(line.efId ?? ''),
      };
      if (line.efCatalog) {
        row.efCatalog = line.efCatalog;
      }
      const efKey = this.buildEfKey(line.efCatalog, line.efId);
      if (efKey) {
        row.efKey = efKey;
      }
      const sourceItemLabel = String(line.sourceItemLabel ?? '').trim();
      if (sourceItemLabel) {
        row.sourceItemLabel = sourceItemLabel;
      }
      rows.push(row);
      rowNo += 1;
    }

    this.dataEntrySvc.save(this.cycleId, {
      ...entryDoc,
      fr041Selection: rows,
    });
  }
}
