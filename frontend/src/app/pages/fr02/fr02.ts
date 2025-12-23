import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-fr02',
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
  ],
  templateUrl: './fr02.html',
  styleUrls: ['./fr02.scss'],
})
export class Fr02Component {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  cycleId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);

  form = this.fb.group({
    orgChartImage: ['', Validators.required], // base64
    note: [''],
  });

  // mock local store (ภายหลังเปลี่ยนเป็น service ได้)
  private key() {
    return `xpanel_fr02_${this.cycleId}`;
  }

  constructor() {
    const raw = localStorage.getItem(this.key());
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        this.form.patchValue(saved);
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
    this.form.patchValue({ orgChartImage: base64 });

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

  saveDraft() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    localStorage.setItem(this.key(), JSON.stringify(this.form.value));
    alert('Saved FR-02 draft (local)');
  }

  backFr01() {
    this.router.navigate(['/cycles', this.cycleId, 'fr01']);
  }

  goFr031() {
    this.router.navigate(['/cycles', this.cycleId, 'fr03-1']);
  }
}
