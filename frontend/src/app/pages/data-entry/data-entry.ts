import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTabsModule } from '@angular/material/tabs';

import { DataEntryDoc, DataEntryService } from '../../core/services/data-entry.service';
import { CanonicalGhgService } from '../../core/services/canonical-ghg.service';
import { CycleApiService } from '../../core/services/cycle-api.service';
import { CycleStateService } from '../../core/services/cycle-state.service';
import { createEmptyMonths } from '../../models/entry-row.helpers';
import { EvidenceModel } from '../../models/evidence.model';
import { EntryRow } from '../../models/entry-row.model';
import { EvidenceBlockComponent } from '../../shared/components/evidence-block/evidence-block.component';
import { Scope11StationaryComponent } from './scope11-stationary/scope11-stationary.component';
import { Scope12MobileComponent } from './scope12-mobile/scope12-mobile.component';
import { Scope14FugitiveComponent } from './scope14-fugitive/scope14-fugitive.component';
import { Scope142FireComponent } from './scope142-fire/scope142-fire.component';
import { Scope143SepticComponent } from './scope143-septic/scope143-septic.component';
import { Scope144FertilizerComponent } from './scope144-fertilizer/scope144-fertilizer.component';
import { Scope145WwtpComponent } from './scope145-wwtp/scope145-wwtp.component';

