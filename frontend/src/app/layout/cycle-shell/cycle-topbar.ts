import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { CycleNavigationService } from './cycle-navigation.service';
import { TOPBAR_ITEMS } from './navigation-config';

@Component({
  selector: 'app-cycle-topbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './cycle-topbar.html',
  styleUrls: ['./cycle-topbar.scss'],
})
export class CycleTopbarComponent {
  readonly items = TOPBAR_ITEMS;

  constructor(public nav: CycleNavigationService) {}

  buildLink(path: string): Array<string | number> {
    return this.nav.buildLink(path);
  }

  isActive(key: string): boolean {
    return this.nav.getActiveTopbar() === key;
  }

  handleClick(): void {
    if (!this.nav.hasCycleId()) {
      this.nav.setActiveTopbar(this.nav.getActiveTopbar());
    }
  }
}
