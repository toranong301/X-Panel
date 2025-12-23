import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DataEntry } from './data-entry';

describe('DataEntry', () => {
  let component: DataEntry;
  let fixture: ComponentFixture<DataEntry>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataEntry]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DataEntry);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
