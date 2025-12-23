import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

type Fr031Draft = {
  orgStructureImage: string; // base64
  completedDate?: string;    // YYYY-MM-DD
  note?: string;
};

@Component({
  selector: 'app-fr03-1',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  templateUrl: './fr03-1.html',
  styleUrls: ['./fr03-1.scss'],
})
export class Fr031Component {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  cycleId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);

  form = this.fb.group({
    orgStructureImage: ['', Validators.required],   // รูปแผนภาพ
    completedDate: [new Date(), Validators.required], // เสร็จสิ้นวันที่
    note: [''],
  });

  private storageKey() {
    return `xpanel_fr03_1_${this.cycleId}`;
  }

  constructor() {
    const raw = localStorage.getItem(this.storageKey());
    if (raw) {
      try {
        const saved = JSON.parse(raw) as Fr031Draft;
        this.form.patchValue({
          orgStructureImage: saved.orgStructureImage || '',
          completedDate: saved.completedDate ? new Date(saved.completedDate) : new Date(),
          note: saved.note || '',
        });
      } catch {}
    }
  }

  pickImage(input: HTMLInputElement) {
    input.click();
  }

  async onImageSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const base64 = await this.readAsDataURL(file);
    this.form.patchValue({ orgStructureImage: base64 });

    input.value = '';
  }

  private readAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  private toISO(d: Date | null | undefined): string {
    if (!d) return '';
    const date = new Date(d);
    return date.toISOString().slice(0, 10);
  }

  saveDraft() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.value;
    const payload: Fr031Draft = {
      orgStructureImage: String(v.orgStructureImage || ''),
      completedDate: this.toISO(v.completedDate as Date),
      note: String(v.note || ''),
    };

    localStorage.setItem(this.storageKey(), JSON.stringify(payload));
    alert('Saved FR-03.1 draft (local)');
  }

  backFr02() {
    this.router.navigate(['/cycles', this.cycleId, 'fr02']);
  }

  goFr032() {
    this.router.navigate(['/cycles', this.cycleId, 'fr03-2']);
  }
}
