let sharedAudioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof AudioContext === 'undefined') {
    return null;
  }
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioContext();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

function playTone(
  freq: number,
  durationSec: number,
  type: OscillatorType,
  gainPeak: number,
  delaySec = 0
): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime + delaySec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

export function playRotateClick(powered: boolean, muted: boolean): void {
  if (muted) return;
  playTone(powered ? 520 : 330, 0.07, 'triangle', 0.08);
  if (powered) {
    playTone(780, 0.09, 'sine', 0.05, 0.03);
  }
}

export function playHintPing(muted: boolean): void {
  if (muted) return;
  playTone(660, 0.11, 'sine', 0.08);
  playTone(880, 0.14, 'sine', 0.07, 0.07);
}

export function playVictoryFanfare(muted: boolean): void {
  if (muted) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, idx) => {
    playTone(freq, 0.22, 'triangle', 0.1, idx * 0.08);
  });
}
