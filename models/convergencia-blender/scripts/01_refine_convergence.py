"""Import the real Three.js monument, refine it in Blender and export an editable rig."""
import bpy, math, json, gzip, os, numpy as np
from mathutils import Vector, Quaternion, Matrix
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PROJECT=ROOT.parents[1]
with gzip.open(ROOT/'game-original.json.gz','rt',encoding='utf-8') as stream:DATA=json.load(stream)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
S=bpy.context.scene;S.name='CONVERGENCIA | Confinamento Estelar'
S.unit_settings.system='METRIC';S.unit_settings.scale_length=1
C=Matrix.Rotation(math.pi/2,4,'X');CQ=C.to_quaternion()
def xyz(p):return Vector((p[0],-p[2],p[1]))
def assign_props(obj,props):obj['gameUserData']=json.dumps(props,ensure_ascii=False)
def texture_set(kind,base,size=512):
    rng=np.random.default_rng(311+len(kind));y,x=np.mgrid[0:size,0:size].astype(float)
    grain=rng.random((size,size));seam=np.zeros_like(x)
    if kind=='ceramic':
        xx=(x+(y//64%2)*32)%64;yy=y%64
        seam=((xx<2)|(yy<2)).astype(float)
        relief=.60+.025*grain-.13*seam
    elif kind=='metal':
        seam=((x%128<2)|(y%128<2)).astype(float)
        relief=.62+.06*np.sin(y*2.13)+.018*grain-.15*seam
    elif kind=='copper':
        relief=.62+.065*np.sin(x*1.73)+.03*grain
    elif kind=='hazard':
        stripe=((x+y)//42)%2
        relief=.6+.025*grain
    else:
        relief=.62+.10*grain+.035*np.sin(x*.19)*np.sin(y*.21)
    rgb=np.repeat(relief[:,:,None],3,axis=2)*np.array(base)[None,None,:]
    if kind=='hazard':rgb=np.where(stripe[:,:,None]>0,rgb*np.array([1,.67,.1]),rgb*.10)
    def image(name,pixels,noncolor=False):
        im=bpy.data.images.new(name,size,size);im.colorspace_settings.name='Non-Color' if noncolor else 'sRGB'
        rgba=np.concatenate((np.clip(pixels,0,1),np.ones((size,size,1))),axis=2).astype(np.float32)
        im.pixels.foreach_set(rgba.ravel());im.update()
        im.filepath_raw=str(ROOT/'textures'/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im
    color=image('CONV_'+kind+'_'+''.join(str(int(v*100)) for v in base),rgb)
    dx,dy=np.gradient(relief)
    normal=np.stack((-dy*.32,-dx*.32,np.ones_like(relief)),axis=2)
    normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    normal=image('CONV_Normal_'+kind,normal*.5+.5,True)
    return color,normal
tex={
 'ceramic':texture_set('ceramic',(1,1,.96)),
 'metal':texture_set('metal',(.54,.67,.78)),
 'copper':texture_set('copper',(.88,.49,.19)),
 'basalt':texture_set('basalt',(.27,.32,.39)),
 'hazard':texture_set('hazard',(1,1,1),256),
}
def material(name,color,metal=0,rough=.5,kind=None,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if kind:
        t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=tex[kind][0]
        m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
        n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=tex[kind][1]
        normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.35
        m.node_tree.links.new(n.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],p.inputs['Normal'])
    if emission:
        p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    m.diffuse_color=(*color,1);return m
m={
 'titanium':material('CONV | Titanium',(.35,.47,.6),.82,.32,'metal'),
 'graphite':material('CONV | Graphite',(.055,.087,.13),.62,.46),
 'ceramic':material('CONV | Thermal ceramic',(.77,.81,.76),.16,.5,'ceramic'),
 'copper':material('CONV | Magnetic copper',(.65,.31,.07),.85,.3,'copper'),
 'basalt':material('CONV | Volcanic basalt',(.15,.18,.22),.10,.88,'basalt'),
 'hazard':material('CONV | Service hazard',(.8,.55,.1),.2,.65,'hazard'),
 'cyan':material('CONV | Power cyan',(.04,.6,1),.25,.28,emission=2.5),
 'amber':material('CONV | Power amber',(1,.38,.045),.3,.32,emission=2.3),
 'label':material('CONV | Labels',(.75,.86,.88),.15,.5),
}
original=[]
for spec in DATA['materials']:
    name=spec['name']
    if spec['basic']:
        target=m['amber'] if not spec['toneMapped'] else m['copper']
    elif name in ['Ceramic','CeramicWarm']:target=m['ceramic']
    elif name in ['Basalt','Paving','Ash']:target=m['basalt']
    elif name=='Graphite':target=m['graphite']
    elif name in ['Copper','Gold']:target=m['copper']
    else:
        target=material('Original | '+name,spec['color'],spec['metalness'],spec['roughness'])
        p=next(n for n in target.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        p.inputs['Emission Color'].default_value=(*spec['emissive'],1)
        p.inputs['Emission Strength'].default_value=spec['emissiveIntensity']
        if spec['transparent']:
            p.inputs['Alpha'].default_value=spec['opacity'];target.surface_render_method='DITHERED'
    if spec['userData']:target['gameUserData']=json.dumps(spec['userData'])
    original.append(target)

def imported(spec,parent=None):
    geometry=spec.get('mesh')
    if geometry:
        vertices=np.array(geometry['positions']).reshape(-1,3);vertices=vertices[:,[0,2,1]];vertices[:,1]*=-1
        index=geometry['indices'] or list(range(len(vertices)))
        mesh=bpy.data.meshes.new(spec['name']);mesh.from_pydata(vertices.tolist(),[],np.array(index).reshape(-1,3).tolist());mesh.update()
        obj=bpy.data.objects.new(spec['name'],mesh);mesh.materials.append(original[geometry['material']])
        if geometry['uv']:
            uv=mesh.uv_layers.new(name='OriginalUV');coords=np.array(geometry['uv']).reshape(-1,2)
            for loop in mesh.loops:uv.data[loop.index].uv=coords[loop.vertex_index]
        if geometry['normals']:
            normals=np.array(geometry['normals']).reshape(-1,3);normals=normals[:,[0,2,1]];normals[:,1]*=-1
            for p in mesh.polygons:p.use_smooth=True
            mesh.normals_split_custom_set_from_vertices(normals.tolist())
    else:obj=bpy.data.objects.new(spec['name'],None)
    S.collection.objects.link(obj);obj.parent=parent
    obj.location=xyz(spec['position']);obj.rotation_mode='QUATERNION'
    obj.rotation_quaternion=CQ@Quaternion((spec['quaternion'][3],*spec['quaternion'][:3]))@CQ.inverted()
    obj.scale=(spec['scale'][0],spec['scale'][2],spec['scale'][1]);assign_props(obj,spec['userData'])
    for child in spec['children']:imported(child,obj)
    return obj
base=imported(DATA['static'])
orbits=[imported(o) for o in DATA['orbits']];crown=imported(DATA['crown'])
bpy.context.view_layer.update()

def parent_keep(obj,parent):
    bpy.context.view_layer.update();world=obj.matrix_world.copy();obj.parent=parent
    obj.matrix_parent_inverse=parent.matrix_world.inverted();obj.matrix_world=world
def tag(obj,role):obj['containmentRole']=role
def box(name,at,size,mat,parent=base,yaw=0,role='armor'):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(at));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);o.rotation_euler.z=-yaw
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat);parent_keep(o,parent);tag(o,role);return o
def rod(name,a,b,radius,mat,parent=base,role='cooling'):
    a,b=xyz(a),xyz(b);d=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=radius,depth=d.length,location=(a+b)/2)
    o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(mat)
    parent_keep(o,parent);tag(o,role);return o
def torus(name,radius,tube,y,mat,parent=base,segments=96,role='magnet'):
    bpy.ops.mesh.primitive_torus_add(major_segments=segments,minor_segments=8,location=(0,0,y),major_radius=radius,minor_radius=tube)
    o=bpy.context.object;o.name=name;o.data.materials.append(mat);parent_keep(o,parent);tag(o,role);return o
def cylinder(name,at,r,h,mat,parent=base,role='reactor'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=h,location=xyz(at));o=bpy.context.object;o.name=name;o.data.materials.append(mat)
    parent_keep(o,parent);tag(o,role);return o
def armor(name,center,u,v,w,size,mat,parent):
    center,u,v,w=Vector(center),Vector(u),Vector(v),Vector(w)
    verts=[xyz(center+u*x*size[0]/2+v*y*size[1]/2+w*z*size[2]/2) for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]);mesh.materials.append(mat);mesh.update()
    o=bpy.data.objects.new(name,mesh);S.collection.objects.link(o);parent_keep(o,parent);tag(o,'armor');return o
