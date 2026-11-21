"""Add a mechanically animated review timeline to the editable Blender document."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector,Quaternion,Matrix
ROOT=Path(__file__).resolve().parents[1]
S=bpy.context.scene;C=Matrix.Rotation(math.pi/2,4,'X').to_quaternion()
bpy.context.preferences.filepaths.save_version=0
frames=json.loads((ROOT/'mechanical-preview.json').read_text())
props=lambda o:json.loads(o.get('gameUserData','{}'))
arms=[o for o in S.objects if props(o).get('injectorArm')]
major=[o for o in S.objects if props(o).get('hinge')]
pods=[o for o in S.objects if props(o).get('energyPod')]
homes={o:o.location.copy() for o in pods}
crown=S.objects['EFFECT_CROWN'];sun=S.objects.get('Presentation | Mini-sol')
orbits=[S.objects[f'EFFECT_ORBIT_{i}'] for i in range(1,4)]
bpy.context.view_layer.update();shape_keys=[]
for obj in crown.children_recursive:
    if obj.type!='MESH':continue
    if not obj.data.shape_keys:obj.shape_key_add(name='Base')
    key=obj.data.shape_keys.key_blocks.get('Perimetro externo') or obj.shape_key_add(name='Perimetro externo')
    world=obj.matrix_world.copy();inverse=world.inverted()
    for i,vertex in enumerate(obj.data.vertices):
        p=world@vertex.co;r=math.hypot(p.x,p.y)
        if r>.01:p.x*=(r+22.15)/r;p.y*=(r+22.15)/r
        key.data[i].co=inverse@p
    shape_keys.append(key)
for sample in frames:
    f=1+round(sample['wall']*24);pose=sample['injection']
    for obj in arms:
        axis=Vector(props(obj)['injectorArm']['axis']);axis=Vector((axis.x,-axis.z,axis.y))
        obj.rotation_mode='QUATERNION';obj.rotation_quaternion=Quaternion(axis,pose['arm']);obj.keyframe_insert('rotation_quaternion',frame=f)
    for obj in major:
        spec=props(obj)['hinge'];a=spec['axis'];obj.rotation_mode='QUATERNION'
        obj.rotation_quaternion=Quaternion(Vector((a[0],-a[2],a[1])),spec['travel']*sample['arms']);obj.keyframe_insert('rotation_quaternion',frame=f)
    for obj in pods:
        q=pose['retract'];home=homes[obj];toward=Vector((-home.x,-home.y,0)).normalized()
        obj.location=home+toward*(.85*q);obj.scale=(1-.55*q,1-.55*q,1-.96*q)
        obj.keyframe_insert('location',frame=f);obj.keyframe_insert('scale',frame=f)
    if sun:
        sun.scale=(pose['ignition'],)*3;sun.keyframe_insert('scale',frame=f)
    spin=sample['orbitSpin'];tilt=sample['orbitTilt']
    angles=[((.11+math.sin(spin*.34)*.115)*tilt,spin*.27,-.12*tilt),
            ((.60+math.sin(spin*.27+1)*.23)*tilt,-spin*.33,.28*tilt),
            ((-.85+math.cos(spin*.40)*.17)*tilt,spin*.48,-.39*tilt)]
    for obj,rotation in zip(orbits,angles):
        q=__import__('mathutils').Euler(rotation,'XYZ').to_quaternion()
        obj.rotation_mode='QUATERNION';obj.rotation_quaternion=C@q@C.inverted();obj.keyframe_insert('rotation_quaternion',frame=f)
    crown.location.z=sample['crownY'];crown.keyframe_insert('location',frame=f)
    # Only four radius keys are needed; the render/game both keep radial thickness.
for key in shape_keys:
    for seconds,value in [(0,0),(113,0),(114.7,1),(121,1)]:
        key.value=value;key.keyframe_insert('value',frame=1+round(seconds*24))
for seconds,name in [(0,'Drenagem da cidade'),(9.6,'Injecao dos acumuladores'),(13.3,'Tubos recolhidos'),(15.7,'Mini-sol aceso'),(113,'Coroa se amplia'),(114.7,'Coroa desce por fora'),(121,'Coroa no perimetro')]:
    S.timeline_markers.new(name,frame=1+round(seconds*24))
S.frame_start=1;S.frame_end=2905;S.render.fps=24;S.frame_set(1)
S['mechanical_preview']='Pivôs e trajetória sincronizados com o módulo de injeção do jogo; materiais e pulsos são dirigidos em tempo real pelo jogo.'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'Convergencia_Confinamento_Estelar.blend'))
print('MECHANICAL_PREVIEW_SAVED',len(arms),len(pods),len(shape_keys))
