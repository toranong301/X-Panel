import {
  VSheetDataDoc,
  VSheetDetailBlock,
  VSheetFixedBlock,
  VSheetMonthly12Block,
  VSheetRowData,
  VSheetRowPoolBlock,
  getDynamicBlocks,
  getFixedBlocks,
} from '../../../vsheet/vsheet.schema';
import { ExportContext, TemplateAdapter } from '../../engine/excel-export.engine';

/**
 * Company-specific adapter for MBAX v-sheet (MBAX-TGO-11102567 demo).
 *
 * Goals for verifier trace-chain:
 * - FR-04.1 (Scope 3 section) should reference FR-03.2 rows that are Significant+Selected
 * - FR-03.2 should reference Screen scope 3 (Category/GHG/%)
 * - Screen scope 3 can be written from canonical data (values + formulas for GHG/%/Total)
 */
export class MBAX_TGO_11102567_Adapter implements TemplateAdapter {
  id = 'MBAX_TGO_11102567';

  supports(spec: any): boolean {
    return spec?.templateId === 'MBAX_TGO_11102567';
  }

  async apply(ctx: ExportContext): Promise<void> {
    const vsheet = ctx.canonical.vsheet;
    this.writeFixedBlocks(ctx, getFixedBlocks(), vsheet);
    this.writeDynamicBlocks(ctx, getDynamicBlocks(), vsheet);

    // ✅ NEW: เขียนชีทย่อย Scope 1.1 และ 1.2 (เขียนเฉพาะ input รายเดือน)
    const scope11Totals = this.writeScope11Stationary(ctx);
    const scope12Totals = this.writeScope12Mobile(ctx);
    this.writeScope142FireSuppression(ctx);
    this.writeScope143Septic(ctx);
    this.writeScope144Fertilizer(ctx);
    this.writeScope145WWTP(ctx);
    this.writeEvidenceSheet(ctx);
    // 1) Write Screen scope 3 table (lookup base)
    const screenRowMap = this.writeScreenScope3(ctx);

    // 2) Write FR-03.2 (keep formula links to Screen scope 3) and keep key->row map
    const fr032RowMap = this.writeFr032(ctx, screenRowMap);

    // 3) Populate FR-04.1 Scope 3 selected lines (B51..B56) referencing FR-03.2
    this.linkFr041Scope3FromFr032(ctx, fr032RowMap);

    // 4) Populate FR-04.1 Scope 1 qty linking to subsheet totals
    this.linkFr041Scope1QtyFromSubsheets(ctx, { ...scope11Totals, ...scope12Totals });
  }

  /**
   * Screen scope 3 (MBAX demo):
   * - row 1 = header
   * - row 2.. = group rows (A/B/C)
   * - item rows after each group
   * - total row (GHG total) at I46 (keep formula), % total at J46
   *
   * We write:
   * A tgoNo | B iso | C itemLabel | D unit | E qty | F remark | G dataEvidence | H ef | I ghg(formula) | J %(formula) | K efEvidence
   */
  private writeScreenScope3(ctx: ExportContext): Record<string, number> {
    const ws = ctx.workbook.getWorksheet(ctx.spec.sheets['screenScope3'].name);
    const map: Record<string, number> = {};
    if (!ws) return map;

    // Only Scope 3 inventory items
    const items = ctx.canonical.inventory
      .filter(x => Number((x as any).scope) === 3)
      .map(x => ({
        ...x,
        // normalize for safety
        tgoNo: String((x as any).tgoNo ?? ''),
        categoryLabel: String((x as any).categoryLabel ?? ''),
        isoScope: String((x as any).isoScope ?? ''),
        itemLabel: String((x as any).itemLabel ?? ''),
        unit: String((x as any).unit ?? ''),
        order: Number((x as any).order ?? 0),
      }));

    // Group by tgoNo (Scope 3.1, Scope 3.3, ...)
    const groupKeys = [...new Set(items.map(x => x.tgoNo))].sort((a, b) => {
      // try numeric order from first item in group
      const ao = items.find(x => x.tgoNo === a)?.order ?? 0;
      const bo = items.find(x => x.tgoNo === b)?.order ?? 0;
      return ao - bo;
    });

    // Clear old block (keep header row1 and total row46)
    for (let r = 2; r <= 45; r++) {
      for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']) {
        ws.getCell(`${col}${r}`).value = null;
      }
    }

    let row = 2;
    for (const g of groupKeys) {
      const groupItems = items.filter(x => x.tgoNo === g).sort((a, b) => a.order - b.order);
      if (!groupItems.length) continue;

      // group row
      ws.getCell(`A${row}`).value = g;
      ws.getCell(`B${row}`).value = groupItems[0].isoScope;
      ws.getCell(`C${row}`).value = groupItems[0].categoryLabel;
      row++;

      // item rows
      for (const it of groupItems) {
        if (row > 45) break;

        const qty = Number((it as any).quantityPerYear || 0);
        const ef = Number((it as any).ef || 0);

        ws.getCell(`C${row}`).value = it.itemLabel;
        ws.getCell(`D${row}`).value = it.unit;
        ws.getCell(`E${row}`).value = qty;
        ws.getCell(`F${row}`).value = (it as any).remark ?? '';
        ws.getCell(`G${row}`).value = (it as any).dataEvidence ?? '';
        ws.getCell(`H${row}`).value = ef;

        // Formula chain for verifier
        ws.getCell(`I${row}`).value = { formula: `=E${row}*H${row}/1000` };
        ws.getCell(`J${row}`).value = { formula: `=IF($I$46=0,0,I${row}/$I$46*100)` };

        ws.getCell(`K${row}`).value = (it as any).efEvidence ?? '';

        // map for FR-03.2 linking (avoid duplicates)
const subScope = String(it.tgoNo || '').replace(/^Scope\s*/i, '').trim(); // "Scope 3.1" -> "3.1"
const keyFull = `${subScope}|${it.itemLabel}|${it.unit}`;
const keyShort = `${subScope}|${it.itemLabel}`;

// เก็บแบบ full เป็นหลัก
map[keyFull] = row;

// เก็บแบบ short เป็น fallback แต่ "ห้ามทับของเดิม"
if (!map[keyShort]) map[keyShort] = row;

// เก็บแบบชื่ออย่างเดียวเป็น fallback สุดท้าย (ห้ามทับ)
if (it.itemLabel && !map[it.itemLabel]) map[it.itemLabel] = row;


        row++;
      }

      if (row > 45) break;
    }

    // Keep total formulas as in template (do not overwrite)
    // (If template is missing them, you can enable these lines)
    // ws.getCell('I46').value = { formula: '=SUM(I3:I45)' };
    // ws.getCell('J46').value = { formula: '=SUM(J3:J45)' };

