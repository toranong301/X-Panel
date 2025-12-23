// refs.model.ts
export interface CellRef {
  sheet: string;   // ชื่อชีทใน v-sheet
  cell: string;    // "E4"
}

export interface TraceRef {
  // อ้างอิงต้นทางเพื่อ trace ใน Excel (optional ต่อบริษัท)
  itemLabel?: CellRef;
  unit?: CellRef;
  quantity?: CellRef;
  dataEvidence?: CellRef;
  ef?: CellRef;
  efEvidence?: CellRef;
}

// inventory.model.ts
export type ScopeNo = 1 | 2 | 3;

export interface InventoryItemRow {
  id: string;                    // UUID/slug
  scope: ScopeNo;                // 1/2/3
  subScope: string;              // "1.1", "2.1", "3.4"
  tgoNo: string;                 // "Scope 3.1" (display)
  isoScope: string;              // "Scope 4.1 in ISO 14064-1"
  categoryLabel: string;         // Stationary/Electricity/Purchased Goods & Services
  itemLabel: string;             // ชื่อรายการ
  unit: string;
  quantityPerYear: number;

  remark?: string;
  dataEvidence?: string;

  // single EF (สำหรับ Scope3Screen แบบง่าย) หรือ EF breakdown (สำหรับ FR-04.1)
  ef?: number;                   // kgCO2e per unit (ถ้าเป็น EF รวมแล้ว)
  efEvidence?: string;

  // ถ้าต้องรองรับ FR-04.1 แบบ breakdown รายแก๊ส:
  efGas?: Partial<Record<
    'CO2'|'FossilCH4'|'CH4'|'N2O'|'SF6'|'NF3'|'HFCs'|'PFCs'|'Other',
    { ef: number; gwp?: number; evidence?: string }
  >>;

  // computed (UI คำนวณเหมือนกันทุกบริษัท)
  totalTco2e?: number;           // quantity * ef / 1000 (ถ้า ef รวม)
  sharePct?: number;             // total / sum(total) * 100

  trace?: TraceRef;              // เพื่อ export เป็นสูตรอ้างอิงย้อนกลับได้
}

// evaluation.model.ts (FR-03.2 canonical)
export interface Scope3SignificanceRow {
  key: string;                   // เช่น `${subScope}|${itemLabel}`
  subScope: string;              // "3.1"
  categoryLabel: string;         // หมวด
  itemLabel: string;             // ชื่อรายการ
  ghgTco2e: number;
  sharePct: number;

  assessment: 'มีนัยสำคัญ' | 'ไม่มีนัยสำคัญ' | '';
  selection: 'เลือกประเมิน' | '' | string;
}
