"""Exercise the monument in the real shop/editor against an isolated in-memory save."""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(os.environ['LOCALAPPDATA']) / 'Temp/vila-decoration-testing'))
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / 'test-results' / 'monumento-bombeiros'
OUT.mkdir(parents=True, exist_ok=True)
checks, errors = [], []
saved = {'revision': 1, 'hour': '12', 'world': {
    'version': 1, 'houses': [],
    'roads': [{'x': x, 'z': 0, 'order': i} for i, x in enumerate([-12, 0, 12, 24, 36])],
    'economy': {'coins': 50000, 'progressMs': 0},
}}

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    try:
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
        page = context.new_page()
        page.set_default_timeout(90000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
        page.route('https://fonts.googleapis.com/**', lambda route: route.fulfill(body='', content_type='text/css'))

        def api(route):
            global saved
            if route.request.method != 'GET':
                saved = {**saved, **route.request.post_data_json, 'revision': saved['revision'] + 1}
            route.fulfill(json=saved)

        def instrument(route):
            response = route.fetch()
            source = response.text()
            marker = '  resetCamera();\n  resize();'
            assert marker in source, 'Editor initialization hook changed'
            source = source.replace(marker, '''
              globalThis.__monumentTest = {
                camera, controls, renderer, scene, buildingTemplates, houses, animations, daylight,
                invalidate, explore,
                state: () => ({ houses: houses.map(({x,z,type,rotation})=>({x,z,type,rotation})),
                  coins: treasury.coins,
                  placement: placement && {type:placement.type,rotation:placement.rotation},
                  animations: animations.size })
              }; resetCamera(); resize();''', 1)
            route.fulfill(response=response, body=source)

        page.route('**/api/village', api)
        page.route('**/src/main.js*', instrument)
        page.goto('http://127.0.0.1:5175', wait_until='networkidle')
        page.wait_for_function("globalThis.__monumentTest && !document.querySelector('#shop-button').disabled")
        assert page.locator('#shop-button').count() == 1
        assert page.locator('[data-category="landmarks"]').count() == 1
        page.click('#shop-button')
        page.click('[data-category="landmarks"]')
        choice = page.locator('[data-house="monumentoBombeiros"]')
        assert choice.is_visible() and choice.is_enabled()
        assert 'Monumento Corpo de Bombeiros' in choice.inner_text()
        assert '1.070' in choice.inner_text()
        assert '2 lotes' in choice.inner_text()
        assert choice.locator('img').evaluate('(img)=>img.complete && img.naturalWidth===284')
        page.screenshot(path=str(OUT / 'loja-monumentos.png'))
        checks.append('Monumentos card, native 3D thumbnail, two-lot footprint and normal game price')
        choice.click()

        def state():
            return page.evaluate('()=>__monumentTest.state()')

        def click_world(x, z, y=.12):
            point = page.evaluate('''({x,y,z})=>{
              const t=__monumentTest;t.camera.updateMatrixWorld();
              const p=t.camera.position.clone().set(x,y,z).project(t.camera);
              const r=document.querySelector('#world').getBoundingClientRect();
              return {x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};
            }''', {'x': x, 'y': y, 'z': z})
            page.mouse.move(point['x'], point['y'])
            page.mouse.click(point['x'], point['y'])

        for _ in range(4):
            if state()['placement']['rotation'] == 1:
                break
            page.keyboard.press('r')
        click_world(12, 18)
        page.wait_for_function('__monumentTest.houses.length===1 && __monumentTest.animations.size===0')
        assert state()['houses'] == [{'x': 12, 'z': 18, 'type': 'monumentoBombeiros', 'rotation': 1}]
        assert state()['coins'] == 48930
        click_world(12, 18)
        assert len(state()['houses']) == 1 and state()['coins'] == 48930
        page.keyboard.press('Escape')
        checks.append('Purchase, rotation, construction animation and overlap rejection without a second charge')
        assert page.evaluate('''()=>{
          const t=__monumentTest;
          const grass=t.scene.children.find(m=>m.isInstancedMesh && m.geometry.type==='ConeGeometry');
          const matrix=t.camera.matrix.clone();
          if (!grass) return false;
          for(let i=0;i<grass.count;i++) {
            grass.getMatrixAt(i,matrix);
            const x=matrix.elements[12],z=matrix.elements[14];
            if(Math.abs(x-12)<3.5 && Math.abs(z-18)<7) return false;
          }
          return true;
        }'''), 'Meadow grass must not protrude through the monument base'
        checks.append('Meadow grass is cleared under the rotated monument base')

        page.evaluate('''()=>{
          const t=__monumentTest;t.explore();t.controls.enableDamping=false;
          t.controls.target.set(12,3.4,18);t.camera.position.set(37,22,42);
          t.controls.update();t.invalidate();
        }''')
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / 'monumento-na-vila.png'))
        click_world(12, 18, .65)
        page.wait_for_selector('#move-selected:not([disabled])')
        page.evaluate('''()=>{
          const t=__monumentTest;t.controls.target.set(24,0,18);
          t.camera.position.set(65,48,68);t.controls.update();t.invalidate();
        }''')
        page.click('#move-selected')
        click_world(36, 18)
        assert state()['houses'][0]['x'] == 36
        page.keyboard.press('Control+z')
        assert state()['houses'][0]['x'] == 12
        assert state()['coins'] == 48930
        checks.append('Selection, move and atomic undo retain the purchased monument')

        page.wait_for_function("document.querySelector('#save-state').textContent.includes('Salvo')")
        page.reload(wait_until='networkidle')
        page.wait_for_function("globalThis.__monumentTest && !document.querySelector('#shop-button').disabled")
        assert state()['houses'] == [{'x': 12, 'z': 18, 'type': 'monumentoBombeiros', 'rotation': 1}]
        assert state()['coins'] == 48930
        checks.append('Save/reload round trip retains type, position, rotation and balance')
        page.select_option('#village-hour', '23')
        page.evaluate('''()=>{
          const t=__monumentTest;t.explore();t.controls.enableDamping=false;
          t.controls.target.set(12,3.4,18);t.camera.position.set(32,16,37);
          t.controls.update();t.invalidate();
        }''')
        page.wait_for_timeout(700)
        lighting = page.evaluate('''()=>{
          const t=__monumentTest,m=t.houses[0].model;
          return {emitters:m.userData.lampEmitters.length,
            glowing:m.children.filter(p=>p.material?.userData.nightGlow).length,
            power:t.daylight.lampPower};
        }''')
        assert lighting['emitters'] == 5 and lighting['glowing'] > 0 and lighting['power'] > .1, lighting
        page.screenshot(path=str(OUT / 'monumento-noturno.png'))
        checks.append('LED materials and all five warm/fountain light emitters participate in the day/night system')

        page.set_viewport_size({'width': 390, 'height': 844})
        page.click('#shop-button')
        page.click('[data-category="landmarks"]')
        choice = page.locator('[data-house="monumentoBombeiros"]')
        choice.scroll_into_view_if_needed()
        assert choice.is_visible()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT / 'loja-monumentos-mobile.png'))
        checks.append('Mobile catalogue remains accessible without horizontal overflow')
        assert not errors, errors
        (OUT / 'browser-results.json').write_text(json.dumps({'checks': checks, 'errors': errors}, indent=2), encoding='utf-8')
        print(json.dumps({'checks': checks, 'errors': errors}, indent=2))
    finally:
        browser.close()
