"""Verify recordings, scheduling and spatial voice attenuation in real Web Audio.

Run against the development server: python tests/convergence-voices-browser.py
The test does not load or modify the saved village.
"""
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(os.environ['LOCALAPPDATA']) / 'Temp/vila-decoration-testing'))
from playwright.sync_api import sync_playwright

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5173/src/stellar-audio.js')
    page.evaluate('''async () => {
      const { createStellarAudio, CONVERGENCE_EFFECT_RECORDINGS } = await import('/src/stellar-audio.js');
      const { CONVERGENCE_VOICES } = await import('/src/convergence-voices.js');
      const { createStellarTimeline } = await import('/src/stellar-timeline.js');
      const { STELLAR_DRAIN_DURATION, STELLAR_THRUST_START, STELLAR_BURST } = await import('/src/stellar-event.js');
      window.effectTimes = { impulse: STELLAR_DRAIN_DURATION + STELLAR_THRUST_START,
        burstEffect: STELLAR_DRAIN_DURATION + STELLAR_BURST };
      const alignment = CONVERGENCE_VOICES.find(clip => clip.id === 'overload');
      const timeline = createStellarTimeline();
      if (timeline.sample(alignment.at - STELLAR_DRAIN_DURATION).ringAlignment !== 1)
        throw Error('Alignment announced before the rings finish aligning');
      const countdown = CONVERGENCE_VOICES.find(clip => clip.id === 'countdown');
      if (countdown.at + countdown.duration >= STELLAR_DRAIN_DURATION + STELLAR_THRUST_START)
        throw Error('Countdown overlaps ignition');
      window.clips = CONVERGENCE_VOICES;
      window.recordings = [...clips, ...CONVERGENCE_EFFECT_RECORDINGS];
      window.audioProbe = { decoded: [], starts: [], buffers: new Map() };
      class TrackingContext extends AudioContext {
        constructor() { super(); audioProbe.context = this; }
        async decodeAudioData(bytes) {
          const buffer = await super.decodeAudioData(bytes);
          buffer.voiceId = clips.find(clip => Math.abs(clip.duration - buffer.duration) < .002)?.id;
          const recording = recordings.find(clip => Math.abs(clip.duration - buffer.duration) < .002);
          buffer.recordingId = recording?.id;
          audioProbe.decoded.push({ id: recording?.id, duration: buffer.duration });
          audioProbe.buffers.set(recording?.src, buffer);
          return buffer;
        }
        createBufferSource() {
          const source = super.createBufferSource();
          const start = source.start.bind(source), stop = source.stop.bind(source);
          source.start = (when, offset) => {
            const entry = { voice: source.buffer.voiceId, recording: source.buffer.recordingId,
              when, offset, rate: source.playbackRate.value };
            source.stop = (...args) => { entry.stopped = true; return stop(...args); };
            audioProbe.starts.push(entry);
            return start(when, offset);
          };
          return source;
        }
      }
      window.player = createStellarAudio(TrackingContext);
      const button = document.createElement('button');
      button.textContent = 'Unlock audio';
      button.onclick = () => player.unlock();
      document.body.replaceChildren(button);
    }''')
    page.get_by_role('button', name='Unlock audio').click()
    page.wait_for_function('audioProbe.decoded.length === recordings.length && audioProbe.context.state === "running"')
    page.evaluate('''() => {
      const timestamp = Date.now();
      player.sync({ stellarAt: timestamp }, timestamp);
      if (!audioProbe.starts.some(entry => entry.recording === 'gridDown')) throw Error('Blackout WAV missing');
      audioProbe.playingSince = audioProbe.context.currentTime;
    }''')
    page.wait_for_function('audioProbe.context.currentTime > audioProbe.playingSince + .2')
    result = page.evaluate('''() => {
      for (const [index, clip] of clips.entries()) {
        player.stop();
        const timestamp = 100000 + index * 100000;
        const monument = { [clip.phase === 'show' ? 'stellarAt' : 'stellarReactivatedAt']: timestamp };
        player.sync(monument, timestamp + (clip.at + .35) * 1000);
        const voice = audioProbe.starts.findLast(entry => entry.voice === clip.id);
        if (!voice || Math.abs(voice.offset - .35) > .001 || voice.rate !== 1) throw Error(`Scheduling failed: ${clip.id}`);
        const count = audioProbe.starts.length;
        player.sync(monument, timestamp + (clip.at + .36) * 1000);
        if (count !== audioProbe.starts.length) throw Error(`Repeated sound: ${clip.id}`);
      }
      for (const [id, at] of Object.entries(effectTimes)) {
        player.stop();
        const timestamp = 1000000;
        player.sync({ stellarAt: timestamp }, timestamp + (at + .25) * 1000);
        const effect = audioProbe.starts.findLast(entry => entry.recording === id);
        if (!effect || Math.abs(effect.offset - .25) > .001) throw Error(`Missing recorded effect: ${id}`);
        if (id === 'burstEffect' && !audioProbe.starts.some(entry => entry.voice === 'burst' && !entry.stopped))
          throw Error('Explosion effect replaced the narration');
      }
      player.setMuted(true);
      if (audioProbe.starts.some(entry => !entry.stopped)) throw Error('Mute left active sources');
      const count = audioProbe.starts.length;
      player.sync({ stellarAt: 100000 }, 100500);
      if (count !== audioProbe.starts.length) throw Error('Muted playback');
      return { decoded: audioProbe.decoded, scheduled: audioProbe.starts.filter(entry => entry.voice), muted: true };
    }''')
    assert not errors, errors
    assert {clip['id'] for clip in result['decoded']} == {
        'activation', 'overload', 'half-charge', 'charged', 'countdown', 'burst', 'restoration', 'gridDown',
        'impulse', 'burstEffect'
    }
    # Render the actual recorded voice through the production spatial graph.
    # Suppress only effects so their global sound cannot mask a leaking voice.
    result['spatial'] = page.evaluate('''async () => {
      const { createStellarAudio, CONVERGENCE_VOICE_RANGE } = await import('/src/stellar-audio.js');
      const { Object3D, PerspectiveCamera } = await import('/node_modules/.vite/deps/three.js');
      async function measure(distance) {
        const offline = new OfflineAudioContext(2, 48000, 48000);
        let decoded = 0;
        class RenderContext {
          constructor() {
            this.state = 'running'; this.currentTime = 0;
            this.destination = offline.destination; this.listener = offline.listener;
          }
          createGain() { return offline.createGain(); }
          createPanner() { return offline.createPanner(); }
          createStereoPanner() { return offline.createStereoPanner(); }
          createDynamicsCompressor() { return offline.createDynamicsCompressor(); }
          createBuffer(...args) { return offline.createBuffer(...args); }
          async decodeAudioData(url) { decoded++; return audioProbe.buffers.get(url); }
          createBufferSource() {
            const source = offline.createBufferSource(), start = source.start.bind(source);
            source.start = (...args) => { if (source.buffer.voiceId) start(...args); };
            return source;
          }
        }
        const player = createStellarAudio(RenderContext, {
          fetchAudio: async url => ({ ok: true, arrayBuffer: async () => url })
        });
        player.unlock();
        const deadline = performance.now() + 5000;
        while (decoded < recordings.length && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
        if (decoded !== recordings.length) throw Error('Offline recordings not loaded');
        await new Promise(resolve => setTimeout(resolve, 0));
        const model = new Object3D(), camera = new PerspectiveCamera();
        model.position.set(30, 2, 60);
        camera.position.set(30, 2 + CONVERGENCE_VOICE_RANGE.height, 60 + distance);
        player.sync({ model, stellarAt: 100000 }, 100000, camera);
        const rendered = await offline.startRendering();
        let power = 0;
        for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
          for (const sample of rendered.getChannelData(channel)) power += sample * sample;
        }
        return { distance, rms: Math.sqrt(power / (rendered.length * rendered.numberOfChannels)) };
      }
      return await Promise.all([measure(20), measure(110), measure(CONVERGENCE_VOICE_RANGE.maxDistance + 30)]);
    }''')
    near, middle, far = [sample['rms'] for sample in result['spatial']]
    assert near > middle > .001, result['spatial']
    assert far < .000001, result['spatial']
    print(json.dumps(result, indent=2))
    browser.close()
