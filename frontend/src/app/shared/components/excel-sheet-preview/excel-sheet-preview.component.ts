import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';

import { ExcelPreviewService, SheetPreview, SheetPreviewRow } from '../../../core/export/engine/excel-preview.service';

@Component({
  selector: 'app-excel-sheet-preview',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule, MatButtonModule],
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

  private abortController?: AbortController;

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
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    this.loading = true;
    this.error = null;
    this.preview = null;
    try {
      this.preview = await this.previewSvc.loadSheet({
        cycleId: this.cycleId,
        templateKey: this.templateKey,
        sheetName: this.sheetName,
        range: this.range,
        signal: this.abortController.signal,
      });
    } catch (error: any) {
      this.error = error?.message || String(error);
    } finally {
      this.loading = false;
    }
  }

  cancelLoad() {
    if (!this.loading) return;
    this.abortController?.abort();
  }
}
