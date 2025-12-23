import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateCycleDialog } from './create-cycle-dialog';

describe('CreateCycleDialog', () => {
  let component: CreateCycleDialog;
  let fixture: ComponentFixture<CreateCycleDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateCycleDialog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateCycleDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
