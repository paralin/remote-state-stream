import {
  StreamEntry,
  StreamEntryType,
} from '@fusebot/state-stream';
import {
  mockTime,
} from './time';

export function mockDataset(): StreamEntry[] {
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
  return data;
}
