import bpy,random,math
from math import sin,cos,pi
from mathutils import Vector
random.seed(447)

# Replace discrete rock lumps with a continuous, chisel-textured sculptural footing.
c=bpy.data.collections.get('06D • Base rochosa e fixacao das esculturas')
M.COL=c
for obj in list(c.objects):
    if obj.name.startswith('Rocha fundida'):
        bpy.data.objects.remove(obj,do_unlink=True)
vs=[];fs=[];nx=76;ny=30
for j in range(ny+1):
    y=-1.08+j*2.20/ny
    for i in range(nx+1):
        x=-3.08+i*6.16/nx
        edge=min(i/nx,1-i/nx,j/ny,1-j/ny)
        z=2.34+min(1,edge*20)*(.045+.038*sin(x*7+y*5)+.027*sin(x*16-y*19)+random.uniform(-.035,.035))
        vs.append((x,y,z))
for j in range(ny):
    for i in range(nx):
        k=j*(nx+1)+i
        fs.extend([(k,k+1,k+nx+2),(k,k+nx+2,k+nx+1)])
terrain=M.mesh('Solo rochoso continuo em bronze cinzelado',vs,fs,'Bronze')
terrain.data.materials.append(M.MAT['Bronze escuro']);terrain.data.materials.append(M.MAT['Bronze luz'])
for p in terrain.data.polygons:p.material_index=random.choices([0,1,2],[.90,.07,.03])[0]

# Correct the sloped red inset planes to sit on the pedestal face.
for o in M.SCENE.objects:
    if o.name.startswith('Painel vermelho lateral'):
        for v in o.data.vertices:v.co.y=-1.82+(v.co.z-.92)*.55/1.27+(0 if v.co.y< -1.71 else .035)

M.collection('08 • Fontes, reservatorios e jatos de agua')
for side in [-1,1]:
    cx=side*5.45;cy=-.72;floor=1.18
    M.box('Bloco de apoio da fonte',(cx,cy,.84),(1.76,1.65,.64),'Granito cinza',.045)
    M.box('Fundo do reservatorio',(cx,cy,1.175),(1.8,1.70,.13),'Granito escuro',.035)
    for dx in [-.83,.83]:M.box('Borda lateral da fonte',(cx+dx,cy,1.31),(.15,1.70,.25),'Granito cinza',.025)
    for dy in [-.77,.77]:M.box('Borda frontal da fonte',(cx,cy+dy,1.31),(1.60,.16,.25),'Granito cinza',.025)
    M.box('Espelho de agua',(cx,cy,1.325),(1.48,1.35,.026),'Agua',.018)
    for i in range(8):
        t=2*pi*i/8
        sx=cx+.10*cos(t);sy=cy+.10*sin(t)
        ex=cx+.56*cos(t);ey=cy+.49*sin(t)
        points=[]
        for j in range(31):
            a=j/30
            points.append((sx+(ex-sx)*a,sy+(ey-sy)*a,1.35+4*(.70+(i%3)*.12)*a*(1-a)))
        M.curve('Jato parabolico de agua',points,.014,'Jatos de agua')
        M.cylinder('Bico inox do jato',(sx,sy,1.32),(sx,sy,1.40),.029,'Aco escovado',vertices=16)
        for k in [.82,.9,.97]:
            p=Vector(points[int(k*30)])
            M.uv('Gota no final do jato',p,(.018,.018,.035),'Jatos de agua',12,8)
        M.torus('Onda circular na superficie',(ex,ey,1.349),.082,.006,'Jatos de agua',(0,0,0))
    for i in range(5):
        theta=i*2*pi/5
        pts=[]
        for j in range(28):
            a=j/27
            pts.append((cx+.035*cos(theta)+.17*cos(theta)*a*a,cy+.035*sin(theta)+.17*sin(theta)*a*a,1.36+1.49*a-.48*a*a))
        M.curve('Pluma central de agua',pts,.013,'Jatos de agua')
        M.uv('Gota suspensa da pluma',pts[-1],(.021,.021,.039),'Jatos de agua',12,8)
    for dx in [-.52,.52]:
        M.cylinder('Spot submerso',(cx+dx,cy-.42,1.30),(cx+dx,cy-.42,1.335),.058,'Aco escovado')
        M.uv('Lente azul do spot',(cx+dx,cy-.42,1.338),(.042,.042,.008),'Jatos de agua',16,8)
    M.box('Filete luminoso sob a fonte',(cx,cy-.871,1.20),(1.55,.025,.025),'LED ambar',.004)

