// Combines provider state and artwork into the MediaState the renderer sees.
import { EventEmitter } from 'node:events';
import type { MediaCommand, MediaState } from '../../../src/shared/types';
import type { MediaProvider } from './MediaProvider';

export class MediaService extends EventEmitter<{ change: [] }> {
  private state: MediaState = { active: false };
  private art = new Map<string, string | null>();

  constructor(private provider: MediaProvider) {
    super();
    provider.on('state', (s) => {
      const artDataUrl = s.trackKey ? this.art.get(s.trackKey) ?? null : null;
      this.state = { ...s, artDataUrl };
      this.emit('change');
    });
    provider.on('art', ({ trackKey, dataUrl }) => {
      // Keep only the latest artwork; it is the only one that can be displayed.
      this.art.clear();
      this.art.set(trackKey, dataUrl);
      if (this.state.trackKey === trackKey) {
        this.state = { ...this.state, artDataUrl: dataUrl };
        this.emit('change');
      }
    });
  }

  getState() {
    return this.state;
  }

  start() {
    this.provider.start();
  }

  stop() {
    this.provider.stop();
  }

  command(cmd: MediaCommand) {
    this.provider.send(cmd);
  }
}
