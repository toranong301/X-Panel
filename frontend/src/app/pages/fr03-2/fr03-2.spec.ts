import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Fr032Component } from './fr03-2';

describe('Fr032Component', () => {
  let component: Fr032Component;
  let fixture: ComponentFixture<Fr032Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Fr032Component]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Fr032Component);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
