import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export type OtherBlendSpec = {
  dieselPct: number;
  biodieselPct: number;
  gasolinePct: number;
  ethanolPct: number;
  density: {
    biodieselKgPerL: number;
    ethanolKgPerL: number;
    dieselKgPerL?: number;
    gasolineKgPerL?: number;
  };
};

export type OtherBlendDialogData = {
  blendSpec?: Partial<OtherBlendSpec>;
};

@Component({
  selector: 'app-other-blend-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './other-blend-dialog.component.html',
  styleUrls: ['./other-blend-dialog.component.scss'],
})
export class OtherBlendDialogComponent {
  dieselPct = 100;
  biodieselPct = 0;
  gasolinePct = 0;
  ethanolPct = 0;
  biodieselKgPerL = 0.87;
  ethanolKgPerL = 0.79;
  dieselKgPerL?: number;
  gasolineKgPerL?: number;

  constructor(
    private dialogRef: MatDialogRef<OtherBlendDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: OtherBlendDialogData
  ) {
    const spec = data?.blendSpec;
    if (spec) {
      this.dieselPct = spec.dieselPct ?? this.dieselPct;
      this.biodieselPct = spec.biodieselPct ?? this.biodieselPct;
      this.gasolinePct = spec.gasolinePct ?? this.gasolinePct;
      this.ethanolPct = spec.ethanolPct ?? this.ethanolPct;
      this.biodieselKgPerL = spec.density?.biodieselKgPerL ?? this.biodieselKgPerL;
      this.ethanolKgPerL = spec.density?.ethanolKgPerL ?? this.ethanolKgPerL;
      this.dieselKgPerL = spec.density?.dieselKgPerL ?? this.dieselKgPerL;
      this.gasolineKgPerL = spec.density?.gasolineKgPerL ?? this.gasolineKgPerL;
    }
  }

  get pctSum(): number {
    return Number(this.dieselPct || 0)
      + Number(this.biodieselPct || 0)
      + Number(this.gasolinePct || 0)
      + Number(this.ethanolPct || 0);
  }

  get isValid(): boolean {
    return Math.abs(this.pctSum - 100) <= 0.01;
  }

  normalizeTo100() {
    const values = [this.dieselPct, this.biodieselPct, this.gasolinePct, this.ethanolPct].map(v => Number(v || 0));
    const sum = values.reduce((s, v) => s + v, 0);
    if (sum <= 0) return;
    const scale = 100 / sum;
    this.dieselPct = Number((values[0] * scale).toFixed(2));
    this.biodieselPct = Number((values[1] * scale).toFixed(2));
    this.gasolinePct = Number((values[2] * scale).toFixed(2));
    this.ethanolPct = Number((values[3] * scale).toFixed(2));
  }

  applyPreset(dieselPct: number, biodieselPct: number, gasolinePct: number, ethanolPct: number) {
    this.dieselPct = dieselPct;
    this.biodieselPct = biodieselPct;
    this.gasolinePct = gasolinePct;
    this.ethanolPct = ethanolPct;
  }

  save() {
    if (!this.isValid) return;
    this.dialogRef.close({
      dieselPct: Number(this.dieselPct || 0),
      biodieselPct: Number(this.biodieselPct || 0),
      gasolinePct: Number(this.gasolinePct || 0),
      ethanolPct: Number(this.ethanolPct || 0),
      density: {
        biodieselKgPerL: Number(this.biodieselKgPerL || 0.87),
        ethanolKgPerL: Number(this.ethanolKgPerL || 0.79),
        dieselKgPerL: this.dieselKgPerL,
        gasolineKgPerL: this.gasolineKgPerL,
      },
    } as OtherBlendSpec);
  }
}
