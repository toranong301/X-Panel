import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';

import { CycleStateService } from '../../../core/services/cycle-state.service';

type CfoEntryRow = {
  id: number;
  activity: string;
  quantity: number | null;
  unit: string;
  evidence: string;
  remark: string;
};

@Component({
  selector: 'app-cfo-scope2-electricity',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './cfo-scope2-electricity.component.html',
  styleUrls: ['./cfo-scope2-electricity.component.scss'],
})
export class CfoScope2ElectricityComponent implements OnInit {
  cycleId = 0;
  rows: CfoEntryRow[] = [];
  displayedColumns = ['activity', 'quantity', 'unit', 'evidence', 'remark', 'actions'];

  private nextId = 1;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cycleState: CycleStateService,
  ) {}

  ngOnInit(): void {
    void this.resolveCycleId();
  }

  addRow(): void {
    this.rows = [
      ...this.rows,
      {
        id: this.nextId++,
        activity: '',
        quantity: null,
        unit: '',
        evidence: '',
        remark: '',
      },
    ];
  }

  removeRow(row: CfoEntryRow): void {
    this.rows = this.rows.filter(r => r.id !== row.id);
  }

  trackRow(_index: number, row: CfoEntryRow): number {
    return row.id;
  }

  private async resolveCycleId(): Promise<void> {
    const routeId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);
    const resolvedId = await this.cycleState.resolveCycleId(routeId);
    this.cycleId = resolvedId;
    if (routeId !== resolvedId) {
      this.router.navigate(['/cycles', resolvedId, 'cfo', 'scope2-electricity'], { replaceUrl: true });
    }
  }
}
