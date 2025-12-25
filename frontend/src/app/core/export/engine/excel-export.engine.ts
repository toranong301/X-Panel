import { Injectable } from '@angular/core';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

import { VSheetTemplateSpec, ExcelFeatures } from '../models/template-spec.model';
import { runSelections } from './selection';
import { buildFormula } from './formula-builder';
import { runValidations, ValidationResult } from './validators';
import { CanonicalCycleData } from '../../services/canonical-ghg.service';

export interface ExportReport {
  templateId: string;
  version: string;
  validations: ValidationResult[];
}

export interface ExportContext {
  spec: VSheetTemplateSpec;
  workbook: any;
  canonical: CanonicalCycleData;
  selections: Record<string, any[]>;
  report: ExportReport;
}

export interface TemplateAdapter {
  id: string;
  supports(spec: VSheetTemplateSpec): boolean;
  apply(ctx: ExportContext): Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class ExcelExportEngine {
  /**
   * Export by loading an xlsx template (ArrayBuffer), then applying spec + adapter.
   *
   * NOTE: Excel itself will recalculate formulas when opened by the verifier.
   */
  async export(params: {
    templateArrayBuffer: ArrayBuffer;
    spec: VSheetTemplateSpec;
    adapter: TemplateAdapter;
    canonical: CanonicalCycleData;
    filename: string;
    selections?: Record<string, any[]>;
    excelFeaturesOverride?: Partial<ExcelFeatures>;
    requiredSheets?: string[];
  }): Promise<ExportReport> {
    const { templateArrayBuffer, spec, adapter, canonical, filename, excelFeaturesOverride, selections, requiredSheets } =
      params;

    const mergedSpec: VSheetTemplateSpec = {
      ...spec,
      excelFeatures: { ...spec.excelFeatures, ...(excelFeaturesOverride || {}) },
    };

    const workbook = new (ExcelJS as any).Workbook();
    await workbook.xlsx.load(templateArrayBuffer);

    if (requiredSheets?.length) {
      const missingSheets = requiredSheets.filter(name => !workbook.getWorksheet(name));
      if (missingSheets.length) {
        throw new Error(`Missing worksheet(s): ${missingSheets.join(', ')}`);
      }
    }

    const resolvedSelections = selections ?? runSelections(mergedSpec.selectionRules, canonical);
    const report: ExportReport = { templateId: mergedSpec.templateId, version: mergedSpec.version, validations: [] };

    // 1) Generic section application (declarative)
    for (const section of Object.values(mergedSpec.sections)) {
      if (!section.table) continue;

      const sheetName = mergedSpec.sheets[section.sheet]?.name;
      const ws = sheetName ? workbook.getWorksheet(sheetName) : undefined;
      if (!ws) throw new Error(`Missing sheet for section '${section.sheet}': ${sheetName || 'undefined'}`);

      const { rowStart, rowEnd, columns } = section.table;
      for (let r = rowStart; r <= rowEnd; r++) {
        for (const [col, write] of Object.entries(columns)) {
          if (!write.formulaFrom) continue;
          const formula = buildFormula(write.formulaFrom, mergedSpec.excelFeatures, r);
          if (!formula) continue;
          ws.getCell(`${col}${r}`).value = { formula };
        }
      }
    }

    // 2) Adapter hook (company-specific)
    if (!adapter.supports(mergedSpec)) {
      throw new Error(`Adapter '${adapter.id}' does not support templateId '${mergedSpec.templateId}'`);
    }

    const ctx: ExportContext = { spec: mergedSpec, workbook, canonical, selections: resolvedSelections, report };
    await adapter.apply(ctx);

    // 3) Validation
    report.validations = runValidations(workbook, mergedSpec);

    // 4) Download
    const out = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([out]), filename);

    return report;
  }

  /** Convenience: load template from assets URL */
  async exportFromUrl(params: {
    templateUrl: string;
    templateSpec: VSheetTemplateSpec;
    adapter: TemplateAdapter;
    canonical: CanonicalCycleData;
    selections?: Record<string, any[]>;
    outputName: string;
    excelFeaturesOverride?: Partial<ExcelFeatures>;
    requiredSheets?: string[];
  }): Promise<ExportReport> {
    const res = await fetch(params.templateUrl);
    if (!res.ok) throw new Error(`Failed to load template: ${params.templateUrl}`);
    const buffer = await res.arrayBuffer();
    return this.export({
      templateArrayBuffer: buffer,
      spec: params.templateSpec,
      adapter: params.adapter,
      canonical: params.canonical,
      selections: params.selections,
      filename: params.outputName,
      excelFeaturesOverride: params.excelFeaturesOverride,
      requiredSheets: params.requiredSheets,
    });
  }

  async exportScope11StationaryFromUrl(params: {
    templateUrl: string;
    templateSpec: VSheetTemplateSpec;
    adapter: TemplateAdapter;
    canonical: CanonicalCycleData;
    selections?: Record<string, any[]>;
    outputName: string;
    sheetName?: string;
    excelFeaturesOverride?: Partial<ExcelFeatures>;
  }): Promise<ExportReport> {
    const sheetName = params.sheetName ?? '1.1 Stationary ';
    return this.exportFromUrl({
      templateUrl: params.templateUrl,
      templateSpec: params.templateSpec,
      adapter: params.adapter,
      canonical: params.canonical,
      selections: params.selections,
      outputName: params.outputName,
      excelFeaturesOverride: params.excelFeaturesOverride,
      requiredSheets: [sheetName],
    });
  }
}
