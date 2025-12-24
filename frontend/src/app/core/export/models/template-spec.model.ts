// Template Spec models for Excel V-Sheet export.
//
// Key idea:
// - Canonical data (InventoryItemRow, Scope3SignificanceRow, etc.) is company-agnostic.
// - Template spec describes how to write into a specific Excel v-sheet: sheet names,
//   cell/row ranges, formulas, and selection rules.
// - Adapter (plugin) can handle company-specific quirks beyond declarative spec.

export interface ExcelFeatures {
  /** Supports dynamic array formulas: FILTER/UNIQUE/LET/... */
  dynamicArray: boolean;
  /** Supports XLOOKUP. If false, fall back to VLOOKUP/INDEX-MATCH patterns. */
  xlookup: boolean;
  /** Supports named ranges (optional). */
  namedRanges: boolean;
}

export interface SheetSpec {
  /** Actual worksheet name inside the xlsx */
  name: string;
}

export interface SelectionRuleSpec {
  /** Which canonical dataset to select from */
  source: 'fr032Canonical' | 'inventoryCanonical';
  /** Simple equality filters (AND) */
  where: Array<{ field: string; eq: any }>;
  /** Optional sorting */
  sortBy?: { field: string; dir: 'asc' | 'desc' };
  /** Optional limit */
  limit?: number;
}

export type FormulaSource =
  | { type: 'pattern'; pattern: string } // supports {r}
  | {
      /**
       * Two-mode formula:
       * - modern: may use XLOOKUP / FILTER / LET (depending on features)
       * - legacy: avoid XLOOKUP / dynamic arrays; use VLOOKUP/INDEX-MATCH
       */
      type: 'byExcel';
      whenModern: string;
      whenLegacy: string;
    };

export interface ColumnWriteSpec {
  /** If set, engine writes a formula into this cell */
  formulaFrom?: FormulaSource;
}

export interface TableSectionSpec {
  rowStart: number;
  rowEnd: number;
  /** Column letter -> writing rule */
  columns: Record<string, ColumnWriteSpec>;
}

export interface SectionSpec {
  /** Key referencing spec.sheets */
  sheet: string;
  /** Optional table range to apply */
  table?: TableSectionSpec;
}

export interface ValidationSpec {
  id: string;
  level: 'error' | 'warn';
  check: 'cellFormulaEquals' | 'traceChain' | 'percentDenominator';
  args: Record<string, any>;
}

export interface VSheetTemplateSpec {
  templateId: string;
  version: string;
  excelFeatures: ExcelFeatures;

  sheets: Record<string, SheetSpec>;
  selectionRules: Record<string, SelectionRuleSpec>;
  sections: Record<string, SectionSpec>;
  validations: ValidationSpec[];
}
