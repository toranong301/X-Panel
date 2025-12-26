import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { finalize, from, Subscription } from 'rxjs';

import { ExcelPreviewService, SheetPreview, SheetPreviewRow } from '../../../core/export/engine/excel-preview.service';

@Component({
  selector: 'app-excel-sheet-preview',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule, MatButtonModule],
  templateUrl: './excel-sheet-preview.component.html',
  styleUrls: ['./excel-sheet-preview.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExcelSheetPreviewComponent implements OnChanges, OnDestroy {
  @Input() cycleId = 0;
  @Input() templateKey = 'MBAX_TGO_11102567::demo';
  @Input() sheetName = '';
  @Input() range?: string;

  loading = false;
  error: string | null = null;
  preview: SheetPreview | null = null;

  private abortController?: AbortController;
  private loadSub?: Subscription;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private loadToken = 0;

  constructor(
    private previewSvc: ExcelPreviewService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(): void {
    if (!this.sheetName || !this.cycleId) return;
    this.scheduleLoad();
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

  private scheduleLoad() {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
    }
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      this.startLoad();
    }, 0);
  }

  private startLoad() {
    this.abortController?.abort();
    this.loadSub?.unsubscribe();
    this.abortController = new AbortController();

    const token = ++this.loadToken;
    this.loading = true;
    this.error = null;
    this.preview = null;
    this.cdr.markForCheck();

    const request$ = from(this.previewSvc.loadSheet({
      cycleId: this.cycleId,
      templateKey: this.templateKey,
      sheetName: this.sheetName,
      range: this.range,
      signal: this.abortController.signal,
    })).pipe(
      finalize(() => {
        if (token === this.loadToken) {
          this.loading = false;
          this.cdr.markForCheck();
        }
      }),
    );

    this.loadSub = request$.subscribe({
      next: preview => {
        this.preview = preview;
        this.cdr.markForCheck();
      },
      error: (error: any) => {
        const msg = error?.message || String(error);
        if (msg !== 'Preview cancelled.') {
          this.error = msg;
        }
        this.cdr.markForCheck();
      },
    });
  }

  cancelLoad() {
    if (!this.loading) return;
    this.abortController?.abort();
    this.loadSub?.unsubscribe();
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.abortController?.abort();
    this.loadSub?.unsubscribe();
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
  }
}
