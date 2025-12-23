import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExportLock } from './export-lock';

describe('ExportLock', () => {
  let component: ExportLock;
  let fixture: ComponentFixture<ExportLock>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExportLock]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExportLock);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