@Component({
  selector: 'app-data-entry',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatCardModule,
    MatDividerModule,
    MatButtonModule,
    Scope11StationaryComponent,
    Scope12MobileComponent,
    Scope14FugitiveComponent,
    Scope142FireComponent,
    Scope143SepticComponent,
    Scope144FertilizerComponent,
    Scope145WwtpComponent,
    EvidenceBlockComponent,
  ],
  templateUrl: './data-entry.html',
  styleUrls: ['./data-entry.scss'],
})
export class DataEntryComponent implements OnInit {
  private vmSubject = new BehaviorSubject<DataEntryVm>(createEmptyVm());
  vm$ = this.vmSubject.asObservable();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private entrySvc: DataEntryService,
    private canonicalSvc: CanonicalGhgService,
    private cycleApi: CycleApiService,
    private cycleState: CycleStateService,
  ) {}

  ngOnInit(): void {
    void this.initCycle();
  }

  private async initCycle(): Promise<void> {
    const routeId = Number(this.route.snapshot.paramMap.get('cycleId') ?? 0);
    const resolvedId = await this.cycleState.resolveCycleId(routeId);
    if (!resolvedId) {
      this.vmSubject.next({ ...createEmptyVm(), ready: true });
      return;
    }
    if (routeId !== resolvedId) {
      this.router.navigate(['/cycles', resolvedId, 'data-entry'], { replaceUrl: true });
    }
    const vm = this.buildVmFromStorage(resolvedId);
    this.vmSubject.next({ ...vm, ready: true });
  }

  private buildVmFromStorage(cycleId: number): DataEntryVm {
    const saved = this.entrySvc.load(cycleId);
    if (saved) {
      const scope1Rows = saved.scope1 ?? [];
      const scope11Rows = normalizeScope11Rows(cycleId, scope1Rows);
      const scope12RowsFiltered = scope1Rows.filter(r => r.categoryCode === '1.2');
      const scope12Rows = scope12RowsFiltered.length
        ? scope12RowsFiltered
        : makeScope12Defaults(cycleId);
      const scope141RowsFiltered = scope1Rows.filter(r => r.categoryCode === '1.4.1');
      const scope141Rows = scope141RowsFiltered.length
        ? scope141RowsFiltered
        : makeScope141Defaults(cycleId);
      const scope142RowsFiltered = scope1Rows.filter(r => r.categoryCode === '1.4.2');
      const scope142Rows = scope142RowsFiltered.length
        ? scope142RowsFiltered
        : makeScope142Defaults(cycleId);
      const scope143RowsFiltered = scope1Rows.filter(r => r.categoryCode === '1.4.3');
      const scope143Rows = scope143RowsFiltered.length
        ? scope143RowsFiltered
        : makeScope143Defaults(cycleId);
      const scope144RowsFiltered = scope1Rows.filter(r => r.categoryCode === '1.4.4');
      const scope144Rows = scope144RowsFiltered.length
        ? scope144RowsFiltered
        : makeScope144Defaults(cycleId);
      const scope145RowsFiltered = scope1Rows.filter(r => r.categoryCode === '1.4.5');
      const scope145Rows = scope145RowsFiltered.length
        ? scope145RowsFiltered
        : makeScope145Defaults(cycleId);
      const scope2Rows = saved.scope2 ?? [];
      const scope3Rows = saved.scope3 ?? [];
      const evidenceMap = this.seedEvidenceKeys(saved.evidence ?? {});
      return {
        cycleId,
        ready: false,
        scope11Rows,
        scope12Rows,
        scope141Rows,
        scope142Rows,
        scope143Rows,
        scope144Rows,
        scope145Rows,
        scope2Rows,
        scope3Rows,
        evidenceMap,
      };
    }

    // seed defaults เพื่อให้ “เข้าไปกรอกแล้วกด Save ได้ทันที”
    const evidenceMap = this.seedEvidenceKeys({});
    return {
      cycleId,
      ready: false,
      scope11Rows: makeScope11Defaults(cycleId),
      scope12Rows: makeScope12Defaults(cycleId),
      scope141Rows: makeScope141Defaults(cycleId),
      scope142Rows: makeScope142Defaults(cycleId),
      scope143Rows: makeScope143Defaults(cycleId),
      scope144Rows: makeScope144Defaults(cycleId),
      scope145Rows: makeScope145Defaults(cycleId),
      scope2Rows: [],
      scope3Rows: [],
      evidenceMap,
    };
  }

  resetDefaults(): void {
    const cycleId = this.vmSubject.value.cycleId;
    this.patchVm({
      scope11Rows: makeScope11Defaults(cycleId),
      scope12Rows: makeScope12Defaults(cycleId),
      scope141Rows: makeScope141Defaults(cycleId),
      scope142Rows: makeScope142Defaults(cycleId),
      scope143Rows: makeScope143Defaults(cycleId),
      scope144Rows: makeScope144Defaults(cycleId),
      scope145Rows: makeScope145Defaults(cycleId),
    });
  }

  async save(): Promise<void> {
    const vm = this.vmSubject.value;
    const existing = this.entrySvc.load(vm.cycleId);
    const otherScope1Rows = (existing?.scope1 ?? []).filter(
      row => !['1.1', '1.2', '1.4.1', '1.4.2', '1.4.3', '1.4.4', '1.4.5'].includes(row.categoryCode)
    );
    const payload: DataEntryDoc = {
      cycleId: vm.cycleId,
      scope1: [
        ...vm.scope11Rows,
        ...vm.scope12Rows,
        ...vm.scope141Rows,
        ...vm.scope142Rows,
        ...vm.scope143Rows,
        ...vm.scope144Rows,
        ...vm.scope145Rows,
        ...otherScope1Rows,
      ],
      scope2: vm.scope2Rows,
      scope3: vm.scope3Rows,
      cfoFixed: existing?.cfoFixed,
      subsheets: existing?.subsheets,
      evidence: vm.evidenceMap,
    };

    this.entrySvc.save(vm.cycleId, payload);
    try {
      const canonical = this.canonicalSvc.build(vm.cycleId);
      const updateResult = await this.cycleApi.updateCycleData(vm.cycleId, canonical);
      this.cycleState.setSelectedCycleId(updateResult.cycleId);
      if (updateResult.cycleId !== vm.cycleId) {
        this.patchVm({ cycleId: updateResult.cycleId });
      }
      alert('Saved ✅ (synced to backend)');
    } catch (error: any) {
      console.error('Save sync failed', error);
      alert('Saved locally แต่ sync ไป backend ไม่สำเร็จ');
    }
  }

  goFr041(): void {
    this.router.navigate(['/cycles', this.vmSubject.value.cycleId, 'fr04-1']);
  }

  evidenceFor(map: Record<string, EvidenceModel>, key: string): EvidenceModel {
    return map[key] ?? { notes: [], tables: [], images: [] };
  }

  updateEvidence(key: string, model: EvidenceModel): void {
    const evidenceMap = { ...this.vmSubject.value.evidenceMap, [key]: model };
    this.patchVm({ evidenceMap });
  }

  private seedEvidenceKeys(source: Record<string, EvidenceModel>): Record<string, EvidenceModel> {
    const keys = [
      'S1::1.1',
      'S1::1.2',
      'S1::1.4.1',
      'S1::1.4.2',
      'S1::1.4.3::group1',
      'S1::1.4.3::group2',
      'S1::1.4.3::group3',
      'S1::1.4.3::group4',
      'S1::1.4.4',
      'S1::1.4.5',
    ];
    const next = { ...source };
    for (const key of keys) {
      if (!next[key]) {
        next[key] = { notes: [], tables: [], images: [] };
      }
    }
    return next;
  }

  updateRows(key: RowsKey, rows: EntryRow[]): void {
    this.patchVm({ [key]: cloneRows(rows) } as Partial<DataEntryVm>);
  }

  private patchVm(patch: Partial<DataEntryVm>): void {
    this.vmSubject.next({ ...this.vmSubject.value, ...patch });
  }
}

