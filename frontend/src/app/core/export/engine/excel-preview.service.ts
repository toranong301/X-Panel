import { Injectable } from '@angular/core';
import * as ExcelJS from 'exceljs';

import { CanonicalGhgService } from '../../services/canonical-ghg.service';
import { resolveTemplate } from '../registry/template-registry';
import { runSelections } from './selection';

export type SheetPreviewCell = {
  display: string;
  type: 'text' | 'number' | 'formula';
};

export type SheetPreviewRow = {
  rowNumber: number;
  cells: SheetPreviewCell[];
};

export type SheetPreview = {
  sheetName: string;
  columns: string[];
  rows: SheetPreviewRow[];
  range: string;
};

@Injectable({ providedIn: 'root' })
export class ExcelPreviewService {
  constructor(private canonicalSvc: CanonicalGhgService) {}

  /**
   * Safety cap for UI preview.
   * Many Excel templates (incl. MBAX) have formatting that extends to hundreds/thousands of rows.
   * Rendering the full used range will freeze the browser.
   */
  private readonly DEFAULT_MAX_ROWS = 60;
  private readonly DEFAULT_MAX_COLS = 26; // A..Z

  async loadSheet(params: {
    cycleId: number;
    templateKey: string;
    sheetName: string;
    range?: string;
  }): Promise<SheetPreview> {
    const canonical = this.canonicalSvc.build(params.cycleId);
    const bundle = resolveTemplate(params.templateKey);

    const res = await fetch(bundle.templateUrl);
    if (!res.ok) {
      throw new Error(`Failed to load template: ${bundle.templateUrl}`);
    }

    const buffer = await res.arrayBuffer();
    const workbook = new (ExcelJS as any).Workbook();

    // ExcelJS parsing of large, heavily-formatted templates can block the browser UI long enough
    // to trigger "Page unresponsive". For preview we can safely skip many heavy nodes.
    // NOTE: Types don't expose these options, so we call through `any`.
    const maxRows = this.DEFAULT_MAX_ROWS + 40;
    const maxCols = this.DEFAULT_MAX_COLS + 10;
    await (workbook.xlsx as any).load(buffer, {
      maxRows,
      maxCols,
      ignoreNodes: [
        'dataValidations',
        'conditionalFormatting',
        'picture',
        'drawing',
        'sheetProtection',
        'tableParts',
        'rowBreaks',
        'hyperlinks',
        'extLst',
        // keep sheetData
      ],
    });

    const selections = runSelections(bundle.spec.selectionRules, canonical);
    if (!bundle.adapter.supports(bundle.spec)) {
      throw new Error(`Adapter '${bundle.adapter.id}' does not support templateId '${bundle.spec.templateId}'`);
    }

    await bundle.adapter.apply({
      spec: bundle.spec,
      workbook,
      canonical,
      selections,
      report: { templateId: bundle.spec.templateId, version: bundle.spec.version, validations: [] },
    });

    const resolvedSheetName = bundle.spec.sheets[params.sheetName]?.name ?? params.sheetName;
    const ws = workbook.getWorksheet(resolvedSheetName);
    if (!ws) throw new Error(`Sheet '${resolvedSheetName}' not found in template`);

    // If caller doesn't provide a range, use a capped preview range to avoid UI lockups.
    const range = params.range ?? this.buildCappedRangeFromWorksheet(ws);
    const { startRow, endRow, startCol, endCol } = this.parseRange(range);

    const columns: string[] = [];
    for (let c = startCol; c <= endCol; c++) {
      columns.push(this.colToLetter(c));
    }

    const rows: SheetPreviewRow[] = [];
    for (let r = startRow; r <= endRow; r++) {
      const cells: SheetPreviewCell[] = [];
      for (let c = startCol; c <= endCol; c++) {
        cells.push(this.readCellDisplay(workbook, ws, r, c, new Set()));
      }
      rows.push({ rowNumber: r, cells });
    }

    return {
      sheetName: resolvedSheetName,
      columns,
      rows,
      range,
    };
  }

  private readCellDisplay(workbook: any, ws: any, row: number, col: number, seen: Set<string>): SheetPreviewCell {
    const cell = ws.getCell(row, col);
    const raw = cell?.value;

    if (raw && typeof raw === 'object' && 'formula' in raw) {
      const formula = this.normalizeFormula((raw as any).formula ?? '');
      // ExcelJS may include cached results ("result") in the file. Prefer that.
      const cached = (raw as any).result;
      if (cached !== null && cached !== undefined && cached !== '') {
        const formatted = this.formatDisplay(cached);
        return { ...formatted, type: 'formula' };
      }

      // IMPORTANT: Do NOT attempt to evaluate formulas in the browser preview.
      // Templates contain large SUM ranges which can freeze the UI.
      return { display: `=${formula}`, type: 'formula' };
    }

    return this.formatDisplay(raw);
  }

