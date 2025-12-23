import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { Router } from '@angular/router';
import { CreateCycleDialogComponent } from './create-cycle-dialog/create-cycle-dialog';

@Component({
  selector: 'app-cycles',
  standalone: true,
  imports: [MatTableModule, MatButtonModule, MatIconModule],
  templateUrl: './cycles.html',
  styleUrls: ['./cycles.scss'],
})
export class CyclesComponent {
  displayedColumns = ['name', 'baseYear', 'status', 'actions'];

  cycles = [
    { id: 1, name: 'GHG Inventory 2024', baseYear: 2023, status: 'Draft' },
    { id: 2, name: 'GHG Inventory 2025', baseYear: 2024, status: 'Locked' },
  ];

  constructor(
    private dialog: MatDialog,
    private router: Router
  ) {}

  createCycle() {
    const ref = this.dialog.open(CreateCycleDialogComponent, {
      width: '400px',
    });

    ref.afterClosed().subscribe(result => {
      if (!result) return;

      const newId =
        this.cycles.length > 0
          ? Math.max(...this.cycles.map(c => c.id)) + 1
          : 1;

      const newCycle = {
        id: newId,
        name: result.name!,
        baseYear: result.baseYear!,
        status: 'Draft' as const,
      };

      this.cycles = [...this.cycles, newCycle];

      // 🎯 Auto-Navigate
      this.router.navigate(['/cycles', newId, 'data-entry']);
    });
  }
  openCycle(cycle: { id: number }) {
  this.router.navigate(['/cycles', cycle.id, 'data-entry']);
}

goFr01(c: { id: number }) {
  this.router.navigate(['/cycles', c.id, 'fr01']);
}
goFr02(c: { id: number }) {
  this.router.navigate(['/cycles', c.id, 'fr02']);
}
goFr031(c: { id: number }) {
  this.router.navigate(['/cycles', c.id, 'fr03-1']);
}
goFr032(c: { id: number }) {
  this.router.navigate(['/cycles', c.id, 'fr03-2']);
}
goScreenScope3(c: { id: number }) {
  this.router.navigate(['/cycles', c.id, 'scope3-screen']);
}




}