type DataEntryVm = {
  cycleId: number;
  ready: boolean;
  scope11Rows: EntryRow[];
  scope12Rows: EntryRow[];
  scope141Rows: EntryRow[];
  scope142Rows: EntryRow[];
  scope143Rows: EntryRow[];
  scope144Rows: EntryRow[];
  scope145Rows: EntryRow[];
  evidenceMap: Record<string, EvidenceModel>;
  scope2Rows: EntryRow[];
  scope3Rows: EntryRow[];
};

type RowsKey =
  | 'scope11Rows'
  | 'scope12Rows'
  | 'scope141Rows'
  | 'scope142Rows'
  | 'scope143Rows'
  | 'scope144Rows'
  | 'scope145Rows';

function createEmptyVm(): DataEntryVm {
  return {
    cycleId: 0,
    ready: false,
    scope11Rows: [],
    scope12Rows: [],
    scope141Rows: [],
    scope142Rows: [],
    scope143Rows: [],
    scope144Rows: [],
    scope145Rows: [],
    evidenceMap: {},
    scope2Rows: [],
    scope3Rows: [],
  };
}

function cloneRows(rows: EntryRow[]): EntryRow[] {
  if (typeof structuredClone === 'function') {
    return structuredClone(rows);
  }
  return rows.map(row => ({
    ...row,
    months: Array.isArray(row.months) ? row.months.map(month => ({ ...month })) : [],
  }));
}

/** ---- defaults ที่ “ตรงกับ export mapping” ---- */

function mkRow(
  cycleId: number,
  scope: 'S1' | 'S2' | 'S3',
  categoryCode: string,
  itemName: string,
  unit: string,
  subCategoryCode?: string
): EntryRow {
  return {
    cycleId: String(cycleId),
    scope,
    categoryCode,
    subCategoryCode,
    itemName,
    unit,
    months: createEmptyMonths(),
    dataSourceType: 'ORG',
  };
}

// Scope 1.1: ทำ 4 slot ให้ครบ (mapping ไป E9/P9, E10/P10, E12/P12, E14/P14 ที่ adapter)
// เราใช้ slotNo = 1..4 ผ่าน subCategoryCode แบบ KEY#N
function makeScope11Defaults(cycleId: number): EntryRow[] {
  return [
    mkRow(cycleId, 'S1', '1.1', 'น้ำมัน Diesel B7 (Fire Pump)', 'L', 'DIESEL_B7_STATIONARY'),
    mkRow(cycleId, 'S1', '1.1', 'น้ำมัน Gasohol 91/95 (เครื่องตัดหญ้า)', 'L', 'GASOHOL_9195_STATIONARY'),
    mkRow(cycleId, 'S1', '1.1', 'Acetylene gas (5 kg) ในงานการซ่อมบำรุง 2', 'ถัง', 'ACETYLENE_TANK5_MAINT_2'),
    mkRow(cycleId, 'S1', '1.1', 'Acetylene gas (5 kg) ในงานการซ่อมบำรุง 3', 'ถัง', 'ACETYLENE_TANK5_MAINT_3'),
  ];
}

function normalizeScope11Rows(cycleId: number, scope1Rows: EntryRow[]): EntryRow[] {
  const defaults = makeScope11Defaults(cycleId);
  const legacyMap: Record<string, string> = {
    'S1_1_1#1': 'DIESEL_B7_STATIONARY',
    'S1_1_1#2': 'GASOHOL_9195_STATIONARY',
    'S1_1_1#3': 'ACETYLENE_TANK5_MAINT_2',
    'S1_1_1#4': 'ACETYLENE_TANK5_MAINT_3',
  };

  const existingByCode = new Map<string, EntryRow>();
  for (const row of scope1Rows.filter(r => r.categoryCode === '1.1')) {
    const code = legacyMap[row.subCategoryCode ?? ''] ?? row.subCategoryCode ?? '';
    if (code) existingByCode.set(code, row);
  }

  return defaults.map(def => {
    const existing = existingByCode.get(def.subCategoryCode ?? '');
    if (!existing) return def;
    return {
      ...def,
      months: existing.months?.length ? existing.months : def.months,
      referenceText: existing.referenceText ?? def.referenceText,
    };
  });
}

