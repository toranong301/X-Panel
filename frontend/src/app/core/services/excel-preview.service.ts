// cfo-sheet.registry.ts

export interface CfoSheetConfig {
  key: string;
  sheetName: string;
  previewRange: string;
}

export const CFO_SHEETS: Record<string, CfoSheetConfig> = {
  SCOPE1_STATIONARY: {
    key: 'SCOPE1_STATIONARY',
    sheetName: '1.1 Stationary Combustion', // ❗ ต้องตรง Excel 100%
    previewRange: 'A1:P60',
  },

  // เพิ่มต่อได้ในอนาคต
  // SCOPE2_ELECTRICITY: { ... }
};
