export const STELLAR_REACTIVATION_PRICE = 100_000;
export const STELLAR_REACTIVATION_DURATION = 22;
export const STELLAR_GRID_RESTORE_DURATION = 12;
export const STELLAR_REACTIVATION_TOTAL = STELLAR_REACTIVATION_DURATION + STELLAR_GRID_RESTORE_DURATION;
export const STELLAR_ORBIT_RISES = [[.9, 3.6, 6.5], [4.05, 6.8, 7.5], [7.25, 10, 8.2]];
export const STELLAR_CROWN_LIFT_START = 13.3;
export const STELLAR_RELIGHT = 17.9;
export const STELLAR_BEAM_RETURN = 19.1;
export const STELLAR_SHUTDOWN = 90;
export const STELLAR_ORBITS_DESCENT_START = 95;
export const STELLAR_ORBITS_DOCKED = 101;
export const STELLAR_CROWN_RETRACTED = 102.7;
export const STELLAR_DURATION = 109;
export const STELLAR_DRAIN_DURATION = 12;
export const STELLAR_EVENT_DURATION = STELLAR_DRAIN_DURATION + STELLAR_DURATION;
export const STELLAR_ALTITUDE = 640;
export const STELLAR_LIFT_HEIGHT = 47;
export const STELLAR_LIFT_START = 40;
export const STELLAR_RINGS_ALIGNED = STELLAR_LIFT_START - 1;
// Leave room for the alignment confirmation, reactor status and countdown.
export const STELLAR_LAUNCH = 60;
export const STELLAR_THRUST_START = STELLAR_LAUNCH - .56;
export const STELLAR_ARRIVAL = STELLAR_LAUNCH + .67;
export const STELLAR_BURST = STELLAR_LAUNCH + 2.15;
export const STELLAR_WAVES = [
  { start: STELLAR_BURST, duration: 1.55, peak: 1 },
  { start: STELLAR_BURST + 3.65, duration: 1.65, peak: .48 },
  { start: STELLAR_BURST + 5.55, duration: 1.8, peak: .28 },
];
export const STELLAR_WAVE_END = STELLAR_WAVES.at(-1).start + STELLAR_WAVES.at(-1).duration;

export const isStellarTimestamp = (value) => Number.isSafeInteger(value) && value > 0 &&
  value <= 8_640_000_000_000_000;
export const isStellarNight = (hour) => hour === "23";

export const stellarElapsed = (startedAt, now) => Math.max(0, (now - startedAt) / 1000);
export const stellarShowElapsed = (startedAt, now) => stellarElapsed(startedAt, now) - STELLAR_DRAIN_DURATION;
export const stellarInProgress = (startedAt, now) =>
  isStellarTimestamp(startedAt) && stellarElapsed(startedAt, now) < STELLAR_EVENT_DURATION;
export const stellarBusy = (monument, now) => stellarInProgress(monument?.stellarAt, now) ||
  (isStellarTimestamp(monument?.stellarReactivatedAt) &&
    stellarElapsed(monument.stellarReactivatedAt, now) < STELLAR_REACTIVATION_TOTAL);
