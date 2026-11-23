"""Real shop, wind motion, independent copies and save/undo; no live API writes."""
import json
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(os.environ["LOCALAPPDATA"]) / "Temp/vila-decoration-testing"))
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / "test-results" / "flags"
OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get("VILLAGE_TEST_URL", "http://127.0.0.1:5175")
saved = {"revision": 1, "hour": "12", "world": {"version": 1, "areaSize": 180,
    "houses": [{"type": "cottage", "x": 0, "z": 0, "rotation": 0},
               {"type": "cottage", "x": 12, "z": 0, "rotation": 0}],
    "roads": [{"x": 0, "z": 12, "order": 0}], "economy": {"coins": 100000, "progressMs": 0}}}
errors, checks = [], []
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page(viewport={"width": 1500, "height": 1100})
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
        source = response.text()
        assert marker in source
        source = source.replace(marker, """
          globalThis.__flags={camera,controls,renderer,scene,houses,animations,buildingTemplates,flagAnimation,
            addHouse,invalidate,explore,state:()=>({coins:treasury.coins,
              houses:houses.map(({type,x,z,rotation})=>({type,x,z,rotation})),
              placement:placement&&{type:placement.type,rotation:placement.rotation}})};
          resetCamera(); resize();""", 1)
        route.fulfill(response=response, body=source)

    page.route("**/api/village", api)
    page.route("**/src/main.js*", instrument)

    def ready():
        page.wait_for_function("() => globalThis.__flags && !document.querySelector('#shop-button').disabled")

    def state():
        return page.evaluate("() => __flags.state()")

    def click_world(x, z, y=.02):
        pos = page.evaluate("""({x,z,y})=>{
          const t=__flags;t.camera.updateMatrixWorld();
          const v=t.camera.position.clone().set(x,y,z).project(t.camera);
          const r=document.querySelector('#world').getBoundingClientRect();
          return {x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};
        }""", {"x": x, "z": z, "y": y})
        page.mouse.click(pos["x"], pos["y"])

    def cloth(type="flagBrazil"):
        return page.evaluate("""type=>Array.from(__flags.houses.find(h=>h.type===type)
          .model.getObjectByName('Tecido da bandeira').geometry.attributes.position.array)""", type)

    def choose(type):
        page.click("#shop-button")
        page.click('[data-category="decoration"]')
        page.click('[data-decoration-family="flags"]')
        page.click(f'[data-house="{type}"]')

    try:
        page.goto(BASE, wait_until="networkidle")
        ready()
        page.screenshot(path=str(OUT / "01-initial.png"))
        page.click("#shop-button")
        page.click('[data-category="decoration"]')
        page.click('[data-decoration-family="flags"]')
        assert page.locator(".decoration-choice:visible").count() == 20
        assert page.locator("#catalog-count").inner_text() == "20 decorações"
        sources = page.locator(".decoration-choice:visible img").evaluate_all("imgs=>imgs.map(img=>img.src)")
        assert len(set(sources)) == 20 and all(s.startswith("data:image/webp") for s in sources)
        page.screenshot(path=str(OUT / "02-shop.png"))
        checks.append("20 country designs, local textures and unique catalogue previews")
        page.click('[data-house="flagBrazil"]')
        click_world(6.25, .75)
        page.wait_for_function("() => __flags.houses.length===3 && __flags.animations.size===0")
        assert state()["houses"][-1] == {"type": "flagBrazil", "x": 6.25, "z": .75, "rotation": 0}
        assert state()["coins"] == 99976
        a = cloth()
        page.wait_for_timeout(220)
        assert a != cloth(), "wind must update cloth even with a stationary camera"
        page.keyboard.press("Escape")
        checks.append("purchase and actual cloth motion in the gap between two houses")

        choose("flagPortugal")
        page.keyboard.press("r")
        click_world(18.25, .75)
        page.wait_for_function("() => __flags.houses.length===4 && __flags.animations.size===0")
        assert state()["houses"][-1]["rotation"] == 3
        page.keyboard.press("Escape")
        assert page.evaluate("__flags.flagAnimation.count") == 2
        page.emulate_media(reduced_motion="reduce")
        page.wait_for_timeout(80)
        frozen = cloth()
        page.wait_for_timeout(180)
        assert frozen == cloth()
        page.emulate_media(reduced_motion="no-preference")
        page.wait_for_timeout(220)
        assert frozen != cloth()
        checks.append("rotation and reduced-motion pause/resume")

        click_world(6.25, .75, 1)
        page.click("#move-selected")
        click_world(6.25, 4.75)
        assert state()["houses"][2]["z"] == 4.75
        page.keyboard.press("Control+z")
        assert state()["houses"][2]["z"] == .75
        click_world(6.25, .75, 1)
        page.click("#delete-selected")
        assert page.evaluate("__flags.flagAnimation.count") == 1
        page.keyboard.press("Control+z")
        assert page.evaluate("__flags.flagAnimation.count") == 2
        restored = cloth()
        page.wait_for_timeout(220)
        assert restored != cloth()
        checks.append("moving, deletion, undo and restored animation without shared fabric")
        page.wait_for_function("() => document.querySelector('#save-state').textContent.includes('Salvo')")
        page.reload(wait_until="networkidle")
        ready()
        assert len(state()["houses"]) == 4
        assert page.evaluate("__flags.flagAnimation.count") == 2
        before = cloth()
        page.wait_for_timeout(180)
        assert before != cloth()
        page.select_option("#village-hour", "23")
        page.wait_for_timeout(120)
        assert all(isinstance(n, (int, float)) for n in cloth())
        checks.append("save reload resumes both flagpoles; night lighting renders without errors")

        page.select_option("#village-hour", "12")
        page.evaluate("""()=>{
          const t=__flags;
          Object.keys(t.buildingTemplates).filter(type=>type.startsWith('flag')).forEach((type,i)=>
            t.addHouse({type,x:(i%5-2)*5,z:-10-Math.floor(i/5)*7,rotation:0}));
          t.controls.enableDamping=false;t.controls.target.set(0,0,-20);
          t.camera.position.set(26,20,15);t.controls.update();t.invalidate();
        }""")
        page.wait_for_timeout(350)
        page.screenshot(path=str(OUT / "03-gallery.png"))
        page.wait_for_timeout(160)
        page.screenshot(path=str(OUT / "04-wind-next-frame.png"))
        assert page.evaluate("__flags.flagAnimation.count") == 22
        page.set_viewport_size({"width": 390, "height": 844})
        page.click("#shop-button")
        page.click('[data-category="decoration"]')
        page.click('[data-decoration-family="flags"]')
        assert page.locator(".decoration-choice:visible").count() == 20
        page.locator('[data-house="flagSwitzerland"]').scroll_into_view_if_needed()
        page.screenshot(path=str(OUT / "05-mobile.png"))
        checks.append("all 20 hoisted flags render together and are accessible in the mobile shop")
        assert not errors, errors
        (OUT / "report.json").write_text(json.dumps({"checks": checks, "errors": errors}, indent=2), encoding="utf-8")
        print(json.dumps({"checks": checks, "errors": errors}, indent=2))
    finally:
        browser.close()
