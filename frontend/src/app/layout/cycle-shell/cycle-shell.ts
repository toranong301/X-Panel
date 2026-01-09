import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { CycleTopbarComponent } from './cycle-topbar';
import { Sidebar } from '../sidebar/sidebar';

@Component({
  selector: 'app-cycle-shell',
  standalone: true,
  imports: [RouterOutlet, CycleTopbarComponent, Sidebar],
  templateUrl: './cycle-shell.html',
  styleUrls: ['./cycle-shell.scss'],
})
export class CycleShellComponent {}
