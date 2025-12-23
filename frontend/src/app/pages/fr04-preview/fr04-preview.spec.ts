import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Fr04Preview } from './fr04-preview';

describe('Fr04Preview', () => {
  let component: Fr04Preview;
  let fixture: ComponentFixture<Fr04Preview>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Fr04Preview]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Fr04Preview);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