// Scope 1.2: seed แบบ “ไม่ฟิกจำนวนแถว”
// - UI จะมีปุ่ม Add/Remove และจำกัดจำนวนไม่เกิน slot ที่ template รองรับ
function makeScope12Defaults(cycleId: number): EntryRow[] {
  const mk = (subCategoryCode: string, unit = 'L'): EntryRow => ({
    cycleId: String(cycleId),
    scope: 'S1',
    categoryCode: '1.2',
    subCategoryCode,
    itemName: '',
    unit,
    months: createEmptyMonths(),
    dataSourceType: 'ORG',
  });

  // เริ่มต้นให้มีอย่างละ 1 แถวพอ (ผู้ใช้ค่อย Add เพิ่มเอง)
  return [
    mk('DIESEL_B7_ONROAD#1', 'L'),
    mk('DIESEL_B10_ONROAD#1', 'L'),
    mk('GASOHOL_9195#1', 'L'),
    mk('GASOHOL_E20#1', 'L'),
    mk('DIESEL_B7_OFFROAD', 'L'), // forklift (มีแถวเดียวใน template)
  ];
}


function makeScope141Defaults(cycleId: number): EntryRow[] {
  return [
    mkRow(cycleId, 'S1', '1.4.1', 'สารทำความเย็น R-22 Chiller/เครื่องปรับอากาศ/Air dryer', 'kg', 'REFRIG_R22_KG'),
    mkRow(cycleId, 'S1', '1.4.1', '', 'ถัง', 'REFRIG_R22_TANK'),
    mkRow(cycleId, 'S1', '1.4.1', 'สารทำความเย็น R-32 -เครื่องปรับอากาศ', 'kg', 'REFRIG_R32'),
    mkRow(cycleId, 'S1', '1.4.1', 'สารทำความเย็น R-410a - เครื่องปรับอากาศ', 'kg', 'REFRIG_R410A'),
    mkRow(cycleId, 'S1', '1.4.1', 'สารทำความเย็น R-134a - ตู้แอร์ระบายความร้อน', 'kg', 'REFRIG_R134A'),
    mkRow(cycleId, 'S1', '1.4.1', 'สารทำความเย็น R-407c - Air dryer/Chiller', 'kg', 'REFRIG_R407C'),
  ].map(row => ({
    ...row,
    location: row.subCategoryCode === 'REFRIG_R32' || row.subCategoryCode === 'REFRIG_R410A'
      ? 'LCB, BKK'
      : row.subCategoryCode === 'REFRIG_R22_TANK'
        ? 'LCB'
        : row.location ?? 'LCB',
    referenceText: row.subCategoryCode === 'REFRIG_R22_KG' || row.subCategoryCode === 'REFRIG_R22_TANK'
      ? 'ใบกำกับภาษี/ใบส่งซ่อม'
      : 'ใบกำกับภาษี/เอกสาร PM',
  }));
}

function makeScope142Defaults(cycleId: number): EntryRow[] {
  const mk = (slotNo: number, itemName: string, location: string, referenceText: string): EntryRow => ({
    cycleId: String(cycleId),
    scope: 'S1',
    categoryCode: '1.4.2',
    subCategoryCode: `FIRE_EXT_AGENT#${slotNo}`,
    id: `S1-142-${slotNo}`,
    itemName,
    location,
    referenceText,
    unit: 'kg',
    months: createEmptyMonths(),
    dataSourceType: 'ORG',
  });

  return [
    mk(1, 'สารดับเพลิง CO2', 'LCB/BKK', 'ใบสั่งซื้อ/เอกสาร PM'),
    mk(2, 'สารดับเพลิง HCFC-123', 'LCB/BKK (ห้อง Server)', 'ใบสั่งซื้อ/เอกสาร PM'),
  ];
}

