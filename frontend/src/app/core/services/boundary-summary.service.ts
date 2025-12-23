import { Injectable } from '@angular/core';
import { Fr01BoundarySummary } from '../../models/fr01.model';

@Injectable({ providedIn: 'root' })
export class BoundarySummaryService {
  // TODO: ต่อไปค่อยคำนวณจริงจาก Data Entry + FR-04 + FR-03.2
  getBoundarySummary(cycleId: number): Fr01BoundarySummary {
    return {
      scope1: [
        'Stationary Combustion (1.1)' ,
        'Mobile Combustion (1.2)',
        'Process Emission (1.3)',
        'Fugitive Emission (1.4)',
        'Biomass Emission (1.5)'
      ],
      scope2: [
        'Purchased Electricity (2.1)',
        'Purchased Energy (2.2)',
      ],
      scope3: [
        '#Cat 1 (3.1 Purchased Goods & Services)',
        '#Cat 2 (3.2 Capital goods)',
        '#Cat 3 (3.3 Fuel- and energy-related activities)',
        '#Cat 4 (3.4 Upstream transportation and distribution)',
        '#Cat 5 (3.5 Waste generated in operations)',
        '#Cat 6 (3.6 Business travel)',
        '#Cat 7 (3.7 Employee commuting)',
        '#Cat 8 (3.8 Upstream leased assets)',
        '#Cat 9 (3.9 Downstream transportation and distribution)',
        '#Cat 10 (3.10 Processing of sold products)',
        '#Cat 11 (3.11 Use of sold products)',
        '#Cat 12 (3.12 End-of-life treatment of sold products)',
        '#Cat 13 (3.13 Downstream leased assets)',
        '#Cat 14 (3.14 Franchises)',
        '#Cat 15 (3.15 Investments)',
      ],
    };
  }
}