def line(name,points,radius,mat,parent=base):
    for i in range(len(points)-1):rod(name+f' {i:02}',points[i],points[i+1],radius,mat,parent)
def radial(radius,angle,y):return (radius*math.cos(angle),y,radius*math.sin(angle))
def energy_pod(index,at):
    o=bpy.data.objects.new(f'ENERGY_POD_{index}',None);S.collection.objects.link(o);o.location=xyz(at)
    parent_keep(o,base);assign_props(o,{'energyPod':{'index':index}});return o
def text(name,body,at,size,mat,parent=base,yaw=0):
    cv=bpy.data.curves.new(name,'FONT');cv.body=body;cv.align_x='CENTER';cv.size=size;cv.extrude=.004
    o=bpy.data.objects.new(name,cv);S.collection.objects.link(o);o.location=xyz(at);o.rotation_euler=(math.pi/2,0,-yaw);cv.materials.append(mat);parent_keep(o,parent);tag(o,'label');return o

# Six armored, articulated supports keep the game's original hinges.
for i,rib in enumerate(DATA['ribs'][:6]):
    parent=S.objects[f'HINGE_{i}'];points=[Vector(p) for p in rib['points']];a=rib['angle']
    u=Vector((math.sin(a),0,-math.cos(a)));rails=[[],[]]
    for k,p in enumerate(points):
        t=k/(len(points)-1);tangent=(points[min(k+1,len(points)-1)]-points[max(0,k-1)]).normalized();normal=u.cross(tangent).normalized()
        width=rib['width']*(.26+.74*(1-t)**.73);depth=rib['thickness']*(.31+.69*(1-t)**1.08)
        for j,side in enumerate([-1,1]):rails[j].append(p+u*(width*.84*side)+normal*(depth*.95))
        if k in range(2,34,3):
            armor(f'Containment clamp {i}-{k}',p+normal*depth*.84,u,tangent,normal,(width*2.25,.40,.30),m['titanium'],parent)
            for side in [-1,1]:
                q=p+u*(width*.74*side)+normal*(depth*1.12)
                armor(f'Ceramic shield {i}-{k}-{side}',q,u,tangent,normal,(width*.53,.72,.14),m['ceramic'],parent)
    for j,rail in enumerate(rails):line(f'Cryogenic line {i}-{j}',rail,.075,m['copper'] if j else m['cyan'],parent)
    foot=points[0];cylinder(f'Bearing foundation {i}',(foot.x,1.55,foot.z),2.15,1.1,m['graphite'],parent,role='anchor')
    for j in range(8):
        angle=j*math.tau/8
        cylinder(f'Anchor bolt {i}-{j}',(foot.x+1.66*math.cos(angle),2.16,foot.z+1.66*math.sin(angle)),.13,.18,m['titanium'],parent,role='anchor')
    p=points[7];anchor=foot+Vector((-math.cos(a)*2.5,1,-math.sin(a)*2.5))
    rod(f'Hydraulic actuator {i}',anchor,p,.29,m['graphite'],parent,role='actuator')
    rod(f'Hydraulic piston {i}',anchor.lerp(p,.52),p,.17,m['titanium'],parent,role='actuator')

