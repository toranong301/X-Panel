export interface EvidenceTable {
  headers: string[];
  rows: string[][];
}

export interface EvidenceImage {
  name: string;
  dataUrl: string;
}

export interface EvidenceModel {
  notes: string[];
  tables: EvidenceTable[];
  images: EvidenceImage[];
}
