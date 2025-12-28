export type SheetItemOption = {
  fuelKey: string;
  defaultLabel: string;
  unit?: string;
  subScope?: string;
};

export const SHEET_ITEM_REGISTRY: Record<string, SheetItemOption[]> = {
  scope11_stationary: [
    { fuelKey: 'DIESEL_B7_STATIONARY', defaultLabel: 'น้ำมัน Diesel B7 (Fire Pump)', unit: 'L', subScope: '1.1' },
    { fuelKey: 'GASOHOL_9195_STATIONARY', defaultLabel: 'น้ำมัน Gasohol 91/95 (เครื่องตัดหญ้า)', unit: 'L', subScope: '1.1' },
    { fuelKey: 'ACETYLENE_TANK5_MAINT_2', defaultLabel: 'Acetylene gas (5 kg) ในงานการซ่อมบำรุง 2', unit: 'ถัง', subScope: '1.1' },
    { fuelKey: 'ACETYLENE_TANK5_MAINT_3', defaultLabel: 'Acetylene gas (5 kg) ในงานการซ่อมบำรุง 3', unit: 'ถัง', subScope: '1.1' },
  ],
  scope12_mobile: [
    { fuelKey: 'DIESEL_B7_ONROAD', defaultLabel: 'Diesel B7 on-road', unit: 'L', subScope: '1.2' },
    { fuelKey: 'DIESEL_B10_ONROAD', defaultLabel: 'Diesel B10 on-road', unit: 'L', subScope: '1.2' },
    { fuelKey: 'GASOHOL_9195', defaultLabel: 'Gasohol 91/95', unit: 'L', subScope: '1.2' },
    { fuelKey: 'GASOHOL_E20', defaultLabel: 'Gasohol E20', unit: 'L', subScope: '1.2' },
    { fuelKey: 'DIESEL_B7_OFFROAD', defaultLabel: 'Diesel B7 off-road (forklift)', unit: 'L', subScope: '1.2' },
  ],
};

export function getSheetItemOptions(sheetId: string, subScope?: string): SheetItemOption[] {
  const items = SHEET_ITEM_REGISTRY[String(sheetId || '').toLowerCase()] ?? [];
  if (!subScope) return items;
  return items.filter(item => item.subScope === subScope);
}
