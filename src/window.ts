import {
  BehaviorSubject,
} from 'rxjs/BehaviorSubject';
import {
  Subject,
} from 'rxjs/Subject';
import {
  BoundedStateHistoryMode,
  IBoundedStateHistoryRequest,
  IBoundedStateHistoryResponse,
  IStateContext,
  IStateEntry,
  BoundedStateHistoryStatus,
} from '@fusebot/fusecloud-common';
import {
  ICallHandle,
  IServiceHandle,
} from 'grpc-bus';
import {
  StreamEntry,
} from '@fusebot/state-stream';

export enum WindowState {
  Pending = 0,
  Pulling,
  Committed,
  Live,
  // Window is out of range (no data).
  OutOfRange,
  // Window is failed (some network error).
  Failed,
}

export interface IWindowData {
  startBound?: StreamEntry;
  endBound?: StreamEntry;
  // entries between start + end
  dataset: StreamEntry[];
}

// A window is a snapshot of a period of time.
export class Window {
  public state: BehaviorSubject<WindowState> = new BehaviorSubject<WindowState>(WindowState.Pending);
  public data: IWindowData = {dataset: []};
  // If we failed to reach Committed state, this will push an error.
  public failed: Subject<any> = new Subject<any>();
  // Called when disposed
  public disposed: Subject<void> = new Subject<void>();
  public entryAdded: Subject<StreamEntry> = new Subject<StreamEntry>();

  private started: boolean = false;
  private callHandle: ICallHandle;
  private isDisposed: boolean = false;

  constructor(private serviceHandle: IServiceHandle,
              private streamContext: IStateContext,
              public midTimestamp: Date) {
  }

  public containsDate(midTime: Date) {
    let wind = this;
    return wind.state.value !== WindowState.Pending &&
           wind.data.startBound.timestamp.getTime() < midTime.getTime() &&
           (!wind.data.endBound ||
            wind.data.endBound.timestamp.getTime() > midTime.getTime());
  }

  // Start the data pull process.
  public start() {
    if (this.started) {
      return;
    }
    this.startResolveRequest();
  }

  public get isInErrorState() {
    return this.state.value === WindowState.OutOfRange ||
      this.state.value === WindowState.Failed;
  }

  // Release everything
  public dispose() {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    if (this.callHandle) {
      try {
        this.callHandle.terminate();
      } catch (e) {
        // do nothing
      }
      this.callHandle = null;
    }
    this.data = null;
    if (this.state.value !== WindowState.Committed &&
        this.state.value !== WindowState.Failed) {
      this.state.next(WindowState.Failed);
    }
  }

  private startResolveRequest() {
    try {
      let req: IBoundedStateHistoryRequest = {
        context: this.streamContext,
        mid_timestamp: this.midTimestamp.getTime(),
        mode: BoundedStateHistoryMode.SNAPSHOT_BOUND,
      };
      this.callHandle = this.serviceHandle['getBoundedStateHistory'](req);
      this.callHandle.on('data', (data: IBoundedStateHistoryResponse) => {
        this.handleData(data);
      });
      this.callHandle.on('error', (err: any) => {
        this.failWithError(err);
      });
      this.callHandle.on('end', () => {
        this.handleEnded();
      });
    } catch (e) {
      this.failWithError(e);
    }
  }

  private decodeState(state: IStateEntry): StreamEntry {
    if (!state || !state.json_state || !state.json_state.length) {
      return null;
    }
    let data = JSON.parse(state.json_state);
    return {
      data,
      timestamp: new Date(state.timestamp),
      type: state.type,
    };
  }

  private failWithError(error: any) {
    this.failed.next(error);
    this.state.next(WindowState.Failed);
    this.dispose();
  }

  private handleData(data: IBoundedStateHistoryResponse) {
    if (this.isInErrorState ||
        this.state.value === WindowState.Committed ||
        this.isDisposed ||
        !this.data) {
      return;
    }

    let decodedState = this.decodeState(data.state);
    switch (data.status) {
      case BoundedStateHistoryStatus.BOUNDED_HISTORY_START_BOUND:
        this.data.startBound = decodedState;
        if (!this.data.startBound) {
          this.state.next(WindowState.OutOfRange);
          this.dispose();
          return;
        }
        break;
      case BoundedStateHistoryStatus.BOUNDED_HISTORY_END_BOUND:
        this.data.endBound = decodedState;
        if (this.state.value === WindowState.Live) {
          this.state.next(WindowState.Committed);
          return;
        }
        break;
      case BoundedStateHistoryStatus.BOUNDED_HISTORY_INITIAL_SET:
        this.data.dataset.push(decodedState);
        if (this.state.value === WindowState.Pending) {
          this.state.next(WindowState.Pulling);
        }
        this.entryAdded.next(decodedState);
        break;
      case BoundedStateHistoryStatus.BOUNDED_HISTORY_TAIL:
        if (!decodedState) {
          if (this.data.endBound) {
            this.state.next(WindowState.Committed);
          } else {
            this.state.next(WindowState.Live);
          }
          return;
        }
        this.data.dataset.push(decodedState);
        this.entryAdded.next(decodedState);
        break;
    }

    if (this.state.value === WindowState.Pending &&
        this.data.endBound && this.data.startBound) {
      this.state.next(WindowState.Pulling);
    }
  }

  private handleEnded() {
    if (this.isInErrorState || this.state.value === WindowState.Committed) {
      return;
    }
    this.failWithError(new Error('Remote stream ended prematurely.'));
  }
}
