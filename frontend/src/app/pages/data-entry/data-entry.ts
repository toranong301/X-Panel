import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTabsModule } from '@angular/material/tabs';

import { DataEntryDoc, DataEntryService } from '../../core/services/data-entry.service';
import { createEmptyMonths } from '../../models/entry-row.helpers';
import { EntryRow } from '../../models/entry-row.model';
import { Scope11StationaryComponent } from './scope11-stationary/scope11-stationary.component';
import { Scope12MobileComponent } from './scope12-mobile/scope12-mobile.component';
import { Scope14FugitiveComponent } from './scope14-fugitive/scope14-fugitive.component';

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
      this.scope2Rows = saved.scope2 ?? [];
      this.scope3Rows = saved.scope3 ?? [];
      return;
    }

    // seed defaults เพื่อให้ “เข้าไปกรอกแล้วกด Save ได้ทันที”
    this.resetDefaults();
  }

  resetDefaults(): void {
    this.scope11Rows = makeScope11Defaults(this.cycleId);
    this.scope12Rows = makeScope12Defaults(this.cycleId);
    this.scope141Rows = makeScope141Defaults(this.cycleId);
  }

  save(): void {
    const existing = this.entrySvc.load(this.cycleId);
    const payload: DataEntryDoc = {
      cycleId: this.cycleId,
      scope1: [...this.scope11Rows, ...this.scope12Rows, ...this.scope141Rows],
      scope2: this.scope2Rows,
      scope3: this.scope3Rows,
      cfoFixed: existing?.cfoFixed,
      subsheets: existing?.subsheets,
    };

    this.entrySvc.save(this.cycleId, payload);
    alert('Saved ✅ (stored in localStorage)');
  }

  goFr041(): void {
    this.router.navigate(['/cycles', this.cycleId, 'fr04-1']);
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

// Scope 1.2: seed “ทุก slot” จะได้กรอกได้เลยไม่ต้อง add/remove
function makeScope12Defaults(cycleId: number): EntryRow[] {
  const rows: EntryRow[] = [];

  // Diesel B7 on-road: slot 1..14
  for (let i = 1; i <= 14; i++) {
    rows.push(mkRow(cycleId, 'S1', '1.2', '', 'L', `DIESEL_B7_ONROAD#${i}`));
  }
  // Diesel B10 on-road: slot 1..14
  for (let i = 1; i <= 14; i++) {
    rows.push(mkRow(cycleId, 'S1', '1.2', '', 'L', `DIESEL_B10_ONROAD#${i}`));
  }
  // Gasohol 91/95: slot 1..6
  for (let i = 1; i <= 6; i++) {
    rows.push(mkRow(cycleId, 'S1', '1.2', '', 'L', `GASOHOL_9195#${i}`));
  }
  // Gasohol E20: slot 1..6
  for (let i = 1; i <= 6; i++) {
    rows.push(mkRow(cycleId, 'S1', '1.2', '', 'L', `GASOHOL_E20#${i}`));
  }

  // Diesel B7 off-road forklift: single row 58
  rows.push(mkRow(cycleId, 'S1', '1.2', '', 'L', 'DIESEL_B7_OFFROAD'));

  return rows;
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
