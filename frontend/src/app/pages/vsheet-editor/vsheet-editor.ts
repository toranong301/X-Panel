import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTabsModule } from '@angular/material/tabs';

import { DataEntryService } from '../../core/services/data-entry.service';
import {
  DEFAULT_VSHEET_DOC,
  VSheetDataDoc,
  getDynamicBlocks,
  getFixedBlocks,
} from '../../core/vsheet/vsheet.schema';
import { FixedCfoFormComponent } from '../../core/vsheet/fixed-cfo-form.component';
import { DynamicSubsheetEditorComponent } from '../../core/vsheet/dynamic-subsheet-editor.component';

@Component({
  selector: 'app-vsheet-editor',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatCardModule,
    MatDividerModule,
    MatButtonModule,
    FixedCfoFormComponent,
    DynamicSubsheetEditorComponent,
  ],
  templateUrl: './vsheet-editor.html',
  styleUrls: ['./vsheet-editor.scss'],
})
export class VSheetEditorComponent implements OnInit {
  cycleId = 0;
  data: VSheetDataDoc = structuredClone(DEFAULT_VSHEET_DOC);

  fixedBlocks = getFixedBlocks();
  dynamicBlocks = getDynamicBlocks();

  constructor(
    private route: ActivatedRoute,
    private entrySvc: DataEntryService,
  ) {}

  ngOnInit(): void {
    this.cycleId = Number(this.route.snapshot.paramMap.get('cycleId') ?? 0);
    this.data = this.entrySvc.loadVSheet(this.cycleId);
  }

  save(): void {
    this.entrySvc.saveVSheet(this.cycleId, this.data);
    alert('Saved ✅ (stored in localStorage)');
  }

  reset(): void {
    this.data = structuredClone(DEFAULT_VSHEET_DOC);
  }
}
