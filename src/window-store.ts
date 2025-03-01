import {
  IWindow,
  WindowState,
  WindowFactory,
} from './window';
import { Subscription } from 'rxjs/Subscription';

// When we need a window for a period of time.
interface IPendingWindowInterest {
  // Timestamp we need a window for. Null for live.
  timestamp?: Date;
  // When we have instantiated a window for this timestamp.
  filledCallback: {resolve: (wind: IWindow) => void, reject: (err: any) => void};
}

// A time-linear storage of windows.
export class WindowStore {
  // List of windows ordered by time.
  private windows: IWindow[] = [];
  // Time interests.
  private pendingInterests: IPendingWindowInterest[] = [];
  // Current window pending scope.
  private pendingWindow: IWindow;

  constructor(private windowFactory: WindowFactory) {
  }

  // Build a window for a period of time, or null for live.
  public async buildWindow(midTime?: Date): Promise<IWindow> {
    let exist = this.getExistingWindow(midTime);
    if (exist) {
      return exist;
    }
    return new Promise<IWindow>((resolve, reject) => {
      // Insert an interest record
      this.registerInterest({
        timestamp: midTime,
        filledCallback: {resolve, reject},
      });
    });
  }

  // Build a window and wait for state.
  public async buildWindowWithState(midTime: Date, targetState: WindowState): Promise<IWindow> {
    let window = await this.buildWindow(midTime);
    return this.waitForWindowState(window, targetState);
  }

  // Wait for a window to reach at least a target state.
  // Note: this will activate the window if necessary.
  public async waitForWindowState(window: IWindow, targetState: WindowState): Promise<IWindow> {
    return new Promise<IWindow>((_resolve, reject) => {
      let sub: Subscription;
      let resolve = (val: IWindow) => {
        if (sub && !sub.closed) {
          sub.unsubscribe();
        }
        _resolve(val);
      };
      sub = window.state.subscribe((state) => {
        if (state >= targetState) {
          resolve(window);
        } else if (state === WindowState.Waiting) {
          window.activate();
        }
      }, (error) => {
        reject(error);
      });
    });
  }

  // Check if we can promote a pending window interest, etc.
  private procInterest() {
    // Check if we can promote a pending interest to a window.
    if (this.pendingWindow || !this.pendingInterests.length) {
      return;
    }

    // Grab the first interest
    let interest = this.pendingInterests.splice(0, 1)[0];
    let exist = this.getExistingWindow(interest.timestamp);
    if (exist) {
      interest.filledCallback.resolve(exist);
      // proc interest again
      this.procInterest();
      return;
    }

    let pendingWindowFail = (error: any) => {
      this.pendingWindow = null;
      interest.filledCallback.reject(error);
      this.procInterest();
    };
    this.pendingWindow = this.windowFactory();
    this.waitForWindowState(this.pendingWindow, WindowState.Pending)
      .then((pendingWindow) => {
        let metasub = pendingWindow.meta.subscribe((meta) => {
          if (!meta) {
            return;
          }
          metasub.unsubscribe();
          this.insertWindow(this.pendingWindow);
          this.pendingWindow = null;
          interest.filledCallback.resolve(pendingWindow);
          this.procInterest();
        }, pendingWindowFail);
      })
      .catch(pendingWindowFail);
    if (interest.timestamp) {
      this.pendingWindow.initWithMidTimestamp(interest.timestamp);
    } else {
      this.pendingWindow.initLive();
    }
  }

  private registerInterest(interest: IPendingWindowInterest) {
    this.pendingInterests.push(interest);
    this.procInterest();
  }

  // Insert a non-pending window
  private insertWindow(window: IWindow) {
    if (!window.meta.value.endBound) {
      this.windows.splice(this.windows.length, 0, window);
      return;
    }

    let time = window.meta.value.endBound.getTime();
    // Insertion sort.
    for (let idx = 0; idx < this.windows.length; idx++) {
      if (this.windows[idx].meta.value.startBound.getTime() > time) {
        this.windows.splice(idx + 1, 0, window);
        return;
      }
    }
    // Put it at the beginning.
    this.windows.splice(0, 0, window);
  }

  private getExistingWindow(midTime: Date): IWindow {
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
      if (wind.containsTimestamp(midTime)) {
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
