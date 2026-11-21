import bpy, math, random
from mathutils import Vector,Matrix
from math import sin,cos,pi,exp
import sculpt_anatomy as A
random.seed(854)

def path_at(points,t):
    pts=[Vector(p) for p in points];u=min(t*(len(pts)-1),len(pts)-1-.000001)
    i=int(u);a=u-i;p0=pts[max(0,i-1)];p1=pts[i];p2=pts[min(i+1,len(pts)-1)];p3=pts[min(i+2,len(pts)-1)]
    return .5*((2*p1)+(-p0+p2)*a+(2*p0-5*p1+4*p2-p3)*a*a+(-p0+3*p1-3*p2+p3)*a*a*a)

def frame(points,t):
    p=path_at(points,t);d=(path_at(points,min(t+.002,.99999))-path_at(points,max(0,t-.002))).normalized()
    n=d.cross(Vector((0,1,0)))
    if n.length<.05:n=d.cross(Vector((1,0,0)))
    n.normalize();return p,n,d.cross(n).normalized(),d

class Statue:
    def __init__(self,name,origin,scale):
        self.name=name;self.origin=Vector(origin);self.scale=scale;self.M=M
        self.coll=M.collection(name)
    def P(self,p):return self.origin+Vector(p)*self.scale
    def uv(self,name,p,s,mat='Bronze escultura',seg=32):
        return M.uv(self.name+' | '+name,self.P(p),tuple(a*self.scale for a in s),mat,seg,20)
    def box(self,name,p,s,mat='Bronze escuro escultura',edge=.012):
        return M.box(self.name+' | '+name,self.P(p),tuple(a*self.scale for a in s),mat,edge*self.scale)
    def line(self,name,pts,r=.005,mat='Bronze realce'):
        return M.curve(self.name+' | '+name,[self.P(p) for p in pts],r*self.scale,mat)
    def rod(self,name,a,b,r,mat='Bronze escuro escultura',r2=None):
        return M.cylinder(self.name+' | '+name,self.P(a),self.P(b),r*self.scale,mat,r2=None if r2 is None else r2*self.scale)
    def cloth(self,name,points,radii,mat='Bronze escultura',kind='leg',start=0,end=1,ns=48,nr=44):
        vs=[]
        for j in range(nr+1):
            t=start+(end-start)*j/nr
            p,n,v,d=frame(points,t)
            r=radii[0]*(1-t)**2+2*radii[1]*t*(1-t)+radii[2]*t*t
            for i in range(ns):
                q=2*pi*i/ns
                # Directional folds collect at bends; they do not encircle limbs as regular ribs.
                joint=.65 if len(points)==4 else .52
                localized=exp(-((t-joint)/.19)**2)
                lower=exp(-((t-.88)/.14)**2)
                folds=(.009*localized*sin(22*t+3.2*q)+.005*lower*sin(36*t-4*q))*(.35+.65*sin(q)**2)
                dr=folds+.0025*sin(q*9+t*18)
                if kind=='band':dr=.002
                vs.append(tuple(self.P(p+(n*cos(q)+(v*sin(q)*.90))*(r+dr))))
        fs=[tuple(reversed(range(ns))),tuple(range(nr*ns,(nr+1)*ns))]
        fs += [(j*ns+i,j*ns+(i+1)%ns,(j+1)*ns+(i+1)%ns,(j+1)*ns+i) for j in range(nr) for i in range(ns)]
        return M.mesh(self.name+' | '+name,vs,fs,mat,True)
    def band(self,points,radii,t,width=.037):
        rr=[r+.006 for r in radii]
        self.cloth('faixa refletiva larga',points,rr,'Dourado envelhecido',kind='band',start=t-width/2,end=t+width/2,ns=48,nr=3)
        self.cloth('costura da faixa',points,[r+.007 for r in radii],'Bronze escuro escultura',kind='band',start=t-width/2-.006,end=t-width/2,ns=48,nr=2)
    def unify(self,objects,name):
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join();obj=bpy.context.object;obj.name=self.name+' | '+name
        rem=obj.modifiers.new('Uniao escultural das superficies','REMESH')
        modes=[i.identifier for i in rem.bl_rna.properties['mode'].enum_items]
        if 'VOXEL' in modes:rem.mode='VOXEL'
        rem.voxel_size=.0065*self.scale;rem.use_smooth_shade=True
        bpy.ops.object.modifier_apply(modifier=rem.name)
        sm=obj.modifiers.new('Relaxamento de escultura','SMOOTH');sm.factor=.6;sm.iterations=3
        bpy.ops.object.modifier_apply(modifier=sm.name)
        M.smooth(obj)
        return obj
    def torso(self,hips,shoulders):
        hip=sum((Vector(p) for p in hips),Vector())/2;top=sum((Vector(p) for p in shoulders),Vector())/2
        vs=[];ns=64;nr=44
        for j in range(nr+1):
            t=j/nr;p=hip.lerp(top,t)+Vector((0,0,-.05+.08*t))
            rx=.253+.035*sin(t*pi)
            if t>.83:rx-=.085*(t-.83)/.17
            ry=.155+.015*sin(pi*t)
            for i in range(ns):
                q=2*pi*i/ns
                fold=.004*sin(6*q+t*23)+.003*sin(11*q-t*29)
                folds=.010*exp(-((t-.23)/.18)**2)*sin(9*q+t*21)
                vs.append(tuple(self.P(p+Vector(((rx+fold+folds)*cos(q),(ry+fold+folds)*sin(q),.003*sin(q*8))))))
        fs=[tuple(reversed(range(ns))),tuple(range(nr*ns,(nr+1)*ns))]
        fs += [(j*ns+i,j*ns+(i+1)%ns,(j+1)*ns+(i+1)%ns,(j+1)*ns+i) for j in range(nr) for i in range(ns)]
        return M.mesh(self.name+' | tecido do casaco',vs,fs,'Bronze escultura',True),hip,top
    def boot(self,p,yaw=0):
        p=Vector(p)
        rot=Matrix.Rotation(yaw,4,'Z').to_3x3()
        def B(v):return p+rot@Vector(v)
        # A shaped leather upper, a separate welt, and a lugged sole.
        vs=[];ns=48
        rings=[(-.078,.113,.185,-.055),(-.042,.116,.196,-.055),(.012,.112,.191,-.06),(.080,.102,.155,-.038),(.15,.094,.111,.0),(.24,.099,.103,.014),(.30,.105,.108,.02)]
        for z,rx,ry,cy in rings:
            for i in range(ns):
                q=2*pi*i/ns;x=rx*cos(q);y=cy+ry*sin(q)
                vs.append(tuple(self.P(B((x,y,z)))))
        fs=[tuple(reversed(range(ns))),tuple(range((len(rings)-1)*ns,len(rings)*ns))]
        fs += [(j*ns+i,j*ns+(i+1)%ns,(j+1)*ns+(i+1)%ns,(j+1)*ns+i) for j in range(len(rings)-1) for i in range(ns)]
        upper=M.mesh(self.name+' | bota couro modelado',vs,fs,'Bronze escuro escultura',True)
        sub=upper.modifiers.new('Couro arredondado','SUBSURF');sub.levels=1;sub.render_levels=2
        # Sole follows the boot outline, avoiding a cubical or inflated sphere appearance.
        sole=[B((.118*cos(2*pi*i/64),-.055+.202*sin(2*pi*i/64),-.066)) for i in range(65)]
        self.line('vira costurada da bota',sole,.011,'Bronze realce')
        sole=[B((.117*cos(2*pi*i/64),-.055+.20*sin(2*pi*i/64),-.090)) for i in range(65)]
        self.line('sola vulcanizada',sole,.018,'Bronze escuro escultura')
        for j in range(6):
            z=.025+j*.033;y=-.18+j*.011
            self.line('cadarco cruzado',[B((-.065,y,z)),B((.065,y-.007,z+.022))],.0055,'Bronze realce')
            self.line('cadarco cruzado',[B((.065,y,z)),B((-.065,y-.007,z+.022))],.0055,'Bronze realce')
        for side in [-1,1]:
            self.line('costura de couro',[B((side*.078,-.17,.0)),B((side*.078,-.12,.10)),B((side*.077,-.09,.22))],.003,'Bronze realce')
            for j in range(6):
                o=self.box('ranhura do solado',B((side*.105,-.20+j*.056,-.1)),(.025,.032,.018),'Bronze realce',.004);o.rotation_euler.z=yaw
        self.line('biqueira de protecao',[B((.09*cos(pi*i/20),-.11-.10*sin(pi*i/20),.025)) for i in range(21)],.004,'Bronze realce')
    def helmet(self,center,rot):
        c=Vector(center)
        def H(p):return c+rot.to_3x3()@Vector((p[0]*.74,p[1]*.85,p[2]))
        vs=[];nr=16;ns=64
        for j in range(nr+1):
            t=(j+.03)/(nr+.03)*pi/2
            for i in range(ns):
                q=2*pi*i/ns
                vs.append(tuple(self.P(H((.202*sin(t)*cos(q),.204*sin(t)*sin(q),.126+.172*cos(t))))))
        fs=[(j*ns+i,j*ns+(i+1)%ns,(j+1)*ns+(i+1)%ns,(j+1)*ns+i) for j in range(nr) for i in range(ns)]
        shell=M.mesh(self.name+' | casco continuo do capacete',vs,fs,'Bronze capacete',True)
        sol=shell.modifiers.new('Espessura do capacete','SOLIDIFY');sol.thickness=.008*self.scale
        brim=[]
        for i in range(65):
            q=2*pi*i/64;brim.append(H((.264*cos(q),.270*sin(q),.102-.033*sin(q))))
        self.line('borda dourada do capacete',brim,.011,'Dourado envelhecido')
        vs=[]
        for q in [2*pi*i/64 for i in range(64)]:
            for r in [0,1]:vs.append(tuple(self.P(H(((.195+.069*r)*cos(q),(.197+.073*r)*sin(q),.116-.014*r-.033*r*sin(q))))))
        M.mesh(self.name+' | aba continua com curvatura',vs,[(2*i,2*((i+1)%64),2*((i+1)%64)+1,2*i+1) for i in range(64)],'Bronze capacete',True)
        for x in [-.105,0,.105]:
            points=[]
            for j in range(25):
                t=-pi*.46+j*pi*.92/24
                y=.196*sin(t);z=.13+.176*cos(t)*math.sqrt(max(.1,1-(x/.24)**2))
                points.append(H((x,y,z)))
            self.line('nervura longitudinal do capacete',points,.0065,'Dourado envelhecido')
        shield=[(-.052,.137),(-.060,.236),(0,.278),(.060,.236),(.052,.137),(0,.11)]
        vs=[self.P(H((x,-.211,z))) for x,z in shield]
        M.mesh(self.name+' | placa heraldrica do capacete',vs,[tuple(range(6))],'Dourado envelhecido')
        self.line('borda do distintivo',[H((x,-.218,z)) for x,z in shield+[shield[0]]],.0035,'Bronze realce')
        self.line('chama no distintivo',[H((-.012,-.222,.158)),H((-.02,-.222,.20)),H((.003,-.222,.242)),H((.018,-.222,.197)),H((.012,-.222,.158))],.004,'Bronze escuro escultura')
        for side in [-1,1]:
            self.line('jugular de couro',[H((side*.18,.04,.10)),H((side*.155,-.10,-.08)),H((side*.055,-.13,-.17))],.008,'Bronze escuro escultura')
            self.uv('rebite da jugular',H((side*.19,-.005,.105)),(.011,.011,.011),'Bronze realce',16)
        self.uv('protecao da nuca',H((0,.155,.02)),(.17,.065,.10),'Bronze escuro escultura')
    def details(self,hip,top,arm_paths,leg_paths):
        hip,top=Vector(hip),Vector(top);axis=top-hip
        for side in [-1,1]:
            # Folded lapels and collar deliberately leave a visible neck.
            points=[top+Vector((side*.075,-.08,.058)),top+Vector((side*.18,-.11,-.04)),top+Vector((side*.082,-.177,-.14)),top+Vector((side*.02,-.15,-.02))]
            M.mesh(self.name+' | gola dobrada', [self.P(p) for p in points],[(0,1,2,3)],'Bronze realce',True,edge=.004)
            pocket=hip+axis*.62+Vector((side*.155,-.166,0))
            self.box('bolso do casaco',pocket,(.17,.035,.16),'Bronze escultura',.017)
            self.box('aba do bolso',pocket+Vector((0,-.015,.07)),(.18,.025,.045),'Bronze realce',.009)
            self.uv('botao do bolso',pocket+Vector((0,-.034,.065)),(.008,.005,.008),'Dourado envelhecido',12)
            strap=[hip+axis*t+Vector((side*(.15+.052*t),-.184,.02)) for t in [.05,.3,.6,.9]]
            self.line('arnes de seguranca',strap,.020,'Bronze escuro escultura')
            self.line('costura do arnes',[p+Vector((side*.012,-.002,0)) for p in strap],.0027,'Bronze realce')
            self.box('regulador do arnes',strap[2],(.065,.028,.067),'Dourado envelhecido',.008)
        self.line('ziper frontal',[hip+axis*t+Vector((0,-.18,.025)) for t in [.02,.25,.5,.75,.99]],.006,'Bronze escuro escultura')
        for j in range(5):self.uv('botao frontal',hip+axis*(.10+j*.18)+Vector((.027,-.185,.02)),(.008,.006,.008),'Dourado envelhecido',12)
        for j in [.12,.21]:
            self.line('faixa refletiva do casaco',[(hip.x+.259*cos(2*pi*i/96),hip.y+.164*sin(2*pi*i/96),hip.z+j) for i in range(97)],.012,'Dourado envelhecido')
        self.line('cinto com relevo',[(hip.x+.25*cos(2*pi*i/96),hip.y+.168*sin(2*pi*i/96),hip.z+.045) for i in range(97)],.025,'Bronze escuro escultura')
        b=hip+Vector((0,-.197,.045))
        self.box('fivela moldurada',b,(.102,.028,.075),'Dourado envelhecido',.010)
        self.box('centro da fivela',b+Vector((0,-.019,0)),(.070,.012,.044),'Bronze escuro escultura',.004)
        for side in [-1,1]:
            self.box('bolso cargo lateral',hip+Vector((side*.245,-.005,-.20)),(.135,.19,.23),'Bronze escultura',.018)
            self.box('aba do bolso cargo',hip+Vector((side*.25,-.11,-.11)),(.145,.032,.052),'Bronze realce',.008)
        for path in arm_paths:
            self.band(path,[.08,.19,.10],.73,.040);self.band(path,[.08,.19,.10],.83,.018)
        for path in leg_paths:
            self.band(path,[.164,.145,.102],.77,.047);self.band(path,[.164,.145,.102],.87,.020)
            knee=Vector(path[1])+Vector((0,-.119,0))
            self.uv('joelheira anatomica',knee,(.104,.024,.122),'Bronze escuro escultura')
            self.line('costura da joelheira',[(knee.x+.104*cos(2*pi*i/40),knee.y-.022,knee.z+.122*sin(2*pi*i/40)) for i in range(41)],.003,'Bronze realce')
            self.line('costura longitudinal da calca',[Vector(path_at(path,t))+Vector((.13,0,0)) for t in [i/25 for i in range(23)]],.0025,'Bronze escuro escultura')
        radio=hip+axis*.76+Vector((-.18,-.21,.02))
        self.box('radio detalhado',radio,(.10,.05,.18),'Bronze escuro escultura',.012)
        self.rod('antena do radio',radio+Vector((-.025,0,.09)),radio+Vector((-.025,0,.25)),.006,'Bronze escuro escultura')
        for j in range(5):self.line('ranhura do comunicador',[radio+Vector((-.03,-.03,-.04+j*.018)),radio+Vector((.03,-.03,-.04+j*.018))],.002,'Bronze realce')
        tank=hip+axis*.5+Vector((0,.235,0))
        self.box('placa dorsal do SCBA',tank,(.30,.055,.51),'Bronze escuro escultura',.025)
        self.rod('cilindro de ar dorsal',tank+Vector((0,.065,-.22)),tank+Vector((0,.065,.24)),.105,'Bronze capacete')
        self.uv('tampa superior do cilindro',tank+Vector((0,.065,.24)),(.105,.105,.08),'Bronze capacete')
        self.uv('tampa inferior do cilindro',tank+Vector((0,.065,-.22)),(.105,.105,.08),'Bronze escuro escultura')
        for z in [-.12,.12]:
            self.line('cinta do cilindro',[(tank.x+.108*cos(2*pi*i/48),tank.y+.065+.108*sin(2*pi*i/48),tank.z+z) for i in range(49)],.014,'Dourado envelhecido')
        self.rod('valvula reguladora',tank+Vector((0,.065,.29)),tank+Vector((0,.065,.35)),.027,'Bronze realce')
        self.line('mangueira respiratoria',[tank+Vector((.06,.07,.32)),top+Vector((.27,.05,0)),hip+axis*.6+Vector((.25,-.10,0)),hip+axis*.52+Vector((.12,-.22,0))],.016,'Bronze escuro escultura')
        # A small Maltese badge on the shoulder references the supplied uniform.
        for side in [-1,1]:
            arm=arm_paths[0 if side<0 else 1]
            shoulder=Vector(arm[1])+Vector((side*.035,-.11,.015))
            self.uv('distintivo vermelho da manga',shoulder,(.059,.014,.070),'Vermelho brasao')
            for dx,dz in [(0,.04),(.035,0),(0,-.04),(-.035,0)]:
                self.line('cruz dourada da manga',[shoulder+Vector((dx,-.017,dz)),shoulder+Vector((0,-.017,0))],.007,'Dourado envelhecido')
    def body(self,hips,shoulders,knees,ankles,elbows,wrists,head,kind='male',yaw=0,pitch=0,hand_dirs=None):
        torso,hip,top=self.torso(hips,shoulders)
        arms=[];legs=[];jacket=[torso]
        for i in range(2):
            root=Vector(shoulders[i])+Vector((.165 if i==0 else -.165,0,-.01))
            shoulder=Vector(shoulders[i])+Vector((0,0,-.095))
            arm=[root,shoulder,elbows[i],wrists[i]];arms.append(arm)
            jacket.append(self.cloth('manga continua',arm,[.08,.19,.100]))
            leg=[hips[i],knees[i],Vector(ankles[i])+Vector((0,0,.18))];legs.append(leg)
            self.cloth('calca continua com dobras',leg,[.164,.145,.102])
            self.boot(ankles[i],pi if kind=='operator' and i==1 else 0)
        self.unify(jacket,'casaco esculpido continuo')
        self.details(hip,top,arms,legs)
        face_kind='male' if kind=='operator' else kind
        obj,rot,center,size=A.head(self,head,yaw,pitch,face_kind)
        h=Vector(head)
        self.cloth('pescoco continuo',[h+Vector((0,.025,-.31)),h+Vector((0,.015,-.20)),h+Vector((0,0,-.105))],[.086,.085,.081],'Bronze escultura',ns=48,nr=22)
        collar=top+Vector((0,0,.02))
        self.line('gola espessa ajustada',[(collar.x+.117*cos(2*pi*i/64),collar.y+.116*sin(2*pi*i/64),collar.z+.035) for i in range(65)],.022,'Bronze escuro escultura')
        self.helmet(head,rot)
        for i in range(2):
            d=hand_dirs[i] if hand_dirs else Vector(wrists[i])-Vector(elbows[i])
            A.hand(self,wrists[i],d,-1 if i==0 else 1,curl=2.5 if kind=='operator' else .45,roll=-pi/2 if kind=='operator' else (-.20 if i==0 else .20))
        return self

