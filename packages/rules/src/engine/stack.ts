import type { WorkFrame } from '../state/work';
import type { Transcript } from './transcript';

export function pushWork(t: Transcript, frame: WorkFrame): void {
  t.emit({ type: 'workPushed', frame });
}

export function popWork(t: Transcript): void {
  t.emit({ type: 'workPopped' });
}

export function updateWork(t: Transcript, frame: WorkFrame): void {
  t.emit({ type: 'workUpdated', frame });
}
