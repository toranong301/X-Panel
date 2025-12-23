import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Fr031 } from './fr03-1';

describe('Fr031', () => {
  let component: Fr031;
  let fixture: ComponentFixture<Fr031>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Fr031]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Fr031);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
