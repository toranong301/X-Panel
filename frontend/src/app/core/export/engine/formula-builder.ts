import { ExcelFeatures, FormulaSource } from '../models/template-spec.model';

/**
 * Build a formula string for a given row.
 * - Supports {r} placeholder (row number)
 * - Switches between dynamic/static formulas by excelFeatures.dynamicArray
 */
export function buildFormula(src: FormulaSource, features: ExcelFeatures, row: number): string {
  const injectRow = (s: string) => s.replaceAll('{r}', String(row));

  if (src.type === 'pattern') return injectRow(src.pattern);
  // Modern = allowed to use XLOOKUP and/or dynamic arrays.
  const isModern = !!(features.xlookup || features.dynamicArray);
  const chosen = isModern ? src.whenModern : src.whenLegacy;
  return injectRow(chosen);
}
