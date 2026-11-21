import bpy,math,json
from mathutils import Vector,Quaternion
from math import pi

M.collection('11 • Apresentacao, cameras e luzes')
M.material('Chao de estudio',(.044,.060,.073),rough=.72,noise=20)
ground=M.box('Piso externo de apresentacao',(0,0,-.12),(200,200,.15),'Chao de estudio',.02)
ground['Excluir das dimensoes do monumento']=True
s=M.SCENE
world=bpy.data.worlds.new('Ceu azul do entardecer');s.world=world;world.use_nodes=True
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs['Color'].default_value=(.14,.20,.29,1);bg.inputs['Strength'].default_value=.45
def light(name,loc,energy,color,size,target=(0,0,3.7)):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);M.COL.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return o
light('Luz principal suave',(-8,-11,14),5000,(1,.84,.65),8)
light('Preenchimento frio',(8,-5,10),4200,(.60,.78,1),7)
light('Recorte do aco',(1,6,12),6500,(.72,.84,1),6)
light('Destaque frontal das esculturas',(0,-7,6.5),1500,(1,.70,.39),5)
light('Luz rasante esquerda',(-8,1,6),1600,(1,.45,.19),4)

def camera(name,loc,target,scale):
    d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);M.COL.objects.link(o)
    o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    d.type='ORTHO';d.ortho_scale=scale;d.lens=50;d.clip_end=500
    return o
hero=camera('Camera • perspectiva principal',(11,-24,11),(0,0,3.70),18.7)
camera('Camera • vista frontal',(0,-28,7.5),(0,0,4.1),17.5)
camera('Camera • vista lateral',(24,-.3,8.5),(0,0,3.8),14)
camera('Camera • vista superior',(0,-.001,25),(0,0,0),16.7)
camera('Camera • detalhes dos bombeiros',(7,-13,7.8),(0,-.1,4.0),9.2)
s.camera=hero
s.render.resolution_x=1800;s.render.resolution_y=1350;s.render.resolution_percentage=100
s.render.film_transparent=False
formats=[e.identifier for e in s.render.image_settings.bl_rna.properties['file_format'].enum_items]
if 'PNG' in formats:s.render.image_settings.file_format='PNG'
if hasattr(s,'eevee') and hasattr(s.eevee,'taa_render_samples'):s.eevee.taa_render_samples=96
s.render.image_settings.color_mode='RGBA'
s.view_settings.exposure=.30
# A restrained photographic halo gives the embedded LED strips a visible warm glow.
if hasattr(s,'compositing_node_group'):
    nt=bpy.data.node_groups.new('Monumento • acabamento fotografico','CompositorNodeTree')
    nt.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
    s.compositing_node_group=nt
    rl=nt.nodes.new('CompositorNodeRLayers');glow=nt.nodes.new('CompositorNodeGlare');out=nt.nodes.new('NodeGroupOutput')
    if 'Type' in glow.inputs:
        try:glow.inputs['Type'].default_value='Fog Glow'
        except TypeError as e:print('Modo de brilho disponivel:',str(e))
        try:glow.inputs['Quality'].default_value='High'
        except TypeError:pass
        glow.inputs['Threshold'].default_value=2.0
        glow.inputs['Strength'].default_value=.24
        glow.inputs['Size'].default_value=.28
    nt.links.new(rl.outputs['Image'],glow.inputs['Image']);nt.links.new(glow.outputs['Image'],out.inputs['Image'])

# Keep the supplied design inside the .blend as a packed reference image.
M.collection('12 • Referencia fornecida')
im=bpy.data.images.load(str(M.ROOT/'referencia.png'));im.pack()
ref=bpy.data.objects.new('Referencia original • diagrama fornecido',None);M.COL.objects.link(ref)
ref.empty_display_type='IMAGE';ref.data=im;ref.empty_display_size=14
ref.location=(0,5,4.5);ref.rotation_euler=(pi/2,0,0);ref.hide_render=True;ref.hide_viewport=True
notes=bpy.data.texts.new('LEIA-ME • Monumento')
notes.write('MONUMENTO CORPO DE BOMBEIROS\n\nRecriacao artistica editavel da referencia fornecida.\nDimensoes de referencia: 14 x 7 x 8,5 metros.\nTres esculturas de bronze modeladas com equipamento, poses e rostos distintos.\nMateriais procedurais; fontes representadas por malhas e curvas estaticas.\nColecoes organizadas por componente e cinco cameras de apresentacao.\nNao e projeto executivo nem dimensionamento estrutural.\n')
for p in (M.ROOT/'scripts').glob('*.py'):
    t=bpy.data.texts.new(p.name);t.write(p.read_text(encoding='utf-8'))
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
        area.spaces.active.overlay.show_overlays=False
        area.spaces.active.clip_end=500
        area.spaces.active.shading.studiolight_rotate_z=.3
bpy.ops.object.select_all(action='DESELECT')
s.render.filepath=str(M.ROOT/'renders'/'Monumento_Perspectiva.png')
bpy.ops.wm.save_as_mainfile(filepath=str(M.ROOT/'Monumento_Corpo_de_Bombeiros.blend'))
print('Apresentacao pronta. Cena:',len(s.objects),'objetos; camera:',s.camera.name)
