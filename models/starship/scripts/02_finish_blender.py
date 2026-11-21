"""Finish the SolidCraft model in Blender; reusable materials and animation pivots."""
import bpy, math, random, json
from mathutils import Vector, Matrix
from pathlib import Path

ROOT=Path(r'C:\Users\Maciel Ribeiro\Desktop\villager 3d\my-villager-3d\models\starship')
S=bpy.context.scene
S.name='STARSHIP | Porto Aurora'
S.unit_settings.system='METRIC'
S.unit_settings.scale_length=1
parts=json.loads((ROOT/'cad'/'parts.json').read_text(encoding='utf-8'))
source=[o for o in S.objects if o.type=='MESH']
for o in source:
    world=o.matrix_world.copy()
    o.parent=None
    o.data=o.data.copy()
    o.data.transform(world)
    o.matrix_world=Matrix.Identity(4)
    # CAD tessellation is reduced here while broad faces and hard edges remain.
    if len(o.data.polygons)>1200:
        mod=o.modifiers.new('Game tessellation','DECIMATE');mod.ratio=.23
        bpy.context.view_layer.objects.active=o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in o.data.polygons:
        p.use_smooth=not (o.name.startswith('STATIC_Tower') or 'Flap' in o.name or 'Control' in o.name)
for o in list(S.objects):
    if o.type=='EMPTY':bpy.data.objects.remove(o,do_unlink=True)

