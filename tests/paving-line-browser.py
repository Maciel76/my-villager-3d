"""Exercise Shift-click paving, obstacles, costs, undo and first-person placement."""
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
        def setup(coins=1000, obstacles=True):
            context = browser.new_context(viewport={"width": 1280, "height": 900}, reduced_motion="reduce")
            page = context.new_page()
            page.set_default_timeout(60000)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            saved = {"revision": 1, "hour": "7.5", "world": {"version": 1, "areaSize": 360,
                "houses": [{"type": "cottage", "x": 0, "z": 0, "rotation": 0},
                           {"type": "pavingConcrete", "x": -14, "z": 0, "rotation": 0}] if obstacles else [],
                "roads": [{"x": 12, "z": 0, "order": 2}] if obstacles else [],
                "economy": {"coins": coins, "progressMs": 0}}}
            writes = []

            def api(route):
                if route.request.method != "GET":
                    writes.append(copy.deepcopy(route.request.post_data_json))
                    saved.update(route.request.post_data_json)
                    saved["revision"] += 1
                route.fulfill(json=saved)

            def instrument(route):
                response = route.fetch()
                source = response.text()
                marker = "  resetCamera();\n  resize();"
                assert marker in source
                source = source.replace(marker, """
                  globalThis.__line={camera,walker,invalidate,
                    state:()=>({items:houses.map(({x,z,type,rotation})=>({x,z,type,rotation})),
                      candidate,coins:treasury.coins,active:walker.active,
                      pose:walker.camera.position.toArray(),rotation:walker.camera.quaternion.toArray(),
                      anchor:placement?.lineStart,tool:placement?.type,
                      plan:placement?.linePreview?.plan,
                      preview:{visible:Boolean(pavingLineGhost?.visible),count:pavingLineGhost?.count??0}}),
                    view:(x,z)=>{controls.enableDamping=false;controls.target.set(x,0,z);
                      camera.position.set(x+46,70,z+65);controls.update();invalidate();},
                    point:(x,z)=>{const view=walker.active?walker.camera:camera;view.updateMatrixWorld();
                      const p=new THREE.Vector3(x+.15,.01,z+.15).project(view),b=canvas.getBoundingClientRect();
                      return{x:b.x+(p.x+1)*b.width/2,y:b.y+(1-p.y)*b.height/2};}
                  };resetCamera(); resize();""", 1)
                route.fulfill(response=response, body=source)

            page.route("**/api/village", api)
            page.route("**/src/main.js*", instrument)
            page.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(body="", content_type="text/css"))
            page.goto("http://127.0.0.1:5174", wait_until="networkidle")
            page.wait_for_function("globalThis.__line&&!document.querySelector('#shop-button').disabled")
            state = lambda: page.evaluate("__line.state()")

            def choose(type_="pavingConcrete"):
                page.click("#shop-button")
                page.click('[data-category="paving"]')
                page.click(f'[data-house="{type_}"]')

            def point(x, z, click=False, shift=False):
                pos = page.evaluate("({x,z})=>__line.point(x,z)", {"x": x, "z": z})
                if shift:
                    page.keyboard.down("Shift")
                if click:
                    page.mouse.click(pos["x"], pos["y"])
                else:
                    page.mouse.move(pos["x"], pos["y"])
                if shift:
                    page.keyboard.up("Shift")
                page.evaluate("()=>new Promise(requestAnimationFrame)")

            def saved_ok():
                page.wait_for_function("document.querySelector('#save-state').textContent.includes('✓')")

            return context, page, state, choose, point, saved_ok, saved, writes

        context, page, state, choose, point, saved_ok, saved, writes = setup()
        original = copy.deepcopy(state()["items"])
        page.evaluate("__line.view(0,0)")
        choose()
        point(-24, 0, click=True, shift=True)
        assert state()["anchor"] == {"x": -24, "z": 0}
        assert state()["items"] == original and state()["coins"] == 1000 and len(writes) == 0
        point(12, 0)
        plan = state()["plan"]
        assert state()["candidate"]["valid"] is False, "The endpoint is deliberately on a road"
        assert state()["preview"] == {"visible": True, "count": 19}
        assert [s["x"] for s in plan["ready"]] == [-24, -22, -20, -18, -16, -12, -10, -8, -6, 6], plan
        assert plan["blocked"] == 9 and plan["cost"] == 100
        assert page.locator("#place-button").is_enabled(), "A blocked endpoint must still allow filling the free cells"
        page.screenshot(path=str(OUT / "paving-line-preview.png"))
        point(12, 0, click=True)
        saved_ok()
        assert len(state()["items"]) == len(original) + 10
        assert state()["coins"] == 900 and len(writes) == 1
        assert state()["preview"]["visible"] is False and state().get("anchor") is None
        assert len([h for h in state()["items"] if h["x"] == -14 and h["z"] == 0]) == 1
        checks.append("Shift-click anchors without building; the next click fills past a house, skips existing paving and roads, accepts a red endpoint and charges only the 10 valid cells")
        page.keyboard.press("Control+z")
        saved_ok()
        assert state()["items"] == original and state()["coins"] == 1000
        checks.append("One undo removes the complete line, refunds its cost and preserves all original objects")

        choose()
        point(16, 12, click=True)
        saved_ok()
        assert len(state()["items"]) == len(original) + 1 and state()["coins"] == 990
        point(0, 0, click=True, shift=True)
        assert state()["anchor"] == {"x": 0, "z": 0}, "A blocked start is supported too"
        point(24, 0)
        assert [s["x"] for s in state()["plan"]["ready"]] == [6, 18, 20, 22, 24]
        page.keyboard.press("Enter")
        saved_ok()
        assert state()["coins"] == 940 and len(state()["items"]) == len(original) + 6
        point(-24, 24, click=True, shift=True)
        before = copy.deepcopy(state()["items"])
        page.keyboard.press("Escape")
        assert state().get("anchor") is None and state()["tool"] == "pavingConcrete"
        assert state()["items"] == before
        point(-24, 24, click=True, shift=True)
        page.keyboard.press("Control+z")
        assert state().get("anchor") is None and state()["items"] == before
        page.keyboard.press("Control+z")
        saved_ok()
        assert state()["coins"] == 990 and len(state()["items"]) == len(original) + 1
        checks.append("Normal single-block placement is retained; blocked starts, Enter, Escape and cancelling an unfinished line work without modifying the village")
        choose()
        point(-24, 24, click=True, shift=True)
        point(-14, 34, click=True)
        saved_ok()
        diagonal = [{"x": -24 + i * 2, "z": 24 + i * 2} for i in range(6)]
        assert all(any(h["x"] == s["x"] and h["z"] == s["z"] for h in state()["items"]) for s in diagonal)
        assert state()["coins"] == 930
        page.reload(wait_until="networkidle")
        page.wait_for_function("globalThis.__line&&!document.querySelector('#shop-button').disabled")
        assert len(state()["items"]) == len(original) + 7 and state()["coins"] == 930
        checks.append("Diagonal lines and the final balance survive saving and reload")
        context.close()

        context, page, state, choose, point, saved_ok, saved, writes = setup(coins=25, obstacles=False)
        choose("pavingMosaic")
        point(-12, 12, click=True, shift=True)
        point(0, 12)
        assert len(state()["plan"]["ready"]) == 1 and state()["plan"]["unaffordable"] == 6
        point(0, 12, click=True)
        saved_ok()
        assert len(state()["items"]) == 1 and state()["coins"] == 10
        page.keyboard.press("Control+z")
        saved_ok()
        assert len(state()["items"]) == 0 and state()["coins"] == 25
        checks.append("A low balance places only affordable blocks and undo returns the exact amount")
        context.close()

        context, page, state, choose, point, saved_ok, saved, writes = setup(obstacles=False)
        page.click("#walk-button")
        page.evaluate("__line.walker.camera.position.set(0,1.68,20);__line.walker.camera.lookAt(0,0,0);__line.invalidate()")
        pose = (state()["pose"], state()["rotation"])
        choose()
        point(-6, 0, click=True, shift=True)
        point(6, 0, click=True)
        saved_ok()
        assert len(state()["items"]) == 7 and state()["active"] is True
        assert (state()["pose"], state()["rotation"]) == pose
        checks.append("First-person line placement retains the walking position and viewing direction")
        context.close()
        assert errors == [], errors
        (OUT / "paving-line-results.json").write_text(json.dumps({"checks": checks, "errors": errors}, indent=2), encoding="utf-8")
        print(json.dumps({"checks": checks, "errors": errors}, indent=2))
    finally:
        browser.close()
