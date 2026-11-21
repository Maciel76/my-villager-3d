import bpy,sys,importlib,math
from mathutils import Vector
from types import SimpleNamespace
import sculpt_anatomy as A
importlib.reload(A)

# Refined nozzle grip.
coll=next(c for c in M.SCENE.collection.children if c.name.startswith('06B v2'));M.COL=coll
for o in list(coll.objects):
    if 'luva anatomica cinco dedos' in o.name:bpy.data.objects.remove(o,do_unlink=True)
f=SimpleNamespace(M=M,name=coll.name,P=lambda p:Vector((-1.72,-.05,2.42))+Vector(p)*1.38)
for i,(w,d) in enumerate([((-.68,-.52,1.25),(-1,-.2,.02)),((-.40,-.65,1.23),(-1,-.05,.04))]):
    A.hand(f,w,d,-1 if i==0 else 1,curl=2.5,roll=-math.pi/2)
# Child head and scalp use the same anatomical surface, with a resting head tilt.
coll=next(c for c in M.SCENE.collection.children if c.name.startswith('06C v2'));M.COL=coll
for o in list(coll.objects):
    if any(k in o.name for k in ['rosto anatomico child','cabelo infantil','mecha do cabelo da crianca']):bpy.data.objects.remove(o,do_unlink=True)
f=SimpleNamespace(M=M,name=coll.name,P=lambda p:Vector((1.56,-.08,2.42))+Vector(p)*1.07)
A.head(f,(.18,-.40,1.855),yaw=.42,pitch=.37,kind='child',size=.65)
for name in ['06_rock_and_finishing.py','07_cloth_refinement.py']:
    p=M.ROOT/'scripts'/name;exec(compile(p.read_text(encoding='utf-8'),str(p),'exec'),{'M':M})

# Editable figure hierarchies with stable world transforms.
for prefix,name,origin in [('06A v2','ESCULTURA_LIDER',(0,-.08,2.42)),('06B v2','ESCULTURA_OPERADOR',(-1.72,-.05,2.42)),('06C v2','ESCULTURA_BOMBEIRA_CRIANCA',(1.56,-.08,2.42))]:
    coll=next(c for c in M.SCENE.collection.children if c.name.startswith(prefix))
    root=bpy.data.objects.new(name,None);coll.objects.link(root);root.location=origin;root.empty_display_size=.18
    bpy.context.view_layer.update();inverse=root.matrix_world.inverted()
    for obj in list(coll.objects):
        if obj!=root:
            w=obj.matrix_world.copy();obj.parent=root;obj.matrix_parent_inverse=inverse;obj.matrix_world=w

camera_specs=[('Camera • conjunto escultorico',(4.4,-14,7),(0,-.12,4.0),6.8),('Camera • bombeira e crianca',(3.7,-7,5.6),(1.65,-.25,4.2),2.75),('Camera • operador da mangueira',(-5,-9,5.7),(-2.25,-.3,3.8),3.9)]
coll=bpy.data.collections['11 • Apresentacao, cameras e luzes']
for name,loc,target,scale in camera_specs:
    data=bpy.data.cameras.new(name);cam=bpy.data.objects.new(name,data);coll.objects.link(cam);cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=scale

im=bpy.data.images.load(str(M.ROOT/'referencia-estatuas.png'));im.pack()
txt=bpy.data.texts.get('LEIA-ME • Monumento')
txt.write('\n\nREVISAO DAS ESCULTURAS\nRostos e maos: base anatomica hm08 MakeHuman CC0, adaptada e posada.\nFonte: https://github.com/makehumancommunity/makehuman\nLider, operador ajoelhado e bombeira com crianca agrupados separadamente.\nA primeira versao foi mantida em colecoes ocultas Arquivo v1.\nAs cotas do conjunto escultorico foram adaptadas para a implantacao monumental da referencia inicial.\n')
for p in (M.ROOT/'scripts').glob('*.py'):
    t=bpy.data.texts.get(p.name) or bpy.data.texts.new(p.name);t.clear();t.write(p.read_text(encoding='utf-8'))
M.SCENE.camera=bpy.data.objects['Camera • perspectiva principal']
bpy.ops.object.select_all(action='DESELECT')
M.SCENE.render.filepath=str(M.ROOT/'renders'/'Monumento_Perspectiva.png')
bpy.ops.wm.save_as_mainfile(filepath=str(M.ROOT/'Monumento_Corpo_de_Bombeiros.blend'))
print('Acabamento concluido e arquivo salvo. Objetos:',len(M.SCENE.objects))
