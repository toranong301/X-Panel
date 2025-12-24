import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTabsModule } from '@angular/material/tabs';

import { DataEntryDoc, DataEntryService } from '../../core/services/data-entry.service';
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

@Component({
  selector: 'app-data-entry',
  standalone: true,
  imports: [
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
    EvidenceBlockComponent,
  ],
  templateUrl: './data-entry.html',
  styleUrls: ['./data-entry.scss'],
})
export class DataEntryComponent implements OnInit {
  cycleId = 0;

  // แยก 1.1 / 1.2 เพื่อให้ export mapping ชัด
  scope11Rows: EntryRow[] = [];
  scope12Rows: EntryRow[] = [];
  scope141Rows: EntryRow[] = [];
  scope142Rows: EntryRow[] = [];
  scope143Rows: EntryRow[] = [];
  scope144Rows: EntryRow[] = [];

  evidenceMap: Record<string, EvidenceModel> = {};

  // เผื่อไว้ (ถ้ายังไม่ทำก็ปล่อยว่างได้)
  scope2Rows: EntryRow[] = [];
  scope3Rows: EntryRow[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private entrySvc: DataEntryService
  ) {}

  ngOnInit(): void {
    this.cycleId = Number(this.route.snapshot.paramMap.get('cycleId') ?? 0);

    const saved = this.entrySvc.load(this.cycleId);
    if (saved) {
      const scope1Rows = saved.scope1 ?? [];
      this.scope11Rows = normalizeScope11Rows(this.cycleId, scope1Rows);
      const scope12Rows = scope1Rows.filter(r => r.categoryCode === '1.2');
      this.scope12Rows = scope12Rows.length ? scope12Rows : makeScope12Defaults(this.cycleId);
      const scope141Rows = scope1Rows.filter(r => r.categoryCode === '1.4.1');
      this.scope141Rows = scope141Rows.length ? scope141Rows : makeScope141Defaults(this.cycleId);
      const scope142Rows = scope1Rows.filter(r => r.categoryCode === '1.4.2');
      this.scope142Rows = scope142Rows.length ? scope142Rows : makeScope142Defaults(this.cycleId);
      const scope143Rows = scope1Rows.filter(r => r.categoryCode === '1.4.3');
      this.scope143Rows = scope143Rows.length ? scope143Rows : makeScope143Defaults(this.cycleId);
      const scope144Rows = scope1Rows.filter(r => r.categoryCode === '1.4.4');
      this.scope144Rows = scope144Rows.length ? scope144Rows : makeScope144Defaults(this.cycleId);
      this.scope2Rows = saved.scope2 ?? [];
      this.scope3Rows = saved.scope3 ?? [];
      this.evidenceMap = saved.evidence ?? {};
      this.seedEvidenceKeys();
      return;
    }

    // seed defaults เพื่อให้ “เข้าไปกรอกแล้วกด Save ได้ทันที”
    this.resetDefaults();
    this.seedEvidenceKeys();
  }

  resetDefaults(): void {
    this.scope11Rows = makeScope11Defaults(this.cycleId);
    this.scope12Rows = makeScope12Defaults(this.cycleId);
    this.scope141Rows = makeScope141Defaults(this.cycleId);
    this.scope142Rows = makeScope142Defaults(this.cycleId);
    this.scope143Rows = makeScope143Defaults(this.cycleId);
    this.scope144Rows = makeScope144Defaults(this.cycleId);
  }

  save(): void {
    const existing = this.entrySvc.load(this.cycleId);
    const otherScope1Rows = (existing?.scope1 ?? []).filter(
      row => !['1.1', '1.2', '1.4.1', '1.4.2', '1.4.3', '1.4.4'].includes(row.categoryCode)
    );
    const payload: DataEntryDoc = {
      cycleId: this.cycleId,
      scope1: [
        ...this.scope11Rows,
        ...this.scope12Rows,
        ...this.scope141Rows,
        ...this.scope142Rows,
        ...this.scope143Rows,
        ...this.scope144Rows,
        ...otherScope1Rows,
      ],
      scope2: this.scope2Rows,
      scope3: this.scope3Rows,
      cfoFixed: existing?.cfoFixed,
      subsheets: existing?.subsheets,
      evidence: this.evidenceMap,
    };

    this.entrySvc.save(this.cycleId, payload);
    alert('Saved ✅ (stored in localStorage)');
  }

  goFr041(): void {
    this.router.navigate(['/cycles', this.cycleId, 'fr04-1']);
  }

  evidenceFor(key: string): EvidenceModel {
    return this.evidenceMap[key] ?? { notes: [], tables: [], images: [] };
  }

  updateEvidence(key: string, model: EvidenceModel): void {
    this.evidenceMap = { ...this.evidenceMap, [key]: model };
  }

  private seedEvidenceKeys(): void {
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
    ];
    let updated = false;
    const next = { ...this.evidenceMap };
    for (const key of keys) {
      if (!next[key]) {
        next[key] = { notes: [], tables: [], images: [] };
        updated = true;
      }
    }
    if (updated) this.evidenceMap = next;
  }
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
