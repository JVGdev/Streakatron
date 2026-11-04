// Small synthesized sounds (Web Audio), so the app ships no audio files. Browsers only play sound
// after the user has interacted with the page: `primeAudio()` from a click (starting a session)
// unlocks it for the timer's chime later.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  try {
    ctx ??= new AudioContext();
  } catch {
    return null;
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

/** Call from a click so later sounds may play. */
export function primeAudio() {
  audio();
}

/** One soft bell note: a sine with a quieter octave, struck and left to ring. */
function bell(a: AudioContext, freq: number, at: number, gain = 0.22, ring = 1.8) {
  const out = a.createGain();
  out.gain.setValueAtTime(0.0001, at);
  out.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  out.gain.exponentialRampToValueAtTime(0.0001, at + ring);
  out.connect(a.destination);
  for (const [mult, level] of [
    [1, 1],
    [2, 0.28],
    [3.01, 0.08],
  ] as const) {
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    g.gain.value = level;
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + ring + 0.05);
  }
}

/** The focus timer reached its planned time: three falling-then-rising notes. */
export function playFocusChime() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.05;
  bell(a, 783.99, t); // G5
  bell(a, 659.25, t + 0.22); // E5
  bell(a, 1046.5, t + 0.44, 0.2, 2.4); // C6
}

/** A break ended: two rising notes, a little brighter. */
export function playBreakChime() {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.05;
  bell(a, 523.25, t, 0.2, 1.2); // C5
  bell(a, 783.99, t + 0.16, 0.2, 2); // G5
}
