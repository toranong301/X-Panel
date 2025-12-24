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
  // ✅ NEW: เขียนชีทย่อย Scope 1.1 และ 1.2 (เขียนเฉพาะ input รายเดือน)
  this.writeScope11Stationary(ctx);
  this.writeScope12Mobile(ctx);
    // 1) Write Screen scope 3 table (lookup base)
    const screenRowMap = this.writeScreenScope3(ctx);

    // 2) Write FR-03.2 (keep formula links to Screen scope 3) and keep key->row map
    const fr032RowMap = this.writeFr032(ctx, screenRowMap);

    // 3) Populate FR-04.1 Scope 3 selected lines (B51..B56) referencing FR-03.2
    this.linkFr041Scope3FromFr032(ctx, fr032RowMap);
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
        ws.getCell(`B${destRow}`).value = '';
        continue;
      }

      const excelRow = fr032RowMap[String((item as any).key)] ?? null;
      if (excelRow) {
        ws.getCell(`B${destRow}`).value = { formula: `='${ctx.spec.sheets['fr032'].name}'!C${excelRow}` };
      } else {
        ws.getCell(`B${destRow}`).value = (item as any).itemLabel ?? '';
      }
    }
  }
  private writeScope11Stationary(ctx: ExportContext): void {
  // ชื่อชีทตาม template จริง: มีเว้นวรรคท้ายด้วย
  const ws = ctx.workbook.getWorksheet('1.1 Stationary ');
  if (!ws) return;

  const MONTH_COLS = ['E','F','G','H','I','J','K','L','M','N','O','P'] as const; // เดือน 1..12

  const readMonths = (x: any): number[] | undefined =>
    Array.isArray(x?.quantityMonthly) ? x.quantityMonthly :
    Array.isArray(x?.months) ? x.months :
    undefined;

  const writeMonths = (excelRow: number, months?: number[]) => {
    for (let i = 0; i < 12; i++) {
      const v = Number(months?.[i] ?? 0);
      // 0 ให้เป็นค่าว่าง เพื่อไม่ “ดูเหมือนเขียนทับสูตร”
      ws.getCell(`${MONTH_COLS[i]}${excelRow}`).value = v ? v : null;
    }
  };

  // ✅ แถว input รายเดือน (ตามที่ล็อกไว้)
  const dieselRow = 9;       // E9:P9
  const gasoholRow = 10;     // E10:P10
  const acetyl2TankRow = 12; // E12:P12
  const acetyl3TankRow = 14; // E14:P14

  // เคลียร์เฉพาะ input cells
  [dieselRow, gasoholRow, acetyl2TankRow, acetyl3TankRow].forEach(r => writeMonths(r));

  const items = (ctx.canonical.inventory ?? []).filter((x: any) => String(x?.subScope ?? '') === '1.1');

  const keyOf = (x: any) => String(x?.fuelKey ?? x?.meta?.fuelKey ?? '').trim().toUpperCase();
  const findByKeys = (...keys: string[]) => {
    const set = new Set(keys.map(k => k.toUpperCase()));
    return items.find((x: any) => set.has(keyOf(x)));
  };

  // ✅ contract fuelKey (แนะนำให้ใช้ตามนี้ใน canonical)
  // 1.1 Stationary
  const diesel   = findByKeys('DIESEL_B7_STATIONARY');
  const gasohol  = findByKeys('GASOHOL_9195_STATIONARY');
  const acetyl2  = findByKeys('ACETYLENE_TANK5_MAINT_2');
  const acetyl3  = findByKeys('ACETYLENE_TANK5_MAINT_3');

  if (diesel)  writeMonths(dieselRow, readMonths(diesel));
  if (gasohol) writeMonths(gasoholRow, readMonths(gasohol));
  if (acetyl2) writeMonths(acetyl2TankRow, readMonths(acetyl2));
  if (acetyl3) writeMonths(acetyl3TankRow, readMonths(acetyl3));

  // ⚠️ ไม่แตะเซลล์สรุป/แปลงหน่วยด้านบน และไม่แตะ FR-04.1 — ให้ template คำนวณเอง
}

private writeScope12Mobile(ctx: ExportContext): void {
  const ws = ctx.workbook.getWorksheet('1.2 Mobile');
  if (!ws) return;

  const MONTH_COLS = ['G','H','I','J','K','L','M','N','O','P','Q','R'] as const; // เดือน 1..12

  const readMonths = (x: any): number[] | undefined =>
    Array.isArray(x?.quantityMonthly) ? x.quantityMonthly :
    Array.isArray(x?.months) ? x.months :
    undefined;

  const writeMonths = (excelRow: number, months?: number[]) => {
    for (let i = 0; i < 12; i++) {
      const v = Number(months?.[i] ?? 0);
      ws.getCell(`${MONTH_COLS[i]}${excelRow}`).value = v ? v : null;
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

  // เคลียร์เฉพาะ input cells
  [...dieselB7Rows, ...dieselB10Rows, ...gasohol9195Rows, ...gasoholE20Rows, offroadForkliftRow]
    .forEach(r => writeMonths(r));

  const items = (ctx.canonical.inventory ?? []).filter((x: any) => String(x?.subScope ?? '') === '1.2');
  const keyOf = (x: any) => String(x?.fuelKey ?? x?.meta?.fuelKey ?? '').trim().toUpperCase();

  const byKey = (k: string) => items.filter((x: any) => keyOf(x) === k.toUpperCase());

  const fillSlots = (slots: number[], list: any[]) => {
    // 1) ถ้ามี slotNo ให้ลงตาม slotNo (1-based)
    const used = new Set<number>(); // idx
    const withSlot = list
      .filter(x => Number.isFinite(Number(x?.slotNo)))
      .sort((a, b) => Number(a.slotNo) - Number(b.slotNo));

    for (const it of withSlot) {
      const idx = Number(it.slotNo) - 1;
      if (idx >= 0 && idx < slots.length && !used.has(idx)) {
        writeMonths(slots[idx], readMonths(it));
        used.add(idx);
      }
    }

    // 2) ที่เหลือ (ไม่มี slotNo) เติมลงช่องว่างตามลำดับ
    const withoutSlot = list.filter(x => !Number.isFinite(Number(x?.slotNo)));
    let ptr = 0;
    for (const it of withoutSlot) {
      while (ptr < slots.length && used.has(ptr)) ptr++;
      if (ptr >= slots.length) break;
      writeMonths(slots[ptr], readMonths(it));
      used.add(ptr);
      ptr++;
    }
  };

  // ✅ contract fuelKey (แนะนำให้ใช้ตามนี้ใน canonical)
  fillSlots(dieselB7Rows,   byKey('DIESEL_B7_ONROAD'));
  fillSlots(dieselB10Rows,  byKey('DIESEL_B10_ONROAD'));
  fillSlots(gasohol9195Rows,byKey('GASOHOL_9195'));
  fillSlots(gasoholE20Rows, byKey('GASOHOL_E20'));

  const offroad = byKey('DIESEL_B7_OFFROAD')[0];
  if (offroad) writeMonths(offroadForkliftRow, readMonths(offroad));

  // ⚠️ ไม่แตะสูตรสรุปบนสุดของชีท และ FR-04.1 — ให้ template คำนวณเอง
}


}
