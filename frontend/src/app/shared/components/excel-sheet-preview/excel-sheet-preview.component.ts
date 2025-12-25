import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ExcelPreviewService, SheetPreview, SheetPreviewRow } from '../../../core/export/engine/excel-preview.service';

@Component({
  selector: 'app-excel-sheet-preview',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  templateUrl: './excel-sheet-preview.component.html',
  styleUrls: ['./excel-sheet-preview.component.scss'],
})
export class ExcelSheetPreviewComponent implements OnChanges {
  @Input() cycleId = 0;
  @Input() templateKey = 'MBAX_TGO_11102567::demo';
  @Input() sheetName = '';
  @Input() range?: string;

  loading = false;
  error: string | null = null;
  preview: SheetPreview | null = null;

  constructor(private previewSvc: ExcelPreviewService) {}

  ngOnChanges(): void {
    if (!this.sheetName || !this.cycleId) return;
    this.load();
  }

  get columns(): string[] {
    return this.preview?.columns ?? [];
  }

  get rows(): SheetPreviewRow[] {
    return this.preview?.rows ?? [];
  }

  trackRow(_index: number, row: SheetPreviewRow) {
    return row.rowNumber;
  }

  trackCell(index: number) {
    return index;
  }

  private async load() {
    this.loading = true;
    this.error = null;
    this.preview = null;
    try {
      this.preview = await this.previewSvc.loadSheet({
        cycleId: this.cycleId,
        templateKey: this.templateKey,
        sheetName: this.sheetName,
        range: this.range,
      });
    } catch (error: any) {
      this.error = error?.message || String(error);
    } finally {
      this.loading = false;
    }
  }
}
