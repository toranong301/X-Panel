import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { Scope3SummaryService } from '../../core/services/scope3-summary.service';
import { Scope3ItemRow } from '../../models/scope3-summary.model';

import { Fr032Service } from '../../core/services/fr03-2.service';
import { Fr032EvalRow, Fr032GroupRow, Fr032SavedMap, Fr032ScreenRow } from '../../models/fr03-2.model';

type CatMeta = { tgoNo: string; isoNo: string; catLabel: string };

@Component({
  selector: 'app-fr03-2',
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
    MatSelectModule,
  ],
  templateUrl: './fr03-2.html',
  styleUrls: ['./fr03-2.scss'],
})
export class Fr032Component implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private scope3Svc = inject(Scope3SummaryService);
  private fr032Svc = inject(Fr032Service);

  cycleId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);

  // --- weight like Excel header ---
  wMag = 0.6;
  wInfluence = 0.2;
  wRisk = 0.1;
  wOpp = 0.1;

  displayedColumns = [
    'tgoNo',
    'isoNo',
    'category',
    'sourceGHG',
    'sourceEF',
    'magnitude',
    'influence',
    'risk',
    'opportunity',
    'score',
    'assessment',
    'selection',
    'ghg',
    'pct',
  ];

  rows: Fr032ScreenRow[] = [];

  // ---- category list (ตามรูปของคุณ) ----
  private CAT_META: CatMeta[] = [
    { tgoNo: '3.1', isoNo: '4.1', catLabel: 'Purchased Goods & Services' },
    { tgoNo: '3.2', isoNo: '4.2', catLabel: 'Capital goods' },
    { tgoNo: '3.3', isoNo: '2.2', catLabel: 'Fuel- and energy related activities' },
    { tgoNo: '3.4', isoNo: '3.1', catLabel: 'Upstream transportation and distribution' },
    { tgoNo: '3.5', isoNo: '4.3', catLabel: 'Waste generated in operations' },
    { tgoNo: '3.6', isoNo: '3.5', catLabel: 'Business travel' },
    { tgoNo: '3.7', isoNo: '3.3', catLabel: 'Employee commuting' },
    { tgoNo: '3.8', isoNo: '4.4', catLabel: 'Upstream leased assets' },
    { tgoNo: '3.9', isoNo: '3.2', catLabel: 'Downstream transportation and distribution' },
    { tgoNo: '3.10', isoNo: '5', catLabel: 'Processing of sold products' },
    { tgoNo: '3.11', isoNo: '4.4', catLabel: 'Use of sold products' },
    { tgoNo: '3.12', isoNo: '5', catLabel: 'End-of-life treatment of sold products' },
    { tgoNo: '3.13', isoNo: '6', catLabel: 'Downstream leased assets' },
    { tgoNo: '3.14', isoNo: '6', catLabel: 'Franchises' },
    { tgoNo: '3.15', isoNo: '6', catLabel: 'Investments' },
  ];

  ngOnInit(): void {
    // 1) โหลด scope3 items (ที่ screen scope 3 ใช้)
    const scope3Doc = this.scope3Svc.load(this.cycleId);
    const scope3Items: Scope3ItemRow[] =
      scope3Doc?.rows?.length ? scope3Doc.rows : this.scope3Svc.getMockRows(this.cycleId);

    // 2) คำนวณ total/share ให้เหมือน scope3 screen (กัน data เก่าไม่มีคำนวณ)
    const computed = this.computeScope3(scope3Items);

    // 3) โหลดค่าที่ผู้ใช้เคยกรอกใน FR-03.2 (local)
    const savedMap = this.fr032Svc.load(this.cycleId) || {};

    // 4) สร้าง rows ของ FR-03.2: group + eval rows
    this.rows = this.buildRowsFromScope3(computed, savedMap);
  }

  // =========================
  // Helpers
  // =========================
  private normTgoNo(v: string): string {
    // "Scope 3.1" -> "3.1"
    return String(v || '').replace(/^Scope\s*/i, '').trim();
  }

  private normText(v: any): string {
    return String(v ?? '').trim().toLowerCase();
  }

  private pickItemLabel(it: Scope3ItemRow): string {
    return (it.itemLabel || it.itemName || '').trim();
  }

  // =========================
  // Build FR-03.2 rows
  // =========================
  private buildRowsFromScope3(items: Scope3ItemRow[], saved: Fr032SavedMap): Fr032ScreenRow[] {
    const out: Fr032ScreenRow[] = [];

    for (const cat of this.CAT_META) {
      const group: Fr032GroupRow = { type: 'group', ...cat };

      const catItems = items.filter(it => {
        const tgoMatch = this.normTgoNo(it.tgoNo) === this.normTgoNo(cat.tgoNo);
        const labelMatch = this.normText(it.categoryLabel) === this.normText(cat.catLabel);
        // เผื่อ compat
        const labelMatchCompat = this.normText(it.catLabel) === this.normText(cat.catLabel);
        return tgoMatch || labelMatch || labelMatchCompat;
      });

      if (catItems.length > 0) {
        out.push(group);

        for (const it of catItems) {
          const label = this.pickItemLabel(it);
          const key = `${cat.tgoNo}|${label}`;

          const ghg = Number(it.totalTco2e ?? it.ghgTco2e ?? 0);
          const pct = Number(it.sharePct ?? it.pct ?? 0);

          out.push(this.makeEvalRow(cat, label, key, ghg, pct, saved[key], false));
        }
      } else {
        // ไม่มี item -> ใส่ 1 แถวของหมวด
        const key = `${cat.tgoNo}|__CATEGORY__`;
        out.push(this.makeEvalRow(cat, cat.catLabel, key, 0, 0, saved[key], true));
      }
    }

    return out;
  }

  private makeEvalRow(
    cat: CatMeta,
    categoryText: string,
    key: string,
    ghg: number,
    pct: number,
    saved?: Fr032SavedMap[string],
    isCategoryRow?: boolean
  ): Fr032EvalRow {
    const r: Fr032EvalRow = {
      type: 'eval',
      key,
      tgoNo: cat.tgoNo,
      isoNo: cat.isoNo,
      category: categoryText,
      isCategoryRow: !!isCategoryRow,

      sourceOfGHG: 1,
      sourceOfEF: 1,
      magnitude: 1,
      influence: 1,
      risk: 1,
      opportunity: 1,

      score: 0,
      assessment: '',
      selection: '',

      ghgTco2e: ghg,
      sharePct: pct,
    };

    if (saved) Object.assign(r, saved);

    r.score = this.calcScore(r);

    if (!r.assessment) {
      r.assessment = r.score >= 5 ? 'มีนัยสำคัญ' : 'ไม่มีนัยสำคัญ';
    }
    if (!r.selection) {
      r.selection = r.assessment === 'มีนัยสำคัญ' ? 'เลือกประเมิน' : '';
    }

    return r;
  }

  // =========================
  // Calc
  // =========================
  calcScore(r: Fr032EvalRow) {
    const s1 = Number(r.sourceOfGHG || 0);
    const s2 = Number(r.sourceOfEF || 0);
    const mag = Number(r.magnitude || 0) * this.wMag;
    const inf = Number(r.influence || 0) * this.wInfluence;
    const risk = Number(r.risk || 0) * this.wRisk;
    const opp = Number(r.opportunity || 0) * this.wOpp;

    return this.round2(s1 + s2 + mag + inf + risk + opp);
  }

  onRowChange(r: Fr032EvalRow) {
    r.score = this.calcScore(r);

    if (r.assessment === '' || r.assessment === 'มีนัยสำคัญ' || r.assessment === 'ไม่มีนัยสำคัญ') {
      r.assessment = r.score >= 5 ? 'มีนัยสำคัญ' : 'ไม่มีนัยสำคัญ';
    }
    if (r.selection === '' || r.selection === 'เลือกประเมิน') {
      r.selection = r.assessment === 'มีนัยสำคัญ' ? 'เลือกประเมิน' : '';
    }
  }

  // คำนวณ total/share ของ scope3 items (ให้ % ถูกแบบ =H3/$H$46*100)
  private computeScope3(items: Scope3ItemRow[]): Scope3ItemRow[] {
    for (const r of items) {
      const qty = Number(r.quantityPerYear || 0);
      const ef = Number(r.ef || 0);

      r.totalTco2e = (qty * ef) / 1000;

      // compat
      r.ghgTco2e = r.totalTco2e;
      r.pct = r.sharePct;
      r.catLabel = r.categoryLabel;
      r.itemName = r.itemLabel;
    }

    const total = items.reduce((s, r) => s + Number(r.totalTco2e || 0), 0);

    for (const r of items) {
      r.sharePct = total > 0 ? (Number(r.totalTco2e || 0) / total) * 100 : 0;
      r.pct = r.sharePct;
    }

    return items;
  }

  // =========================
  // Save
  // =========================
  saveDraft() {
    const map: Fr032SavedMap = {};

    for (const r of this.rows) {
      if (r.type !== 'eval') continue;
      map[r.key] = {
        sourceOfGHG: r.sourceOfGHG,
        sourceOfEF: r.sourceOfEF,
        magnitude: r.magnitude,
        influence: r.influence,
        risk: r.risk,
        opportunity: r.opportunity,
        assessment: r.assessment,
        selection: r.selection,
      };
    }

    this.fr032Svc.save(this.cycleId, map);
    alert('Saved FR-03.2 (local)');
  }

  goScope3Screen() {
    this.router.navigate(['/cycles', this.cycleId, 'scope3-screen']);
  }

  goFr041() {
    this.router.navigate(['/cycles', this.cycleId, 'fr04-1']);
  }

  fmt(n: number, digits = 2) {
    if (n === null || n === undefined) return '';
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  private round2(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  isGroup = (_: number, row: Fr032ScreenRow) => row.type === 'group';
  isEval = (_: number, row: Fr032ScreenRow) => row.type === 'eval';
}
