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

export type WindowFactory = () => IWindow;

export enum WindowState {
  // Metadata unknown, resolving middle timestamp query.
  Pending = 0,
  // Metadata known, ready to pull
  Waiting,
  // Pulling data
  Pulling,
  // Initial dataset pulled, current data is live.
  Live,
  // Data pull done, no more will come.
  Committed,
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
  replayEntries(subject: Subject<StreamEntry>): void;
}

// A window is a snapshot of a period of time.
export interface IWindow {
  state: BehaviorSubject<WindowState>;
  data: IWindowData;
  meta: BehaviorSubject<IWindowMeta>;

  initLive(): void;
  initWithMidTimestamp(midTimestamp: Date): void;
  initWithMetadata(meta: IWindowMeta): void;

  containsTimestamp(midTimestamp: Date): boolean;

  // Start the pulling process. This may be called many times.
  activate(): void;

  // Kill any ongoing operations, enter terminal state.
  dispose(): void;
}
