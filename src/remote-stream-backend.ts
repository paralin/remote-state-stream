import {
  IStorageBackend,
  StreamEntry,
  StreamEntryType,
} from '@fusebot/state-stream';
import {
  Subscription,
} from 'rxjs/Subscription';
import {
  WindowStore,
} from './window-store';
import {
  IWindow,
  WindowState,
} from './window';
import {
  toPromise,
} from './util';

export class RemoteStreamBackend implements IStorageBackend {
  constructor(public windowStore: WindowStore) {
  }

  // Builds a window not in pending state.
  public async resolveWindowForTimestamp(timestamp: Date): Promise<IWindow> {
    let window = await this.windowStore.buildWindow(timestamp);
    return new Promise<IWindow>((resolve, reject) => {
      let sub: Subscription;
      let failedSub: Subscription;
      let clearSub = () => {
        if (sub) {
          sub.unsubscribe();
        }
        if (failedSub) {
          failedSub.unsubscribe();
        }
      };
      sub = window.state.subscribe((state) => {
        if (state === WindowState.Waiting) {
          window.activate();
        }
        // todo: handle failed state here?
        if (state === WindowState.Committed || state === WindowState.Live) {
          clearSub();
          resolve(window);
          return;
        }
      });
      failedSub = window.error.subscribe((err: any) => {
        if (!err) {
          return;
        }
        clearSub();
        reject(err);
      });
    });
  }

  public async getSnapshotBefore(timestamp: Date): Promise<StreamEntry> {
    let window = await this.resolveWindowForTimestamp(timestamp);
    return toPromise<StreamEntry>(window.data.getSnapshotBefore(timestamp));
  }

  public async getEntryAfter(timestamp: Date, filterType: StreamEntryType): Promise<StreamEntry> {
    let window = await this.resolveWindowForTimestamp(timestamp);
    return toPromise<StreamEntry>(window.data.getEntryAfter(timestamp, filterType));
  }

  public saveEntry(entry: StreamEntry) {
    // throw new Error('Cannot save to remote streams.');
  }

  public amendEntry(entry: StreamEntry, oldTimestamp: Date) {
    // throw new Error('Cannot save to remote streams.');
  }

  public dispose() {
    this.windowStore.dispose();
  }
}
