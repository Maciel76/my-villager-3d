"""Exercise native purchase/save and render the station; API writes stay in memory."""
import json, os, sys, urllib.request
from pathlib import Path
sys.path.insert(0, str(Path(os.environ['LOCALAPPDATA'])/'Temp/vila-decoration-testing'))
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1]/'test-results'/'fire-station'
OUT.mkdir(parents=True, exist_ok=True)
actual = '--actual' in sys.argv
if actual:
    saved = json.load(urllib.request.urlopen('http://127.0.0.1:5175/api/village'))
    assert any(h['type'] == 'fireStation' for h in saved['world']['houses'])
else:
    saved = {'revision': 1, 'hour': '12', 'world': {'version': 1, 'areaSize': 360,
        'houses': [{'type': 'policeStation', 'x': -66, 'z': 108, 'rotation': 2}],
        'houseOrder': [30],
        'roads': [{'x': x, 'z': 72, 'order': i} for i, x in enumerate(range(-168, -23, 12))],
        'economy': {'coins': 50000, 'progressMs': 0}}}
errors, checks = [], []
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1600, 'height': 1050})
    page.set_default_timeout(60000)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))
    def api(route):
        global saved
        if route.request.method != 'GET':
            saved = {**saved, **route.request.post_data_json, 'revision': saved['revision'] + 1}
        route.fulfill(json=saved)
    def instrument(route):
        response = route.fetch()
        source = response.text()
        marker = '  resetCamera();\n  resize();'
        assert marker in source
        source = source.replace(marker, '''globalThis.__fireTest={camera,controls,renderer,scene,houses,animations,traffic,nightLights,
          invalidate, state:()=>({coins:treasury.coins,
            houses:houses.map(({type,x,z,rotation})=>({type,x,z,rotation})),
            placement:placement&&{type:placement.type,rotation:placement.rotation}})};
          resetCamera(); resize();''', 1)
        route.fulfill(response=response, body=source)
    page.route('**/api/village', api)
    page.route('**/src/main.js*', instrument)
    def ready():
        page.wait_for_function("globalThis.__fireTest&&!document.querySelector('#shop-button').disabled")
    def frame(close=False):
        page.evaluate('''close=>{const t=__fireTest;t.controls.enableDamping=false;
          t.controls.target.set(close?-144:-108,close?6:0,105);
          t.camera.position.set(close?-192:-215,close?74:125,close?13:-58);
          t.controls.update();t.invalidate();}''', close)
        page.wait_for_timeout(500)
    def click_world(x,z):
        q=page.evaluate('''({x,z})=>{const t=__fireTest;t.camera.updateMatrixWorld();
          const p=t.camera.position.clone().set(x,.12,z).project(t.camera),r=document.querySelector('#world').getBoundingClientRect();
          return {x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};}''', {'x':x,'z':z})
        page.mouse.click(q['x'],q['y'])
    try:
        page.goto('http://127.0.0.1:5175', wait_until='networkidle'); ready()
        if not actual:
            page.click('#shop-button');page.click('[data-category="landmarks"]')
            card=page.locator('[data-house="fireStation"]')
            assert card.is_visible() and card.is_enabled()
            assert '20 lotes' in card.inner_text() and '5.750' in card.inner_text()
            assert card.locator('img').evaluate('(i)=>i.complete&&i.naturalWidth===284')
            page.screenshot(path=str(OUT/'01-loja.png'))
            card.click();frame()
            for _ in range(4):
                if page.evaluate('__fireTest.state().placement.rotation') == 2: break
                page.keyboard.press('r')
            click_world(-144,102)
            page.wait_for_function('__fireTest.houses.length===2&&__fireTest.animations.size===0')
            state=page.evaluate('__fireTest.state()')
            assert state['coins']==44250
            fire=next(h for h in state['houses'] if h['type']=='fireStation')
            assert fire=={'type':'fireStation','x':-144,'z':102,'rotation':2}
            page.keyboard.press('Escape');frame()
            checks.append('Native shop, thumbnail, 5750-coin purchase and rotated placement beside police')
            page.wait_for_function("document.querySelector('#save-state').textContent.includes('Salv')")
            page.reload(wait_until='networkidle');ready()
            assert len(page.evaluate('__fireTest.state().houses'))==2
            checks.append('Station survives the real save/load flow')
        page.select_option('#village-hour','12');frame()
        page.screenshot(path=str(OUT/('04-cidade-dia.png' if actual else '02-dia.png')))
        frame(True);page.screenshot(path=str(OUT/('05-quartel-detalhe.png' if actual else '03-detalhe.png')))
        page.select_option('#village-hour','23');frame()
        page.screenshot(path=str(OUT/('06-cidade-noite.png' if actual else '04-noite.png')))
        stats=page.evaluate('''()=>{const t=__fireTest,h=t.houses.find(h=>h.type==='fireStation');
          let meshes=0,glow=0;h.model.traverse(m=>{if(m.isMesh){meshes++;if(m.material.userData.nightGlow&&m.material.emissiveIntensity>0)glow++;}});
          return {meshes,glow,emitters:h.model.userData.lampEmitters?.length,houses:t.houses.length,
            trucks:t.traffic.vehicles.filter(v=>v.kind==='fire').length,
            finiteLights:Array.from(t.nightLights.uniforms.cityLights.value.image.data).every(Number.isFinite),
            lightCount:t.nightLights.stats.emitters};}''')
        assert stats['meshes']<95 and stats['glow']>=2 and stats['emitters']==14 and stats['trucks']==4
        assert stats['finiteLights'] and stats['lightCount']>=14
        fleet=page.evaluate('''()=>{const t=__fireTest;let opened=false;
          for(let i=0;i<3000;i++){
            t.traffic.update(t.controls.target,140,1/30,true);
            opened ||= t.traffic.fireFleets.some(s=>s.open[3]>.9);
          }
          t.invalidate();return {opened,vehicles:t.traffic.vehicles.filter(v=>v.kind==='fire').map(v=>({name:v.name,mode:v.mode,meters:v.meters}))};}''')
        assert fleet['opened'] and all(v['mode']=='road' and v['meters']>50 for v in fleet['vehicles']),fleet
        page.wait_for_timeout(500);frame()
        page.screenshot(path=str(OUT/('07-viaturas-cidade.png' if actual else '05-viaturas.png')))
        stats['fleet']=fleet
        assert not errors, errors
        checks.append('Day/night textures and lighting render without console errors')
        (OUT/('actual-report.json' if actual else 'report.json')).write_text(
            json.dumps({'checks':checks,'stats':stats,'errors':errors},indent=2),encoding='utf-8')
        print(json.dumps({'checks':checks,'stats':stats,'errors':errors}))
    except Exception:
        page.screenshot(path=str(OUT/'failure.png'))
        print(json.dumps({'errors':errors,'state':page.evaluate('globalThis.__fireTest?.state()')}))
        raise
    finally:
        browser.close()
