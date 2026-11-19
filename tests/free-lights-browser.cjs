const {createRequire}=require('node:module');
const {chromium}=createRequire(process.env.CODEX_MCP_NODE_PATH)('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const errors=[],checks=[];
  try{
    async function setup(touch=false){
      const context=await browser.newContext({viewport:{width:touch?480:1280,height:900},hasTouch:touch});
      const page=await context.newPage();page.setDefaultTimeout(60000);
      page.on('pageerror',e=>{errors.push(String(e));console.log(String(e));});
      page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log(m.text());}});
      let saved={revision:1,hour:'23',world:{version:1,
        houses:[{type:'cottage',x:0,z:0,rotation:0}],roads:[{x:0,z:12,order:1}]}};
      await page.route('**/api/village',r=>{
        if(r.request().method()!=='GET')saved={...saved,...r.request().postDataJSON(),revision:saved.revision+1};
        return r.fulfill({json:saved});
      });
      await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
      await page.route('**/src/main.js*',async r=>{
        const response=await r.fetch();
        const body=(await response.text()).replace('  resetCamera();\n  resize();',`globalThis.__light={camera,walker,invalidate,nightLights,
          state:()=>({active:walker.active,pose:walker.camera.position.toArray(),
            items:houses.map(({x,y,z,type,rotation,model})=>({x,y,z,type,rotation,worldY:model.position.y})),
            candidate,placement:placement&&{type:placement.type,height:placement.height},selection:selection&&{type:selection.type},
            emitters:nightLights.stats.emitters,lightData:Array.from(nightLights.uniforms.cityLights.value.image.data)})};resetCamera(); resize();`);
        await r.fulfill({response,body});
      });
      await page.goto('http://127.0.0.1:5174',{waitUntil:'networkidle'});
      await page.waitForFunction(()=>globalThis.__light&&!document.querySelector('#shop-button').disabled);
      const state=()=>page.evaluate(()=>__light.state());
      const points=async()=> (await state()).items.filter(h=>h.type==='lightBlock');
      const project=async(x,y,z)=>page.evaluate(({x,y,z})=>{
        const c=__light.walker.active?__light.walker.camera:__light.camera;c.updateMatrixWorld();
        const p=c.position.clone().set(x,y,z).project(c),b=document.querySelector('#world').getBoundingClientRect();
        return{x:b.x+(p.x+1)*b.width/2,y:b.y+(1-p.y)*b.height/2};
      },{x,y,z});
      async function point(x,y,z,click=false){const p=await project(x,y,z);
        if(touch)await page.touchscreen.tap(p.x,p.y);else if(click)await page.mouse.click(p.x,p.y);else await page.mouse.move(p.x,p.y);
        await page.evaluate(()=>new Promise(requestAnimationFrame));
      }
      async function choose(){await page.click('#shop-button');await page.click('[data-category="lighting"]');await page.click('[data-house="lightBlock"]');}
      async function height(y){await page.locator('#light-height').fill(String(y));await page.locator('#light-height').press('Tab');}
      async function confirm(){await page.click('#place-button');await page.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('✓'));}
      return{page,context,state,points,point,choose,height,confirm,saved:()=>saved};
    }
    const f=await setup();const {page,state,points,point,choose,height,confirm}=f;
    await choose();
    assert.equal(await page.locator('#light-height-controls').isVisible(),true);
    assert.equal(await page.locator('#rotate-button').isVisible(),false);
    await point(0,7,0);
    assert.ok((await state()).candidate.y>4,'Automatic placement must hit the roof, not the ground');
    await height(18);await confirm();
    assert.equal((await points())[0].y,18);
    assert.equal((await points())[0].worldY,18);
    await point(0,7,0);await height(.5);await confirm();
    assert.equal((await points())[1].y,.5,'A point light can overlap the house footprint beneath its roof');
    await point(6,0,12);await height(-2);await confirm();
    assert.equal((await points())[2].y,-2);
    await page.keyboard.press('Escape');
    checks.push('The shop offers a free light with surface snapping and absolute placement above, inside and below objects');
    const light=(await points())[1];
    await point(light.x,light.y,light.z,true);
    assert.equal((await state()).selection.type,'lightBlock','The small marker remains selectable through the building');
    await page.keyboard.press('PageUp');
    assert.equal((await points())[1].y,.75);
    await page.keyboard.press('Control+z');
    assert.equal((await points())[1].y,.5);
    await point(light.x,.5,light.z,true);
    await page.click('#move-selected');
    await point(12,0,0);await confirm();
    assert.equal((await points())[1].x,12);
    assert.equal((await points())[1].y,.5,'Moving a light retains its height');
    await page.keyboard.press('Control+z');
    assert.equal((await points())[1].x,light.x);
    await point(light.x,.5,light.z,true);await page.click('#delete-selected');
    assert.equal((await points()).length,2);
    await page.keyboard.press('Control+z');assert.equal((await points()).length,3);
    checks.push('Selection through objects, Page Up/Down, moving, height preservation, delete and undo work');
    await page.waitForFunction(()=>__light.state().emitters===3);
    await page.screenshot({path:'test-results/free-lights-night.png'});
    await page.reload({waitUntil:'networkidle'});
    await page.waitForFunction(()=>globalThis.__light&&!document.querySelector('#shop-button').disabled);
    assert.deepEqual((await points()).map(p=>p.y),[18,.5,-2]);
    assert.deepEqual((await points()).map(p=>p.worldY),[18,.5,-2]);
    assert.equal((await state()).emitters,3);
    assert.ok(f.saved().world.houses.filter(h=>h.type==='lightBlock').every(h=>Number.isFinite(h.y)));
    checks.push('All three heights, point-light emitters and the existing house/road survive saving and reload');
    await page.click('#walk-button');
    await page.evaluate(()=>{const c=__light.walker.camera;c.position.set(0,1.68,20);c.lookAt(12,0,0);c.updateMatrixWorld();__light.invalidate();});
    const pose=(await state()).pose;
    await choose();await point(12,0,0);await height(6);await confirm();
    assert.equal((await state()).active,true);assert.deepEqual((await state()).pose,pose);
    assert.equal((await points()).at(-1).y,6);
    checks.push('First-person placement keeps the camera and accepts points above eye level');
    await f.context.close();
    const t=await setup(true);
    await t.choose();await t.point(0,7,0);await t.height(10);await t.confirm();
    assert.equal((await t.points())[0].y,10);
    await t.page.click('#light-lower');
    assert.equal(Number(await t.page.locator('#light-height').inputValue()),9.75);
    const box=await t.page.locator('#light-height-controls').boundingBox();
    assert.ok(box.x>=0&&box.x+box.width<=480,'Height controls must fit a touch screen');
    await t.page.screenshot({path:'test-results/free-lights-touch.png'});
    checks.push('Touch selection, confirmation and height buttons work without horizontal overflow');
    assert.deepEqual(errors,[]);
    fs.writeFileSync('test-results/free-lights-results.json',JSON.stringify({checks,errors},null,2));
    console.log(JSON.stringify({checks,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
