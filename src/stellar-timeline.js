import { createTimeline } from "animejs/timeline";
import { MathUtils } from "three";
import {
  STELLAR_ARRIVAL, STELLAR_BEAM_RETURN, STELLAR_BURST, STELLAR_CROWN_LIFT_START, STELLAR_CROWN_RETRACTED,
  STELLAR_DURATION, STELLAR_LAUNCH, STELLAR_LIFT_START, STELLAR_ORBIT_RISES, STELLAR_ORBITS_DESCENT_START,
  STELLAR_ORBITS_DOCKED, STELLAR_REACTIVATION_DURATION, STELLAR_RELIGHT, STELLAR_SHUTDOWN,
  STELLAR_RINGS_ALIGNED, STELLAR_THRUST_START, STELLAR_WAVE_END, STELLAR_WAVES,
} from "./stellar-event.js";

function tracks(state) {
  const timeline = createTimeline({ autoplay: false, defaults: { ease: "inOutSine" } });
  return {
    add(target, property, frames) {
      let end = 0;
      const keyframes = frames.map(([second, value, ease]) => {
        const duration = (second - end) * 1000;
        end = second;
        return { to: value, duration, ...(ease ? { ease } : {}) };
      });
      timeline.add(target, { [property]: keyframes }, 0);
    },
    sample(elapsed, duration) {
      timeline.seek(MathUtils.clamp(elapsed, 0, duration) * 1000, true);
      return state;
    },
  };
}

