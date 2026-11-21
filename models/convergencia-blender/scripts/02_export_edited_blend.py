"""Run in the edited .blend to export only the game geometry and original pivots."""
import bpy,io_scene_gltf2
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
scene=bpy.context.scene
scene.frame_set(1)
for obj in scene.objects:obj.select_set(False)
for obj in scene.objects:
    if not obj.get('gameMesh'):continue
    obj.select_set(True)
    parent=obj.parent
    while parent:
        parent.select_set(True);parent=parent.parent
fmt=next(item[0] for item in io_scene_gltf2.get_format_items(scene,bpy.context) if item[0]=='GLB')
out=ROOT.parents[1]/'src/assets/models/convergencia-refinada.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format=fmt,use_selection=True,use_active_scene=True,
    export_animations=False,export_morph=False,export_extras=True,export_cameras=False,export_lights=False)
print('Convergence exported:',out)
