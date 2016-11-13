import {
  IWindow,
  WindowState,
  IWindowData,
  IWindowMeta,
} from '../window';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Subject } from 'rxjs/Subject';
import {
  StreamEntry,
  StreamEntryType,
  MemoryBackend,
} from '@fusebot/state-stream';
import { mockDataset } from './mock-data';
import { mockTime } from './time';
import { StreamingBackend } from '../streaming-backend';

export class MockWindow implements IWindow {
  public state: BehaviorSubject<WindowState> = new BehaviorSubject<WindowState>(WindowState.Pending);
  public data: IWindowData = new StreamingBackend();
  public meta = new BehaviorSubject<IWindowMeta>(null);
  // If we failed to reach Committed state, this will push an error.
  public error = new BehaviorSubject<any>(null);
  // Call when disposed
  public disposed = new Subject<void>();
  private isDisposed = false;

  private dataset = new MemoryBackend(mockDataset());

  constructor(private mockDelay: number = 100) {
  }

  public initLive() {
    // Simulate fetching early bound.
    this.initWithMidTimestamp(null);
  }

  public initWithMidTimestamp(midTimestamp: Date) {
    // Simulate fetching early + late bound
    let closestTime = midTimestamp || new Date();
    let snap = this.dataset.getSnapshotBefore(closestTime);
    let endSnap: StreamEntry = null;
    if (midTimestamp) {
      endSnap = this.dataset.getEntryAfter(closestTime, StreamEntryType.StreamEntrySnapshot);
    }
    setTimeout(() => {
      let meta: IWindowMeta = {
        startBound: snap.timestamp,
        endBound: endSnap ? endSnap.timestamp : null,
      };
      this.meta.next(meta);
      this.state.next(WindowState.Waiting);
    }, this.mockDelay);
  }

  public initWithMetadata(meta: IWindowMeta) {
    this.meta.next(meta);
    this.state.next(WindowState.Waiting);
  }

  // start the pulling process
  public activate() {
    this.state.next(WindowState.Pulling);
    setTimeout(() => {
      let timestamp = new Date(this.meta.value.startBound.getTime() - 100);
      let nextEntry: StreamEntry = this.dataset.getEntryAfter(timestamp, StreamEntryType.StreamEntryAny);
      while (nextEntry) {
        this.data.saveEntry(nextEntry);
        if (nextEntry.type === StreamEntryType.StreamEntrySnapshot) {
          break;
        }
        nextEntry = this.dataset.getEntryAfter(nextEntry.timestamp, StreamEntryType.StreamEntryAny);
      }
      this.state.next(this.meta.value.endBound ? WindowState.Committed : WindowState.Live);
      if (this.state.value === WindowState.Live) {
        this.dataset.saveEntry({
          timestamp: mockTime(-1),
          data: {isfinal: true},
          type: StreamEntryType.StreamEntrySnapshot,
        });
        this.state.next(WindowState.Committed);
      }
    }, this.mockDelay);
  }

  public containsTimestamp(timestamp: Date): boolean {
    let meta = this.meta.value;
    let timeNum = timestamp ? timestamp.getTime() : new Date().getTime();
    if (this.state.value === WindowState.Pending || !meta) {
      return false;
    }
    return meta.startBound.getTime() < timeNum &&
           (!meta.endBound || meta.endBound.getTime() > timeNum);
  }

  public dispose() {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    if ([WindowState.Failed, WindowState.Committed].indexOf(this.state.value) === -1) {
      this.state.next(WindowState.Failed);
    }
    this.disposed.next();
  }
}
