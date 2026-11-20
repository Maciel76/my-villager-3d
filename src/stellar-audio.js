import {
  STELLAR_BEAM_RETURN, STELLAR_BURST, STELLAR_CROWN_LIFT_START, STELLAR_CROWN_RETRACTED,
  STELLAR_DRAIN_DURATION, STELLAR_GRID_RESTORE_DURATION, STELLAR_LAUNCH, STELLAR_LIFT_START,
  STELLAR_ORBIT_RISES, STELLAR_ORBITS_DESCENT_START, STELLAR_REACTIVATION_DURATION, STELLAR_RELIGHT,
  STELLAR_SHUTDOWN, STELLAR_THRUST_START, STELLAR_WAVE_END, STELLAR_WAVES, stellarElapsed,
} from "./stellar-event.js";

const sampleRate = 24000;
const tau = Math.PI * 2;
const tone = (from, to, level, attack, release, tremolo = 0) => ({ from, to, level, attack, release, tremolo });
const noise = (from, to, level, attack, release, floor = 0) => ({ from, to, level, attack, release, floor, noise: true });

const sounds = {
  gridDown: [12, [
    tone(54, 29, .24, .28, 7.5, 2.4), tone(108, 57, .075, .22, 9, 3.1),
    noise(460, 75, .19, .22, 7.8),
  ]],
  switch: [.26, [tone(360, 94, .27, .006, .225), noise(3700, 480, .29, .004, .2, 80)]],
  reflector: [.95, [
    tone(178, 288, .18, .018, .65), tone(573, 544, .07, .017, .83), noise(2300, 500, .17, .006, .75, 145),
  ]],
  charge: [24, [
    tone(58, 105, .18, 2.4, 9, 2.7), tone(117, 211, .075, 3.1, 10.5, 3.1),
    tone(235, 316, .036, 4.6, 6.2, 4.7), noise(660, 1390, .075, 3, 7.6, 65),
  ]],
  align: [5, [
    tone(197, 294, .16, .49, 2.3, 3.6), tone(299, 439, .13, .82, 2.55, 2.8),
    noise(1400, 2600, .11, .74, 1.9, 80),
  ]],
  ascent: [15, [
    tone(84, 158, .19, 1.6, .7, 3.4), tone(168, 318, .071, 2.8, 1.2, 4.3),
    tone(253, 479, .049, 3.2, 1.1, 5.4), noise(950, 3100, .105, 2.2, 1.3, 120),
  ]],
  thrust: [.66, [
    tone(61, 268, .39, .11, .08, 10), tone(231, 1038, .22, .14, .13),
    noise(340, 5200, .38, .16, .09, 80),
  ]],
  launch: [1.48, [
    tone(112, 35, .34, .014, 1.1), tone(390, 2110, .15, .043, 1.32),
    noise(4800, 550, .73, .012, 1.3, 130),
  ]],
  burst: [3.55, [
    tone(103, 30, .79, .025, 3.33), tone(196, 43, .32, .021, 3.32),
    tone(390, 191, .10, .016, 3.44, 4.2), noise(4600, 140, .87, .015, 3.48, 28),
  ]],
  echo: [1.6, [
    tone(190, 72, .35, .13, 1.32), tone(541, 392, .095, .19, 1.35, 5),
    noise(2300, 425, .41, .18, 1.33, 90),
  ]],
  nebula: [18, [
    tone(137, 139, .11, 1.8, 12, .4), tone(209, 207, .071, 2.8, 11.8, .65),
    tone(277, 278, .046, 4, 10.7, 1.1), noise(950, 580, .065, 2.4, 12.2, 190),
  ]],
  docking: [3.65, [
    tone(120, 43, .28, .15, 1.72, 2.6), tone(255, 87, .075, .18, 2.16, 3.5),
    noise(1480, 210, .30, .07, 2.01, 80),
  ]],
  ring: [3.35, [
    tone(143, 295, .25, .11, 1.64, 3.2), tone(286, 590, .084, .14, 2.53, 4.4),
    noise(540, 1800, .12, .23, 1.7, 70),
  ]],
  crown: [3.4, [
    tone(226, 362, .21, .20, 2, 2.9), tone(452, 724, .09, .21, 2.4, 3.9),
    noise(640, 3100, .18, .3, 1.8, 120),
  ]],
  beam: [3.6, [
    tone(104, 208, .21, .32, 1.6), tone(313, 471, .09, .36, 2.2, 2.4),
    tone(627, 940, .065, .4, 2.68), noise(970, 3500, .14, .32, 2.3, 250),
  ]],
  gridUp: [12, [
    tone(42, 77, .14, .8, 2.9, 3), tone(84, 155, .075, 1.1, 3, 4.2),
    noise(430, 720, .12, .7, 3.2, 70),
  ]],
  ready: [1.65, [tone(392, 392, .14, .013, 1.51), tone(587, 587, .085, .03, 1.48), tone(784, 784, .043, .04, 1.39)]],
};

