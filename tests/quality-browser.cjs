const { createRequire } = require('node:module');
const { chromium } = createRequire(process.env.CODEX_MCP_NODE_PATH)('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const saved = await (await fetch('http://127.0.0.1:5174/api/village')).json();
  saved.hour = '23';
  const browser = await chromium.launch({channel:'msedge', headless:true});
  const errors=[];
  try {
    const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:2});
    page.setDefaultTimeout(90000);
    page.on('pageerror',e=>{errors.push(String(e));console.log(String(e));});
    page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.log(m.text());}});
    await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
    await page.route('**/api/village',r=>{
      if(r.request().method()!=='GET')Object.assign(saved,r.request().postDataJSON());
      return r.fulfill({json:saved});
    });
    await page.route('**/src/main.js*',async r=>{
      const response=await r.fetch();
      const source=await response.text();
      console.log('Quality hook',source.includes('  resetCamera();\n  resize();'));
      const body=source.replace('  resetCamera();\n  resize();',
        'globalThis.__quality={camera,controls,renderer,nightLights,invalidate,houses,buildingTemplates}; resetCamera(); resize();');
      await r.fulfill({response,body});
    });
    const began=Date.now();
    await page.goto('http://127.0.0.1:5174',{waitUntil:'networkidle'});
    console.log('Quality page ready',await page.locator('#status').textContent());
    await page.waitForFunction(()=>globalThis.__quality&&!document.querySelector('#help-button').disabled);
    const nightLoadMs=Date.now()-began;
    async function resolution() {return page.evaluate(()=>({
      native:devicePixelRatio,ratio:__quality.renderer.getPixelRatio(),
      width:__quality.renderer.domElement.width,cssWidth:__quality.renderer.domElement.clientWidth,
      lights:__quality.nightLights.stats.emitters,
    }));}
    assert.equal((await resolution()).ratio,2);
    assert.equal((await resolution()).width,2560);
    const emitters=(await resolution()).lights;
    await page.selectOption('#village-hour','7.5');
    await page.evaluate(()=>{
      const p=__quality;p.controls.enableDamping=false;
      p.controls.target.set(0,4,0);p.camera.position.set(40,36,54);p.controls.update();p.invalidate();
    });
    await page.screenshot({path:'test-results/village-full-quality-day.png'});
    await page.evaluate(async()=>{
      for(let i=0;i<120;i++){
        await new Promise(requestAnimationFrame);
        __quality.camera.position.x+=.008;__quality.controls.update();__quality.invalidate();
      }
    });
    assert.equal((await resolution()).ratio,2,'Native resolution must never drop during movement');
    await page.selectOption('#village-hour','23');
    await page.screenshot({path:'test-results/village-full-quality-night.png'});
    assert.equal((await resolution()).lights,emitters);
    await page.click('#shop-button');
    for(const category of ['apartments','commercial','landmarks','lighting','residential']){
      await page.click(`[data-category="${category}"]`);
      assert.ok(await page.locator('.house-choice:visible img[src]').count());
    }
    await page.click('#close-shop');
    assert.deepEqual(errors,[]);
    const result={nightLoadMs,resolution:await resolution(),errors};
    fs.writeFileSync('test-results/full-quality-results.json',JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
