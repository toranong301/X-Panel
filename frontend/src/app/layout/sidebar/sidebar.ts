import { CommonModule } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { MenuItem, SIDEBAR_MENU } from '../cycle-shell/navigation-config';
import { CycleNavigationService } from '../cycle-shell/cycle-navigation.service';
import { CycleApiService, DashboardSection } from '../../core/services/cycle-api.service';

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

  readonly dashboardSections = signal<DashboardSection[]>([]);
  readonly sectionsLoading = signal(false);
  private loadSeq = 0;

  constructor(
    private nav: CycleNavigationService,
    private cycleApi: CycleApiService,
  ) {
    effect(() => {
      const cycleId = this.nav.getCycleId();
      if (!cycleId) {
        this.dashboardSections.set([]);
        return;
      }
      void this.loadDashboardSections(cycleId);
    });
  }

  hasCycle(): boolean {
    return this.nav.hasCycleId();
  }

  linkPath(path?: string): Array<string | number> {
    if (!path) {
      return ['/cycles', this.nav.getCycleId() ?? ''];
    }
    return this.nav.buildLink(path);
  }

  linkForSection(sectionId: string): Array<string | number> {
    const id = String(sectionId || '').trim();
    if (!id) return this.linkPath();

    if (id === '1.1') return this.linkPath('cfo/scope1-stationary');
    if (id === '1.2') return this.linkPath('cfo/scope1-mobile');
    if (id === '1.3') return this.linkPath('placeholder/scope1-3');
    if (id === '1.4.1' || id === '1.4.2' || id === '1.4.3' || id === '1.4.4' || id === '1.4.5') {
      return this.linkPath(`cfo/scope1-fugitive/${id}`);
    }
    if (id === '1.4') return this.linkPath('cfo/scope1-fugitive');
    if (id === '1.5') return this.linkPath('placeholder/scope1-5');
    if (id === '2.1') return this.linkPath('cfo/scope2-electricity');
    if (id === '2.2') return this.linkPath('placeholder/scope2-2');
    if (id.startsWith('3.')) return this.linkPath(`cfo/scope3/${id}`);

    return this.linkPath();
  }

  badgeText(section: DashboardSection): string {
    const status = section.status;
    if (!status) return '';
    if (!status.hasData) return '';

    const missing = Number(status.missingEvidenceCount || 0) + Number(status.missingEfCount || 0);
    if (missing <= 0) return 'OK';
    return `!${missing}`;
  }

  private async loadDashboardSections(cycleId: number): Promise<void> {
    const seq = ++this.loadSeq;
    this.sectionsLoading.set(true);
    try {
      const sections = await this.cycleApi.getDashboardSections(cycleId);
      if (seq !== this.loadSeq) return;
      this.dashboardSections.set(sections ?? []);
    } catch {
      if (seq !== this.loadSeq) return;
      this.dashboardSections.set([]);
    } finally {
      if (seq === this.loadSeq) {
        this.sectionsLoading.set(false);
      }
    }
  }
}
