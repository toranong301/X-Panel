export interface CfoSheetConfig {
  key: string;
  sheetId: string;
  label: string;
  previewRange?: string;
}

export const CFO_SHEETS: Record<string, CfoSheetConfig> = {
  SCOPE1_STATIONARY: {
    key: 'SCOPE1_STATIONARY',
    sheetId: 'scope11_stationary',
    label: '1.1 Stationary',
    previewRange: 'A1:P60',
  },
  SCOPE2_ELECTRICITY: {
    key: 'SCOPE2_ELECTRICITY',
    sheetId: 'scope2_electricity',
    label: '2.1 Purchased Electricity',
    previewRange: 'A1:O55',
  },
};