def setup():
    for coll in M.SCENE.collection.children:
        if coll.name.startswith(('06A','06B','06C')):
            coll.hide_render=True;coll.hide_viewport=True
            coll.name='Arquivo v1 • '+coll.name
    for o in list(M.SCENE.objects):
        if 'Halligan' in o.name or o.name.startswith('Garra da ferramenta'):o.hide_render=True;o.hide_viewport=True
    M.material('Bronze escultura',(.115,.063,.027),metallic=.84,rough=.42,noise=210)
    M.material('Bronze escuro escultura',(.040,.024,.013),metallic=.76,rough=.37,noise=190)
    M.material('Bronze realce',(.31,.16,.047),metallic=.86,rough=.28)
    M.material('Dourado envelhecido',(.49,.285,.052),metallic=.80,rough=.29)
    M.material('Bronze capacete',(.105,.119,.128),metallic=.88,rough=.25)
    for name in ['Bronze escultura','Bronze escuro escultura']:
        for n in M.MAT[name].node_tree.nodes:
            if n.type=='BUMP':n.inputs['Strength'].default_value=.075;n.inputs['Distance'].default_value=.0017
    print('Versao anterior arquivada; materiais de escultura preparados')

def leader():
    f=Statue('06A v2 • Lider • escultura anatomica',(0,-.08,2.42),1.38)
    f.body([(-.135,.01,1.04),(.135,.01,1.04)],[(-.285,.015,1.77),(.285,.015,1.77)],
        [(-.18,-.012,.57),(.20,.07,.58)],[(-.23,-.03,.11),(.26,.08,.11)],
        [(-.345,-.012,1.43),(.355,-.015,1.43)],[(-.345,-.09,1.14),(.345,-.10,1.13)],
        (0,-.008,2.075),kind='leader',yaw=-.02,pitch=-.035)
    # The right hand holds the straight rescue tool down to the rock.
    f.rod('ferramenta de arrombamento',(-.35,-.105,.17),(-.35,-.105,1.24),.016,'Bronze escuro escultura')
    f.rod('lamina da ferramenta',(-.45,-.105,.21),(-.25,-.105,.21),.026,'Bronze realce',.012)
    f.line('garra da ferramenta',[(-.35,-.105,.22),(-.35,-.11,.12),(-.40,-.11,.10)],.017,'Bronze realce')
    return f

