import {
  Window,
  WindowState,
} from './window';
import {
  MockViewService,
} from './mock/service';
import {
  mockTime,
} from './mock/time';

describe('Window', () => {
  let window: Window;
  let mockService: MockViewService;

  beforeEach(() => {
    mockService = new MockViewService();
    window = null;
  });

  it('should fetch the beginning set', (done) => {
    window = new Window(<any>mockService, {}, mockTime(-7));
    window.state.subscribe((state) => {
      if (state === WindowState.Committed) {
        done();
      }
    });
    window.start();
  });

  it('should handle a live set', (done) => {
    window = new Window(<any>mockService, {}, mockTime(0));
    let hitLive: boolean;
    window.state.subscribe((state) => {
      if (state === WindowState.Live) {
        hitLive = true;
      } else if (state === WindowState.Committed) {
        expect(hitLive).toBe(true);
        expect(window.data.dataset.length).toBe(5);
        done();
      }
    });
    window.start();
  });

  it('should handle out of range', (done) => {
    window = new Window(<any>mockService, {}, mockTime(-50));
    window.state.subscribe((state) => {
      if (state === WindowState.OutOfRange) {
        done();
      }
    });
    window.start();
  });
});
