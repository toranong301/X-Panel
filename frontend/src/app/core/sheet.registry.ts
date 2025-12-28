export type SheetConfig = {
  sheetId: string;
  label: string;
  previewRange?: string;
};

export const SHEET_REGISTRY: Record<string, SheetConfig> = {
  SCOPE1_STATIONARY: {
    sheetId: 'scope11_stationary',
    label: '1.1 Stationary',
    previewRange: 'A1:P60',
  },
  SCOPE1_MOBILE: {
    sheetId: 'scope12_mobile',
    label: '1.2 Mobile',
    previewRange: 'A1:AA70',
  },
  SCOPE1_FUGITIVE: {
    sheetId: 'scope14_fugitive',
    label: '1.4 Fugitive Emission',
    previewRange: 'A1:Q80',
  },
  FR041: {
    sheetId: 'fr041',
    label: 'FR-04.1',
    previewRange: 'A1:AO70',
  },
  FR042: {
    sheetId: 'fr042',
    label: 'FR-04.2',
    previewRange: 'A1:Z60',
  },
  FR05: {
    sheetId: 'fr05',
    label: 'FR-05',
    previewRange: 'A1:Z60',
  },
  EF_TGO_AR5: {
    sheetId: 'ef_tgo_ar5',
    label: 'EF TGO AR5',
    previewRange: 'A1:Z60',
  },
  EF_1: {
    sheetId: 'ef_1',
    label: 'EF (1)',
    previewRange: 'A1:Z60',
  },
  REVISION_LOG: {
    sheetId: 'revision_log',
    label: 'Revision Log',
    previewRange: 'A1:Z60',
  },
};

export function getSheetConfig(sheetId: string): SheetConfig | null {
  const found = Object.values(SHEET_REGISTRY).find(sheet => sheet.sheetId === sheetId);
  return found ?? null;
}
