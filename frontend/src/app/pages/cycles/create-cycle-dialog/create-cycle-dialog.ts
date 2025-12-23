import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-create-cycle-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './create-cycle-dialog.html',
  styleUrls: ['./create-cycle-dialog.scss'],
})
export class CreateCycleDialogComponent {
  form;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateCycleDialogComponent>
  ) {
    this.form = this.fb.group({
      name: ['', Validators.required],
      baseYear: [new Date().getFullYear() - 1, Validators.required],
    });
  }

  save() {
    if (this.form.valid) {
      this.dialogRef.close(this.form.value);
    }
  }

  cancel() {
    this.dialogRef.close();
  }
}

