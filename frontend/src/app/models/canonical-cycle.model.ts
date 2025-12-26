import { EvidenceModel } from './evidence.model';
import { Fr01Data } from './fr01.model';
import { Fr02Data } from './fr02.model';
import { Fr031Data } from './fr03-1.model';
import { InventoryItemRow, Scope3SignificanceRow } from './refs.model';
import { VSheetDataDoc } from '../core/vsheet/vsheet.schema';

export interface Fr032CanonicalRow extends Scope3SignificanceRow {
  isoNo: string;
}

export type CfoGhgItem = {
  scope: 1 | 2 | 3;
  subScope: string;
  activity: string;
  quantity: number;
  unit: string;
  evidence?: string;
  remark?: string;
};

export type CfoGhgBundle = {
  scope1: CfoGhgItem[];
  scope2: CfoGhgItem[];
  scope3: CfoGhgItem[];
};

export interface CanonicalCycleData {
  cycleId: number;

  inventory: InventoryItemRow[];
  fr03_2: Fr032CanonicalRow[];
  vsheet: VSheetDataDoc;
  evidence?: Record<string, EvidenceModel>;

  fr01?: Fr01Data | null;
  fr02?: Fr02Data | null;
  fr031?: Fr031Data | null;

  fr041Selection?: any[];

  cfoGhg: CfoGhgBundle;
}
