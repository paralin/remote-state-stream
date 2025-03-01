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
import {
  WindowMultiplexerFactory,
} from './window-multiplexer';
import {
  WindowErrors,
} from './errors';

describe('WindowStore', () => {
  let store: WindowStore;
  let windowFactory: WindowMultiplexerFactory;

  beforeEach(() => {
    windowFactory = new WindowMultiplexerFactory([() => {
      return new MockWindow();
    }]);
    store = new WindowStore(windowFactory.getFactoryFcn());
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
      }, (err) => {
        expect(err.message).toBe(WindowErrors.GenericFailure().message);
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
      }, (err) => {
        expect(err.message).toBe(WindowErrors.GenericFailure().message);
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
      }, (err) => {
        expect(err.message).toBe(WindowErrors.GenericFailure().message);
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
      }, (err) => {
        expect(err.message).toBe(WindowErrors.GenericFailure().message);
        done();
      });
    });
  });

  afterEach(() => {
    // store.dispose();
  });
});
