import {
  WindowStore,
} from './window-store';
import {
  WindowState,
} from './window';
import {
  MockViewService,
} from './mock/service';
import {
  mockTime,
} from './mock/time';

describe('WindowStore', () => {
  let store: WindowStore;
  let mockService: MockViewService;

  beforeEach(() => {
    mockService = new MockViewService();
    store = new WindowStore(<any>mockService, {});
  });

  it('should fetch the beginning set', (done) => {
    store.buildWindow(mockTime(-7)).then((window) => {
      window.state.subscribe((state) => {
        if (state === WindowState.Committed) {
          done();
        }
      });
    });
  });

  it('should deduplicate windows', (done) => {
    let committedComplete = false;
    store.buildWindow(mockTime(-7)).then((window) => {
      window.state.subscribe((state) => {
        if (state === WindowState.Committed) {
          committedComplete = true;
        }
      });
    });
    store.buildWindow(mockTime(-8)).then((window) => {
      window.state.subscribe((state) => {
        if (state === WindowState.Committed) {
          expect(committedComplete).toBe(true);
          done();
        }
      });
    });
  });

  it('should reject in-progress windows', (done) => {
    store.buildWindow(mockTime(20)).then((window) => {
      window.state.subscribe((state) => {
        // call start to trigger else path of started
        window.start();
        if (state === WindowState.Pulling) {
          window.dispose();
          // call twice to hit line checking isDisposed
          window.dispose();
        }
        if (state === WindowState.Failed) {
          done();
        }
      });
    });
  });

  afterEach(() => {
    store.dispose();
  });
});
