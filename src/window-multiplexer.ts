import {
  IWindow,
  IWindowMeta,
  IWindowData,
  WindowFactory,
  WindowState,
} from './window';
import { StreamingBackend } from './streaming-backend';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { Subscription } from 'rxjs/Subscription';
import { Subject } from 'rxjs/Subject';

interface IWindowFactoryReference {
  factory: WindowFactory;
  identifier: string;
}

interface IWindowMultiplexerSettings {
  useLive?: boolean;
  midTime?: Date;
}

interface IMultiplexedWindow {
  window: IWindow;
  inited?: boolean;
  activated?: boolean;
  factoryIdentifier: string;
  disposed?: boolean;
  subscriptions: Subscription[];
}

export class WindowMultiplexer implements IWindow {
  public state = new BehaviorSubject<WindowState>(WindowState.Pending);
  public data: IWindowData = new StreamingBackend();
  public meta = new BehaviorSubject<IWindowMeta>(null);
  // If we failed to reach Committed state, this will push an error.
  public error = new BehaviorSubject<any>(null);
  // Call when disposed
  public disposed = new Subject<void>();

  private factoryReferences: { [id: string]: IWindowFactoryReference } = {};
  private factoryInstances: { [factoryIdentifier: string]: IMultiplexedWindow } = {};
  private inited = false;
  private activated = false;
  private settings: IWindowMultiplexerSettings;

  constructor(factories: IWindowFactoryReference[] = []) {
    for (let fact of factories) {
      this.addFactory(fact);
    }
  }

  public addFactory(factory: IWindowFactoryReference) {
    /* istanbul ignore next */
    if (this.factoryReferences[factory.identifier]) {
      return;
    }

    this.factoryReferences[factory.identifier] = factory;
    this.instanceFactory(factory);
  }

  public deleteFactory(factory: IWindowFactoryReference) {
    let ref = this.factoryReferences[factory.identifier];
    /* istanbul ignore next */
    if (!ref) {
      return;
    }

    delete this.factoryReferences[factory.identifier];
    // clear any calls on the old factory
    let inst = this.factoryInstances[factory.identifier];
    /* istanbul ignore next */
    if (!inst) {
      return;
    }
    this.deleteFactoryInstances(factory.identifier);
  }

  public initLive() {
    if (this.inited) {
      return;
    }
    this.settings = {
      useLive: true,
    };
    this.inited = true;
    this.actuateAll();
  }

  public initWithMidTimestamp(midTimestamp: Date) {
    if (this.inited) {
      return;
    }
    this.settings = {
      midTime: midTimestamp,
    };
    this.inited = true;
    this.actuateAll();
  }

  public initWithMetadata(meta: IWindowMeta) {
    if (this.inited) {
      return;
    }
    this.meta.next(meta);
    this.settings = {};
    this.inited = true;
    this.state.next(WindowState.Waiting);
    this.actuateAll();
  }

  public containsTimestamp(midTimestamp: Date) {
    if (this.settings &&
        this.settings.midTime &&
        this.settings.midTime.getTime() === midTimestamp.getTime()) {
      return true;
    }
    let meta = this.meta.value;
    if (!meta) {
      return false;
    }
    return meta.startBound.getTime() <= midTimestamp.getTime() &&
           (!meta.endBound || meta.endBound.getTime() > midTimestamp.getTime());
  }

  // start the pulling process
  public activate() {
    this.activated = true;
    if (this.inited) {
      this.actuateAll();
    }
  }

  public dispose() {
    if ([WindowState.Failed, WindowState.Committed].indexOf(this.state.value) === -1) {
      this.state.next(WindowState.Failed);
    }
    // delete all factories
    for (let factid in Object.keys(this.factoryInstances)) {
      this.deleteFactory(this.factoryReferences[factid]);
    }
    this.disposed.next();
  }

  private deleteFactoryInstances(id: string) {
    let instance = this.factoryInstances[id];
    if (!instance) {
      return;
    }
    delete this.factoryInstances[id];
    this.clearWindowHandlers(instance);
    instance.disposed = true;
    instance.window.dispose();
  }

  private actuateAll() {
    if (this.state.value === WindowState.Committed) {
      return;
    }
    if (this.activated && this.state.value === WindowState.Waiting) {
      this.state.next(WindowState.Pulling);
    }
    for (let id in this.factoryInstances) {
      if (!this.factoryInstances.hasOwnProperty(id)) {
        continue;
      }
      this.actuateWindow(this.factoryInstances[id]);
    }
  }

  // Instantiate a factory, actuate
  private instanceFactory(ref: IWindowFactoryReference) {
    if (this.state.value === WindowState.Committed) {
      return;
    }
    let window: IMultiplexedWindow = this.factoryInstances[ref.identifier];
    if (!window) {
      window = this.factoryInstances[ref.identifier] = {
        window: ref.factory(),
        factoryIdentifier: ref.identifier,
        subscriptions: [],
      };
      this.initWindowHandlers(window);
    }
    this.actuateWindow(window);
  }

  private actuateWindow(window: IMultiplexedWindow) {
    if (!this.initWindow(window)) {
      return;
    }
    this.activateWindow(window);
  }

