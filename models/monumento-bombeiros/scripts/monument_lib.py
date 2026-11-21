import bpy, math, random
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi

ROOT=Path(__file__).resolve().parents[1]
random.seed(1217)
SCENE=None
COL=None
MAT={}

def collection(name):
    global COL
    c=bpy.data.collections.new(name)
    SCENE.collection.children.link(c)
    COL=c
    return c

def link(obj):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    COL.objects.link(obj)
    return obj

def material(name,color,metallic=0,rough=.45,noise=0,emission=0,transmission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*color,1)
    ns=m.node_tree.nodes;ls=m.node_tree.links
    p=next(n for n in ns if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metallic
    p.inputs['Roughness'].default_value=rough
    p.inputs['Coat Weight'].default_value=.25 if metallic else .08
    if transmission:
        p.inputs['Transmission Weight'].default_value=transmission
        p.inputs['IOR'].default_value=1.333
    if emission:
        p.inputs['Emission Color'].default_value=(*color,1)
        p.inputs['Emission Strength'].default_value=emission
    if noise:
        n=ns.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=noise
        n.inputs['Detail'].default_value=3.2;n.inputs['Roughness'].default_value=.72
        ramp=ns.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position=.15
        ramp.color_ramp.elements[0].color=(*(v*.45 for v in color),1)
        ramp.color_ramp.elements[1].position=.85
        ramp.color_ramp.elements[1].color=(*(min(v*1.32+.015,1) for v in color),1)
        ls.new(n.outputs['Fac'],ramp.inputs[0]);ls.new(ramp.outputs['Color'],p.inputs['Base Color'])
        b=ns.new('ShaderNodeBump');b.inputs['Strength'].default_value=.23
        b.inputs['Distance'].default_value=.017 if not metallic else .009
        ls.new(n.outputs['Fac'],b.inputs['Height']);ls.new(b.outputs['Normal'],p.inputs['Normal'])
    MAT[name]=m
    return m

def assign(o,mat):
    o.data.materials.append(MAT[mat] if isinstance(mat,str) else mat)
    return o

def bevel(o,width=.04,segments=3):
    b=o.modifiers.new('Arestas de acabamento','BEVEL');b.width=width;b.segments=segments
    return o

def smooth(o):
    for p in o.data.polygons:p.use_smooth=True
    return o

def mesh(name,verts,faces,mat,soft=False,edge=0):
    d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update()
    o=bpy.data.objects.new(name,d);COL.objects.link(o)
    if mat:assign(o,mat)
    if soft:smooth(o)
    if edge:bevel(o,edge)
    return o

def box(name,loc,size,mat,edge=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=link(bpy.context.object);o.name=name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    assign(o,mat)
    if edge:bevel(o,edge)
    return o

def uv(name,loc,size,mat,seg=24,rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,radius=1,location=loc)
    o=link(bpy.context.object);o.name=name;o.scale=size;assign(o,mat);smooth(o)
    return o

def ico(name,loc,size,mat,level=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=level,radius=1,location=loc)
    o=link(bpy.context.object);o.name=name;o.scale=size;assign(o,mat);smooth(o)
    return o

def cylinder(name,a,b,r,mat,r2=None,vertices=24):
    a,b=Vector(a),Vector(b);delta=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=delta.length,location=(a+b)/2)
    o=link(bpy.context.object);o.name=name;o.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    assign(o,mat);smooth(o)
    return o

def curve(name,points,r,mat,closed=False,resolution=12):
    d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.resolution_u=resolution
    d.bevel_depth=r;d.bevel_resolution=3
    s=d.splines.new('POLY');s.points.add(len(points)-1)
    for p,co in zip(s.points,points):p.co=(*co,1)
    s.use_cyclic_u=closed
    o=bpy.data.objects.new(name,d);COL.objects.link(o);assign(o,mat)
    return o

def bezier(name,points,r,mat):
    d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.resolution_u=24;d.bevel_depth=r;d.bevel_resolution=4
    s=d.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for p,co in zip(s.bezier_points,points):
        p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,d);COL.objects.link(o);assign(o,mat)
    return o

