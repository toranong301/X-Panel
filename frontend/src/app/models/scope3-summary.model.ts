export interface CellRef {
  sheet: string; // เช่น "Scope 3.1.1 วัตถุดิบผลิต"
  cell: string;  // เช่น "A4"
}

export type Scope3ScreenRow = Scope3GroupRow | Scope3ItemRow;

export interface Scope3GroupRow {
  type: 'group';

  // ตารางใหม่
  tgoNo: string;          // เช่น "Scope 3.1"
  scopeIso: string;       // เช่น "Scope 4.1 in ISO 14064-1"
  categoryLabel: string;  // เช่น "Purchased Goods & Services"

  // ใช้จัดเรียงกลุ่ม (3.1, 3.3, 3.4, ...)
  order: number;
}

export interface Scope3ItemRow {
  type: 'item';

  // กลุ่มที่ item นี้สังกัด
  tgoNo: string;
  scopeIso: string;
  categoryLabel: string;
  order: number;

  // ตารางใหม่ (คอลัมน์ Category)
  itemLabel: string;      // ชื่อรายการ (แสดงใน Category)
  unit: string;
  quantityPerYear: number;

  // ตารางใหม่
  remark?: string;
  dataEvidence?: string;  // หลักฐานอ้างอิง(ข้อมูล)
  ef: number;
  efEvidence?: string;    // หลักฐานอ้างอิง(EF)

  // ===== computed (ตามสูตรที่ต้องถูก) =====
  totalTco2e?: number;    // totalTco2e = quantity * ef / 1000
  sharePct?: number;      // % share = totalTco2e / SUM(totalTco2e) * 100

  // ===== compat fields (กันโค้ดเดิม/FR03.2 พัง) =====
  catLabel?: string;      // alias ของ categoryLabel (เผื่อที่อื่นเรียก)
  itemName?: string;      // alias ของ itemLabel
  ghgTco2e?: number;      // alias ของ totalTco2e
  pct?: number;           // alias ของ sharePct

  // ===== cell refs (optional) =====
  refs?: {
    itemLabel?: CellRef;
    unit?: CellRef;
    quantityPerYear?: CellRef;
    dataEvidence?: CellRef;
    ef?: CellRef;
    efEvidence?: CellRef;
  };
}

export interface Scope3SummaryStore {
  rows: Scope3ItemRow[];
  updatedAt: string; // ISO datetime
}
