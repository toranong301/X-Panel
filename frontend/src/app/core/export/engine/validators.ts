// NOTE: ExcelJS is typed as any via src/shims-vsheet-export.d.ts until you install the real package.
import * as ExcelJS from 'exceljs';
import { VSheetTemplateSpec } from '../models/template-spec.model';

export interface ValidationResult {
  id: string;
  level: 'error' | 'warn';
  ok: boolean;
  message: string;
  cells?: string[];
}

/**
 * Minimal validation framework.
 * You can expand checks over time (trace chain, total denominator, etc.).
 */
export function runValidations(workbook: any, spec: VSheetTemplateSpec): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const v of spec.validations) {
    if (v.check === 'cellFormulaEquals') {
      results.push(checkCellFormulaEquals(workbook, v.id, v.level, v.args as any));
      continue;
    }

    // Placeholder: allow future validators without breaking.
    results.push({
      id: v.id,
      level: v.level,
      ok: true,
      message: `SKIP (${v.check}) - not implemented yet`,
    });
  }

  return results;
}

function checkCellFormulaEquals(
  workbook: any,
  id: string,
  level: 'error' | 'warn',
  args: { sheet: string; range: string; pattern: string }
): ValidationResult {
  const ws = workbook.getWorksheet(args.sheet);
  if (!ws) {
    return { id, level, ok: false, message: `Missing sheet: ${args.sheet}` };
  }

  const cells = expandRange(args.range);
  const bad: string[] = [];

  for (const addr of cells) {
    const cell = ws.getCell(addr);
    const actual = (cell.value as any)?.formula ?? '';
    const row = Number(addr.replace(/^[A-Z]+/i, ''));
    const expect = String(args.pattern).replaceAll('{r}', String(row));
    if (actual !== expect) bad.push(addr);
  }

  return {
    id,
    level,
    ok: bad.length === 0,
    message: bad.length ? `Formula mismatch: ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? '...' : ''}` : 'OK',
    cells: bad.length ? bad : undefined,
  };
}

/**
 * Supports:
 * - Single cell: "AO51"
 * - Single-col range: "AO51:AO56"
 * For multi-column ranges, add later when needed.
 */
function expandRange(range: string): string[] {
  const parts = range.split(':').map(s => s.trim());
  if (parts.length === 1) return [parts[0]];

  const [a1, b1] = parts;
  const colA = a1.match(/^[A-Z]+/i)?.[0] ?? '';
  const colB = b1.match(/^[A-Z]+/i)?.[0] ?? '';
  if (colA.toUpperCase() !== colB.toUpperCase()) {
    // keep safe: just check endpoints
    return [a1, b1];
  }

  const r1 = Number(a1.replace(/^[A-Z]+/i, ''));
  const r2 = Number(b1.replace(/^[A-Z]+/i, ''));
  const out: string[] = [];
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) out.push(`${colA}${r}`);
  return out;
}
