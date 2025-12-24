export type VSheetLayoutType = 'fixed' | 'dynamic';
export type VSheetBlockType = 'fixed' | 'rowPool' | 'monthly12' | 'detail';

export type VSheetInputKind = 'text' | 'number' | 'select';

export interface VSheetInputOption {
  label: string;
  value: string;
}

export interface VSheetColumn {
  key: string;
  label: string;
  column: string;
  inputKind?: VSheetInputKind;
  options?: VSheetInputOption[];
}

export interface VSheetFixedInput {
  key: string;
  label: string;
  cell: string;
  inputKind?: VSheetInputKind;
  options?: VSheetInputOption[];
}

export interface VSheetBlockBase {
  id: string;
  title: string;
  sheetName: string;
  layoutType: VSheetLayoutType;
  blockType: VSheetBlockType;
  description?: string;
}

export interface VSheetFixedBlock extends VSheetBlockBase {
  blockType: 'fixed';
  layoutType: 'fixed';
  inputs: VSheetFixedInput[];
}

export interface VSheetRowPoolBlock extends VSheetBlockBase {
  blockType: 'rowPool';
  layoutType: 'dynamic';
  startRow: number;
  maxRows: number;
  step?: number;
  columns: VSheetColumn[];
}

export interface VSheetMonthly12Block extends VSheetBlockBase {
  blockType: 'monthly12';
  layoutType: 'dynamic';
  startRow: number;
  maxRows: number;
  step?: number;
  monthColumns: string[];
  columns?: VSheetColumn[];
}

export interface VSheetDetailBlock extends VSheetBlockBase {
  blockType: 'detail';
  layoutType: 'dynamic';
  startRow: number;
  maxRows: number;
  step?: number;
  parentBlockId: string;
  columns: VSheetColumn[];
}

export type VSheetBlock =
  | VSheetFixedBlock
  | VSheetRowPoolBlock
  | VSheetMonthly12Block
  | VSheetDetailBlock;

export interface VSheetSchema {
  templateId: string;
  blocks: VSheetBlock[];
}

export interface VSheetRowData {
  itemCode?: string;
  label?: string;
  unit?: string;
  evidence?: string;
  inputs?: Record<string, any>;
  months?: Array<number | null>;
  details?: VSheetRowData[];
}

export interface VSheetDataDoc {
  cfoFixed: Record<string, Record<string, any>>;
  subsheets: Record<string, VSheetRowData[]>;
}

export const CFO_FIXED_SCHEMA: VSheetSchema = {
  templateId: 'VSHEET_CFO',
  blocks: [
    {
      id: 'cfo-fr01-company',
      title: 'Fr-01: Company profile',
      sheetName: 'Fr-01',
      layoutType: 'fixed',
      blockType: 'fixed',
      description: 'Fixed fields from CFO template.',
      inputs: [
        { key: 'companyName', label: 'Company name', cell: 'G4' },
        { key: 'reportPreparedBy', label: 'Prepared by', cell: 'J4' },
      ],
    },
    {
      id: 'cfo-fr02-meta',
      title: 'Fr-02: Verification metadata',
      sheetName: 'Fr-02',
      layoutType: 'fixed',
      blockType: 'fixed',
      inputs: [{ key: 'verifier', label: 'Verifier name', cell: 'M4' }],
    },
  ],
};

export const MBAX_DYNAMIC_SCHEMA: VSheetSchema = {
  templateId: 'MBAX_TGO_11102567',
  blocks: [
    {
      id: 'fr01-notes',
      title: 'Fr-01: Notes (dynamic)',
      sheetName: 'Fr-01',
      layoutType: 'dynamic',
      blockType: 'rowPool',
      startRow: 5,
      maxRows: 3,
      columns: [
        { key: 'note', label: 'Note', column: 'A' },
      ],
    },
    {
      id: 'fr042-monthly',
      title: 'Fr-01: Monthly inputs (dynamic)',
      sheetName: 'Fr-01',
      layoutType: 'dynamic',
      blockType: 'monthly12',
      startRow: 50,
      maxRows: 3,
      monthColumns: ['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V'],
    },
    {
      id: 'fr042-details',
      title: 'Fr-01: Breakdown details',
      sheetName: 'Fr-01',
      layoutType: 'dynamic',
      blockType: 'detail',
      startRow: 60,
      maxRows: 3,
      parentBlockId: 'fr042-monthly',
      columns: [
        { key: 'detailLabel', label: 'Detail', column: 'C' },
      ],
    },
  ],
};

export const VSHEET_SCHEMAS: VSheetSchema[] = [CFO_FIXED_SCHEMA, MBAX_DYNAMIC_SCHEMA];

export const DEFAULT_VSHEET_DOC: VSheetDataDoc = {
  cfoFixed: {},
  subsheets: {},
};

export function getSchemaByTemplateId(templateId: string): VSheetSchema | undefined {
  return VSHEET_SCHEMAS.find(schema => schema.templateId === templateId);
}

export function getFixedBlocks(): VSheetFixedBlock[] {
  return CFO_FIXED_SCHEMA.blocks.filter((b): b is VSheetFixedBlock => b.blockType === 'fixed');
}

export function getDynamicBlocks(): Array<VSheetRowPoolBlock | VSheetMonthly12Block | VSheetDetailBlock> {
  return MBAX_DYNAMIC_SCHEMA.blocks.filter(
    (b): b is VSheetRowPoolBlock | VSheetMonthly12Block | VSheetDetailBlock =>
      b.blockType !== 'fixed',
  );
}
