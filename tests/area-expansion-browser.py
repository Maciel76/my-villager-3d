"""Test expansion with isolated saves, real rendering and the actual placement UI."""
import copy
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(os.environ["LOCALAPPDATA"]) / "Temp/vila-decoration-testing"))
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / "test-results"
OUT.mkdir(exist_ok=True)
checks, errors = [], []

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    try:
        def setup(touch=False):
            context = browser.new_context(viewport={"width": 390 if touch else 1280, "height": 900}, has_touch=touch, reduced_motion="reduce")
            page = context.new_page()
            page.set_default_timeout(60000)
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
            saved = {"revision": 1, "hour": "7.5", "world": {"version": 1,
                "houses": [{"type": "cottage", "x": 0, "z": 0, "rotation": 0},
                           {"type": "lightBlock", "x": 5.25, "y": 12, "z": 2, "rotation": 0}],
                "houseOrder": [0, 2], "roads": [{"x": 0, "z": 12, "order": 1}]}}
            if not touch:
                saved["world"]["areaSize"] = 180

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
                  globalThis.__area = {camera, controls, walker, scene, ground, grid, roadGrid, invalidate,
                    terrainHeight, getBuildAreaSize, setBuildAreaSize,
                    state: () => ({size:getBuildAreaSize(),limit:BUILD_LIMIT,active:walker.active,
                      pose:walker.camera.position.toArray(),rotation:walker.camera.quaternion.toArray(),
                      houses:houses.map(({x,y,z,type,rotation})=>({x,y,z,type,rotation})),
                      roads:[...roads.values()],candidate,placement:placement&&{type:placement.type,road:placement.road},
                      chunks:ground.children.length,gridWidth:Math.max(...grid.geometry.attributes.position.array.filter((_,i)=>i%3===0))*2}),
                    view:(x,z)=>{controls.enableDamping=false;controls.target.set(x,0,z);
                      camera.position.set(x+40,65,z+55);controls.update();invalidate();},
                    forestInArea:()=>{let occupied=0; const edge=getBuildAreaSize()/2;
                      for(const part of scene.children.filter(p=>p.isInstancedMesh&&p.castShadow)){
                        const m=part.matrixWorld.clone();for(let i=0;i<part.count;i++){
                          part.getMatrixAt(i,m);const p=camera.position.clone().setFromMatrixPosition(m).add(part.position);
                          if(Math.abs(p.x)<edge&&Math.abs(p.z)<edge)occupied++;
                        }}return occupied;}
                  };resetCamera(); resize();""", 1)
                route.fulfill(response=response, body=source)

            page.route("**/api/village", api)
            page.route("**/src/main.js*", instrument)
            page.route("https://fonts.googleapis.com/**", lambda route: route.fulfill(body="", content_type="text/css"))
            page.goto("http://127.0.0.1:5174", wait_until="networkidle")
            page.wait_for_function("globalThis.__area && !document.querySelector('#extend-button').disabled")
            return context, page, saved

        context, page, saved = setup()
        state = lambda: page.evaluate("__area.state()")
        original = copy.deepcopy(saved["world"])
        assert page.locator("#explore-button").count() == 0
        assert state()["size"] == 180
        assert page.evaluate("__area.terrainHeight(160,0)") > 0
        page.click("#extend-button")
        assert page.locator("#current-area").inner_text() == "180 × 180 m"
        assert page.locator("#next-area").inner_text() == "360 × 360 m"
        page.keyboard.press("Escape")
        assert state()["size"] == 180 and saved["revision"] == 1
        page.keyboard.press("1")
        page.click("#expand-area")
        page.wait_for_function("document.querySelector('#save-state').textContent.includes('✓')")
        assert state()["size"] == saved["world"]["areaSize"] == 360
        for key in ["houses", "houseOrder", "roads"]:
            assert saved["world"][key] == original[key], key
        assert page.evaluate("__area.terrainHeight(160,0)") == 0
        assert page.evaluate("__area.forestInArea()") == 0
        assert state()["gridWidth"] == 360
        checks.append("Estender replaces Explorar; cancel is harmless; expansion flattens land, removes native forest and preserves the complete saved village")

        def aim(x, z):
            point = page.evaluate("""({x,z})=>{const c=__area.active?__area.walker.camera:__area.camera;
              c.updateMatrixWorld();const v=c.position.clone().set(x,.04,z).project(c);
              const b=document.querySelector('#world').getBoundingClientRect();
              return{x:b.x+(v.x+1)*b.width/2,y:b.y+(1-v.y)*b.height/2};}""", {"x": x, "z": z})
            page.mouse.move(point["x"], point["y"])
            page.evaluate("()=>new Promise(requestAnimationFrame)")

        page.evaluate("__area.view(120,0)")
        page.click("#road-button")
        aim(120, 0)
        assert state()["candidate"]["valid"] is True
        page.click("#place-button")
        page.keyboard.press("Escape")
        page.click("#shop-button")
        page.click('[data-house="cottage"]')
        aim(120, 12)
        assert state()["candidate"]["valid"] is True
        page.click("#place-button")
        page.keyboard.press("Escape")
        page.wait_for_function("document.querySelector('#save-state').textContent.includes('✓')")
        assert any(h["x"] == 120 for h in saved["world"]["houses"])
        page.reload(wait_until="networkidle")
        page.wait_for_function("globalThis.__area && !document.querySelector('#extend-button').disabled")
        assert state()["size"] == 360
        assert any(h["x"] == 120 for h in state()["houses"])
        assert any(r["x"] == 120 for r in state()["roads"])
        checks.append("A road and house beyond the previous limit can be built with the UI and both survive reload with the expanded size")

        page.evaluate("__area.view(240,0)")
        page.click("#walk-button")
        page.evaluate("__area.walker.camera.position.set(160,1.68,20);__area.walker.camera.lookAt(240,0,0);__area.invalidate()")
        page.click("#shop-button")
        page.click('[data-category="lighting"]')
        page.click('[data-house="lightBlock"]')
        pose = (state()["pose"], state()["rotation"])
        for expected in [540, 720]:
            page.click("#extend-button")
            page.keyboard.press("w")
            page.click("#expand-area")
            page.wait_for_function("document.querySelector('#save-state').textContent.includes('✓')")
            assert state()["size"] == expected
            assert state()["active"] is True
            assert (state()["pose"], state()["rotation"]) == pose
            assert state()["placement"]["type"] == "lightBlock"
            assert page.evaluate("__area.forestInArea()") == 0
        page.click("#extend-button")
        page.screenshot(path=str(OUT / "area-expansion-desktop.png"))
        page.keyboard.press("Escape")
        checks.append("Repeated expansion keeps first-person position, direction and the selected item; modal input does not move the walker")
        before = state()["chunks"]
        page.evaluate("__area.setBuildAreaSize(18000);__area.invalidate()")
        page.wait_for_function("__area.state().gridWidth===480")
        assert state()["chunks"] == before
        assert state()["gridWidth"] == 480
        checks.append("Even very large terrain keeps local grid and loaded terrain memory bounded")
        context.close()

        context, page, saved = setup(True)
        assert state()["size"] == 360, "An unconfigured legacy village starts with doubled dimensions"
        page.click("#extend-button")
        box = page.locator("#extend-dialog").bounding_box()
        assert box["x"] >= 0 and box["x"] + box["width"] <= 390
        assert page.locator("#next-area").inner_text() == "540 × 540 m"
        page.screenshot(path=str(OUT / "area-expansion-touch.png"))
        page.tap("#expand-area")
        page.wait_for_function("document.querySelector('#save-state').textContent.includes('✓')")
        assert saved["world"]["areaSize"] == 540
        checks.append("Legacy default doubles to 360 m; the expansion dialog fits a 390 px touch screen and its button saves the next expansion")
        context.close()
        assert errors == [], errors
        (OUT / "area-expansion-results.json").write_text(json.dumps({"checks": checks, "errors": errors}, indent=2), encoding="utf-8")
        print(json.dumps({"checks": checks, "errors": errors}, indent=2))
    finally:
        browser.close()
