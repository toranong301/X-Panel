import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Fr02 } from './fr02';

describe('Fr02', () => {
  let component: Fr02;
  let fixture: ComponentFixture<Fr02>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Fr02]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Fr02);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
