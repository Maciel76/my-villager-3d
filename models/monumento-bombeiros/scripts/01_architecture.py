from math import sin,cos,pi
from mathutils import Vector
import bpy,math

M.init()
M.collection('01 • Fundacao e estrutura interna')
M.rounded_rect('Fundacao em concreto | 14 x 7 m',14,7,0,.22,1.3,'Concreto')
for x in [-4,-2,0,2,4]:
    M.box('Viga metalica longitudinal',(x,.25,.47),(.12,4.1,.16),'Aco estrutural',.009)
for y in [-1.65,0,1.65]:
    M.box('Travessa estrutural',(0,y,.47),(9.9,.12,.16),'Aco estrutural',.009)
for x in [-4,-2,0,2,4]:
    for y in [-1.65,1.65]:
        M.box('Chapa de ancoragem',(x,y,.29),(.32,.32,.04),'Aco escovado',.012)
        for dx in [-.11,.11]:
            M.cylinder('Chumbador M20',(x+dx,y,.26),(x+dx,y,.57),.012,'Aco escovado',vertices=12)

M.collection('02 • Praca, degraus e pedestal')
M.rounded_rect('Rodape de granito',14,7,.22,.24,1.3,'Granito escuro')
M.rounded_rect('Pavimento superior',13.82,6.82,.46,.055,1.23,'Piso pracinha',edge=.015)
for x in [i*.62 for i in range(-7,8)]:
    for y in [-2.87,2.91]:
        M.box('Junta do pavimento',(x,y,.517),(.012,1.05,.004),'Granito escuro',0)
for y in [-3.12,-2.65,2.62,3.15]:
    M.box('Junta transversal',(0,y,.517),(9.45,.012,.004),'Granito escuro',0)
for k,(w,d,z) in enumerate([(9.7,2.15,.52),(9.0,1.72,.73),(8.35,1.26,.94)]):
    y=-2.08+.20*k
    M.box('Degrau %02d em granito'%(k+1),(0,y,z+.105),(w,d,.21),'Granito cinza',.045)
    front=y-d/2-.012
    M.box('Canaleta LED degrau %02d'%k,(0,front,z+.083),(w-.23,.035,.035),'Aco escovado',.009)
    M.box('Difusor luminoso degrau %02d'%k,(0,front-.022,z+.083),(w-.29,.012,.018),'LED ambar',.004)
M.frustum('Pedestal principal facetado',(0,.05),.92,1.27,(8.55,3.65),(6.75,2.55),'Granito escuro')
M.box('Coroamento do pedestal',(0,.05,2.205),(6.92,2.72,.17),'Granito cinza',.06)
M.box('Friso metalico superior',(0,-1.333,2.192),(6.89,.035,.065),'Aco escovado',.009)
for side in [-1,1]:
    M.profile('Painel vermelho lateral',[(side*3.25,1.13),(side*4.03,1.13),(side*3.31,2.12),(side*2.94,2.12)],-1.74,.055,'Vermelho automotivo')
    M.cylinder('Borda em inox do painel',(side*4.02,-1.79,1.12),(side*3.31,-1.25,2.14),.043,'Aco escovado')
    M.box('Apoio dos arcos',(side*4.68,.78,.78),(1.6,2.2,.53),'Granito cinza',.05)
    for x in [side*4.68-.36,side*4.68+.36]:
        M.box('Chapa base do arco',(x,.78,1.065),(.32,.65,.035),'Aco escovado',.012)
        for y in [.54,1.02]:M.cylinder('Porca e parafuso do arco',(x,y,1.07),(x,y,1.12),.029,'Aco estrutural',vertices=6)

M.collection('03 • Letreiro e iluminacao embutida')
alpha=math.atan2(1.27,.55)
def front(z):return -1.775+(z-.92)*.55/1.27-.025
for body,z,size in [('CORPO DE',1.84,.53),('BOMBEIROS',1.35,.60)]:
    M.text('Letra caixa | '+body,body,(0,front(z),z),size,'Dourado',(alpha,0,0),.018)
M.text('Divisa institucional','PREVENÇÃO  •  SALVAMENTO  •  COMBATE  •  RESGATE',(0,front(1.015)-.018,1.015),.115,'Dourado',(alpha,0,0),.004)
M.box('Linha dourada abaixo do letreiro',(0,-1.755,1.075),(5.55,.04,.025),'Dourado',.004)
for side in [-1,1]:
    M.box('Balizador lateral',(side*5.65,-2.7,.65),(.37,.24,.25),'Granito escuro',.035)
    M.box('Luz do balizador',(side*5.65,-2.835,.68),(.25,.022,.06),'LED ambar',.01)

