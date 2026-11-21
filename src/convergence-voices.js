import { STELLAR_BURST, STELLAR_DRAIN_DURATION, STELLAR_REACTIVATION_DURATION,
  STELLAR_RINGS_ALIGNED, STELLAR_THRUST_START } from "./stellar-event.js";

// Original recordings, in the order supplied. Keep the complete takes and
// finish the entire countdown before ignition and launch begin.
const countdownDuration = 7.157542;
const countdownAt = STELLAR_DRAIN_DURATION + STELLAR_THRUST_START - countdownDuration - .15;
export const CONVERGENCE_VOICES = [
  { id: "activation", phase: "show", at: 0, duration: 5.146104,
    src: new URL("./assets/audio/convergence/activation.mp3", import.meta.url).href },
  { id: "overload", phase: "show", at: STELLAR_DRAIN_DURATION + STELLAR_RINGS_ALIGNED + .1, duration: 5.328979,
    src: new URL("./assets/audio/convergence/overload.mp3", import.meta.url).href },
  { id: "half-charge", phase: "show", at: STELLAR_DRAIN_DURATION + 27.3, duration: 5.720813,
    src: new URL("./assets/audio/convergence/half-charge.mp3", import.meta.url).href },
  { id: "charged", phase: "show", at: countdownAt - 6.269375 - .55, duration: 6.269375,
    src: new URL("./assets/audio/convergence/charged.mp3", import.meta.url).href },
  { id: "countdown", phase: "show", at: countdownAt, duration: countdownDuration,
    src: new URL("./assets/audio/convergence/countdown.mp3", import.meta.url).href },
  { id: "burst", phase: "show", at: STELLAR_DRAIN_DURATION + STELLAR_BURST, duration: 2.507750,
    src: new URL("./assets/audio/convergence/burst.mp3", import.meta.url).href },
  { id: "restoration", phase: "reactivation", at: STELLAR_REACTIVATION_DURATION, duration: 5.564063,
    src: new URL("./assets/audio/convergence/restoration.mp3", import.meta.url).href },
];

export const convergenceVoiceCues = phase => CONVERGENCE_VOICES.filter(clip => clip.phase === phase)
  .map(clip => ({ at: clip.at, voice: clip.id, level: 1, rate: 1, pan: 0 }));
