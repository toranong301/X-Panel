export interface MonthlyQty {
  month: number;       // 1-12
  qty: number;         // ปริมาณของเดือนนั้น
  evidenceId?: string; // อ้างอิงหลักฐาน (ไฟล์/เลขเอกสาร)
  note?: string;       // หมายเหตุ
}

export type ScopeCode = 'S1' | 'S2' | 'S3';

export type DataSourceType = 'ORG' | 'SUPPLIER' | 'TGO' | 'DEFAULT';

export type GwpVersion = 'AR5' | 'AR6';

export interface EntryRow {
  id?: string;

  cycleId: string;

  scope: ScopeCode;

  /** รหัสหมวดตาม V-Sheet เช่น 1.1, 1.4.5, 3.4 */
  categoryCode: string;

  /** ใช้แตกย่อยในหมวดใหญ่ เช่น 1.4 refrigerant/fire/wwtp */
  subCategoryCode?: string;

  itemName: string;  // ชื่อกิจกรรม
  unit: string;      // หน่วย
  location?: string;

  /** รายเดือน 1..12 */
  months: MonthlyQty[];

  /** ผูก factor_set / EF */
  efId?: string;
  dataSourceType?: DataSourceType;
  referenceText?: string;

  /** ค่าที่ถูก “freeze” ตอน Lock */
  snapshotEfValue?: number;
  snapshotGwpVersion?: GwpVersion;
}
