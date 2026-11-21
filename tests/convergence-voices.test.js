import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONVERGENCE_VOICES, convergenceVoiceCues } from '../src/convergence-voices.js';
import { createStellarAudio, CONVERGENCE_GRID_DOWN, CONVERGENCE_VOICE_RANGE } from '../src/stellar-audio.js';
import { Object3D, PerspectiveCamera } from 'three';
import { createStellarTimeline } from '../src/stellar-timeline.js';
import { STELLAR_BURST, STELLAR_DRAIN_DURATION, STELLAR_LAUNCH, STELLAR_REACTIVATION_DURATION,
  STELLAR_THRUST_START } from '../src/stellar-event.js';

function audioFixture({ delayed = false, fail = false } = {}) {
  const starts = [], gains = [], requests = [], contexts = [], releases = [], panners = [];
  const clips = [...CONVERGENCE_VOICES, CONVERGENCE_GRID_DOWN];
  const parameter = () => ({ value: 1, targets: [], setValueAtTime() {}, linearRampToValueAtTime() {},
    setTargetAtTime(value) { this.targets.push(value); } });
  const node = () => ({ outputs: [], connect(target) { this.outputs.push(target); return target; },
    disconnect() { this.disconnected = true; } });
  class Context {
    constructor() {
      this.state = 'running'; this.currentTime = 0; this.destination = node();
      this.listener = Object.fromEntries(['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ',
        'upX', 'upY', 'upZ'].map(name => [name, parameter()]));
      contexts.push(this);
    }
    createPanner() {
      const panner = { ...node(), positionX: parameter(), positionY: parameter(), positionZ: parameter() };
      panners.push(panner); return panner;
    }
    createGain() { const gain = { ...node(), gain: parameter() }; gains.push(gain); return gain; }
    createDynamicsCompressor() { return { ...node(), threshold: {}, ratio: {}, attack: {}, release: {} }; }
    createBuffer(channels, length, rate) { return { duration: length / rate, getChannelData: () => new Float32Array(length) }; }
    createBufferSource() {
      const source = { ...node(), playbackRate: {}, start(when, offset) { starts.push({ source, when, offset }); },
        stop() { this.stopped = true; this.onended?.(); } };
      return source;
    }
    async decodeAudioData(index) { return { [index < CONVERGENCE_VOICES.length ? 'voice' : 'effect']: clips[index].id,
      duration: clips[index].duration }; }
  }
  const fetchAudio = async url => {
    requests.push(url);
    if (delayed) await new Promise(resolve => releases.push(resolve));
    const failed = typeof fail === 'function' ? fail(url) : fail;
    return { ok: !failed, status: failed ? 404 : 200,
      arrayBuffer: async () => clips.findIndex(clip => clip.src === url) };
  };
  const player = createStellarAudio(Context, { fetchAudio });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const voices = () => starts.filter(start => start.source.buffer.voice);
  const sync = (phase, elapsed, timestamp = 100000, { monument = {}, camera } = {}) => {
    contexts[0].currentTime = elapsed;
    player.sync({ ...monument, [phase === 'show' ? 'stellarAt' : 'stellarReactivatedAt']: timestamp }, timestamp + elapsed * 1000, camera);
  };
  return { player, starts, gains, requests, releases, voices, sync, settle, panners, contexts };
}

test('all seven original recordings exist and follow the animation phases', async () => {
  assert.equal(CONVERGENCE_VOICES.length, 7);
  assert.equal(convergenceVoiceCues('show').length, 6);
  assert.equal(convergenceVoiceCues('reactivation').length, 1);
  for (const clip of CONVERGENCE_VOICES) assert.ok((await readFile(new URL(clip.src))).length > 50000);
  const countdown = CONVERGENCE_VOICES.find(clip => clip.id === 'countdown');
  const charged = CONVERGENCE_VOICES.find(clip => clip.id === 'charged');
  const burst = CONVERGENCE_VOICES.find(clip => clip.id === 'burst');
  assert.equal(burst.at, STELLAR_DRAIN_DURATION + STELLAR_BURST);
  assert.ok(charged.at + charged.duration < countdown.at, 'the reactor announcement finishes before the countdown');
  assert.ok(countdown.at + countdown.duration < STELLAR_DRAIN_DURATION + STELLAR_THRUST_START,
    'the complete countdown recording finishes before ignition');
  assert.ok(countdown.at + countdown.duration < STELLAR_DRAIN_DURATION + STELLAR_LAUNCH,
    'launch only happens after the countdown has finished');
  assert.equal(CONVERGENCE_VOICES.at(-1).at, STELLAR_REACTIVATION_DURATION);
});

