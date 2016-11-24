import {
  IStorageBackend,
  StreamEntry,
  StreamEntryType,
} from '@fusebot/state-stream';
import {
  WindowStore,
} from './window-store';
import {
  WindowState,
} from './window';
import {
  toPromise,
} from './util';

export class RemoteStreamBackend implements IStorageBackend {
  constructor(public windowStore: WindowStore) {
  }

  public async getSnapshotBefore(timestamp: Date): Promise<StreamEntry> {
    let window = await this.windowStore.buildWindowWithState(timestamp, WindowState.Live);
    return toPromise<StreamEntry>(window.data.getSnapshotBefore(timestamp));
  }

  public async getEntryAfter(timestamp: Date, filterType: StreamEntryType): Promise<StreamEntry> {
    let window = await this.windowStore.buildWindowWithState(timestamp, WindowState.Live);
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