    return map;
  }

  /**
   * FR-03.2 (MBAX demo): write group + item rows with formula links to Screen scope 3.
   *
   * Template header row is 20, so we start writing from row 21.
   * We write:
   * - group row: A=subScope, B=isoNo, C=categoryLabel
   * - item row:  C -> ='Screen scope 3'!C{screenRow}
   *             M -> ='Screen scope 3'!I{screenRow}
   *             N -> ='Screen scope 3'!J{screenRow}
   *             K/L from canonical (assessment/selection)
   * Returns key->excelRow map for FR-04.1 trace.
   */
  private writeFr032(ctx: ExportContext, screenRowMap: Record<string, number>): Record<string, number> {
    const ws = ctx.workbook.getWorksheet(ctx.spec.sheets['fr032'].name);
    const map: Record<string, number> = {};
    if (!ws) return map;

    type Fr032WriteRow = {
  key: string;
  subScope: string;
  isoNo: string;
  categoryLabel: string;
  itemLabel: string;
  assessment?: string;
  selection?: string;
  ghgTco2e?: number;
  sharePct?: number;
};

const rows: Fr032WriteRow[] = (ctx.canonical.fr03_2 ?? [])
  .filter((r: any) => String(r?.subScope ?? '').startsWith('3'))
  .map((r: any) => ({
    ...r,
    subScope: String(r?.subScope ?? ''),
    isoNo: String(r?.isoNo ?? ''),
    categoryLabel: String(r?.categoryLabel ?? ''),
    itemLabel: String(r?.itemLabel ?? ''),
    key: String(r?.key ?? ''),
  }));

// sort แบบ dotted-number (แก้ 3.10 เพี้ยน)
const compareDotted = (a: string, b: string) => {
  const pa = a.split('.').map(n => Number(n));
  const pb = b.split('.').map(n => Number(n));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
};

const groupKeys = [...new Set(rows.map(x => x.subScope))].sort(compareDotted);



    // Clear a safe block where the table lives (keep header rows above 20)
    for (let r = 21; r <= 200; r++) {
      for (const col of ['A', 'B', 'C', 'K', 'L', 'M', 'N']) {
        ws.getCell(`${col}${r}`).value = null;
      }
    }

    let excelRow = 21;
    for (const g of groupKeys) {
      const groupRows = rows.filter(x => x.subScope === g);
      if (!groupRows.length) continue;

      // group header
      ws.getCell(`A${excelRow}`).value = g;
      ws.getCell(`B${excelRow}`).value = groupRows[0].isoNo;
      ws.getCell(`C${excelRow}`).value = groupRows[0].categoryLabel;
      excelRow++;

      // items
      for (const r of groupRows) {
        if (excelRow > 200) break;

        map[r.key] = excelRow;
        const unit = String((r as any).unit ?? ''); // ถ้า canonical fr03_2 ไม่มี unit ก็จะเป็น ''
const keyFull = `${r.subScope}|${r.itemLabel}|${unit}`;
const keyShort = `${r.subScope}|${r.itemLabel}`;

const screenRow =
  screenRowMap[keyFull] ??
  screenRowMap[keyShort] ??
  screenRowMap[r.itemLabel] ??
  null;


        if (screenRow) {
          ws.getCell(`C${excelRow}`).value = { formula: `='${ctx.spec.sheets['screenScope3'].name}'!C${screenRow}` };
          ws.getCell(`M${excelRow}`).value = { formula: `='${ctx.spec.sheets['screenScope3'].name}'!I${screenRow}` };
          ws.getCell(`N${excelRow}`).value = { formula: `='${ctx.spec.sheets['screenScope3'].name}'!J${screenRow}` };
        } else {
          ws.getCell(`C${excelRow}`).value = r.itemLabel;
          ws.getCell(`M${excelRow}`).value = Number((r as any).ghgTco2e ?? 0);
          ws.getCell(`N${excelRow}`).value = Number((r as any).sharePct ?? 0);
        }

        // write evaluation results (from FR-03.2 UI)
        ws.getCell(`K${excelRow}`).value = r.assessment;
        ws.getCell(`L${excelRow}`).value = r.selection;

        excelRow++;
      }

      if (excelRow > 200) break;
    }

    return map;
  }

  /**
   * FR-04.1 Scope 3 section (MBAX demo): B51..B56 = activity/item label
   * Write formula linking back to FR-03.2!C{row} so verifier can trace.
   */
  private linkFr041Scope3FromFr032(ctx: ExportContext, fr032RowMap: Record<string, number>) {
    const ws = ctx.workbook.getWorksheet(ctx.spec.sheets['fr041'].name);
    if (!ws) return;

    const selected = ctx.selections['significantScope3Top6'] || [];
    const baseRow = 51;
    const max = 6;

    for (let i = 0; i < max; i++) {
      const destRow = baseRow + i;
      const item = selected[i];
      if (!item) {
        this.setCellValueSafely(ws, `B${destRow}`, null);
        continue;
      }

      const excelRow = fr032RowMap[String((item as any).key)] ?? null;
      if (excelRow) {
        this.setCellValueSafely(ws, `B${destRow}`, { formula: `='${ctx.spec.sheets['fr032'].name}'!C${excelRow}` });
      } else {
        this.setCellValueSafely(ws, `B${destRow}`, (item as any).itemLabel ?? '');
      }
    }
  }

  private writeFixedBlocks(ctx: ExportContext, blocks: VSheetFixedBlock[], data: VSheetDataDoc) {
    for (const block of blocks) {
      const ws = ctx.workbook.getWorksheet(block.sheetName);
      if (!ws) continue;

      const values = data?.cfoFixed?.[block.id] ?? {};
      for (const input of block.inputs) {
        const value = values[input.key];
        if (value === undefined) continue;
        this.setCellValueSafely(ws, input.cell, value);
      }
    }
  }

  private writeDynamicBlocks(
    ctx: ExportContext,
    blocks: Array<VSheetRowPoolBlock | VSheetMonthly12Block | VSheetDetailBlock>,
    data: VSheetDataDoc,
  ) {
    for (const block of blocks) {
      if (block.blockType === 'rowPool') {
        this.writeRowPoolBlock(ctx, block, data);
      } else if (block.blockType === 'monthly12') {
        this.writeMonthly12Block(ctx, block, data);
      } else if (block.blockType === 'detail') {
        this.writeDetailBlocks(ctx, block, data);
      }
    }
  }

  private writeRowPoolBlock(ctx: ExportContext, block: VSheetRowPoolBlock, data: VSheetDataDoc) {
    const ws = ctx.workbook.getWorksheet(block.sheetName);
    if (!ws) return;

    const rows = data?.subsheets?.[this.blockKey(block)] ?? [];
    const step = block.step ?? 1;

    for (let i = 0; i < block.maxRows; i++) {
      const excelRow = block.startRow + i * step;
      const rowData = rows[i];
      for (const col of block.columns) {
        const cellRef = `${col.column}${excelRow}`;
        const value = rowData?.inputs?.[col.key];
        this.setCellValueSafely(ws, cellRef, value ?? null);
      }
    }
  }

  private writeMonthly12Block(ctx: ExportContext, block: VSheetMonthly12Block, data: VSheetDataDoc) {
    const ws = ctx.workbook.getWorksheet(block.sheetName);
    if (!ws) return;

    const rows = data?.subsheets?.[this.blockKey(block)] ?? [];
    const step = block.step ?? 1;

    for (let i = 0; i < block.maxRows; i++) {
      const excelRow = block.startRow + i * step;
      const rowData = rows[i];

      if (block.columns?.length) {
        for (const col of block.columns) {
          const cellRef = `${col.column}${excelRow}`;
          const value = rowData?.inputs?.[col.key];
          this.setCellValueSafely(ws, cellRef, value ?? null);
        }
      }

      for (let m = 0; m < block.monthColumns.length; m++) {
        const monthCol = block.monthColumns[m];
        const cellRef = `${monthCol}${excelRow}`;
        const value = rowData?.months?.[m];
        this.setCellValueSafely(ws, cellRef, value ?? null);
      }
    }
  }

  private writeDetailBlocks(ctx: ExportContext, block: VSheetDetailBlock, data: VSheetDataDoc) {
    const ws = ctx.workbook.getWorksheet(block.sheetName);
    if (!ws) return;

    const parentRows =
      data?.subsheets?.[this.blockKey({ sheetName: block.sheetName, id: block.parentBlockId })] ??
      [];
    const flattened: VSheetRowData[] = [];
    for (const row of parentRows) {
      if (row.details?.length) flattened.push(...row.details);
    }

    const step = block.step ?? 1;
    for (let i = 0; i < block.maxRows; i++) {
      const excelRow = block.startRow + i * step;
      const rowData = flattened[i];
      for (const col of block.columns) {
        const cellRef = `${col.column}${excelRow}`;
        const value = rowData?.inputs?.[col.key];
        this.setCellValueSafely(ws, cellRef, value ?? null);
      }
    }
  }

  private blockKey(block: { sheetName: string; id: string }): string {
    return `${block.sheetName}::${block.id}`;
  }

  private setCellValueSafely(ws: any, cellRef: string, value: any) {
    const cell = ws.getCell(cellRef);
    const target = cell?.master ?? cell;
    if (target?.formula || target?.value?.formula) return;
    target.value = value === '' ? null : value;
  }

  private getCellText(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    if (typeof value === 'object') {
      if (Array.isArray((value as any).richText)) {
        return (value as any).richText.map((r: any) => r.text).join('').trim();
      }
      if (typeof (value as any).text === 'string') return (value as any).text.trim();
    }
    return String(value).trim();
  }
  private writeScope11Stationary(ctx: ExportContext): Record<string, { sheetName: string; totalCell: string }> {
  const totals: Record<string, { sheetName: string; totalCell: string }> = {};
  // ชื่อชีทตาม template จริง: มีเว้นวรรคท้ายด้วย
  const ws = ctx.workbook.getWorksheet('1.1 Stationary ');
  if (!ws) return totals;

  const MONTH_COLS = ['E','F','G','H','I','J','K','L','M','N','O','P'] as const; // เดือน 1..12

  const setMonths = (excelRow: number, months?: number[]) => {
  for (let i = 0; i < 12; i++) {
    const v = Number(months?.[i] ?? 0);
    this.setCellValueSafely(ws, `${MONTH_COLS[i]}${excelRow}`, v ? v : null);
  }
};

  // ✅ แถว input รายเดือน (ตาม template)
  const dieselRow = 9;       // E9:P9
  const gasoholRow = 10;     // E10:P10
  const acetyl2TankRow = 12; // E12:P12
  const acetyl3TankRow = 14; // E14:P14

  // เคลียร์ข้อมูลเก่าเฉพาะ input cells
  for (const r of [dieselRow, gasoholRow, acetyl2TankRow, acetyl3TankRow]) {
  setMonths(r); // จะเขียน null ทั้ง 12 เดือน (ผ่าน setCellValueSafely)
}


  // ดึง canonical
  const rows = (ctx.canonical.inventory ?? []).filter((x: any) =>
    String(x?.subScope ?? '') === '1.1'
  );

  const getFuelKey = (x: any) => String(x?.fuelKey ?? x?.meta?.fuelKey ?? '').trim().toUpperCase();
  const getMonths = (x: any) =>
    Array.isArray(x?.quantityMonthly) ? x.quantityMonthly :
    Array.isArray(x?.months) ? x.months :
    undefined;

  const byFuelKey = (k: string) => rows.find((x: any) => getFuelKey(x) === k.toUpperCase());

  // ✅ map fuelKey → แถวในชีท
  const diesel  = byFuelKey('DIESEL_B7_STATIONARY');
  const gasohol = byFuelKey('GASOHOL_9195_STATIONARY');
  const acetyl2 = byFuelKey('ACETYLENE_TANK5_MAINT_2');
  const acetyl3 = byFuelKey('ACETYLENE_TANK5_MAINT_3');

  if (diesel)  setMonths(dieselRow, getMonths(diesel));
  if (gasohol) setMonths(gasoholRow, getMonths(gasohol));
  if (acetyl2) setMonths(acetyl2TankRow, getMonths(acetyl2));
  if (acetyl3) setMonths(acetyl3TankRow, getMonths(acetyl3));

  const totalRows: Array<{ key: string; row: number }> = [
    { key: 'DIESEL_B7_STATIONARY', row: dieselRow },
    { key: 'GASOHOL_9195_STATIONARY', row: gasoholRow },
    { key: 'ACETYLENE_TANK5_MAINT_2', row: acetyl2TankRow },
    { key: 'ACETYLENE_TANK5_MAINT_3', row: acetyl3TankRow },
  ];

  for (const it of totalRows) {
    const totalCell = this.findRowTotalCell(ws, it.row, [...MONTH_COLS]);
    if (totalCell) totals[it.key] = { sheetName: ws.name, totalCell };
  }

  // ⚠️ ไม่แตะสูตรสรุป/แปลงหน่วยด้านบน และไม่แตะ FR-04.1
  return totals;
}


