import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTabsModule } from '@angular/material/tabs';

import { DataEntryDoc, DataEntryService } from '../../core/services/data-entry.service';
import { createEmptyMonths } from '../../models/entry-row.helpers';
import { EntryRow } from '../../models/entry-row.model';
import { MonthlyEntryGridComponent } from '../../shared/components/monthly-entry-grid/monthly-entry-grid.component';

@Component({
  selector: 'app-data-entry',
  standalone: true,
  imports: [
    MatTabsModule,
    MatCardModule,
    MatDividerModule,
    MatButtonModule,
    MonthlyEntryGridComponent,
  ],
  templateUrl: './data-entry.html',
  styleUrls: ['./data-entry.scss'],
})
export class DataEntryComponent implements OnInit {
  cycleId = 0;

  // แยก 1.1 / 1.2 เพื่อให้ export mapping ชัด
  scope11Rows: EntryRow[] = [];
  scope12Rows: EntryRow[] = [];

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
      this.scope11Rows = (saved.scope1 ?? []).filter(r => r.categoryCode === '1.1');
      this.scope12Rows = (saved.scope1 ?? []).filter(r => r.categoryCode === '1.2');
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
  }

  save(): void {
    const payload: DataEntryDoc = {
      cycleId: this.cycleId,
      scope1: [...this.scope11Rows, ...this.scope12Rows],
      scope2: this.scope2Rows,
      scope3: this.scope3Rows,
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
    mkRow(cycleId, 'S1', '1.1', 'Stationary input slot 1 (E9:P9)',  'liter', 'S1_1_1#1'),
    mkRow(cycleId, 'S1', '1.1', 'Stationary input slot 2 (E10:P10)', 'liter', 'S1_1_1#2'),
    mkRow(cycleId, 'S1', '1.1', 'Stationary input slot 3 (E12:P12)', 'liter', 'S1_1_1#3'),
    mkRow(cycleId, 'S1', '1.1', 'Stationary input slot 4 (E14:P14)', 'liter', 'S1_1_1#4'),
  ];
}

// Scope 1.2: seed “ทุก slot” จะได้กรอกได้เลยไม่ต้อง add/remove
function makeScope12Defaults(cycleId: number): EntryRow[] {
  const rows: EntryRow[] = [];

  // Diesel B7 on-road: slot 1..14
  for (let i = 1; i <= 14; i++) {
    rows.push(mkRow(cycleId, 'S1', '1.2', `Diesel B7 on-road (slot ${i})`, 'liter', `DIESEL_B7_ONROAD#${i}`));
  }
  // Diesel B10 on-road: slot 1..14
  for (let i = 1; i <= 14; i++) {
    rows.push(mkRow(cycleId, 'S1', '1.2', `Diesel B10 on-road (slot ${i})`, 'liter', `DIESEL_B10_ONROAD#${i}`));
  }
  // Gasohol 91/95: slot 1..6
  for (let i = 1; i <= 6; i++) {
    rows.push(mkRow(cycleId, 'S1', '1.2', `Gasohol 91/95 (slot ${i})`, 'liter', `GASOHOL_9195#${i}`));
  }
  // Gasohol E20: slot 1..6
  for (let i = 1; i <= 6; i++) {
    rows.push(mkRow(cycleId, 'S1', '1.2', `Gasohol E20 (slot ${i})`, 'liter', `GASOHOL_E20#${i}`));
  }

  // Diesel B7 off-road forklift: single row 58
  rows.push(mkRow(cycleId, 'S1', '1.2', 'Diesel B7 off-road forklift (row 58)', 'liter', 'DIESEL_B7_OFFROAD'));

  return rows;
}
