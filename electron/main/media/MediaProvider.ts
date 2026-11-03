// A media provider reports the current system media session and accepts playback
// commands. The PowerShell helper is the first implementation; a native addon or
// prebuilt helper can replace it later without touching the rest of the app.
import type { EventEmitter } from 'node:events';
import type { MediaCommand, MediaState } from '../../../src/shared/types';

export interface MediaProviderEvents {
  /** Session metadata and playback state (without artwork). */
  state: [Omit<MediaState, 'artDataUrl'>];
  /** Artwork for a track, sent once per track change. */
  art: [{ trackKey: string; dataUrl: string | null }];
}

export interface MediaProvider extends EventEmitter<MediaProviderEvents> {
  start(): void;
  stop(): void;
  send(cmd: MediaCommand): void;
}
