import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, distinctUntilChanged, finalize, from, map, of, Observable, Subject, shareReplay, startWith, switchMap, tap, catchError } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { CanonicalGhgService } from '../../../core/services/canonical-ghg.service';
import { CycleApiService } from '../../../core/services/cycle-api.service';
import { CycleStateService } from '../../../core/services/cycle-state.service';
import { DataEntryDoc, DataEntryService } from '../../../core/services/data-entry.service';
import { EntryRow } from '../../../models/entry-row.model';
import { EvidenceModel } from '../../../models/evidence.model';
import { EvidenceBlockComponent } from '../../../shared/components/evidence-block/evidence-block.component';
import { Scope12MobileComponent } from '../../data-entry/scope12-mobile/scope12-mobile.component';

@Component({
  selector: 'app-cfo-scope1-mobile',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatDividerModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    Scope12MobileComponent,
    EvidenceBlockComponent,
  ],
  templateUrl: './cfo-scope1-mobile.component.html',
  styleUrls: ['./cfo-scope1-mobile.component.scss'],
})
export class CfoScope1MobileComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  cycleId = 0;
  readonly cycleId$: Observable<number>;
  private readonly reload$ = new Subject<void>();

  loading = true;
  saving = false;
  error: string | null = null;

  rows: EntryRow[] = [];
  evidenceModel: EvidenceModel = { notes: [], tables: [], images: [] };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cycleState: CycleStateService,
    private entrySvc: DataEntryService,
    private canonicalSvc: CanonicalGhgService,
    private cycleApi: CycleApiService,
  ) {
    this.cycleId$ = this.route.paramMap.pipe(
      map(params => Number(params.get('cycleId') || 0)),
      distinctUntilChanged(),
      switchMap(routeId =>
        from(this.cycleState.resolveCycleId(routeId)).pipe(
          catchError(() => of(routeId)),
          tap(resolvedId => {
            if (routeId !== resolvedId) {
              Promise.resolve().then(() => {
                this.router.navigate(['/cycles', resolvedId, 'cfo', 'scope1-mobile'], { replaceUrl: true });
              });
            }
          })
        )
      ),
      distinctUntilChanged(),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  ngOnInit(): void {
    combineLatest([this.cycleId$, this.reload$.pipe(startWith(undefined))])
      .pipe(
        switchMap(([cycleId]) => this.loadDraft$(cycleId)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  reload(): void {
    this.reload$.next();
  }

  onRowsChange(rows: EntryRow[]): void {
    this.rows = rows ?? [];
    this.persistDraft();
  }

  onEvidenceChange(model: EvidenceModel): void {
    this.evidenceModel = model ?? { notes: [], tables: [], images: [] };
    this.persistDraft();
  }

  async saveAndSync(cycleId: number): Promise<void> {
    if (!cycleId) return;

    this.saving = true;
    this.error = null;
    try {
      this.persistDraft();
      const canonical = this.canonicalSvc.build(cycleId);
      const updateResult = await this.cycleApi.updateCycleData(cycleId, canonical);
      if (updateResult.cycleId !== cycleId) {
        this.cycleId = updateResult.cycleId;
        this.router.navigate(['/cycles', updateResult.cycleId, 'cfo', 'scope1-mobile'], { replaceUrl: true });
      }
      alert('Saved โ… (synced to backend)');
    } catch (error: any) {
      console.error('Save sync failed', error);
      this.error = error?.message || 'Sync failed';
      alert('Saved locally เนเธ•เน sync เนเธ backend เนเธกเนเธชเธณเน€เธฃเนเธ');
    } finally {
      this.saving = false;
    }
  }

  private loadDraft$(cycleId: number) {
    if (!cycleId) {
      this.loading = false;
      return of(undefined);
    }

    this.loading = true;
    this.error = null;

    return of(null).pipe(
      tap(() => {
        this.cycleId = cycleId;
        const doc = this.entrySvc.load(cycleId);
        const scope1 = Array.isArray(doc?.scope1) ? doc?.scope1 : [];
        this.rows = scope1.filter(r => r.categoryCode === '1.2');
        this.evidenceModel = doc?.evidence?.['S1::1.2'] ?? { notes: [], tables: [], images: [] };
      }),
      catchError((err: any) => {
        console.error('Load draft failed', err);
        this.error = err?.message || 'Load failed';
        return of(undefined);
      }),
      finalize(() => {
        this.loading = false;
      })
    );
  }

  private persistDraft(): void {
    const existing: DataEntryDoc = this.entrySvc.load(this.cycleId) ?? {
      cycleId: this.cycleId,
      scope1: [],
      scope2: [],
      scope3: [],
    };

    const otherScope1Rows = (existing.scope1 ?? []).filter(r => r.categoryCode !== '1.2');
    const evidence = { ...(existing.evidence ?? {}), ['S1::1.2']: this.evidenceModel };

    this.entrySvc.save(this.cycleId, {
      ...existing,
      cycleId: this.cycleId,
      scope1: [...this.rows, ...otherScope1Rows],
      evidence,
    });
  }
}