  private evaluateFormula(formula: string, workbook: any, ws: any, seen: Set<string>): any {
    const normalized = this.normalizeFormula(formula);

    const sumMatch = normalized.match(/^SUM\((.+)\)$/i);
    if (sumMatch) {
      const rangeRef = sumMatch[1].trim();
      const { sheetName, range } = this.splitRangeRef(rangeRef);
      const targetWs = sheetName ? workbook.getWorksheet(sheetName) : ws;
      if (!targetWs) return null;
      const { startRow, endRow, startCol, endCol } = this.parseRange(range);
      let sum = 0;
      let hasValue = false;
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const value = this.getCellValue(workbook, targetWs, r, c, seen);
          if (typeof value === 'number' && !Number.isNaN(value)) {
            sum += value;
            hasValue = true;
          }
        }
      }
      return hasValue ? sum : null;
    }

    const refMatch = normalized.match(/^('?[^']+'?)?!?\$?([A-Z]+)\$?(\d+)$/i);
    if (refMatch) {
      const sheetToken = refMatch[1];
      const colLetters = refMatch[2];
      const rowNo = Number(refMatch[3]);
      const sheetName = sheetToken ? this.stripSheetQuotes(sheetToken) : undefined;
      const targetWs = sheetName ? workbook.getWorksheet(sheetName) : ws;
      if (!targetWs) return null;
      const colNo = this.colLetterToNumber(colLetters);
      return this.getCellValue(workbook, targetWs, rowNo, colNo, seen);
    }

    return null;
  }

  private getCellValue(workbook: any, ws: any, row: number, col: number, seen: Set<string>): any {
    const key = `${ws.name}!${row}:${col}`;
    if (seen.has(key)) return null;
    seen.add(key);

    const cell = ws.getCell(row, col);
    const value = cell?.value;

    if (value && typeof value === 'object' && 'formula' in value) {
      const formula = this.normalizeFormula((value as any).formula ?? '');
      return this.evaluateFormula(formula, workbook, ws, seen);
    }

    if (value && typeof value === 'object') {
      if (Array.isArray((value as any).richText)) {
        return (value as any).richText.map((v: any) => v.text).join('');
      }
      if (typeof (value as any).text === 'string') return (value as any).text;
    }

    return value;
  }

  private formatDisplay(value: any): SheetPreviewCell {
    if (value === null || value === undefined) return { display: '', type: 'text' };
    if (typeof value === 'number') {
      return { display: value.toLocaleString('en-US'), type: 'number' };
    }
    if (value instanceof Date) {
      return { display: value.toLocaleDateString('th-TH'), type: 'text' };
    }
    if (typeof value === 'object') {
      if (Array.isArray((value as any).richText)) {
        return { display: (value as any).richText.map((v: any) => v.text).join(''), type: 'text' };
      }
      if (typeof (value as any).text === 'string') {
        return { display: (value as any).text, type: 'text' };
      }
    }
    return { display: String(value), type: 'text' };
  }

  /**
   * Builds a *capped* range from worksheet dimensions to keep preview responsive.
   */
  private buildCappedRangeFromWorksheet(ws: any): string {
    const dimensions = ws.dimensions || {};
    const top = Number(dimensions.top ?? 1);
    const left = Number(dimensions.left ?? 1);

    // Worksheet dimensions often include formatted-but-empty cells (e.g., up to row 1000+).
    const rawBottom = Number(dimensions.bottom ?? ws.rowCount ?? 1);
    const rawRight = Number(dimensions.right ?? ws.columnCount ?? 1);

    const bottom = Math.min(rawBottom, top + this.DEFAULT_MAX_ROWS - 1);
    const right = Math.min(rawRight, left + this.DEFAULT_MAX_COLS - 1);

    return `${this.colToLetter(left)}${top}:${this.colToLetter(right)}${bottom}`;
  }

  private normalizeFormula(formula: string): string {
    const trimmed = String(formula || '').trim();
    return trimmed.startsWith('=') ? trimmed.slice(1) : trimmed;
  }

  private splitRangeRef(rangeRef: string): { sheetName?: string; range: string } {
    const quotedMatch = rangeRef.match(/^'([^']+)'!(.+)$/);
    if (quotedMatch) {
      return { sheetName: quotedMatch[1], range: quotedMatch[2] };
    }
    const parts = rangeRef.split('!');
    if (parts.length === 2) {
      return { sheetName: parts[0], range: parts[1] };
    }
    return { range: rangeRef };
  }

  private stripSheetQuotes(value: string): string {
    const trimmed = value.trim();
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  private parseRange(range: string): { startRow: number; endRow: number; startCol: number; endCol: number } {
    const cleaned = range.replace(/\$/g, '').trim().toUpperCase();
    const match = cleaned.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) {
      throw new Error(`Invalid range: ${range}`);
    }
    const startCol = this.colLetterToNumber(match[1]);
    const startRow = Number(match[2]);
    const endCol = this.colLetterToNumber(match[3]);
    const endRow = Number(match[4]);

    return { startRow, endRow, startCol, endCol };
  }

  private colLetterToNumber(letters: string): number {
    const chars = letters.toUpperCase().split('');
    let total = 0;
    for (const char of chars) {
      total = total * 26 + (char.charCodeAt(0) - 64);
    }
    return total;
  }

  private colToLetter(col: number): string {
    let result = '';
    let n = col;
    while (n > 0) {
      const rem = (n - 1) % 26;
      result = String.fromCharCode(65 + rem) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result || 'A';
  }
}
