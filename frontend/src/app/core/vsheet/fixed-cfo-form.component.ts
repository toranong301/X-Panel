import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { VSheetDataDoc, VSheetFixedBlock } from './vsheet.schema';

@Component({
  selector: 'app-fixed-cfo-form',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatFormFieldModule, MatInputModule],
  templateUrl: './fixed-cfo-form.component.html',
  styleUrls: ['./fixed-cfo-form.component.scss'],
})
export class FixedCfoFormComponent {
  @Input() blocks: VSheetFixedBlock[] = [];
  @Input() data: VSheetDataDoc | null = null;

  blockData(blockId: string): Record<string, any> {
    if (!this.data) return {};
    if (!this.data.cfoFixed[blockId]) this.data.cfoFixed[blockId] = {};
    return this.data.cfoFixed[blockId];
  }

  inputType(inputKind?: string): string {
    return inputKind === 'number' ? 'number' : 'text';
  }
}
