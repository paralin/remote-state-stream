import {
  IStorageBackend,
  StreamEntry,
  StreamEntryType,
} from '@fusebot/state-stream';
import {
  IStateContext,
} from '@fusebot/fusecloud-common';
import {
  Subscription,
} from 'rxjs/Subscription';
import {
  WindowStore,
} from './window-store';
import {
  Window,
  WindowState,
} from './window';
import {
  IServiceHandle,
} from 'grpc-bus';

export class RemoteStreamBackend implements IStorageBackend {
  public windowStore: WindowStore;

  constructor(private serviceHandle: IServiceHandle,
              private streamContext: IStateContext) {
    this.windowStore = new WindowStore(serviceHandle, streamContext);
  }

  // Builds a window not in pending state.
  public async resolveWindowForTimestamp(timestamp: Date): Promise<Window> {
    let window = await this.windowStore.buildWindow(timestamp);
    return new Promise<Window>((resolve, reject) => {
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
        if (state > WindowState.Pending) {
          clearSub();
          resolve(window);
          return;
        }
      });
      failedSub = window.failed.subscribe((err: any) => {
        clearSub();
        reject(err);
      });
    });
  }

  public async getSnapshotBefore(timestamp: Date): Promise<StreamEntry> {
    let window = await this.resolveWindowForTimestamp(timestamp);
    if (window.state.value === WindowState.OutOfRange) {
      return null;
    }
    return window.data ? window.data.startBound : null;
  }

  public async getEntryAfter(timestamp: Date, filterType: StreamEntryType): Promise<StreamEntry> {
    let window = await this.resolveWindowForTimestamp(timestamp);
    if (filterType === StreamEntryType.StreamEntrySnapshot) {
      return window.data.endBound;
    }
    let clearSub: () => void;
    let promis = new Promise<StreamEntry>((resolve, reject) => {
      let entryMatches = (entry: StreamEntry) => {
        return entry.timestamp.getTime() > timestamp.getTime() &&
               (filterType === StreamEntryType.StreamEntryAny ||
               filterType === entry.type);
      };
      for (let entry of window.data.dataset) {
        if (entryMatches(entry)) {
          resolve(entry);
          return;
        }
      }
      let entrySub: Subscription;
      let stateSub: Subscription;
      let failSub: Subscription;
      clearSub = () => {
        if (entrySub) {
          entrySub.unsubscribe();
        }
        if (stateSub) {
          stateSub.unsubscribe();
        }
        if (failSub) {
          failSub.unsubscribe();
        }
      };
      let failError: any;
      failSub = window.failed.subscribe((reason) => {
        failError = reason;
      });
      stateSub = window.state.subscribe((state) => {
        if (state === WindowState.Failed) {
          if (failError) {
            reject(new Error('Window failed with error: ' + failError));
          } else {
            reject(new Error('Window failed.'));
          }
          return;
        }
        if (state === WindowState.OutOfRange) {
          resolve(null);
          return;
        }
        if (state === WindowState.Committed) {
          if (window.data.endBound && entryMatches(window.data.endBound)) {
            resolve(window.data.endBound);
          } else {
            // TODO: decide if we resolve null here, or try again with a new live cursor.
            resolve(null);
          }
        }
        // If we reach a live state, give the latest possible data.
        if (state === WindowState.Live) {
          resolve(null);
          return;
        }
      });
      entrySub = window.entryAdded.subscribe((entry) => {
        if (entryMatches(entry)) {
          resolve(entry);
          return;
        }
      });
    });
    promis.then(clearSub, clearSub);
    return promis;
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
