"""Render real light markers behind opaque walls and at a distance on the GPU."""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(os.environ["LOCALAPPDATA"]) / "Temp/vila-decoration-testing"))
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / "test-results"
OUT.mkdir(exist_ok=True)
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    try:
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.set_default_timeout(60000)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(body="", content_type="text/css"))
        page.route("**/api/village", lambda r: r.fulfill(json={"revision": 1, "hour": "23", "world": {
            "version": 1, "areaSize": 360, "roads": [], "houses": [
                {"type": "lightBlock", "x": 0, "z": 0, "y": 1, "rotation": 0},
            ], "economy": {"coins": 10000, "progressMs": 0}}}))

        def instrument(route):
            response = route.fetch()
            source = response.text()
            marker = "  resetCamera();\n  resize();"
            assert marker in source
            source = source.replace(marker, """
              globalThis.__visibility={THREE,renderer,templates:buildingTemplates,
                createNightLights,createBuildingBatches,nightLights,buildingBatches,
                walker,camera,controls,invalidate,
                pose:(distance)=>{controls.enableDamping=false;controls.target.set(0,1,0);
                  camera.position.set(0,1,distance);controls.update();invalidate();},
                markerCount:()=>buildingBatches.root.children.filter(p=>p.name==='instances-lightBlock').reduce((n,p)=>n+p.count,0)};
              resetCamera(); resize();""", 1)
            route.fulfill(response=response, body=source)

        page.route("**/src/main.js*", instrument)
        page.goto("http://127.0.0.1:5174", wait_until="networkidle")
        page.wait_for_function("globalThis.__visibility&&!document.querySelector('#shop-button').disabled")

        result = page.evaluate("""() => {
          const {THREE,renderer,templates,createNightLights,createBuildingBatches}=__visibility;
          const scene=new THREE.Scene();scene.background=new THREE.Color('#000000');
          const camera=new THREE.PerspectiveCamera(62,1,.08,200);
          camera.position.set(0,1,10);camera.lookAt(0,1,0);
          const model=templates.lightBlock.clone();model.position.set(0,1,0);
          model.traverse(part=>{if(part.isMesh){part.material=part.material.clone();
            part.material.onBeforeCompile=()=>{};part.material.customProgramCacheKey=()=>'';
            part.material.emissiveIntensity=3.5;}});
          scene.add(model);
          const houses=[{type:'lightBlock',model}],animations=new Map();
          const batches=createBuildingBatches(scene,{lightBlock:model});
          const night=createNightLights(scene,{clustered:true});night.bind(model);
          const wall=new THREE.Mesh(new THREE.BoxGeometry(8,8,.5),new THREE.MeshBasicMaterial({color:'#293646',toneMapped:false}));
          wall.position.set(0,1,3);scene.add(wall);
          const target=new THREE.WebGLRenderTarget(256,256,{samples:4});
          const oldTarget=renderer.getRenderTarget();
          function render(power=1){
            scene.updateMatrixWorld(true);camera.updateMatrixWorld();
            batches.sync(houses,animations,camera);night.update(houses,camera,power);
            renderer.setRenderTarget(target);renderer.render(scene,camera);
            const pixels=new Uint8Array(256*256*4);renderer.readRenderTargetPixels(target,0,0,256,256,pixels);
            renderer.setRenderTarget(oldTarget);return pixels;
          }
          function difference(a,b){let max=0,total=0;
            for(let i=0;i<a.length;i++)if(i%4!==3){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);total+=d;}
            return{max,total};}
          const behindWall=render();model.visible=false;const wallAlone=render();
          const occludedDifference=difference(behindWall,wallAlone);
          model.visible=true;wall.visible=false;const near=render();
          model.visible=false;const background=render();model.visible=true;
          const nearDifference=difference(near,background);
          camera.position.set(0,1,80);camera.lookAt(0,1,0);
          const far=render();const farCount=batches.root.children.reduce((n,p)=>n+p.count,0);
          const farEmitters=night.stats.emitters,lightTexture=night.uniforms.cityLights.value;
          const distantDifference=difference(far,background);
          const floor=new THREE.Mesh(new THREE.PlaneGeometry(10,10).rotateX(-Math.PI/2),
            new THREE.MeshStandardMaterial({color:'#888888',roughness:1}));scene.add(floor);
          scene.add(new THREE.HemisphereLight('#111111','#111111',.1));night.bind(floor);
          camera.position.set(0,60,60);camera.lookAt(0,0,0);
          const litFloor=render(1),unlitFloor=render(0);
          const illuminationDifference=difference(litFloor,unlitFloor);
          const textureReused=night.uniforms.cityLights.value===lightTexture;
          target.dispose();floor.geometry.dispose();floor.material.dispose();
          wall.geometry.dispose();wall.material.dispose();
          return{occludedDifference,nearDifference,distantDifference,farCount,farEmitters,illuminationDifference,textureReused};
        }""")
        assert result["occludedDifference"]["max"] <= 1, result
        assert result["nearDifference"]["max"] > 100, result
        assert result["distantDifference"]["max"] <= 1 and result["farCount"] == 0, result
        assert result["farEmitters"] == 1 and result["textureReused"] is True, result
        assert result["illuminationDifference"]["max"] > 20, result
        page.evaluate("__visibility.pose(28)")
        page.wait_for_function("__visibility.markerCount()===1")
        page.evaluate("__visibility.pose(90)")
        page.wait_for_function("__visibility.markerCount()===0")
        assert page.evaluate("__visibility.nightLights.stats.emitters") == 1
        result["gameCameraCulling"] = True
        assert errors == [], errors
        result["errors"] = errors
        (OUT / "free-light-visibility-results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(json.dumps(result, indent=2))
    finally:
        browser.close()