# Power distribution below the chamber leaves the returning orbital rings clear.
for r,y in [(10.6,4.15),(10.6,4.58),(9.9,3.85)]:torus('Reactor coolant manifold',r,.17,y,m['copper'])
for i in range(18):
    a=i*math.tau/18;p=radial(11.15,a,4.45)
    box(f'Magnetic driver {i}',p,(1.05,1.65,.65),m['graphite'],yaw=math.pi/2-a,role='reactor')
    for j in range(4):
        q=radial(11.52,a,3.88+j*.33)
        box(f'Driver cooling fin {i}-{j}',q,(.93,.12,.35),m['titanium'],yaw=math.pi/2-a,role='cooling')
    box(f'Driver power indicator {i}',radial(11.59,a,4.45),(.13,1.1,.05),m['cyan'],yaw=math.pi/2-a,role='power')
for i in range(3):
    a=math.pi/6+i*math.tau/3;p=radial(26.8,a,2.0)
    cylinder(f'Cooling reactor base {i}',p,2.5,1.1,m['graphite'])
    pod=energy_pod(i,p)
    cylinder(f'Cooling reactor body {i}',(p[0],3.72,p[2]),1.82,2.85,m['titanium'],pod)
    cylinder(f'Cooling reactor ceramic {i}',(p[0],5.28,p[2]),1.9,.38,m['ceramic'],pod)
    cylinder(f'Cooling reactor beacon {i}',(p[0],5.53,p[2]),1.60,.12,m['cyan'],pod,role='power')
    for j in range(8):
        b=j*math.tau/8;rod(f'Reactor radiator {i}-{j}',(p[0]+1.9*math.cos(b),2.3,p[2]+1.9*math.sin(b)),(p[0]+1.9*math.cos(b),4.9,p[2]+1.9*math.sin(b)),.11,m['copper'],pod)
    line(f'Radial cooling feed {i}',[radial(r,a,1.77) for r in [24.2,20,16,12.1]],.18,m['titanium'])
