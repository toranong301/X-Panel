import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Fr032 } from './fr03-2';

describe('Fr032', () => {
  let component: Fr032;
  let fixture: ComponentFixture<Fr032>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Fr032]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Fr032);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
