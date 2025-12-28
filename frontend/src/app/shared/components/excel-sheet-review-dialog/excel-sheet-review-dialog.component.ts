import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { ExcelSheetPreviewComponent } from '../excel-sheet-preview/excel-sheet-preview.component';

export type ExcelSheetReviewData = {
  title: string;
  sheetId: string;
  cycleId: number;
  cacheKey?: string | number;
  skipSave?: boolean;
  hideBlankRows?: boolean;
};

@Component({
  selector: 'app-excel-sheet-review-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, ExcelSheetPreviewComponent],
  templateUrl: './excel-sheet-review-dialog.component.html',
  styleUrls: ['./excel-sheet-review-dialog.component.scss'],
})
export class ExcelSheetReviewDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: ExcelSheetReviewData) {}
}
