import {
  ICallHandle,
} from 'grpc-bus';
import {
  // StreamEntry,
  StreamEntryType,
  MemoryBackend,
} from '@fusebot/state-stream';
import {
  BoundedStateHistoryStatus,
  IBoundedStateHistoryRequest,
  IStateEntry,
} from '@fusebot/fusecloud-common';
import {
  mockTime,
} from './time';

export class BoundedStateHistoryCall implements ICallHandle {
  private eventHandlers: { [id: string]: ((arg: any) => void)[] } = {};
  constructor(private storage: MemoryBackend,
              private req: IBoundedStateHistoryRequest) {}

  public on(eventId: string, callback: (arg: any) => void) {
    let arr = this.eventHandlers[eventId];
    if (!arr) {
      arr = this.eventHandlers[eventId] = [];
    }
    arr.splice(arr.length, 0, callback);
  }

  public off(eventId: string) {
    delete this.eventHandlers[eventId];
  }

  public process() {
    let req = this.req;
    if (this.storage.entries[0].timestamp.getTime() > req.mid_timestamp) {
      this.endWithOutOfRange();
      return;
    }
    let closestIdx = this.storage.findClosest(new Date(req.mid_timestamp));
    let beginEntry: IStateEntry;
    for (let i = closestIdx; i >= 0; i--) {
      if (i >= this.storage.entries.length) {
        continue;
      }
      let ent = this.storage.entries[i];
      if (ent.type === StreamEntryType.StreamEntrySnapshot) {
        beginEntry = {
          json_state: JSON.stringify(ent.data),
          timestamp: ent.timestamp.getTime(),
          type: ent.type,
        };
        closestIdx = i;
        break;
      }
    }
    this.emit('data', {
      status: BoundedStateHistoryStatus.BOUNDED_HISTORY_START_BOUND,
      state: beginEntry,
    });
    let endEntry: IStateEntry;
    let queuedData: IStateEntry[] = [];
    if (beginEntry) {
      for (let i = closestIdx + 1; i < this.storage.entries.length; i++) {
        let ent = this.storage.entries[i];
        let decent: IStateEntry = {
          json_state: JSON.stringify(ent.data),
          timestamp: ent.timestamp.getTime(),
          type: ent.type,
        };
        if (ent.type === StreamEntryType.StreamEntrySnapshot) {
          endEntry = decent;
          break;
        } else {
          queuedData.push(decent);
        }
      }
      this.emit('data', {
        status: BoundedStateHistoryStatus.BOUNDED_HISTORY_END_BOUND,
        state: endEntry,
      });
    }
    for (let ent of queuedData) {
      this.emit('data', {
        status: BoundedStateHistoryStatus.BOUNDED_HISTORY_INITIAL_SET,
        state: ent,
      });
    }
    this.emit('data', {
      status: BoundedStateHistoryStatus.BOUNDED_HISTORY_TAIL,
    });
    if (beginEntry && !endEntry) {
      this.emit('data', {
        status: BoundedStateHistoryStatus.BOUNDED_HISTORY_TAIL,
        state: {
          json_state: JSON.stringify({'tailed': true}),
          timestamp: mockTime(1).getTime(),
          type: StreamEntryType.StreamEntryMutation,
        },
      });
      this.emit('data', {
        status: BoundedStateHistoryStatus.BOUNDED_HISTORY_END_BOUND,
        state: {
          json_state: JSON.stringify({'ended': true}),
          timestamp: mockTime(2).getTime(),
          type: StreamEntryType.StreamEntrySnapshot,
        },
      });
    } else {
      this.sendEnd();
    }
  }

  public endWithOutOfRange() {
    this.emit('data', {
      status: BoundedStateHistoryStatus.BOUNDED_HISTORY_START_BOUND,
    });
    this.sendEnd();
  }

  public sendEnd() {
    this.emit('end');
  }

  public terminate() {
    //
  }

  private emit(eventId: string, val?: any) {
    let handlers = this.eventHandlers[eventId];
    if (!handlers) {
      return;
    }
    for (let handler of handlers) {
      handler(val);
    }
  }
}
