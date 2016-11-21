import {
  RemoteStreamBackend,
} from './remote-stream-backend';
import {
  Cursor,
  CursorType,
} from '@fusebot/state-stream';
import {
  WindowState,
} from './window';
import {
  WindowStore,
} from './window-store';
import {
  Subscription,
} from 'rxjs/Subscription';

export class RemoteStream {
  private backend: RemoteStreamBackend;
  private liveCursorPromise: Promise<Cursor>;

  constructor(private windowStore: WindowStore) {
    this.backend = new RemoteStreamBackend(windowStore);
  }

  public get liveCursor(): Promise<Cursor> {
    if (!this.liveCursorPromise) {
      this.liveCursorPromise = this.buildLiveCursor();
      this.liveCursorPromise.catch(() => {
        this.liveCursorPromise = null;
      });
    }
    return this.liveCursorPromise;
  }

  public buildCursor(cursorType: CursorType) {
    if (cursorType === CursorType.WriteCursor) {
      throw new Error('Use liveCursor to get a write cursor.');
    }
    return new Cursor(this.backend, cursorType);
  }

  public dispose() {
    this.backend.dispose();
  }

  private async buildLiveCursor(): Promise<Cursor> {
    // Initialize the live cursor.
    let cursor = new Cursor(this.backend, CursorType.WriteCursor);
    await cursor.init();
    let latestTimestamp = new Date(cursor.computedTimestamp.getTime());
    let subscriptions: Subscription[] = [];
    let nextLiveWindow = async () => {
      // Clear our old subscriptions
      for (let sub of subscriptions) {
        sub.unsubscribe();
      }
      subscriptions.length = 0;

      let liveWindow = await this.backend.windowStore.buildWindow();
      subscriptions.push(liveWindow.state.subscribe((state) => {
        if (state === WindowState.Failed ||
            state === WindowState.OutOfRange ||
            state === WindowState.Committed) {
          nextLiveWindow();
          return;
        }
      }));
      subscriptions.push(liveWindow.data.entryAdded.subscribe((entry) => {
        if (liveWindow.state.value !== WindowState.Live) {
          return;
        }
        if (entry.timestamp.getTime() <= latestTimestamp.getTime()) {
          return;
        }
        latestTimestamp = new Date(entry.timestamp.getTime());
        cursor.handleEntry(entry);
      }));
    };
    // Grab a live window. When the window becomes committed, do it again.
    await nextLiveWindow();
    return cursor;
  }
}
