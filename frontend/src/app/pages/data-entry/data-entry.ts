import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, Router } from '@angular/router';
import { createEmptyMonths } from '../../models/entry-row.helpers';
import { EntryRow } from '../../models/entry-row.model';
import { CategorySectionComponent } from '../../shared/components/category-section/category-section.component';
import { MonthlyEntryGridComponent } from '../../shared/components/monthly-entry-grid/monthly-entry-grid.component';



export interface ActivityRow {
  activity: string;
  unit: string;
  quantity: number;
}

@Component({
  selector: 'app-data-entry',
  standalone: true,
  imports: [
    MatTabsModule,
    MatTableModule,
    MatInputModule,
    MatButtonModule,
    FormsModule,
    MonthlyEntryGridComponent,
    CategorySectionComponent,
  ],
  templateUrl: './data-entry.html',
  styleUrls: ['./data-entry.scss'],
})
export class DataEntryComponent {

  
  cycleId!: number;

  displayedColumns = ['activity', 'unit', 'quantity'];
  

  /* ---------- MOCK DATA ---------- */

  scope1Rows: EntryRow[] = [
  {
    cycleId: String(this.cycleId),
    scope: 'S1',
    categoryCode: '1.1',
    itemName: 'Diesel (Stationary combustion)',
    unit: 'liter',
    months: createEmptyMonths(),
    dataSourceType: 'ORG',
  },
];

scope2Rows: EntryRow[] = [
  {
    cycleId: String(this.cycleId),
    scope: 'S2',
    categoryCode: '2.1',
    itemName: 'Electricity (Grid)',
    unit: 'kWh',
    months: createEmptyMonths(),
    dataSourceType: 'ORG',
  },
];

scope3Rows: EntryRow[] = [
  {
    cycleId: String(this.cycleId),
    scope: 'S3',
    categoryCode: '3.4',
    itemName: 'Employee commuting',
    unit: 'km',
    months: createEmptyMonths(),
    dataSourceType: 'ORG',
  },
];


  constructor(
  private route: ActivatedRoute,
  private router: Router
) {
  this.cycleId = Number(this.route.snapshot.paramMap.get('cycleId'));
}

goScope3() {
  this.router.navigate([
    '/cycles',
    this.cycleId,
    'scope3-screen'
  ]);
}

  save() {
  const payload = {
    cycleId: this.cycleId,
    scope1: this.scope1Rows,
    scope2: this.scope2Rows,
    scope3: this.scope3Rows,
  };

  console.log('SAVE PAYLOAD', payload);
  alert('Saved (mock)');
}

}