text('Containment facility sign','CONVERGENCIA',(0,2.76,12.72),1.0,m['label'])
text('Containment chamber label','CONFINAMENTO ESTELAR  /  CAMARA 01',(0,1.6,12.75),.28,m['cyan'])

# Segmented magnet housings, heat shields and service covers follow each orbit.
for i,(group,radius) in enumerate(zip(orbits,[10.32,8.05,6.06])):
    y=20.9
    for offset in [-.31,.31]:torus(f'Orbit {i} superconducting conductor',radius,.115,y+offset,m['copper'],group,role='magnet')
    torus(f'Orbit {i} plasma channel',radius+.28,.055,y,m['cyan'],group,role='power')
    count=[32,26,20][i]
    for j in range(count):
        a=j*math.tau/count
        box(f'Orbit {i} magnetic segment {j}',radial(radius,a,y),(.62,.72,.64),m['graphite'],group,math.pi/2-a,role='magnet')
        box(f'Orbit {i} ceramic cap {j}',radial(radius+.27,a,y+.10),(.50,.49,.13),m['ceramic'],group,math.pi/2-a)
        box(f'Orbit {i} copper terminal {j}',radial(radius+.37,a,y-.15),(.35,.13,.12),m['copper'],group,math.pi/2-a)
        if j%2==0:box(f'Orbit {i} diagnostic light {j}',radial(radius+.37,a,y+.17),(.29,.06,.08),m['cyan'],group,math.pi/2-a,role='power')
        for side in [-1,1]:cylinder(f'Orbit {i} cap fastener {j}-{side}',radial(radius+side*.20,a,y+.43),.055,.08,m['titanium'],group,role='fastener')
for r,y in [(12.55,40.08),(12.55,40.92)]:torus('Crown containment copper',r,.23,y,m['copper'],crown,role='magnet')
for r in [12.1,13.0]:torus('Crown ion channel',r,.07,40.5,m['cyan'],crown,role='power')
for j in range(36):
    a=j*math.tau/36
    box(f'Crown accelerator segment {j}',radial(12.55,a,40.5),(.92,.70,.68),m['graphite'],crown,math.pi/2-a,role='magnet')
    box(f'Crown ceramic protection {j}',radial(12.95,a,40.67),(.76,.39,.14),m['ceramic'],crown,math.pi/2-a)
    box(f'Crown interlock {j}',radial(12.55,a,41.03),(.30,.12,.78),m['titanium'],crown,math.pi/2-a,role='fastener')

S['source']='Exportado diretamente do modelo procedural do jogo e refinado no Blender'
S['design']='Contencao magnetica: ceramica termica, cobre supercondutor, blindagem de titanio e refrigeracao'

# Consistent physical UV size on both original and newly modeled parts.
for o in list(S.objects):
    if o.type=='FONT':
        bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
bpy.context.view_layer.update()
for o in S.objects:
    if o.type!='MESH':continue
    uv=o.data.uv_layers.active or o.data.uv_layers.new(name='PhysicalUV')
    for p in o.data.polygons:
        normal=o.matrix_world.to_3x3()@p.normal;axis=max(range(3),key=lambda k:abs(normal[k]))
        for li in p.loop_indices:
            co=o.matrix_world@o.data.vertices[o.data.loops[li].vertex_index].co
            uv.data[li].uv=((co.y,co.z) if axis==0 else (co.x,co.z) if axis==1 else (co.x,co.y))
            uv.data[li].uv/=4
    o['gameMesh']=True

