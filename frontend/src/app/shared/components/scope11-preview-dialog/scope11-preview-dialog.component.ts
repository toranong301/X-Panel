import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';

export type Scope11PreviewDialogData = {
  ok: boolean;
  items: Array<{
    rowId: string;
    label: string;
    evidence: string;
    unit: string;
    months: Record<string, any>;
    total: number | null;
  }>;
  unknown_rowIds: string[];
  missing_fields?: string[];
  splitRows?: Array<{
    itemLabel: string;
    fuelKey: string;
    evidence: string;
    unit: string;
    total: number | null;
    dieselL: number | null;
    biodieselL: number | null;
    biodieselKg: number | null;
    gasolineL: number | null;
    ethanolL: number | null;
    ethanolKg: number | null;
  }>;
  headerMonths?: Record<string, number | null>;
};

@Component({
  selector: 'app-scope11-preview-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  templateUrl: './scope11-preview-dialog.component.html',
  styleUrls: ['./scope11-preview-dialog.component.scss'],
})
export class Scope11PreviewDialogComponent {
  readonly items: Array<{
    rowId: string;
    label: string;
    evidence: string;
    unit: string;
    months: Record<string, any>;
    total: number | null;
  }>;
  readonly splitRows: Array<{
    itemLabel: string;
    fuelKey: string;
    evidence: string;
    unit: string;
    total: number | null;
    dieselL: number | null;
    biodieselL: number | null;
    biodieselKg: number | null;
    gasolineL: number | null;
    ethanolL: number | null;
    ethanolKg: number | null;
  }>;
  showAll = false;
  readonly headerMonths: Record<string, number | null> | null;

  constructor(@Inject(MAT_DIALOG_DATA) public data: Scope11PreviewDialogData) {
    this.items = data?.items ?? [];
    this.splitRows = data?.splitRows ?? [];
    this.headerMonths = data?.headerMonths ?? null;
  }

  get visibleItems() {
    if (this.showAll) return this.items;
    return this.items.filter(row =>
      Object.values(row.months ?? {}).some(value => value != null)
    );
  }

  headerMonthsTotal(): number | null {
    if (!this.headerMonths) return null;
    const values = Object.values(this.headerMonths)
      .map(v => this.parseNumberOrNull(v))
      .filter((v): v is number => v !== null);
    if (!values.length) return null;
    return values.reduce((sum: number, v) => sum + v, 0);
  }

  formatFixed2(value: number | string | null | undefined): string {
    const normalized = this.parseNumberOrNull(value);
    if (normalized === null) return '';
    return normalized.toFixed(2);
  }

  private parseNumberOrNull(value: any): number | null {
    if (value == null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
  }

}
