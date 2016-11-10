import {
  Window,
  WindowState,
} from './window';
import {
  IServiceHandle,
} from 'grpc-bus';
import {
  IStateContext,
} from '@fusebot/fusecloud-common';

// When we need a window for a period of time.
interface IPendingWindowInterest {
  // Timestamp we need a window for. Null for live.
  timestamp?: Date;
  // When we have instantiated a window for this timestamp.
  filledCallback: {resolve: (wind: Window) => void, reject: (err: any) => void};
}

// A time-linear storage of windows.
export class WindowStore {
  // List of windows ordered by time.
  private windows: Window[] = [];
  // Time interests.
  private pendingInterests: IPendingWindowInterest[] = [];
  // Current window pending scope.
  private pendingWindow: Window;

  constructor(private serviceHandle: IServiceHandle,
              private streamContext: IStateContext) {
  }

  // Build a window for a period of time, or null for live.
  public async buildWindow(midTime?: Date): Promise<Window> {
    let exist = this.getExistingWindow(midTime);
    if (exist) {
      return exist;
    }
    return new Promise<Window>((resolve, reject) => {
      // Insert an interest record
      this.registerInterest({
        timestamp: midTime,
        filledCallback: {resolve, reject},
      });
    });
  }

  // Check if we can promote a pending window interest, etc.
  private procInterest() {
    // Check if we can promote a pending interest to a window.
    if (!this.pendingWindow && this.pendingInterests.length) {
      // Grab the first interest
      let interest = this.pendingInterests.splice(0, 1)[0];
      let exist = this.getExistingWindow(interest.timestamp);
      if (exist) {
        interest.filledCallback.resolve(exist);
        // proc interest again
        this.procInterest();
        return;
      }

      this.pendingWindow = new Window(this.serviceHandle, this.streamContext, interest.timestamp);
      let stateSub = this.pendingWindow.state.subscribe((state) => {
        if (state === WindowState.Pending) {
          return;
        }
        stateSub.unsubscribe();
        if (state === WindowState.Failed || state === WindowState.OutOfRange) {
          this.pendingWindow = null;
          this.procInterest();
          return;
        }
        this.promotePendingWindow();
        this.procInterest();
      });
      interest.filledCallback.resolve(this.pendingWindow);
      this.pendingWindow.start();
    }

    if (this.pendingWindow) {
      // Check if we can fill any interests with the pending window.
      this.fillInterestWithPendingWindow();
    }
  }

  private registerInterest(interest: IPendingWindowInterest) {
    this.pendingInterests.push(interest);
    this.procInterest();
  }

  private promotePendingWindow() {
    this.insertWindow(this.pendingWindow);
    this.pendingWindow = null;
  }

  // Insert a non-pending window
  private insertWindow(window: Window) {
    if (!window.data.endBound) {
      this.windows.splice(this.windows.length, 0, window);
      return;
    }

    let time = window.data.endBound.timestamp.getTime();
    // Insertion sort.
    for (let idx = 0; idx < this.windows.length; idx++) {
      if (this.windows[idx].data.startBound.timestamp.getTime() > time) {
        this.windows.splice(idx + 1, 0, window);
        return;
      }
    }
    // Put it at the beginning.
    this.windows.splice(0, 0, window);
  }

  private fillInterestWithPendingWindow() {
    // Check if any pending interests can be solved by the active pending window.
    let newPendingInterests: IPendingWindowInterest[] = [];
    for (let interest of this.pendingInterests) {
      if (this.pendingWindow &&
          this.pendingWindow.midTimestamp.getTime() === interest.timestamp.getTime()) {
        interest.filledCallback.resolve(this.pendingWindow);
        continue;
      }

      // If we can't fill it, push to the new array.
      newPendingInterests.push(interest);
    }
    this.pendingInterests = newPendingInterests;
  }

  private getExistingWindow(midTime: Date): Window {
    if (!midTime) {
      // Find live window.
      if (this.windows.length) {
        let wind = this.windows[this.windows.length - 1];
        if (wind.state.value === WindowState.Live) {
          return wind;
        }
      }
      return null;
    }
    for (let wind of this.windows) {
      // If the window is not pending, and within time range.
      if (wind.containsDate(midTime)) {
        return wind;
      }
    }
    return null;
  }

  public dispose() {
    for (let disp of this.windows) {
      disp.dispose();
    }
    this.windows = [];
    for (let disp of this.pendingInterests) {
      disp.filledCallback.reject(new Error('Store is being disposed.'));
    }
    this.pendingInterests = [];
    if (this.pendingWindow) {
      this.pendingWindow.dispose();
      this.pendingWindow = null;
    }
  }
}
