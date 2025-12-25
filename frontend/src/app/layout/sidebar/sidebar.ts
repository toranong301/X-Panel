import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs/operators';

type NavItem = { label: string; path: string };

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.scss'],
})
export class Sidebar {
  readonly currentCycleId = signal<number | null>(null);

  readonly cycleLinks = computed<NavItem[]>(() => {
    const id = this.currentCycleId();
    if (!id) return [];
    return [
      { label: 'Data Entry (Scope 1)', path: `/cycles/${id}/data-entry` },
      { label: 'FR-01 ข้อมูลองค์กร', path: `/cycles/${id}/fr01` },
      { label: 'FR-02 แผนผังองค์กร', path: `/cycles/${id}/fr02` },
      { label: 'FR-03.1 โครงสร้างองค์กร', path: `/cycles/${id}/fr03-1` },
      { label: 'Screen Scope 3', path: `/cycles/${id}/scope3-screen` },
      { label: 'FR-03.2 วิเคราะห์สาระสำคัญ', path: `/cycles/${id}/fr03-2` },
      { label: 'FR-04.1 สรุปผล', path: `/cycles/${id}/fr04-1` },
      { label: 'V-Sheet', path: `/cycles/${id}/vsheet-editor` },
    ];
  });

  constructor(private router: Router) {
    this.syncFromUrl(router.url);

    router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => this.syncFromUrl(e?.urlAfterRedirects ?? e?.url ?? ''));
  }

  private syncFromUrl(url: string) {
    const m = String(url || '').match(/\/cycles\/(\d+)\b/);
    if (m?.[1]) {
      const id = Number(m[1]);
      this.currentCycleId.set(Number.isFinite(id) ? id : null);
      try {
        localStorage.setItem('xpanel:lastCycleId', String(id));
      } catch {
        // ignore
      }
      return;
    }

    // fallback: last cycle
    try {
      const saved = localStorage.getItem('xpanel:lastCycleId');
      if (saved) {
        const id = Number(saved);
        this.currentCycleId.set(Number.isFinite(id) ? id : null);
      }
    } catch {
      // ignore
    }
  }
}
