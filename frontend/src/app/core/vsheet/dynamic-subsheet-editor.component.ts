import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import {
  VSheetDataDoc,
  VSheetDetailBlock,
  VSheetMonthly12Block,
  VSheetRowData,
  VSheetRowPoolBlock,
} from './vsheet.schema';

type DynamicBlock = VSheetRowPoolBlock | VSheetMonthly12Block | VSheetDetailBlock;

@Component({
  selector: 'app-dynamic-subsheet-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './dynamic-subsheet-editor.component.html',
  styleUrls: ['./dynamic-subsheet-editor.component.scss'],
})
export class DynamicSubsheetEditorComponent {
  @Input() blocks: DynamicBlock[] = [];
  @Input() data: VSheetDataDoc | null = null;

  blockKey(block: DynamicBlock): string {
    return `${block.sheetName}::${block.id}`;
  }

  rowsFor(block: DynamicBlock): VSheetRowData[] {
    if (!this.data) return [];
    const key = this.blockKey(block);
    if (!this.data.subsheets[key]) this.data.subsheets[key] = [];
    return this.data.subsheets[key];
  }

  addRow(block: DynamicBlock): void {
    const rows = this.rowsFor(block);
    if (rows.length >= block.maxRows) return;
    const newRow: VSheetRowData = { inputs: {} };
    if (block.blockType === 'monthly12') {
      newRow.months = Array.from({ length: 12 }, () => null);
    }
    rows.push(newRow);
  }

  removeRow(block: DynamicBlock, index: number): void {
    const rows = this.rowsFor(block);
    rows.splice(index, 1);
  }

  inputType(inputKind?: string): string {
    return inputKind === 'number' ? 'number' : 'text';
  }
}
