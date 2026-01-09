import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import {
  CycleApiService,
  EfCatalogOption,
  EfCatalogResponse,
} from '../../../core/services/cycle-api.service';

@Component({
  selector: 'app-data-reference-ar5',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTableModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './ef-ar5.html',
  styleUrls: ['./ef-ar5.scss'],
})
export class DataReferenceEfAr5Component implements OnInit {
  cycleId = 0;
  templateKey = 'mbax';
  loading = false;
  warning: string | null = null;
  scope: 'stationary' | 'mobile' = 'stationary';
  options: EfCatalogOption[] = [];
  readonly columns = ['efId', 'Name', 'Unit', 'CO2', 'Fossil CH4', 'CH4', 'N2O', 'Total', 'Source'];

  constructor(
    private route: ActivatedRoute,
    private cycleApi: CycleApiService,
  ) {}

  ngOnInit(): void {
    const routeId = Number(this.route.snapshot.paramMap.get('cycleId') ?? 0);
    if (routeId > 0) {
      this.cycleId = routeId;
      this.loadCycleTemplate().catch(console.error);
    }
  }

  async loadCycleTemplate(): Promise<void> {
    try {
      const cycle = await this.cycleApi.getCycle(this.cycleId);
      this.templateKey = cycle.template_id ?? this.templateKey;
    } catch (error) {
      console.error('Failed to load cycle for EF catalog', error);
    }
    await this.loadOptions();
  }

  async loadOptions(): Promise<void> {
    this.loading = true;
    this.warning = null;
    try {
      const response = await this.cycleApi.getEfCatalog(this.templateKey, 'AR5', this.scope);
      this.options = Array.isArray(response?.options) ? response.options : [];
      this.warning = response?.warning ?? null;
    } catch (error: any) {
      console.error('EF catalog load failed', error);
      this.options = [];
      this.warning = error?.message ?? 'Failed to load EF catalog';
    } finally {
      this.loading = false;
    }
  }

  onScopeChange(): void {
    void this.loadOptions();
  }
}