test('loads each recording once and schedules every voice without changing its speed', async () => {
  const audio = audioFixture();
  audio.player.unlock();
  await audio.settle();
  audio.player.unlock();
  await audio.settle();
  assert.equal(audio.requests.length, 8);
  for (const clip of CONVERGENCE_VOICES) {
    audio.player.stop();
    audio.sync(clip.phase, clip.at + .35);
    const voice = audio.voices().findLast(start => start.source.buffer.voice === clip.id);
    assert.ok(voice, clip.id);
    assert.ok(Math.abs(voice.offset - .35) < .00001, clip.id);
    assert.equal(voice.source.playbackRate.value, 1);
    const count = audio.voices().length;
    audio.sync(clip.phase, clip.at + .4);
    assert.equal(audio.voices().length, count, 'successive frames must not repeat a voice');
  }
});

test('alignment confirmation starts after the rings align, with no overlapping narration', () => {
  const alignment = CONVERGENCE_VOICES.find(clip => clip.id === 'overload');
  const timeline = createStellarTimeline();
  assert.equal(timeline.sample(alignment.at - STELLAR_DRAIN_DURATION).ringAlignment, 1);
  const clips = CONVERGENCE_VOICES.filter(clip => clip.phase === 'show').sort((a, b) => a.at - b.at);
  for (let index = 1; index < clips.length; index++) {
    const previous = clips[index - 1], current = clips[index];
    assert.ok(previous.at + previous.duration < current.at, `${previous.id} must finish before ${current.id}`);
  }
});

test('late downloads resume the current line and never replay expired lines', async () => {
  const audio = audioFixture({ delayed: true });
  audio.player.unlock();
  await audio.settle();
  audio.sync('show', 1);
  assert.equal(audio.voices().length, 0);
  audio.releases.forEach(resolve => resolve());
  await audio.settle();
  audio.sync('show', 2);
  assert.equal(audio.voices().length, 1);
  assert.equal(audio.voices()[0].source.buffer.voice, 'activation');
  assert.equal(audio.voices()[0].offset, 2);
  audio.player.stop();
  audio.sync('show', 15);
  assert.equal(audio.voices().length, 1, 'joining later must not play the introduction');
});

test('ducks effects during speech, restores them after speech, and respects mute and stop', async () => {
  const audio = audioFixture();
  audio.player.unlock();
  await audio.settle();
  audio.sync('show', 0);
  const effects = audio.gains.find(gain => gain.gain.targets.includes(.25));
  assert.ok(effects);
  audio.sync('show', 6);
  assert.equal(effects.gain.targets.at(-1), 1);
  audio.player.setMuted(true);
  assert.ok(audio.starts.every(start => start.source.stopped));
  const count = audio.starts.length;
  const overloadAt = CONVERGENCE_VOICES.find(clip => clip.id === 'overload').at;
  audio.sync('show', overloadAt);
  assert.equal(audio.starts.length, count);
  audio.player.setMuted(false);
  audio.sync('show', overloadAt + .4);
  assert.equal(audio.voices().at(-1).source.buffer.voice, 'overload');
  audio.player.sync(null, 0);
  assert.ok(audio.starts.every(start => start.source.stopped));
});

test('missing voice assets leave the existing sound effects functional', async () => {
  const audio = audioFixture({ fail: true });
  audio.player.unlock();
  await audio.settle();
  audio.sync('show', 1);
  assert.equal(audio.voices().length, 0);
  assert.ok(audio.starts.length > 0);
  audio.player.stop();
  assert.doesNotThrow(() => createStellarAudio(null).unlock());
});

