"""Author the mission as a Blender animation, render it and export the game rig."""
import bpy, math, random, json
from mathutils import Vector
from pathlib import Path
ROOT=Path(r'C:\Users\Maciel Ribeiro\Desktop\villager 3d\my-villager-3d\models\starship')
S=bpy.context.scene
data=json.loads((ROOT/'mission-keyframes.json').read_text())
S.render.fps=data['fps'];S.frame_start=1;S.frame_end=1+round(data['duration']*data['fps'])
rig={key:S.objects[name] for key,name in [('booster','BOOSTER'),('ship','SHIP'),('armL','ARM_L'),('armR','ARM_R'),('quickDisconnect','QD')]}
def mat(name,color,metal=0,rough=.4,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    return m
metal=bpy.data.materials.get('Starship | SteelDark')
leg_roots=[]
def beam(name,a,b,radius,material,parent):
    a,b=Vector(a),Vector(b);d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=radius,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(material)
    o.parent=parent
    return o
for i in range(4):
    a=math.tau*i/4+math.pi/4
    leg=bpy.data.objects.new(f'LEG_{i}',None);S.collection.objects.link(leg);leg.parent=rig['ship']
    leg.location=(3.5*math.cos(a),3.5*math.sin(a),4)
    target=(2.8*math.cos(a),2.8*math.sin(a),-6.3)
    beam(f'SHIP_LandingLeg_{i}',(0,0,0),target,.19,metal,leg)
    beam(f'SHIP_LandingBrace_{i}',(-.7*math.cos(a),-.7*math.sin(a),-2.2),target,.12,metal,leg)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.78,depth=.2,location=target)
    foot=bpy.context.object;foot.name=f'SHIP_LandingFoot_{i}';foot.data.materials.append(metal);foot.parent=leg
    leg_roots.append(leg)
for sample in data['frames']:
    f=1+round(sample['seconds']*S.render.fps)
    for key,obj in rig.items():
        p=sample[key]['position'];r=sample[key]['rotation']
        obj.location=(p[0],-p[2],p[1]);obj.rotation_euler=(r[0],-r[2],r[1])
        obj.keyframe_insert('location',frame=f,group='Mission')
        obj.keyframe_insert('rotation_euler',frame=f,group='Mission')
    for leg in leg_roots:
        leg.scale=(max(.001,sample['deployment']),)*3
        leg.keyframe_insert('scale',frame=f,group='Mission')
for obj in [*rig.values(),*leg_roots]:
    if obj.animation_data and obj.animation_data.action:obj.animation_data.action.name='StarshipMission | '+obj.name
for at,label in [(0,'T-16'),(10,'Ignicao'),(16,'Decolagem'),(34,'Separacao'),(62,'Captura do propulsor'),(66,'Reentrada'),(90,'Pouso'),(98,'Touchdown'),(108,'Missao concluida')]:
    S.timeline_markers.new(label,frame=1+round(at*S.render.fps))
S.frame_set(1)

# Export only the authored CAD assembly, finished materials and rigid animation rig.
# Node animation remains editable in Blender and is played from the save timestamp in Three.js.
for obj in list(S.objects):
    if obj.type=='FONT':
        for selected in bpy.context.selected_objects:selected.select_set(False)
        obj.select_set(True)
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.convert(target='MESH')
for obj in S.objects:obj.select_set(obj.type in ['MESH','EMPTY'])
S.frame_set(1)
import io_scene_gltf2
fmt=next(i[0] for i in io_scene_gltf2.get_format_items(S,bpy.context) if i[0]=='GLB')
out=ROOT.parents[1]/'src'/'assets'/'models'/'starship.glb'
out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format=fmt,use_selection=True,use_active_scene=True,
    export_animations=True,export_animation_mode='SCENE',export_anim_scene_split_object=False,
    export_force_sampling=False,export_frame_step=6,export_frame_range=True,export_extras=True,
    export_cameras=False,export_lights=False)

# Render-only exhaust and smoke illustrate the same flight in the editable .blend.
fx=bpy.data.collections.new('Presentation | plume and smoke');S.collection.children.link(fx)
def move_fx(obj):
    for c in list(obj.users_collection):c.objects.unlink(obj)
    fx.objects.link(obj)
