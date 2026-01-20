import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';

import {
  CycleApiService,
  EfCatalogOption,
} from '../../../core/services/cycle-api.service';

@Component({
  selector: 'app-data-reference-ef-1',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatTableModule, MatProgressSpinnerModule],
  templateUrl: './ef-1.html',
  styleUrls: ['./ef-1.scss'],
})
export class DataReferenceEf1Component implements OnInit {
  cycleId = 0;
  loading = false;
  warning: string | null = null;
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
      void this.loadOptions();
    }
  }

  async loadOptions(): Promise<void> {
    this.loading = true;
    this.warning = null;
    try {
      const response = await this.cycleApi.getCycleEfCatalog(this.cycleId, 'EF1', 'stationary');
      this.options = Array.isArray(response?.options) ? response.options : [];
      this.warning = response?.warning ?? null;
    } catch (error: any) {
      console.error('Load EF (1) failed', error);
      this.options = [];
      this.warning = error?.message ?? 'Failed to load EF (1)';
    } finally {
      this.loading = false;
    }
  }
}