S.frame_start=1;S.frame_end=250;S.render.fps=24
for o in S.objects:o.select_set(o.type in ['MESH','EMPTY'])
import io_scene_gltf2
fmt=next(i[0] for i in io_scene_gltf2.get_format_items(S,bpy.context) if i[0]=='GLB')
out=PROJECT/'src/assets/models/convergencia-refinada.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format=fmt,use_selection=True,use_active_scene=True,
    export_animations=False,export_extras=True,export_cameras=False,export_lights=False)

# A presentation-only miniature sun is replaced by the original animated shader in the game.
plasma=material('Presentation | Stellar plasma',(1,.38,.06),rough=.3,emission=3.8)
p=next(n for n in plasma.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
noise=plasma.node_tree.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=4.3;noise.inputs['Detail'].default_value=5
ramp=plasma.node_tree.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.4,.015,.001,1);ramp.color_ramp.elements[1].color=(1,.88,.38,1)
plasma.node_tree.links.new(noise.outputs['Fac'],ramp.inputs['Fac']);plasma.node_tree.links.new(ramp.outputs['Color'],p.inputs['Emission Color'])
bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=32,radius=4.08,location=(0,0,20.9));bpy.context.object.name='Presentation | Mini-sol';bpy.context.object.data.materials.append(plasma)
for face in bpy.context.object.data.polygons:face.use_smooth=True
for obj,angles in zip(orbits,[(.11,0,-.12),(.79,0,.28),(-.68,0,-.39)]):
    q=__import__('mathutils').Euler(angles,'XYZ').to_quaternion();obj.rotation_mode='QUATERNION';obj.rotation_quaternion=CQ@q@CQ.inverted()
def light(name,kind,at,power,color,size=20,target=(0,0,15)):
    data=bpy.data.lights.new(name,kind);data.energy=power;data.color=color
    if kind=='AREA':data.shape='DISK';data.size=size
    o=bpy.data.objects.new(name,data);S.collection.objects.link(o);o.location=at;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
light('Presentation | daylight','AREA',(35,-50,75),175000,(.81,.9,1),50)
light('Presentation | warm rim','AREA',(-40,20,60),190000,(1,.62,.29),45)
light('Presentation | sun light','POINT',(0,0,20.9),3800,(1,.43,.13))
world=bpy.data.worlds.new('Fusion observatory');world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.055,.1,.18,1);bg.inputs['Strength'].default_value=.45;S.world=world
ground=material('Presentation | ground',(.045,.065,.09),rough=.9)
bpy.ops.mesh.primitive_plane_add(size=1300,location=(0,0,-.06));bpy.context.object.name='Presentation | ground';bpy.context.object.data.materials.append(ground)
cam_data=bpy.data.cameras.new('Convergence presentation');camera=bpy.data.objects.new('Camera | Convergence',cam_data);S.collection.objects.link(camera);S.camera=camera;cam_data.lens=48;cam_data.clip_end=2500
S.render.engine='CYCLES';S.cycles.samples=24;S.cycles.use_denoising=True
S.render.resolution_x=1600;S.render.resolution_y=1400;S.render.resolution_percentage=100;S.render.image_settings.file_format='PNG'
camera.location=(93,-119,81);camera.rotation_euler=(Vector((0,0,17))-camera.location).to_track_quat('-Z','Y').to_euler()
S.render.filepath=str(ROOT/'renders/Convergencia_Reforcada.png')
if not os.environ.get('CONVERGENCE_FAST_EXPORT'):bpy.ops.render.render(write_still=True)
camera.location=(31,-43,34);camera.rotation_euler=(Vector((0,0,20))-camera.location).to_track_quat('-Z','Y').to_euler()
S.render.filepath=str(ROOT/'renders/Camara_Contencao_Detalhe.png')
if not os.environ.get('CONVERGENCE_FAST_EXPORT'):bpy.ops.render.render(write_still=True)
camera.location=(93,-119,81);camera.rotation_euler=(Vector((0,0,17))-camera.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Convergencia_Confinamento_Estelar.blend'))
report={'source':DATA['source'],'glbBytes':out.stat().st_size,'meshes':sum(o.type=='MESH' for o in S.objects),'hinges':6,'orbits':3,'maps':len(tex)*2}
(ROOT/'blender-export.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('CONVERGENCE_EXPORT_COMPLETE',json.dumps(report))