const cue = (at, sound, level = 1, rate = 1, pan = 0) => ({ at, sound, level, rate, pan });
const timedShowCue = (at, ...sound) => cue(STELLAR_DRAIN_DURATION + at, ...sound);
const gridSwitches = (start, duration, poweringUp) => Array.from({ length: 10 }, (_, index) => {
  const progress = index / 9;
  return cue(start + duration * (.05 + .9 * progress), "switch", .5, poweringUp ? .8 + .6 * progress : 1.2 - .52 * progress,
    (index % 2 ? 1 : -1) * (poweringUp ? progress : 1 - progress) * .44);
});

const show = [
  cue(0, "gridDown"), ...gridSwitches(0, STELLAR_DRAIN_DURATION, false),
  ...Array.from({ length: 8 }, (_, i) => timedShowCue(.2 + i * 1.2, "reflector", .61, .88 + .035 * i, (i % 2 ? 1 : -1) * .34)),
  timedShowCue(9, "charge"), timedShowCue(STELLAR_LIFT_START - 6, "align", .78),
  timedShowCue(STELLAR_LIFT_START, "ascent"), timedShowCue(STELLAR_THRUST_START, "thrust"),
  timedShowCue(STELLAR_LAUNCH, "launch"), timedShowCue(STELLAR_BURST, "burst"),
  timedShowCue(STELLAR_WAVES[1].start, "echo", .62, 1.04, -.28),
  timedShowCue(STELLAR_WAVES[2].start, "echo", .40, .89, .28),
  timedShowCue(STELLAR_WAVE_END, "nebula"), timedShowCue(STELLAR_SHUTDOWN, "docking", .65),
  timedShowCue(STELLAR_ORBITS_DESCENT_START, "docking", .81, .76),
  timedShowCue(STELLAR_CROWN_RETRACTED, "docking", .76, .93),
].sort((a, b) => a.at - b.at);

const reactivation = [
  cue(.05, "switch", .67, .96),
  ...STELLAR_ORBIT_RISES.map(([start], index) => cue(start, "ring", .82, 1.19 - .13 * index, (index - 1) * .16)),
  cue(STELLAR_CROWN_LIFT_START, "crown"), cue(STELLAR_RELIGHT, "ready", .72, 1.14),
  cue(STELLAR_BEAM_RETURN, "beam"), cue(STELLAR_REACTIVATION_DURATION, "gridUp"),
  ...gridSwitches(STELLAR_REACTIVATION_DURATION, STELLAR_GRID_RESTORE_DURATION, true),
  cue(STELLAR_REACTIVATION_DURATION + STELLAR_GRID_RESTORE_DURATION - 1.6, "ready", .75),
].sort((a, b) => a.at - b.at);

