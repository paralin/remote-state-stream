import {
  WindowStore,
} from './window-store';
import {
  WindowState,
} from './window';
import {
  mockTime,
} from './mock/time';
import {
  MockWindow,
} from './mock/mock-window';

describe('WindowStore', () => {
  let store: WindowStore;

  beforeEach(() => {
    store = new WindowStore(() => {
      return new MockWindow();
    });
  });

  it('should fetch the beginning set', (done) => {
    store.buildWindow(mockTime(-7)).then((window) => {
      window.state.subscribe((state) => {
        if (state === WindowState.Waiting) {
          expect(window.meta.value.startBound).toEqual(mockTime(-10));
          window.activate();
        }
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
        if (state === WindowState.Waiting) {
          window.activate();
        }
        if (state === WindowState.Committed) {
          committedComplete = true;
        }
      });
    });
    store.buildWindow(mockTime(-8)).then((window) => {
      window.state.subscribe((state) => {
        if (state === WindowState.Waiting) {
          window.activate();
        }
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
        if (state === WindowState.Waiting) {
          window.activate();
        }
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
