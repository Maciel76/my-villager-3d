"""Export the visible final monument to a browser asset without changing the authored scene."""
import bpy,json,time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT.parents[1]/'src'/'assets'/'models'/'monumento-bombeiros.glb'
original=bpy.context.window.scene
selection=[o for o in bpy.context.selected_objects]
active=bpy.context.view_layer.objects.active
sources=[]
for o in original.objects:
    if o.type not in {'MESH','CURVE','FONT'} or not o.visible_get():continue
    if any(c.name.startswith(('11 •','12 •','Arquivo')) for c in o.users_collection):continue
    if any(c.name.startswith('01 •') for c in o.users_collection) and not o.name.startswith('Fundacao em concreto'):continue
    sources.append(o)

scene=bpy.data.scenes.new('EXPORT • Monumento para loja')
clones=[];baked=[];temporary_data=[];finishes={}
def material(source):
    if source in finishes:return finishes[source]
    mat=bpy.data.materials.new(source.name+' | Web');mat.use_nodes=True
    p=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    old=next((n for n in source.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if source.use_nodes else None
    if old:
        for name in ['Base Color','Metallic','Roughness','Emission Color','Emission Strength','Coat Weight']:
            p.inputs[name].default_value=old.inputs[name].default_value
        ramps=[n for n in source.node_tree.nodes if n.type=='VALTORGB']
        if ramps:
            a,b=ramps[0].color_ramp.elements[0].color,ramps[0].color_ramp.elements[-1].color
            p.inputs['Base Color'].default_value=tuple((a[i]+b[i])/2 for i in range(4))
    else:p.inputs['Base Color'].default_value=source.diffuse_color
    # Real-time water avoids a costly transmission pass and keeps the authored blue finish.
    if source.name in ['Agua','Jatos de agua']:
        p.inputs['Roughness'].default_value=.23
        p.inputs['Metallic'].default_value=.18
    finishes[source]=mat
    return mat

try:
    bpy.context.window.scene=scene
    for src in sources:
        obj=src.copy();obj.parent=None;obj.matrix_world=src.matrix_world.copy()
        if src.type in {'CURVE','FONT'}:
            obj.data=src.data.copy();temporary_data.append(obj.data)
            obj.data.bevel_resolution=min(obj.data.bevel_resolution,2)
            obj.data.resolution_u=min(obj.data.resolution_u,8)
        for mod in obj.modifiers:
            if mod.type=='SUBSURF':mod.levels=min(mod.levels,1);mod.render_levels=min(mod.render_levels,1)
            elif mod.type=='BEVEL':mod.segments=min(mod.segments,2)
        if obj.type=='MESH' and 'casaco esculpido continuo' in src.name:
            dec=obj.modifiers.new('LOD web do tecido','DECIMATE');dec.ratio=.34
        scene.collection.objects.link(obj);clones.append((obj,src))
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    converted=[]
    for obj,src in clones:
        data=bpy.data.meshes.new_from_object(obj.evaluated_get(deps),depsgraph=deps)
        if not data or not data.polygons:
            if data:bpy.data.meshes.remove(data)
            continue
        data.transform(obj.matrix_world)
        old_materials=list(data.materials);data.materials.clear()
        for m in old_materials:
            if m:data.materials.append(material(m))
        converted.append((data,src))
    for obj,src in clones:bpy.data.objects.remove(obj,do_unlink=True)
    clones=[]
    for data,src in converted:
        obj=bpy.data.objects.new(src.name,data);scene.collection.objects.link(obj);baked.append(obj)
        obj['monumentPart']=src.name
        obj['monumentSection']=next((c.name for c in src.users_collection),'')
        obj['monumentGroundCover']=src.name.startswith(('Fundacao em concreto','Rodape de granito','Pavimento superior'))
        obj.select_set(True)
    bpy.context.view_layer.objects.active=baked[0]
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    import io_scene_gltf2
    fmt=next(i[0] for i in io_scene_gltf2.get_format_items(scene,bpy.context) if i[0]=='GLB')
    result=bpy.ops.export_scene.gltf(filepath=str(OUTPUT),export_format=fmt,use_selection=True,
        export_extras=True,export_animations=False,export_cameras=False,export_lights=False,
        export_yup=True,export_apply=False)
    faces=sum(len(o.data.polygons) for o in baked)
    report={'file':str(OUTPUT),'parts':len(baked),'polygons':faces,'materials':len(finishes),'bytes':OUTPUT.stat().st_size,'result':list(result)}
    (ROOT/'web-export.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print('WEB_EXPORT '+json.dumps(report,ensure_ascii=False))
finally:
    bpy.context.window.scene=original
    for obj in baked:
        data=obj.data;bpy.data.objects.remove(obj,do_unlink=True)
        if data.users==0:bpy.data.meshes.remove(data)
    for obj,src in clones:bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.scenes.remove(scene)
    for data in temporary_data:
        if data.users==0:bpy.data.curves.remove(data)
    for mat in finishes.values():
        if mat.users==0:bpy.data.materials.remove(mat)
    for obj in selection:
        if obj.name in original.objects:obj.select_set(True)
    if active and active.name in original.objects:bpy.context.view_layer.objects.active=active
