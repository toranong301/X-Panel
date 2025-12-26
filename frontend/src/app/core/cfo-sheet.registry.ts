export interface CfoSheetConfig {
  key: string;
  sheetName: string;
  previewRange: string;
}

export const CFO_SHEETS: Record<string, CfoSheetConfig> = {
  SCOPE1_STATIONARY: {
    key: 'SCOPE1_STATIONARY',
    sheetName: '1.1 Stationary Combustion', // 👈 ชื่อจริงใน Excel
    previewRange: 'A1:P60',
  },

  SCOPE2_ELECTRICITY: {
    key: 'SCOPE2_ELECTRICITY',
    sheetName: '2.1 Purchased Electricity',
    previewRange: 'A1:O55',
  },
};
