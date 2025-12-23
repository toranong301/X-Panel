export interface Fr01BoundarySummary {
  scope1: string[];
  scope2: string[];
  scope3: string[];
}

export interface Fr01Data {
  orgName: string;
  preparedBy: string;
  preparedDate: string; // yyyy-mm-dd

  photos?: {
    orgPhoto1?: string; // base64
    orgPhoto2?: string; // base64
  };

  dataPeriod?: { start?: string; end?: string };
  baseYearPeriod?: { start?: string; end?: string };

  production?: { value?: number; unit?: string };
  baseYearProduction?: { value?: number; unit?: string };

  orgInfoLines?: string[]; // 5 บรรทัด
  contactAddress?: string;
  registrationDate?: string; // yyyy-mm-dd
}
