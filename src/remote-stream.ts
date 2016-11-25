import { RemoteStreamBackend } from './remote-stream-backend';
import {
  Cursor,
  CursorType,
  StreamEntry,
} from '@fusebot/state-stream';
import {
  WindowState,
} from './window';
import { WindowStore } from './window-store';
import { Subject } from 'rxjs/Subject';
import { Subscription } from 'rxjs/Subscription';
import { Subscriber } from 'rxjs/Subscriber';

export class RemoteStream {
  private backend: RemoteStreamBackend;
  private liveCursor: Cursor;
  private liveCursorSubscribers: { [identifier: string]: Subscriber<Cursor> } = {};
  private liveCursorSubscriberCounter = 0;
  private liveCursorSubscriptions: Subscription[] = [];

  constructor(private windowStore: WindowStore) {
    this.backend = new RemoteStreamBackend(windowStore);
  }

  public buildCursor(cursorType: CursorType) {
    if (cursorType === CursorType.WriteCursor) {
      throw new Error('Use liveCursor to get a write cursor.');
    }
    return new Cursor(this.backend, cursorType);
  }

  // Request a live cursor.
  public liveSubscribe(next: (cursor: Cursor) => void,
                       error?: (e?: any) => void): Subscription {
    let sub = Subscriber.create<Cursor>(next, error);
    let identifier = this.liveCursorSubscriberCounter++ + '';
    this.liveCursorSubscribers[identifier] = sub;
    sub.add(() => {
      delete this.liveCursorSubscribers[identifier];
      this.procLiveCursor();
    });
    this.procLiveCursor();
    return sub;
  }

  public dispose() {
    this.backend.dispose();
  }

  // Check if we need to start/stop the live cursor mechanism.
  private procLiveCursor() {
    let haveLiveCursor = !!Object.keys(this.liveCursorSubscribers).length;
    if (haveLiveCursor && !this.liveCursor) {
      this.initLiveCursor();
    }
    if (this.liveCursor && !haveLiveCursor) {
      this.terminateLiveCursor(new Error('No subscribers remain.'));
    }
  }

  private pushLiveCursor(cursor: Cursor) {
    this.liveCursor = cursor;
    for (let id in this.liveCursorSubscribers) {
      if (!this.liveCursorSubscribers.hasOwnProperty(id) ||
          this.liveCursorSubscribers[id].closed) {
        continue;
      }
      this.liveCursorSubscribers[id].next(cursor);
    }
  }

  private terminateLiveCursor(err?: any) {
    this.liveCursor = null;
    for (let id of Object.keys(this.liveCursorSubscribers)) {
      if (!this.liveCursorSubscribers.hasOwnProperty(id) ||
          this.liveCursorSubscribers[id].closed) {
        continue;
      }
      if (err) {
        this.liveCursorSubscribers[id].error(err);
      } else {
        this.liveCursorSubscribers[id].complete();
      }
      delete this.liveCursorSubscribers[id];
    }
    this.liveCursorSubscriberCounter = 0;
    this.clearLiveCursorSubscriptions();
  }

  private clearLiveCursorSubscriptions() {
    for (let sub of this.liveCursorSubscriptions) {
      if (sub && !sub.closed) {
        sub.unsubscribe();
      }
    }
    this.liveCursorSubscriptions.length = 0;
  }

  private initLiveCursor() {
    let cursor = new Cursor(this.backend, CursorType.WriteCursor);
    this.pushLiveCursor(cursor);
    cursor.init().then(() => {
      this.guardedNextLiveWindow();
    }).catch((err) => {
      this.terminateLiveCursor(err);
    });
  }

  private async guardedNextLiveWindow(): Promise<void> {
    this.clearLiveCursorSubscriptions();
    if (!this.liveCursor) {
      return;
    }
    try {
      await this.nextLiveWindow();
    } catch (e) {
      this.terminateLiveCursor(e);
    }
  }

  private async nextLiveWindow(): Promise<void> {
    if (!this.liveCursor) {
      return;
    }
    let window = await this.windowStore.buildWindowWithState(null, WindowState.Waiting);
    // Create a subject for the replay.
    let replaySubject = new Subject<StreamEntry>();
    // Create a general subject we will use for new data.
    let dataSubject = new Subject<StreamEntry>();

    // Handle any new incoming entries in correct order here.
    this.liveCursorSubscriptions.push(dataSubject.subscribe((nextEntry) => {
      if (nextEntry.timestamp.getTime() <= this.liveCursor.computedTimestamp.getTime()) {
        return;
      }
      this.liveCursor.handleEntry(nextEntry);
    }, (err) => {
      this.terminateLiveCursor(err);
    }, () => {
      this.guardedNextLiveWindow();
    }));

    this.liveCursorSubscriptions.push(replaySubject.subscribe((data) => {
      dataSubject.next(data);
    }, (err) => {
      dataSubject.error(err);
    }, () => {
      this.liveCursorSubscriptions.push(window.data.entryAdded.subscribe((entry) => {
        dataSubject.next(entry);
      }, (err) => {
        dataSubject.error(err);
      }, () => {
        dataSubject.complete();
      }));
      this.liveCursorSubscriptions.push(window.state.subscribe((state) => {
        if (state === WindowState.Waiting) {
          window.activate();
        } else if (state === WindowState.Committed) {
          this.guardedNextLiveWindow();
        }
      }, (err) => {
        this.terminateLiveCursor(err);
      }));
    }));

    window.data.replayEntries(replaySubject);
  }
}