def operator():
    f=Statue('06B v2 • Operador da mangueira',(-1.72,-.05,2.42),1.38)
    f.body([(-.12,.02,.71),(.12,.02,.71)],[(-.25,-.11,1.30),(.25,-.11,1.30)],
        [(-.43,-.34,.55),(.21,.17,.12)],[(-.55,-.57,.11),(.30,.52,.105)],
        [(-.48,-.35,1.20),(.10,-.48,1.10)],[(-.68,-.52,1.25),(-.40,-.65,1.23)],
        (-.035,-.15,1.50),kind='operator',yaw=-.95,pitch=.02,
        hand_dirs=[(-1,-.2,.02),(-1,-.05,.04)])
    f.rod('esguicho conico',(-1.12,-.68,1.29),(-.53,-.59,1.245),.036,'Bronze escuro escultura',.056)
    a=Vector((-1.12,-.68,1.29));b=Vector((-.53,-.59,1.245))
    for j in range(4):
        t=.55+j*.08;p=a.lerp(b,t);d=(b-a).normalized()
        f.rod('anel de engate do esguicho',p-d*.009,p+d*.009,.059,'Dourado envelhecido')
    f.line('mangueira flexivel de combate',[(-.53,-.59,1.245),(-.12,-.59,1.04),(.42,-.31,.58),(.55,.29,.11),(.09,.69,.09),(-.61,.71,.09),(-.88,.34,.12)],.047,'Bronze escuro escultura')
    return f

