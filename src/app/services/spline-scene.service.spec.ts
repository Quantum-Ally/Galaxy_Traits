import { TestBed } from '@angular/core/testing';

import { SplineSceneService } from './spline-scene.service';

describe('SplineSceneService', () => {
  let service: SplineSceneService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SplineSceneService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
