"""Exercise the real shop and placement UI against an isolated saved village."""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(os.environ["LOCALAPPDATA"]) / "Temp/vila-decoration-testing"))
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results"
OUT.mkdir(exist_ok=True)
errors = []
saved = {"revision": 1, "hour": "7.5", "world": {"version": 1, "houses": [], "roads": [{"x": 0, "z": 0, "order": 0}]}}
results = []

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1100}, reduced_motion="reduce")
    page = context.new_page()
    page.set_default_timeout(60000)
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.route("https://fonts.googleapis.com/**", lambda route: route.fulfill(body="", content_type="text/css"))

    def api(route):
        global saved
        if route.request.method != "GET":
            saved = {**saved, **route.request.post_data_json, "revision": saved["revision"] + 1}
        route.fulfill(json=saved)

    def instrument(route):
        response = route.fetch()
        source = response.text()
        marker = "  resetCamera();\n  resize();"
        assert marker in source
        source = source.replace(marker, """
          globalThis.__decorTest = { camera, controls, renderer, scene, buildingTemplates, houses,
            beginPlacement, addHouse, invalidate, explore,
            state: () => ({ houses: houses.map(({ x, z, type, rotation }) => ({ x, z, type, rotation })),
              placement: placement && { type: placement.type, rotation: placement.rotation, moving: Boolean(placement.moving) } })
          }; resetCamera(); resize();""", 1)
        route.fulfill(response=response, body=source)

    page.route("**/api/village", api)
    page.route("**/src/main.js*", instrument)
    page.goto("http://127.0.0.1:5174", wait_until="networkidle")
    page.wait_for_function("() => globalThis.__decorTest && !document.querySelector('#shop-button').disabled")
    page.screenshot(path=str(OUT / "decorations-initial.png"))
    page.click("#shop-button")
    page.click('[data-category="decoration"]')
    assert page.locator(".decoration-choice:visible").count() == 58
    assert page.locator("#catalog-count").inner_text() == "58 decorações"
    sources = page.locator(".decoration-choice img").evaluate_all("imgs => imgs.map(img => img.src)")
    assert len(set(sources)) == 58 and all(source.startswith("data:image/webp") for source in sources)
    page.screenshot(path=str(OUT / "decorations-shop.png"))
    for family, count in [("garden", 6), ("square", 5), ("leisure", 5), ("rustic", 4), ("trees", 12), ("beds", 6), ("flags", 20)]:
        page.click(f'[data-decoration-family="{family}"]')
        assert page.locator(".decoration-choice:visible").count() == count
    page.click('[data-decoration-family="all"]')
    page.click('[data-category="residential"]')
    assert page.locator("#decoration-menu").is_hidden()
    page.click('[data-category="decoration"]')
    page.click('[data-house="decorBench"]')
    results.append("58 unique previews, seven family filters and category switching")

    def state():
        return page.evaluate("() => __decorTest.state()")

    def click_world(x, z, height=0.05):
        pos = page.evaluate("""({x,z,height}) => {
          const t=__decorTest; t.camera.updateMatrixWorld();
          const p=t.camera.position.clone().set(x,height,z).project(t.camera);
          const r=document.querySelector('#world').getBoundingClientRect();
          return {x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2};
        }""", {"x": x, "z": z, "height": height})
        page.mouse.click(pos["x"], pos["y"])

    click_world(-12, -8)
    assert len(state()["houses"]) == 1
    assert state()["placement"]["type"] == "decorBench"
    page.keyboard.press("r")
    click_world(-17, -8)
    assert len(state()["houses"]) == 2 and state()["houses"][-1]["rotation"] == 3
    click_world(-17, -8)
    assert len(state()["houses"]) == 2
    click_world(0, 0)
    assert len(state()["houses"]) == 3
    page.keyboard.press("Escape")
    page.keyboard.press("Control+z")
    assert len(state()["houses"]) == 2
    results.append("repeated placement, rotation, overlap rejection and free road placement")

    click_world(-12, -8, .55)
    page.click("#move-selected")
    click_world(-12, -14)
    assert state()["houses"][0]["z"] == -14 and state()["placement"] is None
    page.keyboard.press("Control+z")
    assert state()["houses"][0]["z"] == -8
    page.keyboard.press("Control+z")
    assert len(state()["houses"]) == 1
    results.append("move and atomic undo")

    page.wait_for_function("() => document.querySelector('#save-state').textContent.includes('Salvo')")
    page.reload(wait_until="networkidle")
    page.wait_for_function("() => globalThis.__decorTest && !document.querySelector('#shop-button').disabled")
    assert len(state()["houses"]) == 1 and state()["houses"][0]["type"] == "decorBench"
    results.append("save API round trip and restored model")

    # Add one of each to this isolated browser fixture for a visual gallery.
    page.evaluate("""() => {
      const t=__decorTest;t.explore();
      Object.keys(t.buildingTemplates).filter(type=>type.startsWith('decor')).forEach((type,i)=>
        t.addHouse({type,x:(i%5-2)*8,z:Math.floor(i/5)*8+16,rotation:0}));
      t.controls.enableDamping=false;t.controls.target.set(0,0,28);
      t.camera.position.set(37,38,76);t.controls.update();t.invalidate();
    }""")
    page.wait_for_timeout(700)
    page.screenshot(path=str(OUT / "decorations-gallery.png"))
    page.select_option("#village-hour", "23")
    page.wait_for_timeout(500)
    assert page.evaluate("() => __decorTest.houses.find(h=>h.type==='decorFirepit').model.userData.lampEmitters.length") == 1
    page.screenshot(path=str(OUT / "decorations-night.png"))
    results.append("all 20 rendered in the village and firepit night light")

    page.set_viewport_size({"width": 390, "height": 844})
    page.click("#shop-button")
    page.click('[data-category="decoration"]')
    assert page.locator(".decoration-choice:visible").count() == 58
    assert page.evaluate("() => document.documentElement.scrollWidth <= innerWidth")
    page.locator('[data-house="decorSignpost"]').scroll_into_view_if_needed()
    page.screenshot(path=str(OUT / "decorations-mobile.png"))
    assert page.locator('[data-house="decorSignpost"]').is_visible()
    results.append("mobile menu, scrolling and final item access")
    assert not errors, errors
    (OUT / "decorations-browser.json").write_text(json.dumps({"checks": results, "errors": errors}, indent=2), encoding="utf-8")
    print(json.dumps({"checks": results, "errors": errors}, indent=2))
    browser.close()
