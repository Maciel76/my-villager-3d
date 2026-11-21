"""Real shop/editor mission test; API writes are isolated from the user's village."""
import json, os, sys
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'Temp/vila-decoration-testing'))
from playwright.sync_api import sync_playwright
OUT=Path(__file__).resolve().parents[1]/'test-results'/'starship'
OUT.mkdir(parents=True,exist_ok=True)
checks,errors,warnings=[],[],[]
saved={'revision':1,'hour':'18','world':{'version':1,'areaSize':360,'houses':[],
    'roads':[{'x':36,'z':z,'order':i} for i,z in enumerate(range(12,73,12))],
    'economy':{'coins':50000,'progressMs':0}}}
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    context=browser.new_context(viewport={'width':1500,'height':1000},reduced_motion='no-preference')
    context.add_init_script('''
      globalThis.__actualNow=Date.now.bind(Date);
      globalThis.__flightOffset=Number(sessionStorage.getItem('starship-test-clock')||0);
      Date.now=()=>__actualNow()+__flightOffset;
    ''')
    page=context.new_page();page.set_default_timeout(90000)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else warnings.append(m.text) if m.type=='warning' else None)
    page.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(body='',content_type='text/css'))
    def api(route):
        global saved
        if route.request.method!='GET':saved={**saved,**route.request.post_data_json,'revision':saved['revision']+1}
        route.fulfill(json=saved)
    def instrument(route):
        response=route.fetch();source=response.text()
        marker='  resetCamera();\n  resize();'
        assert marker in source
        source=source.replace(marker,'''globalThis.__flightTest={
          camera,controls,renderer,scene,houses,animations,starshipAnimation,starshipAudio,daylight,
          invalidate,explore,activateStarshipMission,
          state:()=>({houses:houses.map(({x,z,type,rotation,launchAt})=>({x,z,type,rotation,launchAt})),
            coins:treasury.coins,following:Boolean(followingStarship),
            placement:placement&&{type:placement.type,rotation:placement.rotation}})
        }; resetCamera(); resize();''',1)
        route.fulfill(response=response,body=source)
    page.route('**/api/village',api);page.route('**/src/main.js*',instrument)
    def ready():
        page.wait_for_function("globalThis.__flightTest&&!document.querySelector('#shop-button').disabled")
    def state():return page.evaluate('__flightTest.state()')
    def frame():
        page.evaluate('''()=>{const t=__flightTest;t.controls.enableDamping=false;
          t.controls.target.set(0,0,42);t.camera.position.set(220,250,350);t.controls.update();t.invalidate();}''')
        page.wait_for_timeout(300)
    def click_world(x,z,y=1.1):
        q=page.evaluate('''({x,y,z})=>{const t=__flightTest;t.camera.updateMatrixWorld();
          const p=t.camera.position.clone().set(x,y,z).project(t.camera),r=document.querySelector('#world').getBoundingClientRect();
          return {x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};}''',{'x':x,'y':y,'z':z})
        page.mouse.click(q['x'],q['y'])
    def seek(seconds):
        page.evaluate('''seconds=>{
          const at=__flightTest.houses.find(h=>h.type==='starship').launchAt;
          __flightOffset=at+seconds*1000-__actualNow();
          sessionStorage.setItem('starship-test-clock',String(__flightOffset));__flightTest.invalidate();
        }''',seconds)
        page.wait_for_timeout(1700)
    try:
        page.goto('http://127.0.0.1:5175',wait_until='networkidle');ready()
        page.click('#shop-button');page.click('[data-category="landmarks"]')
        card=page.locator('[data-house="starship"]')
        assert card.is_visible() and card.is_enabled()
        assert '30 lotes' in card.inner_text() and '8.350' in card.inner_text()
        assert card.locator('img').evaluate('(i)=>i.complete&&i.naturalWidth===284')
        page.screenshot(path=str(OUT/'01-loja.png'));card.click();frame()
        for _ in range(4):
            if state()['placement']['rotation']==1:break
            page.keyboard.press('r')
        assert state()['placement']['rotation']==1
        click_world(0,42,.12)
        page.wait_for_function('__flightTest.houses.length===1&&__flightTest.animations.size===0')
        assert state()['coins']==41650 and state()['houses'][0]['rotation']==1
        page.keyboard.press('Escape');frame();page.screenshot(path=str(OUT/'02-base.png'))
        checks.append('Native shop thumbnail, normal price, rotated 30-lot purchase and construction')
        click_world(0,42)
        page.wait_for_selector('#launch-start:not([disabled])');page.click('#launch-start')
        launch_at=state()['houses'][0]['launchAt'];assert launch_at>0
        page.wait_for_selector('#launch-hud:not([hidden])')
        assert page.locator('#move-selected').is_disabled() and page.locator('#delete-selected').is_disabled()
        assert page.locator('#rotate-button').is_disabled() and page.locator('#launch-start').is_disabled()
        page.keyboard.press('Delete');page.keyboard.press('r');page.keyboard.press('Control+z')
        assert len(state()['houses'])==1 and state()['houses'][0]['rotation']==1 and state()['coins']==41650
        checks.append('Launch starts once, is free and blocks editing/undo of its active base')
        page.wait_for_timeout(700);page.screenshot(path=str(OUT/'03-contagem.png'))
        seek(20)
        assert 'Decolagem' in page.locator('#launch-phase').inner_text()
        assert state()['following']
        assert page.evaluate('__flightTest.controls.target.y')>50
        page.screenshot(path=str(OUT/'04-decolagem.png'))
        pose=page.evaluate('''()=>{const t=__flightTest,h=t.houses[0],s=t.starshipAnimation.state(h.model);
          const V=t.camera.position.constructor,actual=h.model.getObjectByName('SHIP').getWorldPosition(new V()),
          expected=h.model.localToWorld(new V(...s.ship.position));
          return {error:actual.distanceTo(expected),thrust:s.boosterThrust,clouds:t.starshipAnimation.entries.get(h.model).fx.clouds.material.uniforms.uSmoke.value};}''')
        assert pose['error']<.2 and pose['thrust']>.5 and pose['clouds']>0,pose
        checks.append('Authored Blender clip, thrust, steam and cinematic camera agree in the rotated world')
        page.click('#launch-follow');assert not state()['following']
        page.click('#launch-follow');assert state()['following']
        page.click('#sound-toggle');assert page.locator('#sound-toggle').get_attribute('aria-pressed')=='false'
        page.click('#sound-toggle')
        seek(36);page.screenshot(path=str(OUT/'05-separacao.png'))
        page.wait_for_function("document.querySelector('#save-state').textContent.includes('Salvo')")
        page.reload(wait_until='networkidle');ready()
        assert state()['houses'][0]['launchAt']==launch_at and state()['coins']==41650
        assert page.locator('#launch-hud').is_visible()
        checks.append('Mid-flight save/reload resumes the same mission without a new purchase or countdown')
        page.click('#launch-follow');seek(64)
        assert page.evaluate("__flightTest.houses[0].model.getObjectByName('BOOSTER').position.y")<8.51
        page.screenshot(path=str(OUT/'06-captura.png'))
        seek(74)
        framing=page.evaluate('''()=>{const t=__flightTest,V=t.camera.position.constructor;
          const p=t.houses[0].model.getObjectByName('SHIP').localToWorld(new V(0,25,0)).project(t.camera);
          return {x:p.x,y:p.y};}''')
        assert abs(framing['x'])<.15 and abs(framing['y'])<.15,framing
        page.screenshot(path=str(OUT/'07-reentrada.png'))
        seek(94);page.screenshot(path=str(OUT/'08-pouso.png'))
        assert page.evaluate("__flightTest.houses[0].model.getObjectByName('LEG_0').scale.x")>.99
        seek(109);frame()
        assert 'Missão concluída' in page.locator('#launch-phase').inner_text()
        landed=page.evaluate("__flightTest.houses[0].model.getObjectByName('SHIP').position.toArray()")
        assert abs(landed[0]-21)<.01 and abs(landed[1]-3.56)<.01 and abs(landed[2]-6.5)<.01,landed
        page.screenshot(path=str(OUT/'09-retorno.png'))
        click_world(0,42);page.wait_for_selector('#launch-start:not([disabled])')
        assert page.locator('#move-selected').is_enabled() and page.locator('#delete-selected').is_enabled()
        page.click('#launch-start');assert state()['houses'][0]['launchAt']!=launch_at and state()['coins']==41650
        checks.append('Booster capture, reentry, deployed supports, exact landing, completion and repeat mission')
        seek(109);page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('#launch-hud').is_visible()
        page.screenshot(path=str(OUT/'10-mobile.png'))
        checks.append('Mission telemetry fits the mobile viewport')
        assert not errors,errors
        assert not [w for w in warnings if 'No target node found' in w],warnings
        print(json.dumps({'checks':checks,'errors':errors,'warnings':warnings},indent=2))
    except Exception:
        page.screenshot(path=str(OUT/'failure.png'))
        raise
    finally:
        (OUT/'browser-results.json').write_text(json.dumps({'checks':checks,'errors':errors,'warnings':warnings},indent=2),encoding='utf-8')
        browser.close()
