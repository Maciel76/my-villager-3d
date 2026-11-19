"""Verify visible paving below real buildings using isolated saves and the shop UI."""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(os.environ["LOCALAPPDATA"]) / "Temp/vila-decoration-testing"))
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / "test-results"
OUT.mkdir(exist_ok=True)
sites = [("cottage", "residential", 0, 0, 12), ("chalet", "residential", 36, 0, 12),
         ("varandas", "apartments", 72, 0, 12), ("market", "commercial", 108, 0, 12),
         ("aurora", "apartments", 6, 42, 24), ("supermarket", "commercial", 72, 48, 36)]
blocks = [{"type": "pavingConcrete", "x": x + dx, "z": z + dz, "rotation": 0}
          for _, _, x, z, width in sites
          for dx in range(-width // 2, width // 2 + 1, 2)
          for dz in range(-width // 2, width // 2 + 1, 2)]
saved = {"revision": 1, "hour": "7.5", "world": {"version": 1, "areaSize": 360,
         "houses": blocks.copy(), "houseOrder": list(range(len(blocks))), "roads": [],
         "economy": {"coins": 1000000, "progressMs": 0}}}
errors, checks = [], []

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    try:
        context = browser.new_context(viewport={"width": 1280, "height": 900}, reduced_motion="no-preference")
        page = context.new_page()
        page.set_default_timeout(60000)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        def api(route):
            if route.request.method != "GET":
                saved.update(route.request.post_data_json)
                saved["revision"] += 1
            route.fulfill(json=saved)

        def instrument(route):
            response = route.fetch()
            source = response.text()
            marker = "  resetCamera();\n  resize();"
            assert marker in source
            source = source.replace(marker, """
              globalThis.__pave = {camera,controls,invalidate,scene,animations,
                state:()=>({houses:houses.filter(h=>!isPaving(h.type)).map(h=>({type:h.type,x:h.x,z:h.z,
                  y:h.model.position.y,paved:h.model.userData.pavedGround,
                  lowVisible:h.model.children.some(p=>p.userData.lowGroundCover&&p.visible)})),
                  blocks:houses.filter(h=>isPaving(h.type)).length,selection:selection?.type,candidate,
                  placement:placement&&{type:placement.type,moving:placement.moving?.type},aim,
                  camera:camera.position.toArray(),target:controls.target.toArray(),ground:ground.children.length}),
                view:(x,z)=>{controls.enableDamping=false;controls.target.set(x,0,z);
                  camera.position.set(x+40,65,z+55);controls.update();invalidate();},
                point:(x,y,z)=>{camera.updateMatrixWorld();const v=new THREE.Vector3(x,y,z).project(camera);
                  const b=canvas.getBoundingClientRect();return{x:b.x+(v.x+1)*b.width/2,y:b.y+(1-v.y)*b.height/2};},
                inspect:type=>{const house=houses.find(h=>h.type===type),width=footprint(type)[0];
                  const ray=new THREE.Raycaster(),visible=o=>{while(o){if(!o.visible)return false;o=o.parent;}return true;};
                  scene.updateMatrixWorld(true);let exposed=0,covered=[];
                  for(let dx=-width/2+.35;dx<width/2;dx+=2)for(let dz=-width/2+.35;dz<width/2;dz+=2){
                    const x=house.x+dx,z=house.z+dz;
                    ray.set(new THREE.Vector3(x,200,z),new THREE.Vector3(0,-1,0));
                    ray.layers.set(0);ray.layers.enable(1);
                    if(ray.intersectObject(house.model,true).some(h=>visible(h.object)&&!h.object.userData.lowGroundCover&&h.point.y>.121))continue;
                    ray.layers.set(0);
                    const hit=ray.intersectObjects(scene.children,true).find(h=>visible(h.object)&&h.object.material?.depthTest!==false);
                    if(hit?.object.name==='instances-pavingConcrete')exposed++;
                    else covered.push({x,z,name:hit?.object.name,y:hit?.point.y,geometry:hit?.object.geometry?.type,
                      parent:hit?.object.parent?.name,material:hit?.object.material?.color?.getHexString()});
                  }return{exposed,covered};}
              };resetCamera(); resize();""", 1)
            route.fulfill(response=response, body=source)

        page.route("**/api/village", api)
        page.route("**/src/main.js*", instrument)
        page.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(body="", content_type="text/css"))
        page.goto("http://127.0.0.1:5174", wait_until="networkidle")
        page.wait_for_function("globalThis.__pave && !document.querySelector('#shop-button').disabled")
        state = lambda: page.evaluate("__pave.state()")

        def point(x, y, z, click=False):
            pos = page.evaluate("({x,y,z})=>__pave.point(x,y,z)", {"x": x, "y": y, "z": z})
            if click:
                page.mouse.click(pos["x"], pos["y"])
            else:
                page.mouse.move(pos["x"], pos["y"])
            page.evaluate("()=>new Promise(requestAnimationFrame)")

        for type_, category, x, z, _ in sites:
            page.evaluate("({x,z})=>__pave.view(x,z)", {"x": x, "z": z})
            page.click("#shop-button")
            page.click(f'[data-category="{category}"]')
            page.click(f'[data-house="{type_}"]')
            point(x, .04, z)
            page.click("#place-button")
            page.wait_for_function("__pave.animations.size===0")
            page.evaluate("()=>new Promise(requestAnimationFrame)")
            house = next(h for h in state()["houses"] if h["type"] == type_)
            assert abs(house["y"] - .12) < .0001, house
            assert house["paved"] is True and house["lowVisible"] is False, house
            sample = page.evaluate("type=>__pave.inspect(type)", type_)
            assert sample["covered"] == [], (type_, sample)
            checks.append({"type": type_, "height": house["y"], "visiblePavingSamples": sample["exposed"]})
        # The supermarket's structural platform fills its plot; the other
        # models have open borders where the original blocks must stay visible.
        assert all(c["visiblePavingSamples"] > 0 for c in checks if c["type"] != "supermarket"), checks
        assert state()["blocks"] == len(blocks)

        page.evaluate("__pave.view(0,0)")
        point(0, 5, 0, True)
        assert state()["selection"] == "cottage"
        page.click("#move-selected")
        page.evaluate("__pave.view(12,96)")
        point(12.25, 0, 96.25)
        assert state()["candidate"] and state()["candidate"]["valid"], state()
        page.click("#place-button")
        moved = next(h for h in state()["houses"] if h["type"] == "cottage")
        assert moved["z"] == 96 and moved["y"] == 0 and moved["paved"] is False
        page.keyboard.press("Control+z")
        restored = next(h for h in state()["houses"] if h["type"] == "cottage")
        assert restored["z"] == 0 and abs(restored["y"] - .12) < .0001 and restored["paved"] is True
        page.wait_for_function("document.querySelector('#save-state').textContent.includes('✓')")
        page.reload(wait_until="networkidle")
        page.wait_for_function("globalThis.__pave && !document.querySelector('#shop-button').disabled")
        assert len(state()["houses"]) == len(sites) and state()["blocks"] == len(blocks)
        for type_, *_ in sites:
            house = next(h for h in state()["houses"] if h["type"] == type_)
            assert abs(house["y"] - .12) < .0001 and house["paved"] is True and house["lowVisible"] is False
            sample = page.evaluate("type=>__pave.inspect(type)", type_)
            assert sample["covered"] == [], (type_, sample)
        page.evaluate("__pave.view(36,0)")
        page.screenshot(path=str(OUT / "paving-under-buildings.png"))
        assert errors == [], errors
        report = {"checks": checks, "moveUndoReload": True, "allBlocksPreserved": len(blocks), "errors": errors}
        (OUT / "paving-buildings-results.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2))
        context.close()
    finally:
        browser.close()