  private initWindow(window: IMultiplexedWindow): boolean {
    if (!this.settings || window.inited || !this.inited) {
      return true;
    }
    if (window.inited) {
      // If the window is currently trying to resolve meta, delete it and re-init with metadata.
      if (window.window.meta.value !== this.meta.value) {
        let fact = this.factoryReferences[window.factoryIdentifier];
        this.deleteFactoryInstances(window.factoryIdentifier);
        if (fact) {
          this.instanceFactory(fact);
        }
        return false;
      }
      return true;
    }
    let wind = window.window;
    if (this.meta.value) {
      wind.initWithMetadata(this.meta.value);
    } else if (this.settings.midTime) {
      wind.initWithMidTimestamp(this.settings.midTime);
    } else if (this.settings.useLive) {
      wind.initLive();
    }
    window.inited = true;
    return true;
  }

  private activateWindow(window: IMultiplexedWindow) {
    if (!this.settings || !this.activated || window.activated) {
      return;
    }
    window.window.activate();
    window.activated = true;
  }

  // A window has resolved the meta.
  private windowResolvedMeta(window: IMultiplexedWindow) {
    if (this.state.value !== WindowState.Pending) {
      return;
    }
    let wind = window.window;
    this.meta.next(wind.meta.value);
    this.state.next(WindowState.Waiting);
    this.actuateAll();
  }

  private windowReady(window: IMultiplexedWindow) {
    let wind = window.window;
    if (this.meta.value !== wind.meta.value && wind.meta.value) {
      this.meta.next(wind.meta.value);
    }
    this.state.next(wind.state.value);
    this.isolateWindow(window);
  }

  private isolateWindow(window: IMultiplexedWindow) {
    for (let factid in this.factoryInstances) {
      if (!this.factoryInstances.hasOwnProperty(factid)) {
        continue;
      }
      let windInst = this.factoryInstances[factid];
      if (windInst === window) {
        continue;
      }
      windInst.window.dispose();
    }
    this.factoryInstances = {};
    this.factoryInstances[window.factoryIdentifier] = window;
  }

  private windowFailed(window: IMultiplexedWindow) {
    this.deleteFactoryInstances(window.factoryIdentifier);
    // If we have no sub-windows left, fail out.
    if (Object.keys(this.factoryInstances).length === 0) {
      this.dispose();
    } else {
      this.actuateAll();
    }
  }

  private initWindowHandlers(window: IMultiplexedWindow) {
    let wind = window.window;
    let subs = window.subscriptions;
    let lastState = WindowState.Pending;
    subs.push(wind.disposed.subscribe(() => {
      if (window.disposed) {
        return;
      }
      if (wind.state.value === WindowState.Failed || wind.state.value === WindowState.OutOfRange) {
        this.windowFailed(window);
        return;
      }
    }));
    subs.push(wind.data.entryAdded.subscribe((entry) => {
      if (window.disposed) {
        return;
      }
      if (Object.keys(this.factoryInstances).length !== 1) {
        this.windowReady(window);
      }
      this.data.saveEntry(entry);
    }));
    subs.push(wind.state.subscribe((state) => {
      // We can't handle transitions from Waiting -> Pending or so.
      if (state === lastState || state < lastState || window.disposed) {
        return;
      }
      if (state === WindowState.Failed || state === WindowState.OutOfRange) {
        this.windowFailed(window);
      } else if (state === WindowState.Waiting && window.window.meta.value) {
        if (this.state.value === WindowState.Pending) {
          this.windowResolvedMeta(window);
        }
      } else if (state === WindowState.Committed || state === WindowState.Live) {
        this.windowReady(window);
      }
    }));
    subs.push(wind.meta.subscribe((meta) => {
      if (this.state.value === WindowState.Pending &&
          !this.meta.value &&
          meta) {
        this.meta.next(meta);
        this.state.next(WindowState.Waiting);
      }
    }));
  }

  private clearWindowHandlers(window: IMultiplexedWindow) {
    for (let sub of window.subscriptions) {
      sub.unsubscribe();
    }
    window.subscriptions.length = 0;
  }
}

export class WindowMultiplexerFactory {
  private activeMultiplexers: WindowMultiplexer[] = [];
  private identifierCounter: number = 0;
  private factoryReferences: IWindowFactoryReference[] = [];

  constructor(factories: WindowFactory[] = []) {
    for (let fact of factories) {
      this.addFactory(fact);
    }
  }

  public addFactory(factory: WindowFactory) {
    if (this.indexOfFactory(factory) !== -1) {
      return;
    }

    let ref: IWindowFactoryReference = {
      factory: factory,
      identifier: this.identifierCounter++ + '',
    };
    this.factoryReferences.push(ref);
    for (let multi of this.activeMultiplexers) {
      multi.addFactory(ref);
    }
  }

  public deleteFactory(factory: WindowFactory) {
    let idx = this.indexOfFactory(factory);
    if (idx === -1) {
      return;
    }

    let ref = this.factoryReferences.splice(idx, 1)[0];
    for (let multi of this.activeMultiplexers) {
      multi.deleteFactory(ref);
    }
  }

  public getFactoryFcn(): WindowFactory {
    return () => {
      let mp = new WindowMultiplexer(this.factoryReferences);
      this.activeMultiplexers.push(mp);
      mp.disposed.subscribe(() => {
        let idx = this.activeMultiplexers.indexOf(mp);
        if (idx >= 0) {
          this.activeMultiplexers.splice(idx, 1);
        }
      });
      return mp;
    };
  }

  private indexOfFactory(fact: WindowFactory) {
    let i = 0;
    for (let ref of this.factoryReferences) {
      if (ref.factory === fact) {
        return i;
      }
      i++;
    }
    return -1;
  }
}
