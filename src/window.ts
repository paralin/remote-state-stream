import {
  BehaviorSubject,
} from 'rxjs/BehaviorSubject';
import {
  Subject,
} from 'rxjs/Subject';
import {
  StreamEntry,
  IStorageBackend,
} from '@fusebot/state-stream';

export enum WindowState {
  // Metadata unknown, resolving middle timestamp query.
  Pending = 0,
  // Metadata known, ready to pull
  Waiting,
  // Pulling data
  Pulling,
  // Data pull done, no more will come.
  Committed,
  // Data pull done, entries will be added.
  Live,
  // Window is out of range (no data).
  OutOfRange,
  // Window is failed (some network error).
  Failed,
}

// Metadata about a window
export interface IWindowMeta {
  // Snapshot at the beginning of the bound.
  startBound?: Date;
  // Snapshot at the end of the bound.
  endBound?: Date;
}

// Storage + events.
export interface IWindowData extends IStorageBackend {
  entryAdded: Subject<StreamEntry>;
}

// A window is a snapshot of a period of time.
export interface IWindow {
  state: BehaviorSubject<WindowState>;
  data: IWindowData;
  meta: BehaviorSubject<IWindowMeta>;
  // If we failed to reach Committed state, this will push an error.
  error: BehaviorSubject<any>;
  // Call when disposed
  disposed: Subject<void>;

  initLive(): void;
  initWithMidTimestamp(midTimestamp: Date): void;
  containsTimestamp(midTimestamp: Date): boolean;

  // start the pulling process
  activate(): void;

  dispose(): void;
}
