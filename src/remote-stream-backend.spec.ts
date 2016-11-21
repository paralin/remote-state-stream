import {
  RemoteStreamBackend,
} from './remote-stream-backend';
import {
  MockWindow,
} from './mock/mock-window';
import {
  mockTime,
} from './mock/time';
import {
  Cursor,
  CursorType,
  NoDataError,
} from '@fusebot/state-stream';
import {
  WindowStore,
} from './window-store';

describe('RemoteStreamBackend', () => {
  let windowStore: WindowStore;
  let remoteStream: RemoteStreamBackend;
  let cursor: Cursor;

  beforeEach(() => {
    windowStore = new WindowStore(() => {
      return new MockWindow();
    });
    remoteStream = new RemoteStreamBackend(windowStore);
    cursor = new Cursor(remoteStream, CursorType.ReadBidirectionalCursor);
  });

  it('should calculate state properly', async () => {
    await cursor.init(mockTime(-7.5));
    await cursor.computeState();
    expect(cursor.isReady).toBe(true);
    expect(cursor.state).toEqual({
      test: 3,
    });
  });

  it('should handle out of range properly', async () => {
    let err: any;
    try {
      await cursor.init(mockTime(-50));
      await cursor.computeState();
    } catch (e) {
      err = e;
    }
    expect(cursor.isReady).toBe(false);
    expect(err).toBe(NoDataError);
  });
});
