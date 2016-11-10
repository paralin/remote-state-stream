import {
  RemoteStreamBackend,
} from './remote-stream-backend';
import {
  MockViewService,
} from './mock/service';
import {
  mockTime,
} from './mock/time';
import {
  Cursor,
  CursorType,
  NoDataError,
} from '@fusebot/state-stream';

describe('RemoteStreamBackend', () => {
  let remoteStream: RemoteStreamBackend;
  let mockService: MockViewService;
  let cursor: Cursor;

  beforeEach(() => {
    mockService = new MockViewService();
    remoteStream = new RemoteStreamBackend(<any>mockService, {});
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
