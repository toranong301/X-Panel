import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router } from '@angular/router';

import { DataEntryService } from '../../core/services/data-entry.service';
import { createEmptyMonths } from '../../models/entry-row.helpers';
import { EntryRow } from '../../models/entry-row.model';
import { CategorySectionComponent } from '../../shared/components/category-section/category-section.component';
@Component({
  selector: 'app-data-entry',
  standalone: true,
  imports: [
    MatTabsModule,
    MatTableModule,
    MatInputModule,
    MatButtonModule,
    FormsModule,
    CategorySectionComponent,
  ],
  templateUrl: './data-entry.html',
  styleUrls: ['./data-entry.scss'],
})
export class DataEntryComponent {
  private route = inject(ActivatedRoute);
private router = inject(Router);
private entrySvc = inject(DataEntryService);

cycleId = Number(this.route.snapshot.paramMap.get('cycleId'));

scope11Rows: EntryRow[] = [];
scope12Rows: EntryRow[] = [];
scope2Rows: EntryRow[] = [];
scope3Rows: EntryRow[] = [];

constructor() {
  const saved = this.entrySvc.load(this.cycleId);

  if (saved) {
    this.scope11Rows = (saved.scope1 || []).filter(r => r.categoryCode === '1.1');
    this.scope12Rows = (saved.scope1 || []).filter(r => r.categoryCode === '1.2');
    this.scope2Rows = saved.scope2 || [];
    this.scope3Rows = saved.scope3 || [];
    return;
  }

  // default rows (ผูก fuelKey ผ่าน subCategoryCode)
  this.scope11Rows = [
    { cycleId: String(this.cycleId), scope: 'S1', categoryCode: '1.1', subCategoryCode: 'DIESEL_B7_STATIONARY', itemName: 'Diesel (Stationary)', unit: 'liter', months: createEmptyMonths(), dataSourceType: 'ORG' },
    { cycleId: String(this.cycleId), scope: 'S1', categoryCode: '1.1', subCategoryCode: 'GASOHOL_9195_STATIONARY', itemName: 'Gasohol 91/95 (Stationary)', unit: 'liter', months: createEmptyMonths(), dataSourceType: 'ORG' },
    { cycleId: String(this.cycleId), scope: 'S1', categoryCode: '1.1', subCategoryCode: 'ACETYLENE_TANK5_MAINT_2', itemName: 'Acetylene tank 5kg (type 2)', unit: 'tank', months: createEmptyMonths(), dataSourceType: 'ORG' },
    { cycleId: String(this.cycleId), scope: 'S1', categoryCode: '1.1', subCategoryCode: 'ACETYLENE_TANK5_MAINT_3', itemName: 'Acetylene tank 5kg (type 3)', unit: 'tank', months: createEmptyMonths(), dataSourceType: 'ORG' },
  ];

  this.scope12Rows = [
    { cycleId: String(this.cycleId), scope: 'S1', categoryCode: '1.2', subCategoryCode: 'DIESEL_B7_ONROAD#1', itemName: 'Diesel B7 (on-road) #1', unit: 'liter', months: createEmptyMonths(), dataSourceType: 'ORG' },
    { cycleId: String(this.cycleId), scope: 'S1', categoryCode: '1.2', subCategoryCode: 'DIESEL_B10_ONROAD#1', itemName: 'Diesel B10 (on-road) #1', unit: 'liter', months: createEmptyMonths(), dataSourceType: 'ORG' },
    { cycleId: String(this.cycleId), scope: 'S1', categoryCode: '1.2', subCategoryCode: 'GASOHOL_9195#1', itemName: 'Gasohol 91/95 #1', unit: 'liter', months: createEmptyMonths(), dataSourceType: 'ORG' },
    { cycleId: String(this.cycleId), scope: 'S1', categoryCode: '1.2', subCategoryCode: 'GASOHOL_E20#1', itemName: 'Gasohol E20 #1', unit: 'liter', months: createEmptyMonths(), dataSourceType: 'ORG' },
    { cycleId: String(this.cycleId), scope: 'S1', categoryCode: '1.2', subCategoryCode: 'DIESEL_B7_OFFROAD', itemName: 'Diesel B7 (forklift / off-road)', unit: 'liter', months: createEmptyMonths(), dataSourceType: 'ORG' },
  ];
}

save() {
  this.entrySvc.save(this.cycleId, {
    scope1: [...this.scope11Rows, ...this.scope12Rows],
    scope2: this.scope2Rows,
    scope3: this.scope3Rows,
  });
  alert('Saved');
}

}