M.collection('04 • Arcos esculturais em aco e vermelho')
def arc(label,points,width,depth=.44):
    a,b,c,d=[Vector(p) for p in points]
    centers=[];normals=[];widths=[]
    for i in range(97):
        t=i/96
        p=(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d
        tangent=(3*(1-t)**2*(b-a)+6*(1-t)*t*(c-b)+3*t*t*(d-c)).normalized()
        n=Vector((-tangent.z,0,tangent.x)).normalized()
        w=width*(.88+.18*sin(pi*t))*max(.012,(1-t)**.36)
        centers.append(p);normals.append(n);widths.append(w)
    vs=[]
    for p,n,w in zip(centers,normals,widths):
        for yy,ss in [(-depth/2,-.5),(-depth/2,.5),(depth/2,.5),(depth/2,-.5)]:
            q=p+n*w*ss+Vector((0,yy,0));vs.append(q)
    fs=[(3,2,1,0)]
    for i in range(96):
        for j in range(4):fs.append((4*i+j,4*i+(j+1)%4,4*(i+1)+(j+1)%4,4*(i+1)+j))
    fs.append((384,385,386,387))
    M.mesh(label+' | lamina externa inox',vs,fs,'Aco escovado',True,.022)
    red=[]
    for p,n,w in zip(centers,normals,widths):
        for f in [-.48,-.05]:
            q=p+n*w*f+Vector((0,-depth/2-.012,0));red.append(q)
    M.mesh(label+' | revestimento vermelho',red,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(96)],'Vermelho automotivo',True)
    M.curve(label+' | friso dourado interno',[tuple(p-n*w*.49+Vector((0,-depth/2-.03,0))) for p,n,w in zip(centers,normals,widths)],.018,'Dourado')
    M.curve(label+' | linha de luz',[tuple(p-n*w*.40+Vector((0,-depth/2-.033,0))) for p,n,w in zip(centers,normals,widths)][5:86],.012,'LED ambar')
    # Visible seams between fabricated curved panels.
    for i in [16,32,48,64,80]:
        p,n,w=centers[i],normals[i],widths[i]
        M.curve(label+' | junta de chapa',[tuple(p+n*w*f+Vector((0,-depth/2-.008,0))) for f in [.06,.48]],.004,'Aco estrutural')
arc('Arco esquerdo',[(-4.55,.80,1.08),(-7.3,.80,4.15),(-5.55,.80,6.63),(-1.65,.80,8.5)],1.13)
arc('Arco direito',[(4.58,.80,1.08),(6.78,.80,3.48),(5.98,.80,5.69),(3.10,.80,6.94)],1.05)

M.collection('05 • Brasao, tocha e machados')
outline=[(0,1.08),(.25,1.02),(.58,.80),(.98,.84),(.88,.49),(1.04,.22),(1.06,-.13),(.86,-.46),(.94,-.91),(.55,-.83),(.25,-1.02),(0,-1.11),(-.25,-1.02),(-.55,-.83),(-.94,-.91),(-.86,-.46),(-1.06,-.13),(-1.04,.22),(-.88,.49),(-.98,.84),(-.58,.80),(-.25,1.02)]
cx,cz,scale=0,6.55,1.48
shape=[(cx+x*scale,cz+z*scale) for x,z in outline]
M.profile('Escudo vermelho em relevo',shape,1.15,.18,'Vermelho brasao',.055)
M.curve('Contorno dourado do escudo',[(x,1.095,z) for x,z in shape],.051,'Dourado',True)
M.curve('Filete interno do brasao',[(x*.92,1.075,cz+(z-cz)*.92) for x,z in shape],.020,'Dourado',True)
for side in [-1,1]:
    a=(side*-.87,.99,5.55);b=(side*.88,.99,7.40)
    M.cylinder('Cabo do machado cruzado',a,b,.052,'Dourado')
    for t in [.08,.14,.20,.26,.32]:
        p=Vector(a).lerp(Vector(b),t);M.uv('Rebite do cabo',p,(.062,.057,.035),'Bronze escuro',12,8)
    x=side*.80
    pts=[(x-side*.17,7.33),(x+side*.06,7.57),(x+side*.48,7.37),(x+side*.62,7.07),(x+side*.37,6.96),(x+side*.12,7.14)]
    M.profile('Lamina polida do machado',pts,.88,.14,'Aco machados',.025)
    M.curve('Fio do machado',[(x+side*.62,.86,7.07),(x+side*.37,.86,6.96),(x+side*.12,.86,7.14)],.015,'Dourado')
M.torus('Corda circular no brasao',(0,.87,6.55),.62,.036,'Dourado')
M.cylinder('Corpo da tocha',(0,.73,5.65),(0,.73,7.02),.105,'Dourado',r2=.14)
for x in [-.075,-.025,.025,.075]:M.cylinder('Canelura da tocha',(x,.615,5.75),(x,.615,6.97),.013,'Bronze escuro',vertices=12)
for z,r in [(5.7,.14),(6.94,.19),(7.04,.21)]:M.torus('Aro da tocha',(0,.73,z),r,.028,'Dourado',(0,0,0))
for j,(x,z,h) in enumerate([(-.14,7.05,.65),(.03,7.07,.91),(.18,7.05,.54)]):
    M.profile('Lingua de fogo em ouro',[(x-.12,z),(x-.15,z+h*.35),(x+.015,z+h*.78),(x-.015,z+h),(x+.13,z+h*.54),(x+.11,z+h*.14)],.64,.09,'Dourado',.025)
    M.curve('Nervura da chama',[(x,.625,z+.08),(x-.02,.625,z+h*.45),(x+.015,.625,z+h*.78)],.013,'Vermelho brasao')
M.cylinder('Suporte posterior do emblema',(0,1.48,2.25),(0,1.48,6.62),.09,'Aco estrutural')
print('Arquitetura, arcos e brasao concluidos:',len(M.SCENE.objects),'objetos')
