import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Cycles } from './cycles';

describe('Cycles', () => {
  let component: Cycles;
  let fixture: ComponentFixture<Cycles>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Cycles]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Cycles);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
