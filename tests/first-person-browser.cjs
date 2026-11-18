const {createRequire}=require('node:module');
const {chromium}=createRequire(process.env.CODEX_MCP_NODE_PATH)('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  const errors=[],checks=[];
  try{
    async function setup(touch=false){
      const context=await browser.newContext({viewport:{width:1280,height:900},hasTouch:touch});
      const page=await context.newPage();
      page.setDefaultTimeout(60000);
      page.on('pageerror',e=>{errors.push(String(e));console.log(String(e));});
      page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log(m.text());}});
      let saved={revision:1,hour:'7.5',world:{version:1,houses:[],roads:[]}};
      await page.route('**/api/village',r=>{
        if(r.request().method()!=='GET')saved={...saved,...r.request().postDataJSON(),revision:saved.revision+1};
        return r.fulfill({json:saved});
      });
      await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
      await page.route('**/src/main.js*',async r=>{
        const response=await r.fetch();
        const source=await response.text();
        console.log('First-person hook',source.includes('  resetCamera();\n  resize();'));
        const body=source.replace('  resetCamera();\n  resize();',`globalThis.__fp={camera,walker,invalidate,
          state:()=>({active:walker.active,position:walker.camera.position.toArray(),rotation:walker.camera.quaternion.toArray(),
            houses:houses.map(({x,z,type,rotation})=>({x,z,type,rotation})),roads:[...roads.values()],
            placement:placement&&{type:placement.type,road:placement.road},candidate})}; resetCamera(); resize();`);
        await r.fulfill({response,body});
      });
      await page.goto(process.env.VILLAGE_TEST_URL||'http://127.0.0.1:5174',{waitUntil:'networkidle'});
      console.log('First-person page',await page.locator('#status').textContent());
      await page.waitForFunction(()=>globalThis.__fp&&!document.querySelector('#walk-button').disabled);
      const state=()=>page.evaluate(()=>__fp.state());
      const pose=()=>page.evaluate(()=>({position:__fp.state().position,rotation:__fp.state().rotation}));
      async function stand(target={x:0,z:0}){
        if(!(await state()).active)await page.click('#walk-button');
        await page.evaluate(({x,z})=>{
          const c=__fp.walker.camera;c.position.set(0,1.68,20);c.lookAt(x,0,z);c.updateMatrixWorld();__fp.invalidate();
        },target);
      }
      async function choose(type,category){
        const before=await pose();
        await page.click('#shop-button');
        assert.equal((await state()).active,true,'Opening the shop must retain walking');
        await page.click(`[data-category="${category}"]`);
        await page.click(`[data-house="${type}"]`);
        assert.deepEqual(await pose(),before,'Choosing an item must retain the entire camera pose');
        assert.equal((await state()).active,true);
      }
      async function click(x,z){
        const p=await page.evaluate(({x,z})=>{
          const c=__fp.walker.camera;c.updateMatrixWorld();
          const p=c.position.clone().set(x,.04,z).project(c);
          const b=document.querySelector('#world').getBoundingClientRect();
          return {x:b.x+(p.x+1)*b.width/2,y:b.y+(1-p.y)*b.height/2};
        },{x,z});
        if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
      }
      return {context,page,state,pose,stand,choose,click};
    }
    const f=await setup();
    const {page,state,pose,stand,choose,click}=f;
    assert.equal(await page.locator('.world-info').count(),0);
    assert.ok((await page.locator('#help-button').boundingBox()).x>1150);
    checks.push('Removed the counter bar and retained the help button');
    await stand();
    const start=await pose();
    await choose('cottage','residential');
    await page.keyboard.press('r');
    await click(0,0);
    assert.equal((await state()).houses.length,1);
    assert.equal((await state()).houses[0].rotation,3);
    assert.deepEqual(await pose(),start);
    checks.push('Shop, rotated house placement and confirmation preserve the walking camera');
    await choose('decorBench','decoration');
    await click(8,4);
    assert.equal((await state()).houses.length,2);
    assert.equal((await state()).active,true);
    const beforeDrag=await state();
    await page.mouse.move(640,450);
    await page.mouse.down();await page.mouse.move(700,470,{steps:8});await page.mouse.up();
    assert.equal((await state()).houses.length,2,'Looking around must never build an item');
    assert.deepEqual((await state()).position,beforeDrag.position);
    assert.notDeepEqual((await state()).rotation,beforeDrag.rotation);
    await page.keyboard.press('Escape');
    assert.equal((await state()).active,true);
    assert.equal((await state()).placement,null);
    checks.push('Decoration placement works; dragging looks around; Escape cancels without leaving walking');
    await stand({x:0,z:19.7});
    await choose('decorBench','decoration');
    await page.waitForFunction(()=>__fp.state().candidate&&!__fp.state().candidate.valid);
    await page.keyboard.press('Enter');
    assert.equal((await state()).houses.length,2,'Building cannot trap the player');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
    assert.equal((await state()).houses.length,1);
    assert.equal((await state()).active,true);
    checks.push('Placement protects the player and undo stays in first person');
    await stand();
    await choose('lampUrban','lighting');
    await page.waitForFunction(()=>__fp.state().candidate?.x===0);
    await page.mouse.move(1030,455);
    await click(12,4);
    assert.equal((await state()).houses.length,2);
    await page.keyboard.press('Escape');
    await page.screenshot({path:'test-results/first-person-building.png'});
    await page.keyboard.press('Escape');
    assert.equal((await state()).active,false);
    checks.push('Street lights build in first person; a second Escape returns to the overhead view');
    await f.context.close();
    const t=await setup(true);
    await t.stand();
    const touchPose=await t.pose();
    await t.choose('decorBench','decoration');
    await t.click(0,0);
    assert.equal((await t.state()).houses.length,0,'A touch selects a site before confirmation');
    await t.page.click('#place-button');
    assert.equal((await t.state()).houses.length,1);
    assert.deepEqual(await t.pose(),touchPose);
    await t.page.click('#cancel-button');
    assert.equal((await t.state()).active,true);
    await t.page.click('#road-button');
    await t.click(12,0);
    await t.page.click('#place-button');
    assert.equal((await t.state()).roads.length,1);
    assert.equal((await t.state()).active,true);
    checks.push('Touch placement, confirmation, cancel and road building retain first person');
    assert.deepEqual(errors,[]);
    fs.writeFileSync('test-results/first-person-results.json',JSON.stringify({checks,errors},null,2));
    console.log(JSON.stringify({checks,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
