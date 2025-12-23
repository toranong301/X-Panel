import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout/layout';
import { CyclesComponent } from './pages/cycles/cycles';
import { DataEntryComponent } from './pages/data-entry/data-entry';
import { Fr01Component } from './pages/fr01/fr01';
import { Fr02Component } from './pages/fr02/fr02';
import { Fr031Component } from './pages/fr03-1/fr03-1';
import { Fr032Component } from './pages/fr03-2/fr03-2';
import { Scope3ScreenComponent } from './pages/scope3-screen/scope3-screen';

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



      { path: '**', redirectTo: 'cycles' },
    ],
  },
];