function renderSound(context, name) {
  const [duration, layers] = sounds[name];
  const buffer = context.createBuffer(1, Math.ceil(duration * sampleRate), sampleRate);
  const samples = buffer.getChannelData(0);
  for (const layer of layers) {
    let phase = 0, smooth = 0, bass = 0, seed = 652195;
    const cutoff = 1 - Math.exp(-tau * (layer.floor ?? 0) / sampleRate);
    const glide = (layer.to / layer.from) ** (1 / samples.length);
    let frequency = layer.from;
    for (let i = 0; i < samples.length; i++) {
      const time = i / sampleRate;
      const attack = Math.min(1, time / layer.attack);
      const fade = Math.min(1, (duration - time) / layer.release);
      const volume = layer.level * attack * attack * fade * fade;
      if (layer.noise) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const sample = seed / 2147483648 - 1;
        smooth += (sample - smooth) * (1 - Math.exp(-tau * frequency / sampleRate));
        bass += (sample - bass) * cutoff;
        samples[i] += (smooth - bass) * volume;
      } else {
        phase += tau * frequency / sampleRate;
        const pulse = layer.tremolo ? .83 + .17 * Math.sin(tau * time * layer.tremolo) : 1;
        samples[i] += Math.sin(phase) * volume * pulse;
      }
      frequency *= glide;
    }
  }
  return buffer;
}

export function createStellarAudio(AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext) {
  const soundsByName = new Map();
  let context, master, playback;
  let muted = false;
  let resuming = false;

  function unlock() {
    if (!AudioContext || muted || resuming) return;
    if (!context) {
      try {
        context = new AudioContext();
      } catch {
        return;
      }
      master = context.createGain();
      master.gain.value = .77;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -17;
      limiter.ratio.value = 5;
      limiter.attack.value = .006;
      limiter.release.value = .24;
      master.connect(limiter).connect(context.destination);
    }
    if (context.state !== "running" && context.state !== "closed") {
      resuming = true;
      context.resume().catch(() => {}).finally(() => { resuming = false; });
    }
  }

  function stop() {
    if (!playback) return;
    const { output, sources } = playback;
    playback = undefined;
    if (!sources.size) {
      output.disconnect();
      return;
    }
    const now = context.currentTime;
    output.gain.setTargetAtTime(0, now, .018);
    for (const source of sources) source.stop(now + .08);
  }

  function schedule(track, { at, sound, level, rate, pan }, elapsed, now) {
    const offset = Math.max(0, elapsed - at) * rate;
    if (offset >= sounds[sound][0]) return;
    if (!soundsByName.has(sound)) soundsByName.set(sound, renderSound(context, sound));
    const source = context.createBufferSource();
    source.buffer = soundsByName.get(sound);
    source.playbackRate.value = rate;
    const gain = context.createGain();
    gain.gain.value = level;
    const panner = pan ? context.createStereoPanner?.() : undefined;
    source.connect(gain);
    if (panner) {
      panner.pan.value = pan;
      gain.connect(panner).connect(track.output);
    } else gain.connect(track.output);
    track.sources.add(source);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      panner?.disconnect();
      track.sources.delete(source);
      if (playback !== track && !track.sources.size) track.output.disconnect();
    };
    source.start(Math.max(now, track.startsAt + at), offset);
  }

  function sync(monument, wallTime) {
    const timestamp = monument?.stellarAt ?? monument?.stellarReactivatedAt;
    if (!timestamp || muted || context?.state !== "running") {
      stop();
      return;
    }
    const score = monument.stellarAt ? show : reactivation;
    const elapsed = stellarElapsed(timestamp, wallTime);
    const now = context.currentTime;
    const startsAt = now - elapsed;
    if (playback?.timestamp !== timestamp || playback.score !== score || Math.abs(playback.startsAt - startsAt) > .3) {
      stop();
      const output = context.createGain();
      output.gain.setValueAtTime(0, now);
      output.gain.linearRampToValueAtTime(1, now + .025);
      output.connect(master);
      playback = { timestamp, startsAt, score, output, sources: new Set(), index: 0 };
    }
    while (score[playback.index]?.at <= elapsed + .6) {
      schedule(playback, score[playback.index], elapsed, now);
      playback.index++;
    }
  }

  return {
    supported: Boolean(AudioContext), unlock, sync, stop,
    setMuted(value) {
      muted = value;
      if (muted) stop();
    },
  };
}
