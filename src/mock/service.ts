import {
  ICallHandle,
} from 'grpc-bus';
import {
  IBoundedStateHistoryRequest,
} from '@fusebot/fusecloud-common';
import {
  BoundedStateHistoryCall,
} from './bounded_state_history_call';
import {
  StreamEntry,
  MemoryBackend,
  StreamEntryType,
} from '@fusebot/state-stream';
import {
  mockTime,
} from './time';

export class MockViewService {
  public backend: MemoryBackend;

  constructor() {
    let data: StreamEntry[] = [];
    for (let i = 0; i < 10; i++) {
      data.push({
        data: {test: i + 1},
        timestamp: mockTime(-10 + i),
        type: [0, 5].indexOf(i) !== -1 ?
          StreamEntryType.StreamEntrySnapshot :
          StreamEntryType.StreamEntryMutation,
      });
    }
    this.backend = new MemoryBackend(data);
  }

  public getBoundedStateHistory(req: IBoundedStateHistoryRequest): ICallHandle {
    let call = new BoundedStateHistoryCall(this.backend, req);
    setTimeout(() => {
      call.process();
    }, 100);
    return call;
  }

  public end(): ICallHandle {
    return null;
  }
}
