import bpy,math,random
from mathutils import Vector,noise
from math import sin,cos,pi
random.seed(617)
M.COL=bpy.data.collections['06D • Base rochosa e fixacao das esculturas']
for obj in list(M.COL.objects):
    if obj.name.startswith(('Solo rochoso','Base fundida das esculturas')):
        bpy.data.objects.remove(obj,do_unlink=True)
M.material('Bronze da rocha',(.090,.057,.029),metallic=.66,rough=.61,noise=44)
feet=[(-.317,-.221),(.359,-.070),(-2.479,-.937),(-1.306,.768),(1.357,-.208),(1.795,.0)]
vs=[];fs=[];nx=46;ny=18
def height(x,y):
    n=noise.noise_vector(Vector((x*.86,y*1.3,6.72))).x
    n2=noise.noise_vector(Vector((x*2.4,y*2.7,8.92))).y
    z=2.53+.25*n+.10*n2
    for fx,fy in feet:
        q=((x-fx)/.245)**2+((y-fy)/.44)**2
        u=min(1,max(0,(q-1)/.7));w=1-u*u*(3-2*u)
        z=z*(1-w)+2.410*w
    return z
for j in range(ny+1):
    for i in range(nx+1):
        x=-3.13+6.26*i/nx;y=-1.18+2.30*j/ny
        edge=(1 if i in [0,nx] or j in [0,ny] else 0)
        if edge:
            x+=.035*sin(j*2.3+i*.7);y+=.025*sin(i*1.8+j)
        vs.append((x,y,height(x,y)))
for j in range(ny):
    for i in range(nx):
        k=j*(nx+1)+i
        if (i+j)%2:fs.extend([(k,k+1,k+nx+1),(k+1,k+nx+2,k+nx+1)])
        else:fs.extend([(k,k+1,k+nx+2),(k,k+nx+2,k+nx+1)])
border=list(range(nx+1))+[j*(nx+1)+nx for j in range(1,ny+1)]+[ny*(nx+1)+i for i in range(nx-1,-1,-1)]+[j*(nx+1) for j in range(ny-1,0,-1)]
bottom=[]
for i in border:
    x,y,z=vs[i];bottom.append(len(vs));vs.append((x*.995,y*.995,2.285+.01*sin(i*2.3)))
for j,k in enumerate(border):
    q=(j+1)%len(border);fs.append((k,border[q],bottom[q],bottom[j]))
fs.append(tuple(reversed(bottom)))
rock=M.mesh('Rocha continua esculpida • cristas e apoios',vs,fs,'Bronze da rocha')
bev=rock.modifiers.new('Arestas levemente gastas da rocha','BEVEL');bev.width=.008;bev.segments=2
# Cast bronze is satin, with a restrained microtexture rather than a glossy coating.
for name in ['Bronze escultura','Bronze escuro escultura','Bronze realce']:
    p=next(n for n in M.MAT[name].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    p.inputs['Coat Weight'].default_value=.03
    p.inputs['Roughness'].default_value=.46 if name=='Bronze escultura' else .36
# Small visible fasteners and stitches on pockets and rescue belts.
for coll in M.SCENE.collection.children:
    if coll.name.startswith(('06A v2','06B v2','06C v2')):
        M.COL=coll
        flaps=[o for o in coll.objects if 'aba do bolso' in o.name]
        for obj in flaps:
            x,y,z=obj.location;w=obj.dimensions.x*.39
            for j in range(8):
                xx=x-w+2*w*j/7
                M.curve('Pesponto da aba de bolso',[(xx-.004,y-.019,z-.013),(xx+.004,y-.019,z-.013)],.0018,'Bronze realce')
print('Rocha, acabamento acetinado e costuras concluidos')