export function createStellarTimeline() {
  const state = {
    reflector: 0, charge: 0, crown: 0, lift: 0, launch: 0, doors: 0, flare: 0,
    dayFlash: 0, waves: STELLAR_WAVES.map(() => ({ radius: 0, power: 0 })),
    nebula: 0, darkness: .88, arms: 0,
    ringAlignment: 0, ringSpacing: 0, ringThrust: 0, ringDischarge: 0,
    ringDescent: 0, crownRetraction: 0, crownDescent: 0,
  };
  const show = tracks(state);
  const track = (property, frames) => show.add(state, property, frames);
  const ringReturnStart = STELLAR_LAUNCH + .12;
  const ringReturnEnd = STELLAR_LAUNCH + 7.6;
  track("reflector", [[9.6, 1, "linear"], [STELLAR_LAUNCH, 1], [81, 0]]);
  track("charge", [[10, 0], [40, .81], [STELLAR_LAUNCH - 1, 1], [STELLAR_LAUNCH, 1], [STELLAR_LAUNCH + 6, .51], [78, 0]]);
  track("crown", [[19, 0], [51, 1], [STELLAR_LAUNCH + 9, .86], [87, 0]]);
  track("ringAlignment", [[STELLAR_LIFT_START - 6, 0], [STELLAR_RINGS_ALIGNED, 1]]);
  track("ringSpacing", [[STELLAR_LIFT_START + .4, 0], [STELLAR_LIFT_START + 5.6, 1],
    [ringReturnStart, 1], [ringReturnEnd, 0]]);
  track("ringThrust", [[STELLAR_THRUST_START, 0], [STELLAR_LAUNCH - .035, 1, "inOutCubic"],
    [ringReturnStart, 1], [ringReturnEnd, 0]]);
  track("ringDischarge", [[STELLAR_LAUNCH - .5, 0], [STELLAR_LAUNCH - .1, .53],
    [STELLAR_LAUNCH + .055, 1], [STELLAR_LAUNCH + .65, 0, "outQuad"]]);
  track("lift", [[STELLAR_LIFT_START, 0], [STELLAR_LAUNCH, 1]]);
  track("launch", [[STELLAR_LAUNCH, 0], [STELLAR_ARRIVAL, 1, "inQuad"]]);
  track("doors", [[38, 0], [STELLAR_LAUNCH - 2, 1], [STELLAR_LAUNCH + 10, 1], [86, 0]]);
  track("flare", [[STELLAR_BURST, 0], [STELLAR_BURST + .17, 1], [STELLAR_BURST + 3.9, 0, "outExpo"]]);
  track("dayFlash", [[STELLAR_BURST, 0], [STELLAR_BURST + .26, 1, "outCubic"], [STELLAR_BURST + 1.95, .93],
    [STELLAR_BURST + 3.55, 0]]);
  for (const [index, { start, duration, peak }] of STELLAR_WAVES.entries()) {
    const end = start + duration;
    const wave = state.waves[index];
    show.add(wave, "radius", [[start, 0], [end, Math.PI + .36, "linear"]]);
    show.add(wave, "power", [[start, 0], [start + .14, peak], [end - .23, peak * .79], [end, 0]]);
  }
  track("nebula", [[STELLAR_WAVE_END, 0], [STELLAR_WAVE_END + 2.5, .16], [80, .78], [STELLAR_SHUTDOWN, 1]]);
  track("darkness", [[.7, .88], [STELLAR_LAUNCH - 6, .936], [STELLAR_LAUNCH, .985], [STELLAR_ARRIVAL + .35, 0, "outCubic"]]);
  track("arms", [[2, .11], [15, .36], [40, .36], [STELLAR_LAUNCH - .4, 1],
    [STELLAR_BURST + 1.5, 1], [76, .18], [92, .36], [STELLAR_DURATION, 0]]);
  track("ringDescent", [[STELLAR_ORBITS_DESCENT_START, 0], [STELLAR_ORBITS_DOCKED, 1]]);
  track("crownRetraction", [[STELLAR_ORBITS_DOCKED, 0], [STELLAR_CROWN_RETRACTED, 1]]);
  track("crownDescent", [[STELLAR_CROWN_RETRACTED, 0], [STELLAR_DURATION, 1]]);

  // The orbit meshes are indexed from largest to smallest.
  const rises = [...STELLAR_ORBIT_RISES].reverse();
  const rearm = {
    orbits: rises.map(([liftStartsAt]) => ({ liftStartsAt, lift: 0, turn: 0, tilt: 0 })),
    core: 0, crownLiftStartsAt: STELLAR_CROWN_LIFT_START, crownLift: 0, crownOpen: 0, crownLight: 0, beam: 0, arms: 0,
  };
  const reset = tracks(rearm);
  for (const [index, orbit] of rearm.orbits.entries()) {
    const [from, arrival, speed] = rises[index];
    const acceleratingUntil = arrival + .42;
    const brakingAt = 11;
    const initialTurn = speed * .21;
    const atBrake = initialTurn + (brakingAt - acceleratingUntil) * speed;
    const finalTurn = atBrake + speed * 1.05;
    reset.add(orbit, "lift", [[from, 0], [arrival, 1]]);
    reset.add(orbit, "tilt", [[arrival, 0], [arrival + .5, 1]]);
    reset.add(orbit, "turn", [[arrival, 0], [acceleratingUntil, initialTurn, "inQuad"],
      [brakingAt, atBrake, "linear"], [13.1, finalTurn, "outQuad"]]);
  }
  reset.add(rearm, "core", [[1.10, 0], [1.55, .075], [3.6, .28], [4.05, .30], [6.8, .59], [7.25, .61],
    [10, .94], [12.45, 1]]);
  reset.add(rearm, "crownLift", [[rearm.crownLiftStartsAt, 0], [16.65, 1]]);
  reset.add(rearm, "crownOpen", [[16.65, 0], [17.25, 1]]);
  reset.add(rearm, "crownLight", [[STELLAR_RELIGHT, 0], [18.65, 1]]);
  reset.add(rearm, "beam", [[STELLAR_BEAM_RETURN, 0], [STELLAR_REACTIVATION_DURATION, 1, "outSine"]]);
  reset.add(rearm, "arms", [[.25, 0], [2.4, .52], [10, .52], [12.9, .23],
    [16.65, .75], [STELLAR_RELIGHT, .75], [STELLAR_REACTIVATION_DURATION, 0]]);
  return {
    sample: elapsed => show.sample(elapsed, STELLAR_DURATION),
    reactivationPose: elapsed => reset.sample(elapsed, STELLAR_REACTIVATION_DURATION),
  };
}
