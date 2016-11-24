import {
  WindowMultiplexer,
} from './window-multiplexer';
import {
  mockTime,
} from './mock/time';
import {
  MockWindow,
} from './mock/mock-window';
import {
  WindowState,
} from './window';
import {
  WindowErrors,
} from './errors';

describe('WindowMultiplexer', () => {
  let multi: WindowMultiplexer;

  beforeEach(() => {
    multi = new WindowMultiplexer([{
      identifier: '0',
      factory: () => {
        return new MockWindow(100);
      },
    }]);
  });

  it('should fetch meta from mid timestamp properly', (done) => {
    multi.state.subscribe((state) => {
      expect(state).toBeLessThanOrEqual(WindowState.Waiting);
      if (state === WindowState.Waiting) {
        expect(multi.meta.value).not.toBe(null);
        done();
      }
    }, (err) => {
      expect(err.message).toBe(WindowErrors.GenericFailure().message);
    });
    multi.initWithMidTimestamp(mockTime(-5));
  });

  it('should add a factory properly', (done) => {
    let secondWindow = new MockWindow(1);
    // within the 100ms we should be able to...
    multi.initWithMidTimestamp(mockTime(-5));
    let metaAssertion = false;
    multi.meta.subscribe((meta) => {
      if (!meta) {
        return;
      }
      expect(meta).toBe(secondWindow.meta.value);
      metaAssertion = true;
    });
    multi.addFactory({
      identifier: '1',
      factory: () => {
        return secondWindow;
      },
    });
    setTimeout(() => {
      expect(metaAssertion).toBe(true);
      done();
    }, 150);
  });

  it('should wait for a factory', (done) => {
    multi = new WindowMultiplexer();
    multi.initWithMidTimestamp(mockTime(-5));
    setTimeout(() => {
      expect(multi.state.value).toBe(WindowState.Pending);
      done();
    }, 100);
  });

  it('should init live properly', (done) => {
    multi.initLive();
    multi.state.subscribe((state) => {
      if (state === WindowState.Waiting) {
        multi.activate();
      }
      if (state === WindowState.Live) {
        done();
      }
    }, (err) => {
      expect(err.message).toBe(WindowErrors.GenericFailure().message);
    });
  });

  it('should activate automatically', (done) => {
    multi.activate();
    multi.initLive();
    multi.state.subscribe((state) => {
      if (state === WindowState.Live) {
        done();
      }
    });
  });

  it('should pull data correctly', (done) => {
    multi.initWithMidTimestamp(mockTime(-5));
    multi.state.subscribe((state) => {
      if (state === WindowState.Waiting) {
        multi.activate();
      }
      if (state === WindowState.Committed) {
        done();
      }
    }, (err) => {
      expect(err.message).toBe(WindowErrors.GenericFailure().message);
    });
  });

  afterEach(() => {
    if (multi) {
      /*
      try {
        multi.dispose();
      } catch (e) {
        //
      }
      */
      multi = null;
    }
  });
});
