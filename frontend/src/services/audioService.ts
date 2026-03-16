/**
 * AudioService — Standalone alert audio generator
 *
 * Self-contained: uses Web Audio API exclusively.
 * No external files, no dependencies, no imports required.
 *
 * Portable: copy this single file to any web project and it works.
 *
 * Usage:
 *   AudioService.playSignalAlert()    // rising 3-note chime for accepted signal
 *   AudioService.playSignalDismiss()  // single descending tone (optional use)
 *
 * Browser support: Chrome, Firefox, Safari, Edge (all modern browsers).
 * Falls back silently if Web Audio API is unavailable.
 *
 * @version 1.0.0
 * @license MIT
 */

type NoteConfig = {
  freq:     number;
  start:    number;
  duration: number;
  gain:     number;
};

function _getAudioContext(): AudioContext | null {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as Record<string, unknown>)['webkitAudioContext'] as typeof AudioContext;
    if (!Ctx) return null;
    return new Ctx();
  } catch {
    return null;
  }
}

function _playNote(ctx: AudioContext, cfg: NoteConfig): void {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(cfg.freq, ctx.currentTime + cfg.start);

  gain.gain.setValueAtTime(0, ctx.currentTime + cfg.start);
  gain.gain.linearRampToValueAtTime(cfg.gain, ctx.currentTime + cfg.start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + cfg.start + cfg.duration);

  osc.start(ctx.currentTime + cfg.start);
  osc.stop(ctx.currentTime + cfg.start + cfg.duration + 0.05);
}

function _play(notes: NoteConfig[], totalDurationMs: number): void {
  const ctx = _getAudioContext();
  if (!ctx) return;
  notes.forEach(n => _playNote(ctx, n));
  setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, totalDurationMs);
}

export const AudioService = {
  /**
   * Rising 3-note chime — triggered on every accepted signal (paper or live).
   * C5 → E5 → G5  (pleasant, non-aggressive, audible in a noisy environment)
   */
  playSignalAlert(): void {
    _play(
      [
        { freq: 523.25, start: 0.00, duration: 0.30, gain: 0.20 },
        { freq: 659.25, start: 0.20, duration: 0.30, gain: 0.18 },
        { freq: 783.99, start: 0.40, duration: 0.45, gain: 0.22 },
      ],
      1500,
    );
  },

  /**
   * Single descending tone — can be used for rejected signals or dismissals.
   * Optional. Not triggered by default.
   */
  playSignalDismiss(): void {
    _play(
      [{ freq: 349.23, start: 0.00, duration: 0.35, gain: 0.12 }],
      600,
    );
  },
};
