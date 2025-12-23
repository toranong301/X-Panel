import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { Scope3SummaryService } from '../../core/services/scope3-summary.service';
import { Scope3GroupRow, Scope3ItemRow, Scope3ScreenRow } from '../../models/scope3-summary.model';

@Component({
  selector: 'app-scope3-screen',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatDividerModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './scope3-screen.html',
  styleUrls: ['./scope3-screen.scss'],
})
export class Scope3ScreenComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private svc = inject(Scope3SummaryService);

  cycleId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);

  itemRows: Scope3ItemRow[] = [];
  screenRows: Scope3ScreenRow[] = [];

  // ✅ ให้ตรงตารางใหม่ (ไม่มี actions)
  displayedColumns = [
    'tgoNo',
    'scopeIso',
    'category',
    'unit',
    'quantity',
    'remark',
    'dataEvidence',
    'ef',
    'ghg',
    'pct',
    'efEvidence',
  ];

  totalScope3Tco2e = 0;

  ngOnInit(): void {
    const saved = this.svc.load(this.cycleId);
    this.itemRows = saved?.rows?.length ? saved.rows : this.svc.getMockRows(this.cycleId);

    this.recalc();
    this.rebuildScreenRows();
  }

  // ---------- build screen rows (group + items) ----------
  private rebuildScreenRows() {
    const groupMap = new Map<string, Scope3GroupRow>();

    for (const r of this.itemRows) {
      const key = r.tgoNo;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          type: 'group',
          tgoNo: r.tgoNo,
          scopeIso: r.scopeIso,
          categoryLabel: r.categoryLabel,
          order: Number(r.order || 0),
        });
      }
    }

    const groups = [...groupMap.values()].sort((a, b) => a.order - b.order);

    const out: Scope3ScreenRow[] = [];
    for (const g of groups) {
      out.push(g);
      out.push(...this.itemRows.filter(x => x.tgoNo === g.tgoNo));
    }

    this.screenRows = out;
  }

  // ---------- calculations ----------
  recalc() {
    // 1) totalTco2e per row  ✅ totalTco2e = quantity * ef / 1000
    for (const r of this.itemRows) {
      const qty = Number(r.quantityPerYear || 0);
      const ef = Number(r.ef || 0);

      r.totalTco2e = (qty * ef) / 1000;

      // compat fields
      r.ghgTco2e = r.totalTco2e;
      r.catLabel = r.categoryLabel;
      r.itemName = r.itemLabel;
    }

    // 2) total scope3
    const total = this.itemRows.reduce((s, r) => s + Number(r.totalTco2e || 0), 0);
    this.totalScope3Tco2e = total;

    // 3) % share  ✅ = totalTco2e / SUM(totalTco2e) * 100
    for (const r of this.itemRows) {
      r.sharePct = total > 0 ? (Number(r.totalTco2e || 0) / total) * 100 : 0;

      // compat
      r.pct = r.sharePct;
    }
  }

  onCellChange() {
    this.recalc();
    this.rebuildScreenRows();
  }

  // ---------- actions ----------
  saveDraft() {
    this.svc.save(this.cycleId, this.itemRows);
    alert('Saved Scope 3 summary (local)');
  }

  resetToMock() {
    if (!confirm('Reset เป็น mock dataset? (ข้อมูลที่ save ไว้จะถูกแทนที่)')) return;
    this.itemRows = this.svc.getMockRows(this.cycleId);
    this.recalc();
    this.rebuildScreenRows();
    this.svc.save(this.cycleId, this.itemRows);
  }

  goDataEntry() {
    this.router.navigate(['/cycles', this.cycleId, 'data-entry']);
  }

  goFr01() {
    this.router.navigate(['/cycles', this.cycleId, 'fr01']);
  }

  // แสดงเลขสวย
  fmt(n: number | undefined | null, digits = 2) {
    if (n === null || n === undefined) return '';
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
}