def rescuer():
    f=Statue('06C v2 • Bombeira resgatando crianca',(1.56,-.08,2.42),1.07)
    f.body([(-.12,0,1.04),(.12,0,1.04)],[(-.258,0,1.77),(.258,0,1.77)],
        [(-.15,-.02,.57),(.17,.12,.58)],[(-.19,-.045,.11),(.22,.15,.11)],
        [(-.39,-.27,1.41),(.35,-.32,1.36)],[(-.05,-.48,1.51),(.13,-.46,1.20)],
        (-.025,-.015,2.075),kind='female',yaw=.13,pitch=-.08,
        hand_dirs=[(.85,-.05,.35),(-.8,0,.15)])
    # Hair visible below the nape and helmet, kept as continuous swept strands.
    for i in range(9):
        x=(i-4)*.018
        f.line('cabelo preso sob o capacete',[(x,.145,2.12),(x+.015,.19,1.98),(x+.04,.17,1.86)],.012,'Bronze escuro escultura')
    # The child is curled against her chest; head leans onto her left shoulder.
    f.cloth('roupa da crianca',[(.16,-.40,1.31),(.21,-.405,1.57),(.13,-.38,1.76)],[.13,.145,.10],'Bronze realce',ns=40,nr=26)
    _,rot,c,k=A.head(f,(.18,-.40,1.855),yaw=.42,pitch=.37,kind='child',size=.65)
    # Sculpted hair cap follows the small head instead of a second spherical head.
    # Hair is generated from the anatomical scalp by sculpt_anatomy.head.
    for a,b,c in [((.13,-.39,1.39),(-.11,-.50,1.22),(-.19,-.55,1.03)),((.23,-.37,1.38),(.02,-.59,1.18),(-.04,-.63,1.02))]:
        f.cloth('calca infantil dobrada',[a,b,c],[.065,.07,.045],'Bronze realce',ns=32,nr=26)
        f.uv('sapato infantil',Vector(c)+Vector((0,-.035,-.015)),(.058,.095,.043),'Bronze escuro escultura')
    for a,b,c in [((.12,-.40,1.76),(-.09,-.37,1.66),(-.17,-.24,1.76)),((.23,-.42,1.73),(.31,-.54,1.59),(.09,-.57,1.53))]:
        f.cloth('braco infantil',[a,b,c],[.044,.042,.028],'Bronze realce',ns=32,nr=26)
        from types import SimpleNamespace
        wrist=Vector(c)
        small=SimpleNamespace(M=M,name=f.name+' | crianca',P=lambda p,w=wrist:f.P(w+(Vector(p)-w)*.38))
        A.hand(small,wrist,Vector(c)-Vector(b),side=1,curl=.6)
    return f
