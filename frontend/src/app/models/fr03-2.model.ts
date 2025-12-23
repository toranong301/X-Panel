export type Fr032ScreenRow = Fr032GroupRow | Fr032EvalRow;

export interface Fr032GroupRow {
  type: 'group';
  tgoNo: string;       // 3.1
  isoNo: string;       // 4.1
  catLabel: string;    // Purchased Goods & Services
}

export interface Fr032EvalRow {
  type: 'eval';
  key: string;         // unique key (cycle + tgo + item)
  tgoNo: string;       // 3.1
  isoNo: string;       // 4.1
  category: string;    // item name (or category row name)
  isCategoryRow?: boolean;

  // input columns in FR-03.2
  sourceOfGHG: number;     // 0/1
  sourceOfEF: number;      // 0/1
  magnitude: number;       // 1-5
  influence: number;       // 1-5
  risk: number;            // 1-5
  opportunity: number;     // 1-5

  // calculated + user outputs
  score: number;
  assessment: string;      // มีนัยสำคัญ / ไม่มีนัยสำคัญ / ...
  selection: string;       // เลือกประเมิน / ...

  // pulled from Scope 3 Screen
  ghgTco2e: number;        // Total GHG (tCO2e)
  sharePct: number;        // %
}

export interface Fr032SavedMap {
  [key: string]: Partial<Pick<
    Fr032EvalRow,
    | 'sourceOfGHG' | 'sourceOfEF'
    | 'magnitude' | 'influence' | 'risk' | 'opportunity'
    | 'assessment' | 'selection'
  >>;
}
