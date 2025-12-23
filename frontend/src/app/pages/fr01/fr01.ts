import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { ActivatedRoute, Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';

import { BoundarySummaryService } from '../../core/services/boundary-summary.service';
import { Fr01Service } from '../../core/services/fr01.service';
import { Fr01Data } from '../../models/fr01.model';

@Component({
  selector: 'app-fr01',
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
    MatListModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  templateUrl: './fr01.html',
  styleUrls: ['./fr01.scss'],
})
export class Fr01Component {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fr01 = inject(Fr01Service);
  private boundaryService = inject(BoundarySummaryService);

  cycleId = Number(this.route.snapshot.paramMap.get('cycleId') || 0);
  boundary = this.boundaryService.getBoundarySummary(this.cycleId);

  // ✅ ต้องประกาศทุก field ที่คุณ patch/save ให้ครบ
  form = this.fb.group({
    orgName: ['', Validators.required],
    preparedBy: ['', Validators.required],
    preparedDate: [new Date(), Validators.required],

    dataPeriodStart: [null as Date | null],
    dataPeriodEnd: [null as Date | null],
    baseYearStart: [null as Date | null],
    baseYearEnd: [null as Date | null],

    productionValue: [0],
    productionUnit: ['ตัน'],
    baseYearProductionValue: [0],
    baseYearProductionUnit: ['ตัน'],

    orgInfoLines: this.fb.array([
      this.fb.control(''),
      this.fb.control(''),
      this.fb.control(''),
      this.fb.control(''),
      this.fb.control(''),
    ]),

    contactAddress: [''],
    registrationDate: [null as Date | null],

    orgPhoto1: ['' as string],
    orgPhoto2: ['' as string],
  });

  constructor() {
    // โหลด draft ถ้ามี
    const saved = this.fr01.load(this.cycleId);
    if (saved) this.patchFromSaved(saved);
  }

  get orgInfoLines(): FormArray {
    return this.form.get('orgInfoLines') as FormArray;
  }

  private toISO(d: Date | null | undefined): string {
    if (!d) return '';
    const date = new Date(d);
    return date.toISOString().slice(0, 10);
  }

  private patchFromSaved(saved: Fr01Data) {
    this.form.patchValue({
      orgName: saved.orgName,
      preparedBy: saved.preparedBy,
      preparedDate: saved.preparedDate ? new Date(saved.preparedDate) : new Date(),

      dataPeriodStart: saved.dataPeriod?.start ? new Date(saved.dataPeriod.start) : null,
      dataPeriodEnd: saved.dataPeriod?.end ? new Date(saved.dataPeriod.end) : null,
      baseYearStart: saved.baseYearPeriod?.start ? new Date(saved.baseYearPeriod.start) : null,
      baseYearEnd: saved.baseYearPeriod?.end ? new Date(saved.baseYearPeriod.end) : null,

      productionValue: saved.production?.value ?? 0,
      productionUnit: saved.production?.unit ?? 'ตัน',
      baseYearProductionValue: saved.baseYearProduction?.value ?? 0,
      baseYearProductionUnit: saved.baseYearProduction?.unit ?? 'ตัน',

      contactAddress: saved.contactAddress ?? '',
      registrationDate: saved.registrationDate ? new Date(saved.registrationDate) : null,

      orgPhoto1: saved.photos?.orgPhoto1 ?? '',
      orgPhoto2: saved.photos?.orgPhoto2 ?? '',
    });

    const lines = saved.orgInfoLines ?? [];
    for (let i = 0; i < 5; i++) {
      this.orgInfoLines.at(i).setValue(lines[i] ?? '');
    }
  }

  onPickPhoto(slot: 1 | 2, input: HTMLInputElement) {
    input.click();
  }

  async onPhotoSelected(slot: 1 | 2, evt: Event) {
    const input = evt.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const base64 = await this.readAsDataURL(file);

    if (slot === 1) this.form.patchValue({ orgPhoto1: base64 });
    if (slot === 2) this.form.patchValue({ orgPhoto2: base64 });

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

    const v = this.form.value;

    const data: Fr01Data = {
      orgName: String(v.orgName || ''),
      preparedBy: String(v.preparedBy || ''),
      preparedDate: this.toISO(v.preparedDate as Date),

      photos: {
        orgPhoto1: (v.orgPhoto1 as string) || '',
        orgPhoto2: (v.orgPhoto2 as string) || '',
      },

      dataPeriod: {
        start: this.toISO(v.dataPeriodStart as Date),
        end: this.toISO(v.dataPeriodEnd as Date),
      },
      baseYearPeriod: {
        start: this.toISO(v.baseYearStart as Date),
        end: this.toISO(v.baseYearEnd as Date),
      },

      production: {
        value: Number(v.productionValue || 0),
        unit: String(v.productionUnit || ''),
      },
      baseYearProduction: {
        value: Number(v.baseYearProductionValue || 0),
        unit: String(v.baseYearProductionUnit || ''),
      },

      orgInfoLines: this.orgInfoLines.controls.map(c => String(c.value || '')),
      contactAddress: String(v.contactAddress || ''),
      registrationDate: v.registrationDate ? this.toISO(v.registrationDate as Date) : undefined,
    };

    this.fr01.save(this.cycleId, data);
    alert('Saved FR-01 draft (local)');
  }

  goDataEntry() {
    this.router.navigate(['/cycles', this.cycleId, 'data-entry']);
  }

  goFr041() {
    this.router.navigate(['/cycles', this.cycleId, 'fr04-preview']);
  }

  get orgInfoLineControls(): FormControl[] {
  return (this.orgInfoLines.controls as FormControl[]);
}

goFr02() {
  this.router.navigate(['/cycles', this.cycleId, 'fr02']);
}

saveAndNext() {
  this.saveDraft();
  this.goFr02();
}

}
