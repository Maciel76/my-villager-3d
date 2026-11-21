import {STELLAR_LAUNCH,STELLAR_SHUTDOWN} from './stellar-event.js';

// Integral of a cubic speed ramp: 1x at the start, 25x at liftoff.
// Absolute elapsed time makes replay and saved missions produce the same pose.
export function stellarOrbitSpin(elapsed) {
  const t=Math.max(0,Math.min(elapsed,STELLAR_SHUTDOWN));
  const rise=Math.min(t,STELLAR_LAUNCH),peak=25;
  let phase=rise+(peak-1)*rise**4/(4*STELLAR_LAUNCH**3);
  if(t>STELLAR_LAUNCH) {
    const duration=Math.min(8,STELLAR_SHUTDOWN-STELLAR_LAUNCH-4);
    const after=t-STELLAR_LAUNCH,braking=Math.min(after,duration),u=braking/duration;
    phase+=peak*braking-(peak-1)*duration*(u**3-.5*u**4)+Math.max(0,after-duration);
  }
  const stop=Math.max(0,t-(STELLAR_SHUTDOWN-4));
  return phase-stop**2/8;
}