orange=mat('FX | orange plume',(1,.16,.015),emission=8)
blue=mat('FX | blue plume',(.16,.56,1),emission=12)
smoke=mat('FX | steam',(.57,.62,.67),rough=1)
plumes=[]
for key,root,length in [('booster',rig['booster'],38),('ship',rig['ship'],20)]:
    for i,m in enumerate([orange,blue]):
        bpy.ops.mesh.primitive_cone_add(vertices=40,radius1=5/(i+1),radius2=1.9/(i+1),depth=length/(1+i*.25))
        o=bpy.context.object;o.name='FX | '+key+' exhaust';o.data.materials.append(m);o.parent=root;o.location=(0,0,-length/(2*(1+i*.25))-1.8)
        move_fx(o);plumes.append((key,o))
rng=random.Random(713)
clouds=[]
for i in range(32):
    a=rng.random()*math.tau;r=6+rng.random()*18
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(-5+r*math.cos(a),r*math.sin(a),1.4+rng.random()*5))
    o=bpy.context.object;o.name='FX | water deluge steam';o.data.materials.append(smoke);move_fx(o)
    clouds.append((o,Vector((3+rng.random()*5,3+rng.random()*5,2+rng.random()*4))))
for sample in data['frames']:
    f=1+round(sample['seconds']*S.render.fps)
    for key,o in plumes:
        thrust=sample[key+'Thrust'];o.scale=(max(.001,thrust),)*3;o.keyframe_insert('scale',frame=f)
    for o,size in clouds:
        o.scale=size*max(.001,sample['smoke']);o.keyframe_insert('scale',frame=f)

def light(name,kind,at,power,color,size=20):
    d=bpy.data.lights.new(name,kind);d.energy=power;d.color=color
    if kind=='AREA':d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);S.collection.objects.link(o);o.location=at
    o.rotation_euler=(Vector((-5,0,58))-o.location).to_track_quat('-Z','Y').to_euler();return o
light('Studio | key','AREA',(45,-70,125),340000,(.79,.9,1),65)
light('Studio | rim','AREA',(-65,25,140),450000,(1,.62,.28),60)
sun=light('Studio | sun','SUN',(100,-80,160),2.4,(1,.84,.67))
world=bpy.data.worlds.new('Starship dusk');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.13,.20,.32,1);bg.inputs['Strength'].default_value=.5;S.world=world
ground=mat('Studio | ground',(.045,.066,.083),rough=.95)
bpy.ops.mesh.primitive_plane_add(size=2500,location=(0,0,-.06));bpy.context.object.name='Studio | ground';bpy.context.object.data.materials.append(ground)
camera_data=bpy.data.cameras.new('Starship presentation');camera=bpy.data.objects.new('Camera | Starship',camera_data);S.collection.objects.link(camera);S.camera=camera
camera_data.lens=46;camera_data.clip_end=5000
try:S.render.engine='CYCLES'
except TypeError:pass
if S.render.engine=='CYCLES':S.cycles.samples=24;S.cycles.use_denoising=True
S.render.resolution_x=1400;S.render.resolution_y=1500;S.render.resolution_percentage=100
S.render.image_settings.file_format='PNG'
def render(name,seconds,at,target):
    S.frame_set(1+round(seconds*S.render.fps));camera.location=at;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    S.render.filepath=str(ROOT/'renders'/name);bpy.ops.render.render(write_still=True)
render('Starship_Base.png',0,(155,-205,145),(-2,0,62))
render('Starship_Decolagem.png',20,(145,-205,165),(0,0,78))
render('Starship_Retorno.png',94,(125,-170,115),(1,0,54))
S.frame_set(1);camera.location=(155,-205,145);camera.rotation_euler=(Vector((-2,0,62))-camera.location).to_track_quat('-Z','Y').to_euler()
bpy.data.libraries.write(str(ROOT/'Starship_Porto_Aurora.blend'),{S},fake_user=True)
(ROOT/'blender-export.json').write_text(json.dumps({'glb':str(out),'bytes':out.stat().st_size,'duration':data['duration'],'scene':S.name,'meshCount':sum(o.type=='MESH' for o in S.objects)},indent=2))
print(json.dumps({'saved':str(ROOT/'Starship_Porto_Aurora.blend'),'glbBytes':out.stat().st_size}))