function makeScope143Defaults(cycleId: number): EntryRow[] {
  const groups = [
    '#1 โรงงานแหลมฉบัง (6 วัน/สัปดาห์)',
    '#2 สำนักงานกรุงเทพ (5 วัน/สัปดาห์)',
    '#3 รปภ (7 วัน/สัปดาห์)',
    '#4 พยาบาล (7 วัน/สัปดาห์)',
  ];

  const rows: EntryRow[] = [];
  groups.forEach((label, idx) => {
    const groupNo = idx + 1;
    rows.push({
      cycleId: String(cycleId),
      scope: 'S1',
      categoryCode: '1.4.3',
      subCategoryCode: `SEPTIC_P#${groupNo}`,
      itemName: label,
      unit: 'people',
      months: createEmptyMonths(),
      dataSourceType: 'ORG',
    });
    rows.push({
      cycleId: String(cycleId),
      scope: 'S1',
      categoryCode: '1.4.3',
      subCategoryCode: `SEPTIC_OFF#${groupNo}`,
      itemName: label,
      unit: 'days',
      months: createEmptyMonths(),
      dataSourceType: 'ORG',
    });
  });

  return rows;
}

function makeScope144Defaults(cycleId: number): EntryRow[] {
  const months = createEmptyMonths();
  months[0].qty = 50;
  return [
    {
      cycleId: String(cycleId),
      scope: 'S1',
      categoryCode: '1.4.4',
      subCategoryCode: 'FERTILIZER#1',
      itemName: 'ปุ๋ยเคมี 16-16-16',
      unit: 'Kg',
      referenceText: 'บิลเงินสด',
      months,
      dataSourceType: 'ORG',
    },
  ];
}

function makeScope145Defaults(cycleId: number): EntryRow[] {
  const makeMonths = (values: number[]): EntryRow['months'] => {
    const months = createEmptyMonths();
    months.forEach((m, idx) => {
      m.qty = Number(values[idx] ?? 0);
    });
    return months;
  };

  const makeQual = (
    slotNo: number,
    itemName: string,
    standard: string,
    months: number[]
  ): EntryRow => ({
    cycleId: String(cycleId),
    scope: 'S1',
    categoryCode: '1.4.5',
    subCategoryCode: `WWTP_QUAL#${slotNo}`,
    itemName,
    location: 'ระบบเติมอากาศ',
    referenceText: 'ผลตรวจวิเคราะห์น้ำ',
    unit: 'mg/l',
    remark: standard,
    months: makeMonths(months),
    dataSourceType: 'ORG',
  });

  const makeMeter = (
    slotNo: number,
    itemName: string,
    months: number[]
  ): EntryRow => ({
    cycleId: String(cycleId),
    scope: 'S1',
    categoryCode: '1.4.5',
    subCategoryCode: `WWTP_METER#${slotNo}`,
    itemName,
    referenceText: 'ใบแจ้งหนี้',
    unit: 'm3',
    months: makeMonths(months),
    dataSourceType: 'ORG',
  });

  return [
    makeQual(1, 'BOD (น้ำออก) MBAX 1', '500', [124, 95, 120, 38, 65, 84, 72, 56, 88, 47, 136, 137]),
    makeQual(2, 'BOD (น้ำออก) MBAX 3', '500', [90, 60, 84, 111, 78, 64, 49, 47, 62, 110, 45, 80]),
    makeQual(3, 'BOD (น้ำออก) MBAX 5', '500', [90, 70, 43, 69, 66, 77, 65, 67, 83, 124, 75, 65]),
    makeQual(4, 'COD (น้ำออก) MBAX 1', '750', [236, 294, 298, 148, 155, 214, 252, 203, 222, 205, 365, 321]),
    makeQual(5, 'COD (น้ำออก) MBAX 3', '750', [172, 123, 137, 266, 219, 179, 172, 140, 191, 263, 124, 177]),
    makeQual(6, 'COD (น้ำออก) MBAX 5', '750', [176, 186, 145, 179, 179, 221, 514, 182, 198, 204, 235, 190]),
    makeMeter(1, 'โรงงาน1,2', [1024.8, 1576, 1497.6, 980, 1624.8, 1507.2, 1276, 2502.4, 1448, 1199.2, 1987.2, 819.2]),
    makeMeter(2, 'โรงงาน 5', [1320, 1068, 1194.4, 1145.6, 1396, 1412.8, 1315.2, 1326.4, 405.6, 354.4, 504.8, 1292.8]),
    makeMeter(3, 'โรงงาน 3', [987.2, 710.4, 740, 633.6, 1067.2, 816, 702.4, 706.4, 616, 608.8, 652.8, 715.2]),
    makeMeter(4, 'โรงงาน 4', [508.8, 455.2, 484.8, 290.4, 309.6, 384, 389.6, 468, 405.6, 354.4, 504.8, 464]),
  ];
}