def texture(name,mode):
    im=bpy.data.images.get(name) or bpy.data.images.new(name,512,512)
    rng=random.Random(419)
    data=[]
    for y in range(512):
        for x in range(512):
            if mode=='steel':
                seam=(y%64 in [0,1,63]);v=.57+.055*math.sin(x*.39)+rng.random()*.035-(.18 if seam else 0)
                rgb=[v*.92,v*.98,v*1.04]
            elif mode=='tiles':
                yy=y%28;xx=(x+(14 if (y//28)%2 else 0))%32
                edge=xx<2 or yy<2
                v=.027 if edge else .11+((x//32*19+y//28*7)%11)*.003+rng.random()*.007
                rgb=[v*.8,v*.94,v]
            else:
                v=.55+rng.random()*.12-.02*math.sin(x/13)*math.sin(y/9)
                rgb=[v,v*.99,v*.94]
            data.extend([*rgb,1])
    im.pixels.foreach_set(data);im.update();im.pack()
    im.filepath_raw=str(ROOT/'renders'/f'{name}.png');im.file_format='PNG';im.save()
    return im

steel=texture('Starship_BrushedSteel','steel')
tiles=texture('Starship_HeatTiles','tiles')
concrete=texture('Starship_Concrete','concrete')
mats={}
for name,(hexcol,metal,rough) in parts['colors'].items():
    col=tuple(int(hexcol[i:i+2],16)/255 for i in (1,3,5))
    m=bpy.data.materials.new('Starship | '+name);m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*col,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if name in ['Steel','Concrete','Black']:
        n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image={'Steel':steel,'Concrete':concrete,'Black':tiles}[name]
        m.node_tree.links.new(n.outputs['Color'],p.inputs['Base Color'])
        noise=m.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=170
        bump=m.node_tree.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.15;bump.inputs['Distance'].default_value=.025
        m.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);m.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])
    mats[name]=m
for material,names in parts['finishes'].items():
    for name in names:
        o=S.objects.get(name)
        if o:o.data.materials.clear();o.data.materials.append(mats[material])

def uv_project(o,cylinder=False):
    uv=o.data.uv_layers.new(name='StarshipUV') if not o.data.uv_layers else o.data.uv_layers.active
    for p in o.data.polygons:
        values=[]
        for li in p.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co
            values.append((li,(math.atan2(co.y,co.x+5)/math.tau+.5,co.z/14) if cylinder else (co.x/12,co.y/12)))
        if cylinder and values and max(v[1][0] for v in values)-min(v[1][0] for v in values)>.5:
            values=[(li,(u+1 if u<.5 else u,v)) for li,(u,v) in values]
        for li,xy in values:uv.data[li].uv=xy
for o in source:
    uv_project(o,o.name.startswith(('SHIP_','BOOSTER_')))
    if o.name.startswith(('SHIP_Hull','SHIP_Nose')):
        o.data.materials.append(mats['Black'])
        for p in o.data.polygons:
            # Windward half, with a clean metallic seam at the sides.
            p.material_index=1 if p.center.y<-.1 and abs(p.normal.z)<.95 else 0

def root(name,at):
    o=bpy.data.objects.new(name,None);S.collection.objects.link(o);o.location=at;return o
roots={'BOOSTER':root('BOOSTER',(-5,0,8.5)),'SHIP':root('SHIP',(-5,0,73.5)),
       'ARM_L':root('ARM_L',(-18,-4,48)),'ARM_R':root('ARM_R',(-18,4,48)),
       'QD':root('QD',(-18,0,75.5)), 'STATIC':root('STATIC',(0,0,0))}
bpy.context.view_layer.update()
def parent(o,r):
    bpy.context.view_layer.update()
    w=o.matrix_world.copy();o.parent=r;o.matrix_parent_inverse=r.matrix_world.inverted();o.matrix_world=w
for o in source:
    key=next((k for k in ['BOOSTER','SHIP','ARM_L','ARM_R','QD'] if o.name.startswith(k+'_')),'STATIC')
    parent(o,roots[key])

def material(name,color,metal=0,rough=.5,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    return m
amber=material('Starship | LightAmber',(1,.47,.08),.1,.3,3)
cyan=material('Starship | LightCyan',(.08,.65,1),.1,.3,2)
ivory=material('Starship | Marking',(.86,.9,.89),.1,.55)

def cube(name,at,size,mat,r=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=at);o=bpy.context.object;o.name=name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat);parent(o,r or roots['STATIC']);return o
def rod(name,a,b,radius,mat,r=None):
    a,b=Vector(a),Vector(b);d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=radius,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(mat)
    parent(o,r or roots['STATIC']);return o
def text(name,body,at,size,mat,rotation=(math.pi/2,0,0),r=None):
    cv=bpy.data.curves.new(name,'FONT');cv.body=body;cv.align_x='CENTER';cv.size=size;cv.extrude=.007
    o=bpy.data.objects.new(name,cv);S.collection.objects.link(o);o.location=at;o.rotation_euler=rotation;cv.materials.append(mat)
    parent(o,r or roots['STATIC']);return o

text('Porto Aurora sign','PORTO AURORA',(-23,-21.64,5.25),1.05,ivory)
text('Mission control sign','STARSHIP  /  CONTROLE DE MISSAO',(-23,-21.65,2.7),.40,cyan)
text('Landing target','H',(21,-6.5,1.29),7,ivory,rotation=(0,0,0))
text('Landing pad name','LZ - 01',(21,-14,1.29),1.15,ivory,rotation=(0,0,0))
text('Ship insignia','AURORA',(-5,-4.52,95),1.0,ivory,r=roots['SHIP'])
text('Booster insignia','SUPER HEAVY',(-5,-4.52,41),.62,ivory,r=roots['BOOSTER'])
text('Booster serial','B - 01',(-5,-4.53,22),.6,ivory,r=roots['BOOSTER'])
for i in range(24):
    a=math.tau*i/24
    cube('Landing edge light',(21+10.7*math.cos(a),-6.5+10.7*math.sin(a),1.4),(.36,.36,.17),cyan)
for x in [-33,33]:
    for y in [-23,-8,7,23]:
        rod('Floodlight pole',(x,y,1),(x,y,8),.12,mats['SteelDark'])
        cube('Floodlight fixture',(x,y,8),(1.2,.65,.28),amber)
for i in range(14):
    cube('Service road centerline',(-32+i*5,-25,1.04),(2.8,.16,.02),ivory)
for z in [15,38,61,84,107,132]:
    cube('Tower beacon',(-25.1,3.8,z),(.35,.24,.6),amber)
# Static service pipes and a safety rail around the water farm.
for x in [-31,-29.5]:rod('Water supply main',(x,19,2),(x,4,2),.2,mats['Blue'])
for x in [-31,-19]:
    for y in [17,26]:rod('Water farm railing',(x,y,5.2),(x,y,6.5),.055,ivory)
for y in [17,26]:rod('Water farm handrail',(-31,y,6.5),(-19,y,6.5),.055,ivory)
# Extra thermal tile borders and hinge details remain part of the moving ship.
for side in [-1,1]:
    for z in [83,115]:rod('SHIP_Hinge',(side*4.4-5,-.5,z-3),(side*4.4-5,-.5,z+3),.18,mats['SteelDark'],roots['SHIP'])

S['design_source']='SolidCraft parametric CAD, 336 named bodies'
S['mission']='Contagem, ignicao, ascensao, separacao, captura do booster, retorno e pouso da Starship'
bpy.context.view_layer.update()
print(json.dumps({'scene':S.name,'meshes':sum(o.type=='MESH' for o in S.objects),'polygons':sum(len(o.data.polygons) for o in S.objects if o.type=='MESH'),'roots':list(roots)}))