test('the supplied blackout recording replaces the synthetic hum and plays once at the start', async () => {
  const audio = audioFixture();
  audio.player.unlock(); await audio.settle();
  const bytes = await readFile(new URL(CONVERGENCE_GRID_DOWN.src));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  audio.sync('show', 0);
  const blackout = audio.starts.find(start => start.source.buffer.effect === 'gridDown');
  assert.ok(blackout);
  assert.equal(blackout.source.buffer.duration, 2);
  assert.equal(blackout.offset, 0);
  assert.equal(blackout.source.playbackRate.value, 1);
  assert.ok(!audio.starts.some(start => start.source.buffer.duration === 12), 'no duplicate synthetic blackout hum');
  assert.notEqual(blackout.source.outputs[0].outputs[0], audio.panners[0], 'city blackout effect is separate from the monument speaker');
  audio.sync('show', .1);
  assert.equal(audio.starts.filter(start => start.source.buffer.effect === 'gridDown').length, 1);
});

test('narration comes from the monument, follows either camera and fades out with distance', async () => {
  const audio = audioFixture();
  audio.player.unlock(); await audio.settle();
  const parent = new Object3D(), model = new Object3D(), camera = new PerspectiveCamera();
  parent.position.set(100, 4, 20); model.position.set(30, 7, 60); parent.add(model);
  camera.position.set(130, 23, 100);
  const options = { monument: { model }, camera };
  audio.sync('show', .5, 100000, options);
  const emitter = audio.panners[0], listener = audio.contexts[0].listener;
  assert.deepEqual([emitter.positionX.value, emitter.positionY.value, emitter.positionZ.value], [130, 23, 80]);
  assert.equal(emitter.panningModel, 'HRTF');
  assert.equal(emitter.distanceModel, 'linear');
  assert.equal(emitter.maxDistance, CONVERGENCE_VOICE_RANGE.maxDistance);
  assert.equal(emitter.rolloffFactor, 1);
  assert.deepEqual([listener.positionX.value, listener.positionY.value, listener.positionZ.value], [130, 23, 100]);
  const voice = audio.voices()[0];
  assert.equal(voice.source.outputs[0].outputs[0], emitter, 'narration must not bypass the spatial emitter');
  const effects = audio.gains.find(gain => gain.gain.targets.includes(.25));
  assert.ok(effects);
  camera.position.z = 180;
  audio.sync('show', .6, 100000, options);
  assert.ok(effects.gain.targets.at(-1) > .25 && effects.gain.targets.at(-1) < 1);
  const walkingCamera = new PerspectiveCamera();
  walkingCamera.position.set(130, 23, 80 + CONVERGENCE_VOICE_RANGE.maxDistance + 20);
  walkingCamera.rotation.y = Math.PI / 2;
  audio.sync('show', .7, 100000, { ...options, camera: walkingCamera });
  assert.equal(effects.gain.targets.at(-1), 1, 'inaudible speech must not lower the city effects');
  assert.equal(listener.positionZ.value, walkingCamera.position.z);
  assert.ok(Math.abs(listener.forwardX.value + 1) < .00001, 'listener orientation follows camera rotation');
  assert.equal(audio.voices().length, 1, 'moving or changing cameras must not restart narration');
  model.position.x += 5;
  camera.position.z = 100;
  audio.sync('show', .8, 100000, options);
  assert.equal(emitter.positionX.value, 135, 'moving the monument also moves its speaker');
  assert.equal(effects.gain.targets.at(-1), .25, 'returning nearby restores speech audibility');
  audio.player.stop();
  assert.ok(emitter.disconnected);
});

test('an unavailable blackout file falls back to the original effect without losing narration', async () => {
  const audio = audioFixture({ fail: url => url === CONVERGENCE_GRID_DOWN.src });
  audio.player.unlock(); await audio.settle();
  audio.sync('show', .2);
  assert.equal(audio.voices().length, 1);
  assert.ok(audio.starts.some(start => start.source.buffer.duration === 12));
});
