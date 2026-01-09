import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout/layout';
import { CycleShellComponent } from './layout/cycle-shell/cycle-shell';
import { PlaceholderPageComponent } from './pages/placeholder/placeholder';
import { DataReferenceEfAr5Component } from './pages/data-reference/ef-ar5/ef-ar5';
import { DataReferenceEf1Component } from './pages/data-reference/ef-1/ef-1';
import { PLACEHOLDER_SECTIONS } from './layout/cycle-shell/navigation-config';
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

const placeholderRoutes = PLACEHOLDER_SECTIONS.map(section => ({
  path: `placeholder/${section.slug}`,
  component: PlaceholderPageComponent,
  data: {
    title: section.title,
    description: section.description,
  },
}));

export const routes: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', redirectTo: 'cycles', pathMatch: 'full' },
      { path: 'cycles', component: CyclesComponent },
      {
        path: 'cycles/:cycleId',
        component: CycleShellComponent,
        children: [
          { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
          {
            path: 'dashboard',
            component: PlaceholderPageComponent,
            data: { title: 'Dashboard', description: 'Dashboard overview is coming soon.' },
          },
          {
            path: 'scope-dashboard',
            component: PlaceholderPageComponent,
            data: { title: 'Scope Dashboard', description: 'Scope summary will appear here.' },
          },
          { path: 'data-entry', component: DataEntryComponent },
          { path: 'scope3-screen', component: Scope3ScreenComponent },
          { path: 'fr01', component: Fr01Component },
          { path: 'fr02', component: Fr02Component },
          { path: 'fr03-1', component: Fr031Component },
          { path: 'fr03-2', component: Fr032Component },
          { path: 'fr04-1', component: Fr041Component },
          {
            path: 'fr04-2',
            component: ExcelSheetPageComponent,
            data: {
              title: 'FR-04.2 (Read-only)',
              sheetId: 'fr042',
            },
          },
          {
            path: 'fr05',
            component: ExcelSheetPageComponent,
            data: {
              title: 'FR-05 (Read-only)',
              sheetId: 'fr05',
            },
          },
          {
            path: 'ef-tgo-ar5',
            component: PlaceholderPageComponent,
            data: {
              title: 'EF TGO AR5 (Read-only)',
              description: 'Legacy EF sheet is still available under Data Entry exports.',
            },
          },
          {
            path: 'ef-1',
            component: PlaceholderPageComponent,
            data: {
              title: 'EF (1) (Read-only)',
              description: 'Legacy EF (1)/EF other references remain in exports.',
            },
          },
          {
            path: 'revision-log',
            component: PlaceholderPageComponent,
            data: {
              title: 'Revision Log (Read-only)',
              description: 'Revision log preview is under construction.',
            },
          },
          { path: 'vsheet-editor', component: VSheetEditorComponent },
          { path: 'cfo/scope1-stationary', component: CfoScope1StationaryComponent },
          { path: 'cfo/scope1-mobile', component: CfoScope1MobileComponent },
          { path: 'cfo/scope2-electricity', component: CfoScope2ElectricityComponent },
          { path: 'cfo/scope3', component: CfoScope3Component },
          { path: 'cfo/review', component: CfoReviewComponent },
          {
            path: 'data-reference',
            children: [
              { path: '', redirectTo: 'ef-ar5', pathMatch: 'full' },
              { path: 'ef-ar5', component: DataReferenceEfAr5Component },
              { path: 'ef-1', component: DataReferenceEf1Component },
            ],
          },
          ...placeholderRoutes,
        ],
      },
      { path: '**', redirectTo: 'cycles' },
    ],
  },
];
