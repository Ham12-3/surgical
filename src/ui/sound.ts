import type { Settings } from '../store/settings';
import { element } from './dom';
import { CUES, type CueName } from './soundCues';

/** How long a caption stays on screen, in milliseconds. */
const CAPTION_MS = 2600;
/** Quieter than this is silence, and exponential ramps cannot reach zero. */
const SILENT = 0.0001;

export type SoundSettings = Pick<Settings, 'sound' | 'volume' | 'captions'>;

/**
 * Plays the sound cues (soundCues.ts), synthesised with the Web Audio API so
 * there are no audio files to fetch, and writes each cue's caption at the foot
 * of the screen when captions are on.
 *
 * The audio context is only made on the first cue. Cues always follow a click
 * or a key press, which is when browsers allow sound to start.
 */
export class SoundCues {
  private readonly caption = element('div', 'caption');
  private context: AudioContext | null = null;
  private captionTimer = 0;

  constructor(
    host: HTMLElement,
    private settings: SoundSettings,
  ) {
    this.caption.setAttribute('role', 'status');
    this.caption.setAttribute('aria-live', 'polite');
    this.caption.hidden = true;
    host.append(this.caption);
  }

  configure(settings: SoundSettings): void {
    this.settings = settings;
    if (!settings.captions) this.hideCaption();
  }

  play(name: CueName): void {
    const cue = CUES[name];
    if (this.settings.captions) this.showCaption(cue.caption);
    if (!this.settings.sound || this.settings.volume <= 0) return;
    const context = this.audio();
    if (!context) return;

    const start = context.currentTime + 0.01;
    for (const part of cue.tones) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = part.type;
      oscillator.frequency.value = part.frequency;
      const begin = start + part.at;
      const end = begin + part.duration;
      // A 10 ms attack and an exponential release, so no tone starts or stops with a click.
      gain.gain.setValueAtTime(SILENT, begin);
      gain.gain.exponentialRampToValueAtTime(Math.max(SILENT, part.gain * this.settings.volume), begin + 0.01);
      gain.gain.exponentialRampToValueAtTime(SILENT, end);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(begin);
      oscillator.stop(end + 0.02);
    }
  }

  dispose(): void {
    window.clearTimeout(this.captionTimer);
    this.caption.remove();
    void this.context?.close();
    this.context = null;
  }

  private audio(): AudioContext | null {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume();
      return this.context;
    } catch {
      // No Web Audio here: the captions still carry every cue.
      return null;
    }
  }

  private showCaption(text: string): void {
    this.caption.textContent = text;
    this.caption.hidden = false;
    window.clearTimeout(this.captionTimer);
    this.captionTimer = window.setTimeout(() => this.hideCaption(), CAPTION_MS);
  }

  private hideCaption(): void {
    window.clearTimeout(this.captionTimer);
    this.caption.hidden = true;
  }
}
