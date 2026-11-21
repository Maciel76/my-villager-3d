import bpy,json,traceback,time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
STATUS=ROOT/'renders'/'render-status.json'
scene=bpy.context.scene
jobs=[
 ('Camera • perspectiva principal','Monumento_Perspectiva.png',2000,1500),
 ('Camera • conjunto escultorico','Esculturas_Detalhe.png',2000,1500),
 ('Camera • revisao anatomica','Lider_Rosto_Equipamentos.png',1500,1500),
 ('Camera • bombeira e crianca','Bombeira_Crianca_Detalhe.png',1600,1600),
]
progress={'state':'queued','complete':[],'total':len(jobs)}
def status():STATUS.write_text(json.dumps(progress,ensure_ascii=False,indent=2),encoding='utf-8')
def run():
    try:
        scene.eevee.taa_render_samples=64
        for name,filename,w,h in jobs:
            progress.update(state='rendering',current=filename);status()
            scene.camera=bpy.data.objects[name]
            scene.render.resolution_x=w;scene.render.resolution_y=h;scene.render.resolution_percentage=100
            scene.render.filepath=str(ROOT/'renders'/filename)
            bpy.ops.render.render(write_still=True)
            progress['complete'].append(filename);status()
        scene.camera=bpy.data.objects['Camera • perspectiva principal']
        scene.render.resolution_x=2000;scene.render.resolution_y=1500
        scene.render.filepath=str(ROOT/'renders'/'Monumento_Perspectiva.png')
        for area in bpy.context.screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA'
                area.spaces.active.overlay.show_overlays=False
        bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Monumento_Corpo_de_Bombeiros.blend'))
        progress.update(state='complete',current=None);status()
    except Exception:
        progress.update(state='error',error=traceback.format_exc());status()
    return None
status()
bpy.app.timers.register(run,first_interval=1.0)
print('Quatro renders finais agendados; progresso em',STATUS)