private writeScope12Mobile(ctx: ExportContext): Record<string, { sheetName: string; totalCell: string; slotNo?: number }> {
  const totals: Record<string, { sheetName: string; totalCell: string; slotNo?: number }> = {};
  const ws = ctx.workbook.getWorksheet('1.2 Mobile');
  if (!ws) return totals;

  const MONTH_COLS = ['G','H','I','J','K','L','M','N','O','P','Q','R'] as const; // เดือน 1..12

  const setMonths = (excelRow: number, months?: number[]) => {
  for (let i = 0; i < 12; i++) {
    const v = Number(months?.[i] ?? 0);
    this.setCellValueSafely(ws, `${MONTH_COLS[i]}${excelRow}`, v ? v : null);
  }
};


  // row slots ตาม template
  const dieselB7Rows: number[] = [];
  for (let r = 15; r <= 41; r += 2) dieselB7Rows.push(r);

  const dieselB10Rows: number[] = [];
  for (let r = 16; r <= 42; r += 2) dieselB10Rows.push(r);

  const gasohol9195Rows: number[] = [];
  for (let r = 45; r <= 55; r += 2) gasohol9195Rows.push(r);

  const gasoholE20Rows: number[] = [];
  for (let r = 46; r <= 56; r += 2) gasoholE20Rows.push(r);

  const offroadForkliftRow = 58;

  // เคลียร์เฉพาะ input เดือน (กันข้อมูลเก่าค้าง)
  const clearRows = [...dieselB7Rows, ...dieselB10Rows, ...gasohol9195Rows, ...gasoholE20Rows, offroadForkliftRow];
  for (const r of clearRows) setMonths(r);


  // ดึง canonical
  const rows = (ctx.canonical.inventory ?? []).filter((x: any) =>
    String(x?.subScope ?? '') === '1.2' || String(x?.tgoNo ?? '').includes('1.2')
  );

  type MobileRow = { fuelKey: string; months?: number[]; slotNo?: number };

  const getFuelKey = (x: any) => String(x?.fuelKey ?? x?.meta?.fuelKey ?? '').trim().toUpperCase();
  const getMonths = (x: any) =>
    Array.isArray(x?.quantityMonthly) ? x.quantityMonthly :
    Array.isArray(x?.months) ? x.months :
    undefined;

  const mobileRows: MobileRow[] = rows
    .map((x: any) => ({
      fuelKey: getFuelKey(x),
      months: getMonths(x),
      slotNo: Number.isFinite(Number(x?.slotNo)) ? Number(x.slotNo) : undefined,
    }))
    .filter(x => !!x.fuelKey);

  const byKey = (k: string) => mobileRows.filter(x => x.fuelKey === k.toUpperCase());

  const recordTotal = (fuelKey: string, excelRow: number, slotNo?: number) => {
    const totalCell = this.findRowTotalCell(ws, excelRow, [...MONTH_COLS]);
    if (!totalCell) return;
    const key = fuelKey === 'DIESEL_B7_OFFROAD' ? fuelKey : slotNo ? `${fuelKey}#${slotNo}` : fuelKey;
    totals[key] = { sheetName: ws.name, totalCell, slotNo };
  };

  const fillSlots = (slots: number[], list: MobileRow[], fuelKey: string) => {
    // 1) วางตาม slotNo ก่อน (slotNo เป็น 1-based)
    const used = new Set<number>(); // idx 0..n-1
    const withSlot = list
      .filter(x => Number.isFinite(Number(x.slotNo)))
      .sort((a, b) => Number(a.slotNo) - Number(b.slotNo));

    for (const it of withSlot) {
      const idx = Number(it.slotNo) - 1;
      if (idx >= 0 && idx < slots.length && !used.has(idx)) {
        setMonths(slots[idx], it.months);
        recordTotal(fuelKey, slots[idx], idx + 1);
        used.add(idx);
      }
    }

    // 2) ที่เหลือเติมลงช่องว่างตามลำดับ
    const withoutSlot = list.filter(x => !Number.isFinite(Number(x.slotNo)));
    let ptr = 0;
    for (const it of withoutSlot) {
      while (ptr < slots.length && used.has(ptr)) ptr++;
      if (ptr >= slots.length) break;
      setMonths(slots[ptr], it.months);
      recordTotal(fuelKey, slots[ptr], ptr + 1);
      used.add(ptr);
      ptr++;
    }
  };

  fillSlots(dieselB7Rows, byKey('DIESEL_B7_ONROAD'), 'DIESEL_B7_ONROAD');
  fillSlots(dieselB10Rows, byKey('DIESEL_B10_ONROAD'), 'DIESEL_B10_ONROAD');
  fillSlots(gasohol9195Rows, byKey('GASOHOL_9195'), 'GASOHOL_9195');
  fillSlots(gasoholE20Rows, byKey('GASOHOL_E20'), 'GASOHOL_E20');

  const offroad = byKey('DIESEL_B7_OFFROAD')[0];
  if (offroad) {
    setMonths(offroadForkliftRow, offroad.months);
    recordTotal('DIESEL_B7_OFFROAD', offroadForkliftRow);
  }

  // ⚠️ ไม่แตะสูตรสรุปบนสุดของชีท และไม่แตะ FR-04.1
  return totals;
}

  private findRowTotalCell(ws: any, excelRow: number, monthCols: string[]): string | null {
    if (!monthCols?.length) return null;
    const monthStartCol = monthCols[0];
    const monthEndCol = monthCols[monthCols.length - 1];
    const startColNo = this.colLetterToNumber(monthStartCol);
    if (!startColNo || startColNo <= 1) return null;

    for (let c = startColNo - 1; c >= 1; c--) {
      const colLetter = this.colToLetter(c);
      const cell = ws.getCell(`${colLetter}${excelRow}`);
      const formula = cell?.formula || cell?.value?.formula;
      if (!formula) continue;
      const formulaText = String(formula);
      if (formulaText.includes(`${monthStartCol}${excelRow}`) && formulaText.includes(`${monthEndCol}${excelRow}`)) {
        return `${colLetter}${excelRow}`;
      }
    }

    const prevCol = this.colToLetter(startColNo - 1);
    const formula = `=SUM(${monthStartCol}${excelRow}:${monthEndCol}${excelRow})`;
    this.setCellValueSafely(ws, `${prevCol}${excelRow}`, { formula });
    return `${prevCol}${excelRow}`;
  }

  private linkFr041Scope1QtyFromSubsheets(
    ctx: ExportContext,
    totals: Record<string, { sheetName: string; totalCell: string }>,
  ): void {
    const ws = ctx.workbook.getWorksheet(ctx.spec.sheets['fr041'].name);
    if (!ws) return;

    const maxRows = Math.min(ws.rowCount || 400, 400);
    const maxCols = Math.max(ws.columnCount || 30, 30);

    const normalizeText = (s: string) =>
      String(s || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

    const findRowContaining = (needle: string, start: number, end: number): number | null => {
      const target = normalizeText(needle);
      for (let r = start; r <= end; r++) {
        for (let c = 1; c <= maxCols; c++) {
          const text = normalizeText(this.getCellText(ws.getCell(r, c).value));
          if (!text) continue;
          if (text.includes(target)) return r;
        }
      }
      return null;
    };

    const scope1Start = findRowContaining('ขอบเขต 1', 1, maxRows) ?? 1;
    const scope1EndCandidate =
      findRowContaining('ขอบเขต 2', scope1Start + 1, maxRows) ??
      findRowContaining('ขอบเขต 3', scope1Start + 1, maxRows);
    const scope1End = scope1EndCandidate ? Math.max(scope1Start, scope1EndCandidate - 1) : maxRows;

    const headerRow =
      findRowContaining('ปริมาณ', scope1Start, scope1End) ??
      findRowContaining('ค่า lci', scope1Start, scope1End) ??
      findRowContaining('lci', scope1Start, scope1End);
    if (!headerRow) return;

    let itemColNo: number | null = null;
    let qtyColNo: number | null = null;
    let unitColNo: number | null = null;

    for (let c = 1; c <= maxCols; c++) {
      const text = normalizeText(this.getCellText(ws.getCell(headerRow, c).value));
      if (!text) continue;
      if (!itemColNo && (text.includes('รายการ') || text.includes('กิจกรรม'))) itemColNo = c;
      if (!qtyColNo && text.includes('ปริมาณ')) qtyColNo = c;
      if (!qtyColNo && text.includes('lci')) qtyColNo = c;
      if (!unitColNo && (text.includes('หน่วย') || text.includes('unit'))) unitColNo = c;
    }

    if (!qtyColNo) return;
    const qtyColLetter = this.colToLetter(qtyColNo);
    const unitColLetter = unitColNo ? this.colToLetter(unitColNo) : null;

    const rowLabels: Array<{ row: number; label: string }> = [];
    for (let r = headerRow + 1; r <= scope1End; r++) {
      let rawLabel = '';
      if (itemColNo) {
        rawLabel = this.getCellText(ws.getCell(r, itemColNo).value);
      }
      if (!rawLabel) {
        for (let c = 1; c <= maxCols; c++) {
          const text = this.getCellText(ws.getCell(r, c).value);
          if (text) {
            rawLabel = text;
            break;
          }
        }
      }
      if (!rawLabel) continue;
      rowLabels.push({ row: r, label: normalizeText(rawLabel) });
    }

    const getFuelKey = (x: any) => String(x?.fuelKey ?? x?.meta?.fuelKey ?? '').trim().toUpperCase();
    const selectionList =
      (ctx.canonical as any)?.fr041Selection ??
      ctx.selections?.['fr041Selection'] ??
      ctx.selections?.['fr041Selections'] ??
      [];
    const normalizedSelections = Array.isArray(selectionList) ? selectionList : [];

    const normalizeKey = (value: string) =>
      String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

    const isSelected = (item: any) => {
      if (!normalizedSelections.length) return true;
      const itemId = normalizeKey(item?.id);
      const itemLabel = normalizeKey(item?.itemLabel);
      const itemSubScope = normalizeKey(item?.subScope);
      const itemUnit = normalizeKey(item?.unit);
      const itemFuelKey = normalizeKey(item?.fuelKey);
      const itemSlotNo = Number.isFinite(Number(item?.slotNo)) ? Number(item.slotNo) : null;
      const itemComposite = `${itemSubScope}|${itemLabel}|${itemUnit}`;

      return normalizedSelections.some((sel: any) => {
        if (typeof sel === 'string') {
          const selKey = normalizeKey(sel);
          return (
            selKey === itemId ||
            selKey === itemLabel ||
            selKey === `${itemSubScope}|${itemLabel}` ||
            selKey === itemComposite
          );
        }
        const selId = normalizeKey(sel?.id);
        if (selId && selId === itemId) return true;
        const selFuelKey = normalizeKey(sel?.fuelKey ?? sel?.meta?.fuelKey);
        const selSlotNo = Number.isFinite(Number(sel?.slotNo)) ? Number(sel.slotNo) : null;
        if (selFuelKey && selFuelKey === itemFuelKey) {
          return selSlotNo === null || selSlotNo === itemSlotNo;
        }
        const selLabel = normalizeKey(sel?.itemLabel ?? sel?.label ?? sel?.name);
        const selSubScope = normalizeKey(sel?.subScope ?? sel?.categoryCode);
        const selUnit = normalizeKey(sel?.unit);
        if (selLabel && selSubScope) {
          const selComposite = `${selSubScope}|${selLabel}|${selUnit}`;
          return selComposite === itemComposite || `${selSubScope}|${selLabel}` === `${itemSubScope}|${itemLabel}`;
        }
        return selLabel ? selLabel === itemLabel : false;
      });
    };

    const scope1Items = (ctx.canonical.inventory ?? [])
      .filter((x: any) =>
        Number((x as any).scope) === 1 && (String(x?.subScope ?? '') === '1.1' || String(x?.subScope ?? '') === '1.2'),
      )
      .filter(isSelected);

    const fuelKeyLabelMap: Record<string, string[]> = {
      DIESEL_B7_STATIONARY: ['น้ำมัน Diesel B7', 'Diesel B7'],
      GASOHOL_9195_STATIONARY: ['น้ำมัน Gasohol 91/95', 'Gasohol 91/95'],
      ACETYLENE_TANK5_MAINT_2: ['Acetylene gas', 'อะเซทิลีน'],
      ACETYLENE_TANK5_MAINT_3: ['Acetylene gas', 'อะเซทิลีน'],
      DIESEL_B7_ONROAD: ['Diesel B7 on-road', 'Diesel B7'],
      DIESEL_B10_ONROAD: ['Diesel B10 on-road', 'Diesel B10'],
      GASOHOL_9195: ['Gasohol 91/95'],
      GASOHOL_E20: ['Gasohol E20'],
      DIESEL_B7_OFFROAD: ['Diesel B7 off-road', 'forklift'],
    };

    for (const item of scope1Items) {
      const fuelKey = getFuelKey(item);
      if (!fuelKey) continue;

      const slotNo = Number.isFinite(Number((item as any).slotNo)) ? Number((item as any).slotNo) : undefined;
      const key = fuelKey === 'DIESEL_B7_OFFROAD' ? fuelKey : slotNo ? `${fuelKey}#${slotNo}` : fuelKey;
      const totalRef = totals[key];
      if (!totalRef) continue;

      const labelCandidates = [
        String((item as any).itemLabel ?? ''),
        ...(fuelKeyLabelMap[fuelKey] ?? []),
      ]
        .map(normalizeText)
        .filter(Boolean);

      if (!labelCandidates.length) continue;

      const matches = rowLabels
        .filter(r => r.label && labelCandidates.some(label => r.label.includes(label) || label.includes(r.label)))
        .map(r => r.row)
        .sort((a, b) => a - b);
      if (!matches.length) continue;

      const targetRow = slotNo && matches.length >= slotNo ? matches[slotNo - 1] : matches[0];
      const formula = `='${totalRef.sheetName}'!${totalRef.totalCell}`;
      this.setCellValueSafely(ws, `${qtyColLetter}${targetRow}`, { formula });

      if (unitColLetter && (item as any).unit) {
        this.setCellValueSafely(ws, `${unitColLetter}${targetRow}`, String((item as any).unit));
      }
    }
  }

  private writeScope142FireSuppression(ctx: ExportContext): void {
    const ws = ctx.workbook.getWorksheet('1.4.2 สารดับเพลิง');
    if (!ws) return;

    const MONTH_COLS = ['F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'] as const;
    const START_ROW = 4;
    const MAX_ROWS = 10;

    for (let i = 0; i < MAX_ROWS; i++) {
      const r = START_ROW + i;
      for (const col of ['A', 'B', 'C', 'D']) this.setCellValueSafely(ws, `${col}${r}`, null);
      for (let m = 0; m < 12; m++) this.setCellValueSafely(ws, `${MONTH_COLS[m]}${r}`, null);
    }

    const rows = (ctx.canonical.inventory ?? []).filter((x: any) => String(x?.subScope ?? '') === '1.4.2');

    const sorted = [...rows].sort((a: any, b: any) => Number(a?.slotNo || 0) - Number(b?.slotNo || 0));
    const getMonths = (x: any) => (Array.isArray(x?.quantityMonthly) ? x.quantityMonthly : []);
    const getLocation = (x: any) => String(x?.remark ?? '');
    const getEvidence = (x: any) => String(x?.dataEvidence ?? '');

    for (let i = 0; i < Math.min(sorted.length, MAX_ROWS); i++) {
      const it: any = sorted[i];
      const r = START_ROW + i;

      this.setCellValueSafely(ws, `A${r}`, String(it?.itemLabel ?? ''));
      this.setCellValueSafely(ws, `B${r}`, getLocation(it));
      this.setCellValueSafely(ws, `C${r}`, getEvidence(it));
      this.setCellValueSafely(ws, `D${r}`, String(it?.unit ?? 'kg'));

      const months = getMonths(it);
      for (let m = 0; m < 12; m++) {
        const v = Number(months?.[m] ?? 0);
        this.setCellValueSafely(ws, `${MONTH_COLS[m]}${r}`, v ? v : null);
      }
    }
  }

  private writeScope143Septic(ctx: ExportContext): void {
    let ws = ctx.workbook.getWorksheet('1.4.3 Septic');
    if (!ws) {
      ws = ctx.workbook.worksheets.find((sheet: any) => {
        const name = String(sheet?.name ?? '').toLowerCase();
        return name.includes('1.4.3') || name.includes('septic');
      });
    }
    if (!ws) return;

    const janRows: number[] = [];
    for (let r = 1; r <= 300; r++) {
      const text = this.getCellText(ws.getCell(`A${r}`).value);
      if (text === 'ม.ค.') janRows.push(r);
    }

    if (!janRows.length) return;

    const rows = (ctx.canonical.inventory ?? []).filter((x: any) => String(x?.subScope ?? '') === '1.4.3');
    const getFuelKey = (x: any) => String(x?.fuelKey ?? x?.meta?.fuelKey ?? '').trim().toUpperCase();
    const getMonths = (x: any) => Array.isArray(x?.quantityMonthly) ? x.quantityMonthly : [];

    const findRow = (fuelKey: string, slotNo: number) =>
      rows.find((x: any) => getFuelKey(x) === fuelKey && Number(x?.slotNo) === slotNo);

    const hasFormula = (cell: any) => Boolean(cell?.formula || cell?.value?.formula);
    const findInputCol = (preferred: string, candidates: string[]) => {
      const colList = [preferred, ...candidates];
      for (const col of colList) {
        const cell = ws?.getCell(`${col}${janRows[0]}`);
        if (!hasFormula(cell)) return col;
      }
      return preferred;
    };

    const peopleCol = findInputCol('B', ['C', 'D', 'E', 'F', 'G', 'H']);
    const offCol = findInputCol('E', ['D', 'F', 'G', 'H', 'I', 'J']);

    const maxGroups = Math.min(janRows.length, 4);
    for (let groupIndex = 0; groupIndex < maxGroups; groupIndex++) {
      const janRow = janRows[groupIndex];
      const groupNo = groupIndex + 1;

      for (let m = 0; m < 12; m++) {
        this.setCellValueSafely(ws, `${peopleCol}${janRow + m}`, null);
        this.setCellValueSafely(ws, `${offCol}${janRow + m}`, null);
      }

      const peopleRow = findRow('SEPTIC_P', groupNo);
      const offRow = findRow('SEPTIC_OFF', groupNo);
      const peopleMonths = peopleRow ? getMonths(peopleRow) : [];
      const offMonths = offRow ? getMonths(offRow) : [];

      for (let m = 0; m < 12; m++) {
        const peopleValue = Number(peopleMonths?.[m] ?? 0);
        const offValue = Number(offMonths?.[m] ?? 0);
        this.setCellValueSafely(ws, `${peopleCol}${janRow + m}`, peopleValue ? peopleValue : null);
        this.setCellValueSafely(ws, `${offCol}${janRow + m}`, offValue ? offValue : null);
      }
    }
  }

  private writeScope144Fertilizer(ctx: ExportContext): void {
    let ws = ctx.workbook.getWorksheet('1.4.4 ปุ๋ย');
    if (!ws) {
      ws = ctx.workbook.worksheets.find((sheet: any) => {
        const name = String(sheet?.name ?? '').toLowerCase();
        return name.includes('1.4.4') || name.includes('ปุ๋ย');
      });
    }
    if (!ws) return;

    const MONTH_COLS = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'] as const;
    const START_ROW = 4;
    const MAX_ROWS = 10;

    for (let i = 0; i < MAX_ROWS; i++) {
      const r = START_ROW + i;
      this.setCellValueSafely(ws, `A${r}`, null);
      this.setCellValueSafely(ws, `B${r}`, null);
      this.setCellValueSafely(ws, `C${r}`, null);
      for (let m = 0; m < 12; m++) this.setCellValueSafely(ws, `${MONTH_COLS[m]}${r}`, null);
    }

    const items = (ctx.canonical.inventory ?? []).filter((x: any) => String(x?.subScope ?? '') === '1.4.4');
    const sorted = [...items].sort((a: any, b: any) => Number(a?.slotNo || 0) - Number(b?.slotNo || 0));

    const getMonths = (x: any) => Array.isArray(x?.quantityMonthly) ? x.quantityMonthly : [];
    const getEvidence = (x: any) => String(x?.dataEvidence ?? '');
    const getUnit = (x: any) => String(x?.unit ?? 'Kg');

    for (let i = 0; i < Math.min(sorted.length, MAX_ROWS); i++) {
      const it: any = sorted[i];
      const r = START_ROW + i;

      this.setCellValueSafely(ws, `A${r}`, String(it?.itemLabel ?? ''));
      this.setCellValueSafely(ws, `B${r}`, getEvidence(it));
      this.setCellValueSafely(ws, `C${r}`, getUnit(it));

      const months = getMonths(it);
      for (let m = 0; m < 12; m++) {
        const v = Number(months?.[m] ?? 0);
        this.setCellValueSafely(ws, `${MONTH_COLS[m]}${r}`, v ? v : null);
      }
    }
  }

  private writeScope145WWTP(ctx: ExportContext): void {
    const ws = this.findWwtpWorksheet(ctx);
    if (!ws) return;

    const items = (ctx.canonical.inventory ?? []).filter((x: any) => String(x?.subScope ?? '') === '1.4.5');
    const getFuelKey = (x: any) => String(x?.fuelKey ?? x?.meta?.fuelKey ?? '').trim().toUpperCase();
    const getMonths = (x: any) => Array.isArray(x?.quantityMonthly) ? x.quantityMonthly : [];

    const qualRows = items
      .filter((x: any) => getFuelKey(x) === 'WWTP_QUAL')
      .sort((a: any, b: any) => Number(a?.slotNo || 0) - Number(b?.slotNo || 0));
    const meterRows = items
      .filter((x: any) => getFuelKey(x) === 'WWTP_METER')
      .sort((a: any, b: any) => Number(a?.slotNo || 0) - Number(b?.slotNo || 0));

    const qualityBlock = this.findWwtpQualityBlock(ws);
    if (qualityBlock) {
      const { startRow, endRow, monthCols } = qualityBlock;
      for (let row = startRow; row <= endRow; row++) {
        for (const col of qualityBlock.inputCols) {
          this.setCellValueSafely(ws, `${col}${row}`, null);
        }
        for (const col of monthCols) {
          this.setCellValueSafely(ws, `${col}${row}`, null);
        }
      }

      for (let i = 0; i < Math.min(qualRows.length, endRow - startRow + 1); i++) {
        const it: any = qualRows[i];
        const row = startRow + i;
        const { system, standard } = this.parseWwtpRemark(String(it?.remark ?? ''));

        this.setCellValueSafely(ws, `${qualityBlock.itemCol}${row}`, String(it?.itemLabel ?? ''));
        this.setCellValueSafely(ws, `${qualityBlock.systemCol}${row}`, system);
        this.setCellValueSafely(ws, `${qualityBlock.evidenceCol}${row}`, String(it?.dataEvidence ?? ''));
        this.setCellValueSafely(ws, `${qualityBlock.unitCol}${row}`, String(it?.unit ?? ''));
        this.setCellValueSafely(ws, `${qualityBlock.standardCol}${row}`, Number.isFinite(standard) ? standard : null);

        const months = getMonths(it);
        for (let m = 0; m < 12; m++) {
          const v = Number(months?.[m] ?? 0);
          this.setCellValueSafely(ws, `${monthCols[m]}${row}`, v ? v : null);
        }
      }
    }

    const meterBlock = this.findWwtpMeterBlock(ws);
    if (meterBlock) {
      const { startRow, endRow, monthCols } = meterBlock;
      for (let row = startRow; row <= endRow; row++) {
        for (const col of meterBlock.inputCols) {
          this.setCellValueSafely(ws, `${col}${row}`, null);
        }
        for (const col of monthCols) {
          this.setCellValueSafely(ws, `${col}${row}`, null);
        }
      }

      for (let i = 0; i < Math.min(meterRows.length, endRow - startRow + 1); i++) {
        const it: any = meterRows[i];
        const row = startRow + i;

        this.setCellValueSafely(ws, `${meterBlock.itemCol}${row}`, String(it?.itemLabel ?? ''));
        this.setCellValueSafely(ws, `${meterBlock.evidenceCol}${row}`, String(it?.dataEvidence ?? ''));
        this.setCellValueSafely(ws, `${meterBlock.unitCol}${row}`, String(it?.unit ?? ''));

        const months = getMonths(it);
        for (let m = 0; m < 12; m++) {
          const v = Number(months?.[m] ?? 0);
          this.setCellValueSafely(ws, `${monthCols[m]}${row}`, v ? v : null);
        }
      }
    }
  }

  private findWwtpWorksheet(ctx: ExportContext): any {
    let ws = ctx.workbook.getWorksheet('1.4.5 WWTP');
    if (ws) return ws;
    return ctx.workbook.worksheets.find((sheet: any) => {
      const name = String(sheet?.name ?? '').toLowerCase();
      return name.includes('1.4.5') || name.includes('wwtp') || name.includes('บำบัดน้ำเสีย');
    });
  }

  private findWwtpQualityBlock(ws: any): {
    startRow: number;
    endRow: number;
    monthCols: string[];
    itemCol: string;
    systemCol: string;
    evidenceCol: string;
    unitCol: string;
    standardCol: string;
    inputCols: string[];
  } | null {
    const maxRows = Math.min(ws.rowCount || 200, 200);
    const qualityHintRow = this.findRowContainingAny(ws, ['มาตรฐาน', 'bod', 'cod', 'คุณภาพ'], 1);
    const monthHeader = qualityHintRow
      ? this.findMonthHeader(ws, qualityHintRow, qualityHintRow + 6, true)
      : this.findMonthHeader(ws, 1, maxRows, true);
    if (!monthHeader) return null;

    const headerRow = monthHeader.row;
    const startRow = headerRow + 1;
    const meterHeaderRow = this.findRowContaining(ws, ['ตำแหน่ง', 'มิเตอร์'], headerRow);

    const endRow = this.findEndRow(ws, startRow, meterHeaderRow ? meterHeaderRow - 1 : maxRows, ['A', 'B', 'C', 'D', 'E']);
    if (!endRow || endRow < startRow) return null;

    return {
      startRow,
      endRow,
      monthCols: monthHeader.cols,
      itemCol: 'A',
      systemCol: 'B',
      evidenceCol: 'C',
      unitCol: 'D',
      standardCol: 'E',
      inputCols: ['A', 'B', 'C', 'D', 'E'],
    };
  }

  private findWwtpMeterBlock(ws: any): {
    startRow: number;
    endRow: number;
    monthCols: string[];
    itemCol: string;
    evidenceCol: string;
    unitCol: string;
    inputCols: string[];
  } | null {
    const maxRows = Math.min(ws.rowCount || 200, 200);
    const meterTitleRow = this.findRowContaining(ws, ['ตำแหน่ง', 'มิเตอร์'], 1);
    if (!meterTitleRow) return null;

    const monthHeader = this.findMonthHeader(ws, meterTitleRow, meterTitleRow + 6, false);
    if (!monthHeader) return null;

    const startRow = monthHeader.row + 1;
    const endRow = this.findEndRow(ws, startRow, maxRows, ['A', 'B', 'C']);
    if (!endRow || endRow < startRow) return null;

    return {
      startRow,
      endRow,
      monthCols: monthHeader.cols,
      itemCol: 'A',
      evidenceCol: 'B',
      unitCol: 'C',
      inputCols: ['A', 'B', 'C'],
    };
  }

  private findMonthHeader(ws: any, startRow: number, endRow: number, numericOnly: boolean): { row: number; cols: string[] } | null {
    const maxCols = Math.max(ws.columnCount || 20, 20);
    for (let r = startRow; r <= endRow; r++) {
      const monthCols: Record<number, number> = {};
      for (let c = 1; c <= maxCols; c++) {
        const text = this.getCellText(ws.getCell(r, c).value);
        const monthIdx = this.parseMonthIndex(text, numericOnly);
        if (monthIdx) monthCols[monthIdx] = c;
      }

      if (Object.keys(monthCols).length >= 10) {
        const cols: string[] = [];
        for (let m = 1; m <= 12; m++) {
          const colNo = monthCols[m];
          if (!colNo) return null;
          cols.push(this.colToLetter(colNo));
        }
        return { row: r, cols };
      }
    }
    return null;
  }

  private parseMonthIndex(text: string, numericOnly: boolean): number | null {
    const normalized = String(text || '').trim().toLowerCase();
    if (!normalized) return null;
    const num = Number(normalized.replace(/[^\d]/g, ''));
    if (num >= 1 && num <= 12) return num;
    if (numericOnly) return null;

    const thaiMonths = ['ม.ค', 'ก.พ', 'มี.ค', 'เม.ย', 'พ.ค', 'มิ.ย', 'ก.ค', 'ส.ค', 'ก.ย', 'ต.ค', 'พ.ย', 'ธ.ค'];
    const idx = thaiMonths.findIndex(m => normalized.includes(m));
    if (idx >= 0) return idx + 1;
    return null;
  }

  private findRowContaining(ws: any, keywords: string[], startRow: number): number | null {
    const maxRows = Math.min(ws.rowCount || 200, 200);
    const maxCols = Math.max(ws.columnCount || 20, 20);
    const lowered = keywords.map(k => k.toLowerCase());
    for (let r = startRow; r <= maxRows; r++) {
      for (let c = 1; c <= maxCols; c++) {
        const text = this.getCellText(ws.getCell(r, c).value).toLowerCase();
        if (!text) continue;
        if (lowered.every(k => text.includes(k))) return r;
      }
    }
    return null;
  }

  private findRowContainingAny(ws: any, keywords: string[], startRow: number): number | null {
    const maxRows = Math.min(ws.rowCount || 200, 200);
    const maxCols = Math.max(ws.columnCount || 20, 20);
    const lowered = keywords.map(k => k.toLowerCase());
    for (let r = startRow; r <= maxRows; r++) {
      for (let c = 1; c <= maxCols; c++) {
        const text = this.getCellText(ws.getCell(r, c).value).toLowerCase();
        if (!text) continue;
        if (lowered.some(k => text.includes(k))) return r;
      }
    }
    return null;
  }

  private findEndRow(ws: any, startRow: number, maxRow: number, cols: string[]): number | null {
    let lastRow = startRow - 1;
    let emptyStreak = 0;
    for (let r = startRow; r <= maxRow; r++) {
      const hasValue = cols.some(col => this.getCellText(ws.getCell(`${col}${r}`).value));
      if (hasValue) {
        lastRow = r;
        emptyStreak = 0;
      } else {
        emptyStreak += 1;
        if (emptyStreak >= 2 && lastRow >= startRow) break;
      }
    }
    return lastRow >= startRow ? lastRow : null;
  }

  private parseWwtpRemark(remark: string): { system: string; standard: number | null } {
    const match = String(remark || '').match(/standard\s*=\s*([0-9.]+)/i);
    const standard = match ? Number(match[1]) : null;
    const system = String(remark || '')
      .replace(/\s*\|\s*standard\s*=\s*[^|]+/i, '')
      .trim();
    return { system, standard: Number.isFinite(standard) ? standard : null };
  }

  private colToLetter(col: number): string {
    let num = col;
    let letters = '';
    while (num > 0) {
      const mod = (num - 1) % 26;
      letters = String.fromCharCode(65 + mod) + letters;
      num = Math.floor((num - mod) / 26);
    }
    return letters || 'A';
  }

  private colLetterToNumber(col: string): number {
    const normalized = String(col || '').trim().toUpperCase();
    if (!normalized) return 0;
    let num = 0;
    for (let i = 0; i < normalized.length; i++) {
      const code = normalized.charCodeAt(i);
      if (code < 65 || code > 90) return 0;
      num = num * 26 + (code - 64);
    }
    return num;
  }

  private writeEvidenceSheet(ctx: ExportContext): void {
    const evidence = ctx.canonical.evidence ?? {};
    if (!Object.keys(evidence).length) return;

    let ws = ctx.workbook.getWorksheet('EVIDENCE');
    if (!ws) ws = ctx.workbook.addWorksheet('EVIDENCE');

    for (let r = 1; r <= ws.rowCount + 5; r++) {
      for (const col of ['A', 'B', 'C', 'D']) this.setCellValueSafely(ws, `${col}${r}`, null);
    }

    const headerRow = 1;
    this.setCellValueSafely(ws, `A${headerRow}`, 'Sheet/Section');
    this.setCellValueSafely(ws, `B${headerRow}`, 'Group');
    this.setCellValueSafely(ws, `C${headerRow}`, 'Type');
    this.setCellValueSafely(ws, `D${headerRow}`, 'Content/Name');

    let row = 2;
    const entries = Object.entries(evidence).sort(([a], [b]) => a.localeCompare(b));
    for (const [key, model] of entries) {
      const parts = key.split('::');
      const section = parts[1] ?? parts[0] ?? '';
      const group = parts[2] ?? '';

      for (const note of model.notes ?? []) {
        this.setCellValueSafely(ws, `A${row}`, section);
        this.setCellValueSafely(ws, `B${row}`, group);
        this.setCellValueSafely(ws, `C${row}`, 'note');
        this.setCellValueSafely(ws, `D${row}`, note);
        row += 1;
      }

      for (const table of model.tables ?? []) {
        const header = (table.headers ?? []).join(' | ');
        const body = (table.rows ?? []).map(r => r.join(' | ')).join('\n');
        const content = [header, body].filter(Boolean).join('\n');
        this.setCellValueSafely(ws, `A${row}`, section);
        this.setCellValueSafely(ws, `B${row}`, group);
        this.setCellValueSafely(ws, `C${row}`, 'table');
        this.setCellValueSafely(ws, `D${row}`, content);
        row += 1;
      }

      for (const image of model.images ?? []) {
        this.setCellValueSafely(ws, `A${row}`, section);
        this.setCellValueSafely(ws, `B${row}`, group);
        this.setCellValueSafely(ws, `C${row}`, 'image');
        this.setCellValueSafely(ws, `D${row}`, image.name || '[image]');

        if (image.dataUrl && typeof (ctx.workbook as any).addImage === 'function' && typeof (ws as any).addImage === 'function') {
          try {
            const match = image.dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
            if (match) {
              const meta = match[1];
              const base64 = match[2];
              const extension = meta ? meta.split('/')[1] : 'png';
              const imageId = (ctx.workbook as any).addImage({ base64, extension });
              (ws as any).addImage(imageId, {
                tl: { col: 0, row: row },
                ext: { width: 320, height: 200 },
              });
            }
          } catch {
            // ignore image embed errors
          }
        }

        row += 12;
      }
    }
  }


}
