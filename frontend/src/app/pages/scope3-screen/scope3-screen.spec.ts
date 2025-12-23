import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Scope3Screen } from './scope3-screen';

describe('Scope3Screen', () => {
  let component: Scope3Screen;
  let fixture: ComponentFixture<Scope3Screen>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Scope3Screen]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Scope3Screen);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
