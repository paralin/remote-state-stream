import {
  RemoteStreamBackend,
} from './remote-stream-backend';
import {
  IServiceHandle,
} from 'grpc-bus';
import {
  Cursor,
  CursorType,
} from '@fusebot/state-stream';
import {
  IStateContext,
} from '@fusebot/fusecloud-common';

export class RemoteStream {
  private backend: RemoteStreamBackend;

  constructor(private serviceHandle: IServiceHandle,
              private streamContext: IStateContext) {
    this.backend = new RemoteStreamBackend(serviceHandle, streamContext);
  }

  public buildCursor(cursorType: CursorType) {
    return new Cursor(this.backend, cursorType);
  }

  public dispose() {
    this.backend.dispose();
  }
}
