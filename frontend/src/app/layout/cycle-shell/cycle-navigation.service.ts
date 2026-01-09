import { Injectable, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

import { TopbarSection, TOPBAR_DEFAULT_PATHS } from './navigation-config';

@Injectable({ providedIn: 'root' })
export class CycleNavigationService {
  private activeTopbar = signal<TopbarSection>('data-entry');
  private cycleId = signal<number | null>(null);
  private lastReported: TopbarSection = 'data-entry';

  constructor(private router: Router) {
    this.updateFromUrl(router.url);
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        const url = event?.urlAfterRedirects ?? event?.url ?? '';
        this.updateFromUrl(url);
      });
  }

  getActiveTopbar(): TopbarSection {
    return this.activeTopbar();
  }

  getCycleId(): number | null {
    return this.cycleId();
  }

  hasCycleId(): boolean {
    return this.getCycleId() !== null;
  }

  setActiveTopbar(section: TopbarSection): void {
    this.activeTopbar.set(section);
    this.lastReported = section;
  }

  resolveDefaultPath(section: TopbarSection): string {
    return TOPBAR_DEFAULT_PATHS[section];
  }

  buildLink(path: string): Array<string | number> {
    const id = this.getCycleId();
    if (!id) {
      return ['/cycles'];
    }
    const segments = path.split('/').filter(segment => segment.length > 0);
    return ['/cycles', id, ...segments];
  }

  private updateFromUrl(url: string): void {
    const match = /\/cycles\/(\d+)\b/.exec(url);
    const id = match ? Number(match[1]) : null;
    this.cycleId.set(Number.isFinite(id) ? id : null);

    const section = this.detectTopbar(url);
    this.activeTopbar.set(section);
    this.lastReported = section;
  }

  private detectTopbar(url: string): TopbarSection {
    const normalized = (url ?? '').toLowerCase();
    if (/\/cycles\/\d+\/data-reference/.test(normalized)) {
      return 'data-reference';
    }
    if (/\/cycles\/\d+\/(dashboard|scope-dashboard)/.test(normalized)) {
      return 'dashboard';
    }
    if (/\/cycles\/\d+\//.test(normalized)) {
      return 'data-entry';
    }
    return this.lastReported;
  }
}
