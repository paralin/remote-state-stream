import {
  RemoteStreamBackend,
} from './remote-stream-backend';
import {
  Cursor,
  CursorType,
} from '@fusebot/state-stream';
import {
  IWindow,
  WindowState,
} from './window';
import {
  WindowStore,
} from './window-store';
import {
  Subscription,
} from 'rxjs/Subscription';
import {
  BehaviorSubject,
} from 'rxjs/BehaviorSubject';

export interface IRemoteCursorHandle {
  cursor: Cursor;
  ended: BehaviorSubject<any>;
  stop(): void;
}

export class RemoteStream {
  private backend: RemoteStreamBackend;
  private liveCursorPromise: Promise<IRemoteCursorHandle>;

  constructor(private windowStore: WindowStore) {
    this.backend = new RemoteStreamBackend(windowStore);
  }

  public get liveCursor(): Promise<IRemoteCursorHandle> {
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

  private async buildLiveCursor(): Promise<IRemoteCursorHandle> {
    // Initialize the live cursor.
    let cursor = new Cursor(this.backend, CursorType.WriteCursor);
    await cursor.init();
    let latestTimestamp = new Date(cursor.computedTimestamp.getTime());
    let subscriptions: Subscription[] = [];
    let endedSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);
    let clearSubs = () => {
      // Clear our old subscriptions
      for (let sub of subscriptions) {
        sub.unsubscribe();
      }
      subscriptions.length = 0;
    };
    let ended = false;
    let liveWindow: IWindow;
    let nextLiveWindow = async () => {
      clearSubs();
      if (ended) {
        return;
      }
      liveWindow = await this.backend.windowStore.buildWindow();
      subscriptions.push(liveWindow.state.subscribe((state) => {
        if (ended) {
          return;
        }
        if (state === WindowState.Committed) {
          nextLiveWindow().catch((err) => {
            if (ended) {
              return;
            }
            endedSubject.next(err);
          });
          return;
        }
        if (state === WindowState.Failed) {
          endedSubject.next(liveWindow.error.value || new Error('Window entered failed state.'));
          clearSubs();
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
    let endedSub = endedSubject.subscribe((err) => {
      if (!err) {
        return;
      }
      endedSub.unsubscribe();
      this.liveCursorPromise = null;
    });
    return {
      ended: endedSubject,
      stop: () => {
        ended = true;
        if (liveWindow) {
          liveWindow.dispose();
        }
      },
      cursor,
    };
  }
}
