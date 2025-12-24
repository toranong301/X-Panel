import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { EvidenceModel, EvidenceTable } from '../../../models/evidence.model';

const MAX_IMAGE_BYTES = 500 * 1024;

@Component({
  selector: 'app-evidence-block',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './evidence-block.component.html',
  styleUrls: ['./evidence-block.component.scss'],
})
export class EvidenceBlockComponent {
  @Input() evidenceKey = '';
  @Input() model: EvidenceModel = { notes: [], tables: [], images: [] };
  @Output() modelChange = new EventEmitter<EvidenceModel>();

  addNote(): void {
    const notes = [...(this.model.notes ?? []), ''];
    this.emit({ ...this.model, notes });
  }

  updateNote(index: number, value: string): void {
    const notes = [...(this.model.notes ?? [])];
    notes[index] = value;
    this.emit({ ...this.model, notes });
  }

  removeNote(index: number): void {
    const notes = [...(this.model.notes ?? [])];
    notes.splice(index, 1);
    this.emit({ ...this.model, notes });
  }

  addTable(): void {
    const table: EvidenceTable = {
      headers: ['หัวข้อ 1', 'หัวข้อ 2'],
      rows: [['', '']],
    };
    const tables = [...(this.model.tables ?? []), table];
    this.emit({ ...this.model, tables });
  }

  removeTable(index: number): void {
    const tables = [...(this.model.tables ?? [])];
    tables.splice(index, 1);
    this.emit({ ...this.model, tables });
  }

  updateHeader(tableIndex: number, headerIndex: number, value: string): void {
    const tables = this.cloneTables();
    tables[tableIndex].headers[headerIndex] = value;
    this.emit({ ...this.model, tables });
  }

  addColumn(tableIndex: number): void {
    const tables = this.cloneTables();
    tables[tableIndex].headers.push(`หัวข้อ ${tables[tableIndex].headers.length + 1}`);
    for (const row of tables[tableIndex].rows) row.push('');
    this.emit({ ...this.model, tables });
  }

  removeColumn(tableIndex: number, colIndex: number): void {
    const tables = this.cloneTables();
    tables[tableIndex].headers.splice(colIndex, 1);
    for (const row of tables[tableIndex].rows) row.splice(colIndex, 1);
    this.emit({ ...this.model, tables });
  }

  addRow(tableIndex: number): void {
    const tables = this.cloneTables();
    tables[tableIndex].rows.push(Array.from({ length: tables[tableIndex].headers.length }, () => ''));
    this.emit({ ...this.model, tables });
  }

  removeRow(tableIndex: number, rowIndex: number): void {
    const tables = this.cloneTables();
    tables[tableIndex].rows.splice(rowIndex, 1);
    this.emit({ ...this.model, tables });
  }

  updateCell(tableIndex: number, rowIndex: number, colIndex: number, value: string): void {
    const tables = this.cloneTables();
    tables[tableIndex].rows[rowIndex][colIndex] = value;
    this.emit({ ...this.model, tables });
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      alert('รูปใหญ่เกินไป กรุณาเลือกไฟล์ขนาดไม่เกิน 500KB');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const images = [...(this.model.images ?? []), { name: file.name, dataUrl }];
      this.emit({ ...this.model, images });
      input.value = '';
    };
    reader.readAsDataURL(file);
  }

  removeImage(index: number): void {
    const images = [...(this.model.images ?? [])];
    images.splice(index, 1);
    this.emit({ ...this.model, images });
  }

  private cloneTables(): EvidenceTable[] {
    return (this.model.tables ?? []).map(table => ({
      headers: [...table.headers],
      rows: table.rows.map(row => [...row]),
    }));
  }

  private emit(next: EvidenceModel): void {
    this.model = next;
    this.modelChange.emit(next);
  }
}
