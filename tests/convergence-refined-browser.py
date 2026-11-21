"""Verify the actual textured Blender replacement and the unchanged stellar event."""
import json,os,sys
from pathlib import Path
sys.path.insert(0,str(Path(os.environ['LOCALAPPDATA'])/'Temp/vila-decoration-testing'))
from playwright.sync_api import sync_playwright
OUT=Path(__file__).resolve().parents[1]/'test-results/convergencia-refinada'
OUT.mkdir(parents=True,exist_ok=True)
saved={'revision':1,'hour':'12','world':{'version':1,'areaSize':360,
 'houses':[{'type':'convergencia','x':6,'z':6,'rotation':1}],'roads':[],
 'economy':{'coins':500000,'progressMs':0}}}
checks,errors,warnings=[],[],[]
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    context=browser.new_context(viewport={'width':1500,'height':1050},reduced_motion='no-preference')
    context.add_init_script('''globalThis.__actualNow=Date.now.bind(Date);
      globalThis.__fixedNow=Number(sessionStorage.getItem('convergence-test-now'))||null;
      Date.now=()=>__fixedNow??__actualNow();''')
    page=context.new_page();page.set_default_timeout(90000)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else warnings.append(m.text) if m.type=='warning' else None)
    page.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(body='',content_type='text/css'))
    def api(route):
        global saved
        if route.request.method!='GET':saved={**saved,**route.request.post_data_json,'revision':saved['revision']+1}
        route.fulfill(json=saved)
    def instrument(route):
        response=route.fetch();source=response.text();marker='  resetCamera();\n  resize();'
        assert marker in source
        source=source.replace(marker,'''globalThis.__convTest={camera,controls,renderer,scene,houses,animations,
          convergenceAnimation,daylight,invalidate,explore,
          state:()=>({houses:houses.map(({x,z,type,rotation,stellarAt,stellarReactivatedAt})=>({x,z,type,rotation,stellarAt,stellarReactivatedAt})),coins:treasury.coins})
        }; resetCamera(); resize();''',1)
        route.fulfill(response=response,body=source)
    page.route('**/api/village',api);page.route('**/src/main.js*',instrument)
    def ready():page.wait_for_function("globalThis.__convTest&&!document.querySelector('#shop-button').disabled")
    def state():return page.evaluate('__convTest.state()')
    def frame(close=False):
        page.evaluate('''close=>{const t=__convTest;t.controls.enableDamping=false;
          t.controls.target.set(6,0,6);t.camera.position.set(...(close?[56,52,88]:[90,90,134]));t.controls.update();t.invalidate();}''',close)
        page.wait_for_timeout(600)
    def select_base():
        q=page.evaluate('''()=>{const t=__convTest;t.camera.updateMatrixWorld();
          const p=t.camera.position.clone().set(6,2,6).project(t.camera),r=document.querySelector('#world').getBoundingClientRect();
          return {x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};}''')
        page.mouse.click(q['x'],q['y'])
    def seek(at):
        page.evaluate('''at=>{__fixedNow=at;sessionStorage.setItem('convergence-test-now',String(at));__convTest.invalidate();}''',at)
        page.wait_for_timeout(650)
    try:
        page.goto(os.environ.get('VILA_TEST_URL','http://127.0.0.1:5173'),wait_until='networkidle');ready();frame()
        launch_ms=page.evaluate("async()=>1000*(await import('/src/stellar-event.js')).STELLAR_LAUNCH")
        alignment_ms=page.evaluate("async()=>1000*(await import('/src/convergence-voices.js')).CONVERGENCE_VOICES.find(clip=>clip.id==='overload').at")
        revision=page.evaluate("__convTest.houses[0].model.userData.blenderRevision")
        assert revision=='confinamento-estelar-v2'
        materials=page.evaluate('''()=>{let maps=0,normals=0,arms=0;
          const m=__convTest.houses[0].model;m.traverse(o=>{if(o.material?.map)maps++;if(o.material?.normalMap)normals++;});
          arms=m.children.filter(o=>o.userData.hinge).length;return {maps,normals,arms};}''')
        assert materials['maps']>15 and materials['normals']>15 and materials['arms']==6,materials
        page.screenshot(path=str(OUT/'01-convergencia-dia.png'))
        checks.append('Existing saved Convergence automatically loads the Blender model, PBR/normal maps and six hinges')
        page.select_option('#village-hour','23');frame(True)
        page.screenshot(path=str(OUT/'02-contencao-noturna.png'))
        page.click('#shop-button');page.click('[data-category="landmarks"]')
        card=page.locator('[data-house="convergencia"]');assert card.is_visible() and card.is_disabled()
        assert card.locator('img').evaluate('(img)=>img.complete&&img.naturalWidth===284')
        page.screenshot(path=str(OUT/'03-loja.png'));page.click('#close-shop')
        checks.append('Night lighting and a real shop thumbnail use the refined model; the one-Convergence rule remains')
        select_base();page.wait_for_selector('#stellar-start:not([disabled])');page.click('#stellar-start')
        started=state()['houses'][0]['stellarAt'];assert state()['coins']==500000
        assert page.locator('#delete-selected').is_disabled() and page.locator('#move-selected').is_disabled()
        seek(started+6000);frame(True)
        assert page.evaluate("(()=>{const sun=__convTest.scene.getObjectByName('Luz da Convergência').getObjectByName('Mini-sol');return sun.visible&&sun.scale.x>.97;})()")
        charged=page.evaluate('''()=>{const m=__convTest.houses[0].model;
          return {small:m.children.filter(o=>o.userData.injectorArm).map(o=>o.quaternion.w),
          glow:m.children.filter(o=>o.userData.energyPod)[0].children.find(o=>o.isMesh).material.emissiveIntensity};}''')
        assert len(charged['small'])==3 and all(q<1 for q in charged['small'])
        page.screenshot(path=str(OUT/'10-tubos-carregando.png'))
        seek(started+11000)
        assert page.evaluate("__convTest.houses[0].model.children.filter(o=>o.userData.energyPod)[0].children.find(o=>o.isMesh).material.emissiveIntensity")>charged['glow']
        assert page.evaluate("__convTest.scene.getObjectByName('Transferência dos acumuladores').visible")
        page.screenshot(path=str(OUT/'11-injecao-energia.png'))
        seek(started+14000)
        assert page.evaluate("__convTest.houses[0].model.children.filter(o=>o.userData.energyPod).every(o=>o.scale.y<.1)")
        for wall in [0,200,650,1200,12000,12500,14000,15700]:
            seek(started+wall)
            assert page.evaluate("(()=>{const s=__convTest.scene.getObjectByName('Mini-sol');return s.visible&&s.scale.x>.97;})()"),f'Core disappeared at {wall} ms'
        speeds=page.evaluate('''({started,launch})=>{
          const t=__convTest,root=t.scene.getObjectByName('Luz da Convergência');
          const yaw=second=>{t.convergenceAnimation.update(t.camera,second*1000,t.animations,true,started+12000+second*1000,true,true);
            return [1,2,3].map(i=>root.getObjectByName('Órbita '+i).rotation.y);};
          return [5,15,25,35,launch-5,launch-2,launch-.1].map(second=>{
            const a=yaw(second-.025),b=yaw(second+.025);return b.map((v,i)=>Math.abs(v-a[i])/.05);});
        }''',{'started':started,'launch':launch_ms/1000})
        assert all(all(b>a for a,b in zip(speeds[i-1],speeds[i])) for i in range(1,len(speeds))),speeds
        checks.append('Mini-sun stays visible throughout charging; all three rendered rings continuously accelerate through the final countdown')
        checks.append('Small injector arms and accumulator pulses work while the mini-sun remains visible at full size during charging')
        seek(started+alignment_ms)
        assert page.evaluate("[1,2,3].every(i=>{const ring=__convTest.scene.getObjectByName('Luz da Convergência').getObjectByName('Órbita '+i);return ring.rotation.x===0&&ring.rotation.z===0;})")
        checks.append('The alignment announcement only starts once all three containment rings are visibly aligned')
        seek(started+12000+launch_ms-10000);frame()
        opening=page.evaluate('''()=>{const t=__convTest,m=t.houses[0].model,fx=t.scene.getObjectByName('Luz da Convergência');
          return {arms:m.children.filter(o=>o.userData.hinge).map(o=>o.quaternion.w),
            heights:[1,2,3].map(i=>fx.getObjectByName('Órbita '+i).position.y)};}''')
        assert all(q<.999 for q in opening['arms']),opening
        page.screenshot(path=str(OUT/'04-carregamento-estelar.png'))
        seek(started+12000+launch_ms-100)
        assert page.evaluate("__convTest.scene.getObjectByName('Luz da Convergência').getObjectByName('Mini-sol').position.y")>46
        page.screenshot(path=str(OUT/'05-impulso.png'))
        checks.append('The existing free stellar show still opens all six armored arms and raises the magnetic rings and sun')
        seek(started+12000+launch_ms+3000)
        assert not page.evaluate("__convTest.scene.getObjectByName('Luz da Convergência').getObjectByName('Mini-sol').visible")
        seek(started+12000+104000);frame()
        crown=page.evaluate("(()=>{const c=__convTest.scene.getObjectByName('Coroa de luz');return {radius:c.userData.containmentRadius,y:c.position.y,scale:c.scale.x};})()")
        assert crown['radius']==34.7 and 1.75<crown['y']<40.5 and crown['scale']==1,crown
        page.screenshot(path=str(OUT/'12-coroa-descendo-por-fora.png'))
        seek(started+121000);frame(True)
        off=page.evaluate('''()=>{const t=__convTest,m=t.houses[0].model,root=t.scene.getObjectByName('Luz da Convergência');let glow=0;
          [1,2,3].forEach(i=>root.getObjectByName('Órbita '+i).traverse(o=>{if(o.material?.emissive?.getHex())glow+=o.material.emissiveIntensity;}));
          return {glow,emitters:m.userData.lampEmitters??null,heights:[1,2,3].map(i=>root.getObjectByName('Órbita '+i).position.y)};}''')
        assert off['glow']==0 and off['emitters'] is None and all(y<5 for y in off['heights']),off
        assert page.evaluate("__convTest.scene.getObjectByName('Coroa de luz').position.y")==1.75
        page.screenshot(path=str(OUT/'06-desligada.png'))
        checks.append('Upper crown enlarges above the arms, descends outside them and rests as a perimeter ring within the existing lot')
        checks.append('Launch/burst, full blackout, low ring docking and extinguished new hardware remain synchronized')
        page.wait_for_selector('#stellar-start:not([disabled])');page.click('#stellar-start')
        rearmed=state()['houses'][0]['stellarReactivatedAt'];assert state()['coins']==400000
        seek(rearmed+15000)
        crown=page.evaluate("(()=>{const c=__convTest.scene.getObjectByName('Coroa de luz');return {radius:c.userData.containmentRadius,y:c.position.y};})()")
        assert crown['radius']==34.7 and crown['y']>1.75,crown
        seek(rearmed+20000);frame(True)
        page.screenshot(path=str(OUT/'07-reativacao.png'))
        seek(rearmed+35000)
        assert page.evaluate('__convTest.daylight.lampPower')==1
        page.wait_for_function("document.querySelector('#save-state').textContent.includes('Salvo')")
        page.reload(wait_until='networkidle');ready();frame(True)
        assert state()['houses'][0]['stellarReactivatedAt']==rearmed and state()['coins']==400000
        assert page.evaluate("__convTest.houses[0].model.userData.blenderRevision")=='confinamento-estelar-v2'
        page.screenshot(path=str(OUT/'08-pronta-novamente.png'))
        checks.append('Paid reactivation, restored grid and save/reload retain the existing progression and new geometry')
        page.set_viewport_size({'width':390,'height':844});page.click('#shop-button');page.click('[data-category="landmarks"]')
        card.scroll_into_view_if_needed();assert card.is_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT/'09-mobile.png'))
        assert not errors,errors
        assert not [w for w in warnings if 'No target node found' in w],warnings
        print(json.dumps({'checks':checks,'errors':errors,'warnings':warnings},indent=2))
    except Exception:
        page.screenshot(path=str(OUT/'failure.png'));raise
    finally:
        (OUT/'browser-results.json').write_text(json.dumps({'checks':checks,'errors':errors,'warnings':warnings},indent=2),encoding='utf-8')
        browser.close()