def rounded_rect(name,width,depth,z,h,r,mat,center=(0,0),edge=.025):
    ring=[]
    for cx,cy,start in [(width/2-r,depth/2-r,0),(-width/2+r,depth/2-r,pi/2),(-width/2+r,-depth/2+r,pi),(width/2-r,-depth/2+r,3*pi/2)]:
        for j in range(9):
            t=start+j*pi/16;ring.append((center[0]+cx+r*cos(t),center[1]+cy+r*sin(t)))
    n=len(ring);vs=[(x,y,zz) for zz in [z,z+h] for x,y in ring]
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,vs,fs,mat,edge=edge)

def frustum(name,center,z,h,bottom,top,mat):
    x,y=center
    vs=[]
    for zz,(w,d) in [(z,bottom),(z+h,top)]:
        vs += [(x-w/2,y-d/2,zz),(x+w/2,y-d/2,zz),(x+w/2,y+d/2,zz),(x-w/2,y+d/2,zz)]
    return mesh(name,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],mat,edge=.045)

def profile(name,points,y,depth,mat,edge=.02):
    n=len(points);vs=[(x,yy,z) for yy in [y,y+depth] for x,z in points]
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,vs,fs,mat,edge=edge)

def text(name,body,loc,size,mat,rotation=(pi/2,0,0),extrude=.009):
    d=bpy.data.curves.new(name,'FONT');d.body=body;d.size=size;d.align_x='CENTER';d.align_y='CENTER';d.extrude=extrude;d.bevel_depth=.002;d.bevel_resolution=2
    if FONT:d.font=FONT
    o=bpy.data.objects.new(name,d);COL.objects.link(o);o.location=loc;o.rotation_euler=rotation;assign(o,mat)
    return o

def torus(name,center,major,minor,mat,rot=(pi/2,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=10,location=center,major_radius=major,minor_radius=minor,rotation=rot)
    o=link(bpy.context.object);o.name=name;assign(o,mat);smooth(o)
    return o

def init():
    global SCENE,FONT
    SCENE=bpy.data.scenes.new('MONUMENTO • CORPO DE BOMBEIROS')
    bpy.context.window.scene=SCENE
    SCENE.unit_settings.system='METRIC';SCENE.unit_settings.scale_length=1
    SCENE['Dimensoes de referencia']='14,00 x 7,00 x 8,50 m'
    SCENE['Origem']='Recriacao artistica da imagem fornecida; detalhes nao visiveis interpretados.'
    FONT=None
    fp=Path('C:/Windows/Fonts/arialbd.ttf')
    if fp.exists():FONT=bpy.data.fonts.load(str(fp))
    material('Granito cinza',(.20,.23,.25),rough=.43,noise=125)
    material('Granito escuro',(.065,.078,.087),rough=.4,noise=95)
    material('Concreto',(.32,.34,.33),rough=.78,noise=75)
    material('Aco escovado',(.54,.59,.64),metallic=.88,rough=.27,noise=160)
    material('Aco estrutural',(.095,.12,.135),metallic=.78,rough=.36)
    material('Vermelho automotivo',(.50,.008,.015),metallic=.46,rough=.23)
    material('Vermelho brasao',(.34,.004,.009),metallic=.3,rough=.30)
    material('Dourado',(.69,.38,.065),metallic=.83,rough=.25)
    material('Bronze',(.31,.17,.064),metallic=.82,rough=.38,noise=62)
    material('Bronze luz',(.47,.285,.10),metallic=.86,rough=.32,noise=85)
    material('Bronze escuro',(.10,.061,.027),metallic=.73,rough=.43,noise=48)
    material('Aco machados',(.69,.72,.70),metallic=.88,rough=.21)
    material('LED ambar',(1,.51,.12),rough=.24,emission=5)
    material('Agua',(.022,.17,.22),metallic=.17,rough=.12,transmission=.6)
    material('Jatos de agua',(.37,.77,.90),metallic=.18,rough=.14,transmission=.38)
    material('Terra',(.037,.025,.014),rough=.94,noise=46)
    material('Folha verde',(.075,.19,.025),rough=.62)
    material('Folha clara',(.19,.32,.039),rough=.64)
    material('Flor vermelha',(.65,.015,.018),rough=.45)
    material('Flor amarela',(.93,.48,.025),rough=.50)
    material('Centro flor',(.23,.07,.01),rough=.65)
    material('Piso pracinha',(.27,.29,.28),rough=.77,noise=48)
    print('Cena e materiais criados')

FONT=None
