import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout/layout';
import { CyclesComponent } from './pages/cycles/cycles';
import { DataEntryComponent } from './pages/data-entry/data-entry';
import { Fr01Component } from './pages/fr01/fr01';
import { Fr02Component } from './pages/fr02/fr02';
import { Fr031Component } from './pages/fr03-1/fr03-1';
import { Fr032Component } from './pages/fr03-2/fr03-2';
import { Fr041Component } from './pages/fr04-1/fr04-1';
import { Scope3ScreenComponent } from './pages/scope3-screen/scope3-screen';
import { VSheetEditorComponent } from './pages/vsheet-editor/vsheet-editor';
import { ExcelSheetPageComponent } from './pages/excel-sheet-page/excel-sheet-page';
import { CfoScope1StationaryComponent } from './pages/cfo-entry/scope1-stationary/cfo-scope1-stationary.component';
import { CfoScope1MobileComponent } from './pages/cfo-entry/scope1-mobile/cfo-scope1-mobile.component';
import { CfoScope2ElectricityComponent } from './pages/cfo-entry/scope2-electricity/cfo-scope2-electricity.component';
import { CfoScope3Component } from './pages/cfo-entry/scope3/cfo-scope3.component';
import { CfoReviewComponent } from './pages/cfo-review/cfo-review.component';

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', redirectTo: 'cycles', pathMatch: 'full' },
      { path: 'cycles', component: CyclesComponent },

      { path: 'cycles/:cycleId/data-entry', component: DataEntryComponent },
      { path: 'cycles/:cycleId/scope3-screen', component: Scope3ScreenComponent },
      { path: 'cycles/:cycleId/fr01', component: Fr01Component },
      { path: 'cycles/:cycleId/fr02', component: Fr02Component },
      { path: 'cycles/:cycleId/fr03-1', component: Fr031Component },
      { path: 'cycles/:cycleId/fr03-2', component: Fr032Component },

      { path: 'cycles/:cycleId/fr04-1', component: Fr041Component },
      {
        path: 'cycles/:cycleId/fr04-2',
        component: ExcelSheetPageComponent,
        data: {
          title: 'FR-04.2 (Read-only)',
          sheetName: 'Fr-04.2',
        },
      },
      {
        path: 'cycles/:cycleId/fr05',
        component: ExcelSheetPageComponent,
        data: {
          title: 'FR-05 (Read-only)',
          sheetName: 'Fr-05',
        },
      },
      {
        path: 'cycles/:cycleId/ef-tgo-ar5',
        component: ExcelSheetPageComponent,
        data: {
          title: 'EF TGO AR5 (Read-only)',
          sheetName: 'EF TGO AR5',
        },
      },
      {
        path: 'cycles/:cycleId/ef-1',
        component: ExcelSheetPageComponent,
        data: {
          title: 'EF (1) (Read-only)',
          sheetName: 'EF (1)',
        },
      },
      {
        path: 'cycles/:cycleId/revision-log',
        component: ExcelSheetPageComponent,
        data: {
          title: 'Revision Log (Read-only)',
          sheetName: 'บันทึกการปรับปรุง',
        },
      },
      { path: 'cycles/:cycleId/vsheet-editor', component: VSheetEditorComponent },
      { path: 'cycles/:cycleId/cfo/scope1-stationary', component: CfoScope1StationaryComponent },
      { path: 'cycles/:cycleId/cfo/scope1-mobile', component: CfoScope1MobileComponent },
      { path: 'cycles/:cycleId/cfo/scope2-electricity', component: CfoScope2ElectricityComponent },
      { path: 'cycles/:cycleId/cfo/scope3', component: CfoScope3Component },
      { path: 'cycles/:cycleId/cfo/review', component: CfoReviewComponent },



      { path: '**', redirectTo: 'cycles' },
    ],
  },
];
