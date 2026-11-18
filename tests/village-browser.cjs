const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = createRequire(process.env.CODEX_MCP_NODE_PATH)('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  const results = [];
  try {
    async function setup(hasTouch = false) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      let saved = {
        revision: 1, hour: '23',
        world: {
          version: 1,
          houses: [{ type: 'lampColonial', x: 24, z: 24, rotation: 0 }],
          roads: [{ x: 0, z: 0, order: 1 }, { x: 0, z: 12, order: 2 }, { x: -12, z: 0, order: 3 }],
        },
      };
      await page.route('**/api/village', route => {
        if (route.request().method() !== 'GET') {
          const data = route.request().postDataJSON();
          saved = { ...saved, ...data, revision: saved.revision + 1 };
        }
        return route.fulfill({ json: saved });
      });
      await page.route('**/src/main.js*', async route => {
        const response = await route.fetch();
        const source = (await response.text()).replace('  resetCamera();\n  resize();', `
          globalThis.__vilaTest = { camera, scene, nightLights, animations, houses, getState: () => ({
            roads: [...roads.values()], houses: houses.map(({x,z,type,rotation}) => ({x,z,type,rotation})),
            placement: placement && { type: placement.type, road: placement.road, moving: Boolean(placement.moving || placement.movingRoad), rotation: placement.rotation },
            selection: selection && { x: selection.x, z: selection.z, road: selection.road },
          }) }; resetCamera(); resize();`);
        await route.fulfill({ response, body: source });
      });
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({body:'',contentType:'text/css'}));
      await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => globalThis.__vilaTest && !document.querySelector('#move-button').disabled);
      const state = () => page.evaluate(() => globalThis.__vilaTest.getState());
      const project = (x, z, y = 0.05) => page.evaluate(({ x, z, y }) => {
        const camera = globalThis.__vilaTest.camera;
        camera.updateMatrixWorld();
        const point = camera.position.clone().set(x, y, z).project(camera);
        const rect = document.querySelector('#world').getBoundingClientRect();
        return { x: rect.x + (point.x + 1) / 2 * rect.width, y: rect.y + (1 - point.y) / 2 * rect.height };
      }, { x, z, y });
      async function clickWorld(x, z) {
        const p = await project(x, z);
        if (hasTouch) await page.touchscreen.tap(p.x, p.y);
        else await page.mouse.click(p.x, p.y);
      }
      async function choose(type) {
        await page.click('#shop-button');
        await page.click(`[data-category="${type === 'cottage' ? 'residential' : 'lighting'}"]`);
        await page.click(`[data-house="${type}"]`);
      }
      return { page, context, state, project, clickWorld, choose, saved: () => saved };
    }

    const f = await setup();
    const { page, state, clickWorld, project, choose } = f;
    const hasRoad = async (x, z) => (await state()).roads.some(road => road.x === x && road.z === z);
    async function undo() {
      await page.keyboard.press('Control+z');
      await page.waitForFunction(() => !globalThis.__vilaTest.getState().placement);
    }

    await clickWorld(0, 12);
    assert.equal((await state()).selection.road, true);
    assert.equal(await page.locator('#action-mode').textContent(), 'Rua selecionada');
    assert.equal(await page.locator('#rotate-button').isVisible(), false);
    await page.click('#move-selected');
    await clickWorld(12, 12);
    assert.equal(await hasRoad(0, 12), false);
    assert.equal(await hasRoad(12, 12), true);
    assert.equal((await state()).roads.length, 3);
    await undo();
    assert.equal(await hasRoad(0, 12), true);
    assert.equal(await hasRoad(12, 12), false);
    results.push('road selection, movement and atomic undo');

    await clickWorld(0, 12);
    await page.click('#move-selected');
    await page.keyboard.press('Escape');
    assert.equal(await hasRoad(0, 12), true);
    assert.equal((await state()).placement, null);
    results.push('road movement cancellation');

    await page.click('#move-button');
    await clickWorld(-12, 0);
    assert.equal((await state()).placement.moving, true);
    const destination = await project(24, 0);
    await page.mouse.move(destination.x, destination.y);
    await page.keyboard.press('Enter');
    assert.equal(await hasRoad(24, 0), true);
    assert.equal(await hasRoad(-12, 0), false);
    await undo();
    results.push('move tool and keyboard confirmation for roads');

    await clickWorld(0, 12);
    await page.click('#delete-selected');
    assert.equal(await hasRoad(0, 12), false);
    await undo();
    assert.equal(await hasRoad(0, 12), true);
    await clickWorld(-12, 0);
    await page.keyboard.press('Delete');
    assert.equal(await hasRoad(-12, 0), false);
    await undo();
    assert.equal(await hasRoad(-12, 0), true);
    results.push('road delete button, Delete key and restoration');

    await page.click('#road-button');
    await page.click('#road-erase');
    await clickWorld(0, 12);
    assert.equal(await hasRoad(0, 12), false);
    assert.equal((await state()).placement.road, true);
    await undo();
    assert.equal(await hasRoad(0, 12), true);
    results.push('existing repeated road erasing');

    await choose('lampColonial');
    await clickWorld(-24, -24);
    assert.equal((await state()).houses.length, 2);
    assert.equal((await state()).placement.type, 'lampColonial');
    await page.keyboard.press('r');
    await clickWorld(-18, -24);
    assert.equal((await state()).houses.length, 3);
    assert.equal((await state()).houses.at(-1).rotation, 3);
    await clickWorld(-18, -24);
    assert.equal((await state()).houses.length, 3);
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    assert.equal((await state()).houses.length, 4);
    assert.equal((await state()).houses.at(-1).x, -15);
    assert.equal((await state()).houses.at(-1).rotation, 3);
    assert.equal((await state()).placement.type, 'lampColonial');
    await page.keyboard.press('Escape');
    assert.equal((await state()).placement, null);
    results.push('repeated lamps, retained rotation, occupied-site rejection, arrows, Enter and Escape');

    await clickWorld(-24, -24);
    assert.ok((await state()).selection && !(await state()).selection.road);
    await page.click('#move-selected');
    await clickWorld(-30, -24);
    assert.equal((await state()).houses.length, 4);
    assert.equal((await state()).placement, null);
    await undo();
    results.push('moving existing lamps exits placement without duplicating');

    await choose('cottage');
    await clickWorld(-36, 12);
    assert.equal((await state()).houses.at(-1).type, 'cottage');
    assert.equal((await state()).placement, null);
    results.push('ordinary building placement remains single-use');

    await page.waitForFunction(() => globalThis.__vilaTest.animations.size === 0);
    await clickWorld(-36, 12);
    assert.equal((await state()).selection.x, -36);
    await page.click('#rotate-button');
    assert.equal((await state()).houses.at(-1).rotation, 3);
    await undo();
    assert.equal((await state()).houses.at(-1).rotation, 0);
    await clickWorld(-36, 12);
    await page.click('#move-selected');
    await clickWorld(-48, 12);
    assert.equal((await state()).houses.at(-1).x, -48);
    await undo();
    assert.equal((await state()).houses.at(-1).x, -36);
    await clickWorld(-36, 12);
    await page.click('#delete-selected');
    assert.equal((await state()).houses.length, 4);
    await undo();
    assert.equal((await state()).houses.length, 5);
    results.push('instanced house selection, rotation, movement, deletion and undo');

    const light = await page.evaluate(() => ({
      stats: globalThis.__vilaTest.nightLights.stats,
      intensity: globalThis.__vilaTest.nightLights.uniforms.cityLights.value.image.data[4],
    }));
    assert.equal(light.stats.emitters, 4);
    assert.ok(light.intensity > 0);
    await clickWorld(0, 12);
    await page.click('#move-selected');
    await clickWorld(12, 12);
    await page.waitForFunction(() => document.querySelector('#save-state').textContent.includes('Salvo'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.__vilaTest);
    assert.equal(await hasRoad(12, 12), true);
    assert.equal(await hasRoad(0, 12), false);
    assert.equal((await state()).houses.length, 5);
    await clickWorld(12, 12);
    await page.screenshot({ path: 'test-results/village-road-selection.png' });
    results.push('stronger night illumination and persistence after reload');

    const touch = await setup(true);
    await touch.choose('lampSolar');
    await touch.clickWorld(-24, -24);
    assert.equal((await touch.state()).houses.length, 1);
    await touch.page.click('#place-button');
    assert.equal((await touch.state()).houses.length, 2);
    await touch.clickWorld(-18, -24);
    await touch.page.click('#place-button');
    assert.equal((await touch.state()).houses.length, 3);
    assert.equal((await touch.state()).placement.type, 'lampSolar');
    await touch.page.click('#cancel-button');
    await touch.clickWorld(0, 12);
    assert.equal((await touch.state()).selection.road, true);
    await touch.page.click('#move-selected');
    await touch.clickWorld(12, 12);
    await touch.page.click('#place-button');
    assert.ok((await touch.state()).roads.some(road => road.x === 12 && road.z === 12));
    assert.equal((await touch.state()).placement, null);
    results.push('touch: repeated lamps and road movement with explicit confirmation');

    assert.deepEqual(errors, []);
    fs.writeFileSync('test-results/village-editing-results.json', JSON.stringify({ results, errors }, null, 2));
    console.log(JSON.stringify({ results, errors }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

