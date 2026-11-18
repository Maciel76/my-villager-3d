"""Regression: decorate the visually empty gap between real house models."""
import json
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(os.environ["LOCALAPPDATA"]) / "Temp/vila-decoration-testing"))
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results"
OUT.mkdir(exist_ok=True)
saved = {"revision": 1, "hour": "7.5", "world": {"version": 1,
    "houses": [{"type": "cottage", "x": 0, "z": 0, "rotation": 0}, {"type": "cottage", "x": 12, "z": 0, "rotation": 0}],
    "roads": [{"x": 0, "z": 12, "order": 0}, {"x": 0, "z": 24, "order": 1}, {"x": 0, "z": 36, "order": 2}]}}
errors, results = [], []

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
    page.set_default_timeout(90000)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(body="", content_type="text/css"))

    def api(route):
        global saved
        if route.request.method != "GET":
            saved = {**saved, **route.request.post_data_json, "revision": saved["revision"] + 1}
        route.fulfill(json=saved)

    def instrument(route):
        response = route.fetch()
        marker = "  resetCamera();\n  resize();"
        body = response.text()
        assert marker in body
        body = body.replace(marker, """
          globalThis.__trees = { camera, controls, renderer, houses, buildingTemplates, addHouse,
            invalidate, beginPlacement, explore, saveWorld, syncParcels,
            state: () => ({ houses: houses.map(({type,x,z,rotation,model})=>({type,x,z,rotation,y:model.position.y})),
              placement: placement && { type:placement.type, target:placement.target, rotation:placement.rotation } })
          }; resetCamera(); resize();""", 1)
        route.fulfill(response=response, body=body)

    page.route("**/api/village", api)
    page.route("**/src/main.js*", instrument)
    page.goto("http://127.0.0.1:5174", wait_until="networkidle")
    page.wait_for_function("() => globalThis.__trees && !document.querySelector('#shop-button').disabled")
    page.screenshot(path=str(OUT / "trees-initial.png"))
    page.click("#shop-button")
    page.click('[data-category="decoration"]')
    page.click('[data-decoration-family="trees"]')
    assert page.locator(".decoration-choice:visible").count() == 12
    sources = page.locator(".decoration-choice:visible img").evaluate_all("imgs=>imgs.map(img=>img.src)")
    assert len(set(sources)) == 12
    page.screenshot(path=str(OUT / "trees-shop.png"))
    results.append("12 different trees and their catalogue previews")

    page.click('[data-house="treeCherry"]')

    def state():
        return page.evaluate("() => __trees.state()")

    def click_world(x, z, height=0.05):
        coords = page.evaluate("""({x,z,height}) => {
          const t=__trees;t.camera.updateMatrixWorld();
          const v=t.camera.position.clone().set(x,height,z).project(t.camera);
          const r=document.querySelector('#world').getBoundingClientRect();
          return {x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};
        }""", {"x": x, "z": z, "height": height})
        page.mouse.click(coords["x"], coords["y"])

    click_world(6.25, .75)
    assert len(state()["houses"]) == 3
    tree = state()["houses"][-1]
    assert tree["type"] == "treeCherry" and tree["x"] == 6.25 and tree["z"] == .75
    # The old whole-lot collision refused this exact location between both houses.
    click_world(0, 0)
    assert len(state()["houses"]) == 3
    page.keyboard.press("Escape")
    results.append("tree planted between two house lots, actual walls still blocked")

    page.click("#shop-button")
    page.click('[data-decoration-family="garden"]')
    page.click('[data-house="decorBench"]')
    click_world(6, 4.5)
    assert len(state()["houses"]) == 4
    page.mouse.move(5, 5)
    page.keyboard.press("ArrowRight")
    before = state()["placement"]["target"]["x"]
    page.keyboard.press("ArrowRight")
    assert abs(state()["placement"]["target"]["x"] - before - .25) < 1e-6
    page.keyboard.press("Escape")
    results.append("small bench fits the gap and arrows move in 25 cm steps")

    page.click("#shop-button")
    page.click('[data-decoration-family="trees"]')
    page.click('[data-house="treeCypress"]')
    click_world(4.25, 12)
    assert len(state()["houses"]) == 5
    assert abs(state()["houses"][-1]["y"] - .13) < .001
    page.keyboard.press("Escape")
    results.append("tree on a sidewalk rests at the sidewalk height")

    page.wait_for_function("() => document.querySelector('#save-state').textContent.includes('Salvo')")
    page.reload(wait_until="networkidle")
    page.wait_for_function("() => globalThis.__trees && !document.querySelector('#shop-button').disabled")
    assert len(state()["houses"]) == 5
    assert any(h["x"] == 6.25 and h["type"] == "treeCherry" for h in state()["houses"])
    assert abs(state()["houses"][-1]["y"] - .13) < .001
    results.append("reloading preserves trees inside lots, fine coordinates and sidewalk support")

    page.click("#shop-button")
    page.click('[data-category="decoration"]')
    page.click('[data-decoration-family="beds"]')
    assert page.locator(".decoration-choice:visible").count() == 6
    page.screenshot(path=str(OUT / "planting-beds-shop.png"))
    page.click('[data-house="bedMedian"]')
    click_world(0, 24, .045)
    assert len(state()["houses"]) == 6
    assert state()["houses"][-1]["type"] == "bedMedian"
    page.keyboard.press("Escape")
    page.click("#shop-button")
    page.click('[data-decoration-family="trees"]')
    page.click('[data-house="treeIpeYellow"]')
    click_world(0, 24, .355)
    assert len(state()["houses"]) == 7
    tree = state()["houses"][-1]
    assert tree["x"] == 0 and tree["z"] == 24 and abs(tree["y"] - .355) < .001
    click_world(1, 24, .355)
    assert len(state()["houses"]) == 7
    click_world(0, 26, .355)
    assert len(state()["houses"]) == 8
    page.keyboard.press("Escape")
    page.wait_for_function("() => document.querySelector('#save-state').textContent.includes('Salvo')")
    page.reload(wait_until="networkidle")
    page.wait_for_function("() => globalThis.__trees && !document.querySelector('#shop-button').disabled")
    assert len(state()["houses"]) == 8
    assert sum(h["type"] == "treeIpeYellow" and abs(h["y"] - .355) < .001 for h in state()["houses"]) == 2
    results.append("six road planting beds, two trees on the soil, rim rejection and stacked save reload")
    page.evaluate("""() => {
      const t=__trees;t.controls.enableDamping=false;t.controls.target.set(0,1.5,24);
      t.camera.position.set(14,12,37);t.controls.update();t.invalidate();
    }""")
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / "trees-on-road-bed.png"))

    page.evaluate("""() => {
      const t=__trees;t.controls.enableDamping=false;t.controls.target.set(6,1,2);
      t.camera.position.set(26,19,34);t.controls.update();t.invalidate();
    }""")
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / "trees-between-houses.png"))
    page.evaluate("""() => {
      const t=__trees;
      Object.keys(t.buildingTemplates).filter(type=>type.startsWith('tree')).forEach((type,i)=>
        t.addHouse({type,x:(i%4-1.5)*9,z:-20-Math.floor(i/4)*10,rotation:0}));
      t.controls.target.set(0,2,-30);t.camera.position.set(37,31,18);t.controls.update();t.invalidate();
    }""")
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / "trees-gallery.png"))
    page.set_viewport_size({"width": 390, "height": 844})
    page.click("#shop-button")
    page.click('[data-category="decoration"]')
    page.click('[data-decoration-family="trees"]')
    assert page.locator(".decoration-choice:visible").count() == 12
    page.screenshot(path=str(OUT / "trees-mobile.png"))
    results.append("all 12 trees render in the village and the mobile shop")
    assert not errors, errors
    (OUT / "trees-browser.json").write_text(json.dumps({"checks": results, "errors": errors}, indent=2), encoding="utf-8")
    print(json.dumps({"checks": results, "errors": errors}, indent=2))
    browser.close()