M.collection('09 • Jardins e canteiros floridos')
beds=[]
for side in [-1,1]:
    x=side*5.69;y=-2.42
    M.rounded_rect('Jardineira frontal',2.23,1.05,.52,.24,.29,'Granito cinza',center=(x,y))
    M.rounded_rect('Terra do canteiro frontal',2.04,.87,.75,.045,.23,'Terra',center=(x,y),edge=.01)
    beds.extend([(x+random.uniform(-.86,.86),y+random.uniform(-.30,.30),.79) for _ in range(58)])
    # Rear beds keep the monument legible while making the top view complete.
    M.rounded_rect('Jardineira posterior',3.3,1.05,.52,.16,.30,'Granito escuro',center=(side*4.15,2.55))
    M.rounded_rect('Solo posterior',3.10,.86,.675,.04,.23,'Terra',center=(side*4.15,2.55),edge=.01)
    beds.extend([(side*4.15+random.uniform(-1.36,1.36),2.55+random.uniform(-.30,.30),.72) for _ in range(64)])

# Batch botanical geometry by material: hundreds of individually shaped leaves and petals,
# with a small object count for a responsive editable scene.
buffers={name:[[],[]] for name in ['Folha verde','Folha clara','Flor vermelha','Flor amarela','Centro flor']}
def leaf(name,start,angle,length,width,height):
    vs,fs=buffers[name];k=len(vs);s=Vector(start);d=Vector((cos(angle),sin(angle),0));n=Vector((-sin(angle),cos(angle),0))
    pts=[s,s+d*length*.32+Vector((0,0,height*.62)),s+d*length*.72+Vector((0,0,height)),s+d*length+Vector((0,0,height*.72))]
    for j,p in enumerate(pts):
        w=[.006,width,width*.65,0][j]
        vs.extend([tuple(p+n*w),tuple(p+Vector((0,0,.008))),tuple(p-n*w)])
    for j in range(3):
        fs.extend([(k+3*j,k+3*j+1,k+3*j+4,k+3*j+3),(k+3*j+1,k+3*j+2,k+3*j+5,k+3*j+4)])
def ellipsoid(name,center,scale,angle=0):
    vs,fs=buffers[name];k=len(vs)
    for j in range(5):
        lat=-pi/2+j*pi/4
        for i in range(10):
            a=2*pi*i/10;x=scale[0]*cos(lat)*cos(a);y=scale[1]*cos(lat)*sin(a)
            vs.append((center[0]+x*cos(angle)-y*sin(angle),center[1]+x*sin(angle)+y*cos(angle),center[2]+scale[2]*sin(lat)))
    for j in range(4):
        for i in range(10):fs.append((k+j*10+i,k+j*10+(i+1)%10,k+(j+1)*10+(i+1)%10,k+(j+1)*10+i))
for i,(x,y,z) in enumerate(beds):
    for j in range(8):
        a=j*2*pi/8+random.uniform(-.4,.4)
        leaf('Folha verde' if j%3 else 'Folha clara',(x,y,z),a,random.uniform(.12,.28),random.uniform(.018,.038),random.uniform(.16,.34))
    if i%2==0:
        h=random.uniform(.22,.38);color='Flor vermelha' if i%5 else 'Flor amarela'
        for flower in range(2):
            px=x+random.uniform(-.07,.07);py=y+random.uniform(-.07,.07)
            for j in range(6):
                a=j*2*pi/6
                ellipsoid(color,(px+.045*cos(a),py+.045*sin(a),z+h),(.059,.032,.022),a)
            ellipsoid('Centro flor',(px,py,z+h+.018),(.026,.026,.018))
for name,(vs,fs) in buffers.items():M.mesh('Vegetacao detalhada | '+name,vs,fs,name,True)

M.collection('10 • Pequenos acabamentos e ferragens')
for side in [-1,1]:
    for x in [side*6.5,side*4.9]:
        M.box('Placa pequena no granito',(x,-3.09,.53),(.18,.10,.013),'Aco escovado',.012)
        for dx in [-.06,.06]:M.cylinder('Parafuso de acabamento',(x+dx,-3.09,.535),(x+dx,-3.09,.55),.007,'Aco estrutural',vertices=8)
# Rescue tool held next to the central firefighter, in the same bronze casting palette.
M.cylinder('Ferramenta Halligan do bombeiro central',(-.53,-.48,2.63),(-.53,-.48,3.84),.025,'Bronze escuro')
M.cylinder('Cabeca da ferramenta Halligan',(-.68,-.48,2.70),(-.38,-.48,2.70),.043,'Bronze luz',r2=.022)
M.curve('Garra da ferramenta',[(-.53,-.48,2.70),(-.53,-.51,2.57),(-.62,-.51,2.52)],.028,'Bronze luz')
print('Fontes, jatos, jardins e acabamentos concluidos:',len(M.SCENE.objects),'objetos')
