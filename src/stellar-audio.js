import {
  STELLAR_BEAM_RETURN, STELLAR_BURST, STELLAR_CROWN_LIFT_START, STELLAR_CROWN_RETRACTED,
  STELLAR_DRAIN_DURATION, STELLAR_GRID_RESTORE_DURATION, STELLAR_LAUNCH, STELLAR_LIFT_START,
  STELLAR_ORBIT_RISES, STELLAR_ORBITS_DESCENT_START, STELLAR_REACTIVATION_DURATION, STELLAR_RELIGHT,
  STELLAR_SHUTDOWN, STELLAR_THRUST_START, STELLAR_WAVE_END, STELLAR_WAVES, stellarElapsed,
} from "./stellar-event.js";
import { CONVERGENCE_VOICES, convergenceVoiceCues } from "./convergence-voices.js";
import { Vector3, Quaternion } from "three";

export const CONVERGENCE_GRID_DOWN = { id: "gridDown", duration: 2,
  src: new URL("./assets/audio/convergence/grid-down.wav", import.meta.url).href };
export const CONVERGENCE_EFFECT_RECORDINGS = [
  CONVERGENCE_GRID_DOWN,
  { id: "impulse", duration: 2.31, src: new URL("./assets/audio/impulso-convergencia.wav", import.meta.url).href },
  { id: "burstEffect", duration: 3.5, src: new URL("./assets/audio/explosao-estelar.wav", import.meta.url).href },
];
export const CONVERGENCE_VOICE_RANGE = { refDistance: 28, maxDistance: 180, height: 12 };
const recordings = [...CONVERGENCE_VOICES, ...CONVERGENCE_EFFECT_RECORDINGS];

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
  ascent: [STELLAR_LAUNCH - STELLAR_LIFT_START, [
    tone(84, 158, .19, 1.6, .7, 3.4), tone(168, 318, .071, 2.8, 1.2, 4.3),
    tone(253, 479, .049, 3.2, 1.1, 5.4), noise(950, 3100, .105, 2.2, 1.3, 120),
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
  timedShowCue(STELLAR_LIFT_START, "ascent"), timedShowCue(STELLAR_THRUST_START, "impulse", .58),
  timedShowCue(STELLAR_BURST, "burstEffect", .73),
  timedShowCue(STELLAR_WAVES[1].start, "echo", .62, 1.04, -.28),
  timedShowCue(STELLAR_WAVES[2].start, "echo", .40, .89, .28),
  timedShowCue(STELLAR_WAVE_END, "nebula"), timedShowCue(STELLAR_SHUTDOWN, "docking", .65),
  timedShowCue(STELLAR_ORBITS_DESCENT_START, "docking", .81, .76),
  timedShowCue(STELLAR_CROWN_RETRACTED, "docking", .76, .93),
  ...convergenceVoiceCues("show"),
].sort((a, b) => a.at - b.at);

const reactivation = [
  cue(.05, "switch", .67, .96),
  ...STELLAR_ORBIT_RISES.map(([start], index) => cue(start, "ring", .82, 1.19 - .13 * index, (index - 1) * .16)),
  cue(STELLAR_CROWN_LIFT_START, "crown"), cue(STELLAR_RELIGHT, "ready", .72, 1.14),
  cue(STELLAR_BEAM_RETURN, "beam"), cue(STELLAR_REACTIVATION_DURATION, "gridUp"),
  ...gridSwitches(STELLAR_REACTIVATION_DURATION, STELLAR_GRID_RESTORE_DURATION, true),
  cue(STELLAR_REACTIVATION_DURATION + STELLAR_GRID_RESTORE_DURATION - 1.6, "ready", .75),
  ...convergenceVoiceCues("reactivation"),
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

export function createStellarAudio(AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext,
  { fetchAudio = globalThis.fetch?.bind(globalThis) } = {}) {
  const soundsByName = new Map();
  const recordingBuffers = new Map(), loadingRecordings = new Set(), failedRecordings = new Set();
  const recordingClips = new Map(recordings.map(clip => [clip.id, clip]));
  const speakerPosition = new Vector3(), listenerPosition = new Vector3(), listenerRotation = new Quaternion();
  const listenerForward = new Vector3(), listenerUp = new Vector3();
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
    for (const clip of recordings) {
      if (!fetchAudio || recordingBuffers.has(clip.id) || loadingRecordings.has(clip.id)) continue;
      loadingRecordings.add(clip.id);
      failedRecordings.delete(clip.id);
      Promise.resolve().then(() => fetchAudio(clip.src)).then(response => {
        if (!response.ok) throw new Error(`Audio asset ${response.status}`);
        return response.arrayBuffer();
      }).then(bytes => context.decodeAudioData(bytes)).then(buffer => recordingBuffers.set(clip.id, buffer))
        .catch(() => failedRecordings.add(clip.id)).finally(() => loadingRecordings.delete(clip.id));
    }
    if (context.state !== "running" && context.state !== "closed") {
      resuming = true;
      context.resume().catch(() => {}).finally(() => { resuming = false; });
    }
  }

  function disconnectTrack(track) {
    track.output.disconnect();
    track.effects.disconnect();
    track.voiceEmitter.disconnect();
  }

  function spatialAudio(track, monument, camera) {
    if (monument.model?.getWorldPosition) monument.model.getWorldPosition(speakerPosition);
    else speakerPosition.set(monument.x ?? 0, monument.model?.position.y ?? 0, monument.z ?? 0);
    speakerPosition.y += CONVERGENCE_VOICE_RANGE.height;
    const emitter = track.voiceEmitter;
    if (emitter.positionX) {
      emitter.positionX.value = speakerPosition.x;
      emitter.positionY.value = speakerPosition.y;
      emitter.positionZ.value = speakerPosition.z;
    } else emitter.setPosition(speakerPosition.x, speakerPosition.y, speakerPosition.z);
    if (!camera) return 1;
    camera.getWorldPosition(listenerPosition);
    camera.getWorldQuaternion(listenerRotation);
    listenerForward.set(0, 0, -1).applyQuaternion(listenerRotation);
    listenerUp.set(0, 1, 0).applyQuaternion(listenerRotation);
    const listener = context.listener;
    if (listener.positionX) {
      listener.positionX.value = listenerPosition.x;
      listener.positionY.value = listenerPosition.y;
      listener.positionZ.value = listenerPosition.z;
      listener.forwardX.value = listenerForward.x;
      listener.forwardY.value = listenerForward.y;
      listener.forwardZ.value = listenerForward.z;
      listener.upX.value = listenerUp.x;
      listener.upY.value = listenerUp.y;
      listener.upZ.value = listenerUp.z;
    } else {
      listener.setPosition(listenerPosition.x, listenerPosition.y, listenerPosition.z);
      listener.setOrientation(listenerForward.x, listenerForward.y, listenerForward.z, listenerUp.x, listenerUp.y, listenerUp.z);
    }
    const { refDistance, maxDistance } = CONVERGENCE_VOICE_RANGE;
    return Math.max(0, Math.min(1, (maxDistance - listenerPosition.distanceTo(speakerPosition)) / (maxDistance - refDistance)));
  }

  function stop() {
    if (!playback) return;
    const track = playback;
    const { output, sources } = track;
    track.pendingRecordings.clear();
    playback = undefined;
    if (!sources.size) {
      disconnectTrack(track);
      return;
    }
    const now = context.currentTime;
    output.gain.setTargetAtTime(0, now, .018);
    for (const source of sources) source.stop(now + .08);
  }

  function schedule(track, entry, elapsed, now) {
    const { at, sound, voice, level, rate, pan } = entry;
    const offset = Math.max(0, elapsed - at) * rate;
    const recording = recordingClips.get(voice ?? sound);
    let buffer;
    if (recording && !(sound === "gridDown" && (failedRecordings.has(sound) || !fetchAudio))) {
      buffer = recordingBuffers.get(recording.id);
      if (!buffer) {
        if (loadingRecordings.has(recording.id) && offset < recording.duration) track.pendingRecordings.add(entry);
        return;
      }
    } else {
      if (offset >= sounds[sound][0]) return;
      if (!soundsByName.has(sound)) soundsByName.set(sound, renderSound(context, sound));
      buffer = soundsByName.get(sound);
    }
    if (offset >= buffer.duration) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = context.createGain();
    gain.gain.value = level;
    const panner = pan ? context.createStereoPanner?.() : undefined;
    source.connect(gain);
    if (panner) {
      panner.pan.value = pan;
      gain.connect(panner).connect(voice ? track.voiceEmitter : track.effects);
    } else gain.connect(voice ? track.voiceEmitter : track.effects);
    track.sources.add(source);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      panner?.disconnect();
      track.sources.delete(source);
      if (playback !== track && !track.sources.size) disconnectTrack(track);
    };
    source.start(Math.max(now, track.startsAt + at), offset);
  }

  function sync(monument, wallTime, camera) {
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
      const effects = context.createGain(); effects.connect(output);
      const voiceEmitter = context.createPanner();
      voiceEmitter.panningModel = "HRTF";
      voiceEmitter.distanceModel = "linear";
      voiceEmitter.refDistance = CONVERGENCE_VOICE_RANGE.refDistance;
      voiceEmitter.maxDistance = CONVERGENCE_VOICE_RANGE.maxDistance;
      voiceEmitter.rolloffFactor = 1;
      voiceEmitter.connect(output);
      playback = { timestamp, startsAt, score, output, effects, voiceEmitter, sources: new Set(), pendingRecordings: new Set(), index: 0 };
    }
    const audibility = spatialAudio(playback, monument, camera);
    while (score[playback.index]?.at <= elapsed + .6) {
      schedule(playback, score[playback.index], elapsed, now);
      playback.index++;
    }
    for (const entry of playback.pendingRecordings) {
      const recording = entry.voice ?? entry.sound;
      if (recordingBuffers.has(recording) || failedRecordings.has(recording) || elapsed >= entry.at + recordingClips.get(recording).duration) {
        playback.pendingRecordings.delete(entry);
        if (recordingBuffers.has(recording) || failedRecordings.has(recording)) schedule(playback, entry, elapsed, now);
      }
    }
    const speaking = score.some(entry => entry.voice && recordingBuffers.has(entry.voice) &&
      elapsed >= entry.at && elapsed < entry.at + recordingBuffers.get(entry.voice).duration);
    const effectsLevel = speaking ? 1 - .75 * audibility : 1;
    if (playback.effectsLevel !== effectsLevel) {
      playback.effects.gain.setTargetAtTime(effectsLevel, now, .07);
      playback.effectsLevel = effectsLevel;
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
