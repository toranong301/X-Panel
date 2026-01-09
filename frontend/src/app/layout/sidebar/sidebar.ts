import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { MenuItem, SIDEBAR_MENU } from '../cycle-shell/navigation-config';
import { CycleNavigationService } from '../cycle-shell/cycle-navigation.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.scss'],
})
export class Sidebar {
  readonly menuItems = computed<MenuItem[]>(() => {
    const section = this.nav.getActiveTopbar();
    return SIDEBAR_MENU[section] ?? [];
  });

  constructor(private nav: CycleNavigationService) {}

  hasCycle(): boolean {
    return this.nav.hasCycleId();
  }

  linkPath(path?: string): Array<string | number> {
    if (!path) {
      return ['/cycles', this.nav.getCycleId() ?? ''];
    }
    return this.nav.buildLink(path);
  }
}
