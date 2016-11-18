import { Subject } from 'rxjs/Subject';
import { IWindowData } from './window';
import {
  StreamEntry,
  // make the compiler happy
  // tslint:disable-next-line
  StreamEntryType,
  MemoryBackend,
} from '@fusebot/state-stream';

// A generic backend for streaming incoming window data.
// Backed by MemoryBackend.
export class StreamingBackend extends MemoryBackend implements IWindowData {
  public entryAdded = new Subject<StreamEntry>();

  constructor() {
    super();
  }

  public saveEntry(entry: StreamEntry) {
    super.saveEntry(entry);
    this.entryAdded.next(entry);
  }

  public reset() {
    this.entries = [];
  }
}
