import bpy, math, random
from mathutils import Vector
from math import sin,cos,pi
random.seed(381)

def loft(name,a,b,r1,r2,mat='Bronze',ellipse=.88):
    a,b=Vector(a),Vector(b);axis=(b-a).normalized()
    n=axis.cross(Vector((0,1,0)))
    if n.length<.1:n=axis.cross(Vector((1,0,0)))
    n.normalize();v=axis.cross(n).normalized()
    vs=[];nr=18;ns=32
    for j in range(nr+1):
        t=j/nr;c=a.lerp(b,t);r=(r1*(1-t)+r2*t)*(1+.045*sin(t*29)+.022*sin(t*61))
        for i in range(ns):
            q=2*pi*i/ns
            relief=1+.025*sin(q*5+t*23)+.017*sin(q*11-t*37)
            vs.append(tuple(c+(n*cos(q)+v*sin(q)*ellipse)*r*relief))
    fs=[tuple(reversed(range(ns))),tuple(range(nr*ns,(nr+1)*ns))]
    for j in range(nr):
        for i in range(ns):fs.append((j*ns+i,j*ns+(i+1)%ns,(j+1)*ns+(i+1)%ns,(j+1)*ns+i))
    return M.mesh(name,vs,fs,mat,True)

def ring_axis(name,a,b,t,r,mat='Bronze luz',width=.045):
    a,b=Vector(a),Vector(b);axis=(b-a).normalized();c=a.lerp(b,t)
    loft(name,c-axis*width/2,c+axis*width/2,r,r,mat,.92)

class Figure:
    def __init__(self,name,origin,scale=1):
        self.name=name;self.origin=Vector(origin);self.scale=scale
        self.coll=M.collection(name)
        self.objects=[]
    def point(self,p):return self.origin+Vector(p)*self.scale
    def uv(self,label,p,scale,mat='Bronze',seg=24):
        return M.uv(self.name+' | '+label,self.point(p),tuple(v*self.scale for v in scale),mat,seg,16)
    def box(self,label,p,size,mat='Bronze',edge=.014):
        return M.box(self.name+' | '+label,self.point(p),tuple(v*self.scale for v in size),mat,edge*self.scale)
    def rod(self,label,a,b,r,mat='Bronze luz',r2=None):
        return M.cylinder(self.name+' | '+label,self.point(a),self.point(b),r*self.scale,mat,r2=None if r2 is None else r2*self.scale)
    def line(self,label,points,r=.012,mat='Bronze luz'):
        return M.curve(self.name+' | '+label,[self.point(p) for p in points],r*self.scale,mat)
    def limb(self,label,a,b,r1,r2,mat='Bronze'):
        return loft(self.name+' | '+label,self.point(a),self.point(b),r1*self.scale,r2*self.scale,mat)
    def band(self,label,a,b,t,r,mat='Bronze luz',w=.045):
        ring_axis(self.name+' | '+label,self.point(a),self.point(b),t,r*self.scale,mat,w*self.scale)
    def head(self,center,yaw=0,helmet=True,child=False):
        c=Vector(center);k=.63 if child else 1
        def P(p):
            x,y,z=[i*k for i in p]
            return c+Vector((x*cos(yaw)-y*sin(yaw),x*sin(yaw)+y*cos(yaw),z))
        def U(label,p,s,mat='Bronze luz'):
            o=self.uv(label,P(p),tuple(i*k for i in s),mat,32)
            o.rotation_euler.z=yaw
            return o
        U('cabeca esculpida',(0,0,0),(.193,.179,.237))
        U('mandibula',(0,-.060,-.115),(.153,.13,.12))
        U('queixo',(0,-.155,-.155),(.082,.050,.055))
        for s in [-1,1]:
            U('orelha',(s*.190,.005,-.005),(.039,.050,.074))
            U('cavidade da orelha',(s*.215,-.016,-.005),(.011,.025,.041),'Bronze escuro')
            U('maca do rosto',(s*.104,-.128,-.035),(.077,.065,.079))
            U('olho em bronze escuro',(s*.073,-.172,.049),(.040,.020,.021),'Bronze escuro')
            self.line('palpebra',[P((s*.112,-.173,.054)),P((s*.073,-.193,.069)),P((s*.035,-.179,.054))],.008*k,'Bronze luz')
            self.line('sobrancelha',[P((s*.118,-.165,.093)),P((s*.075,-.183,.104)),P((s*.030,-.172,.089))],.013*k,'Bronze')
        U('nariz',(0,-.185,.001),(.036,.065,.080))
        U('ponta do nariz',(0,-.239,-.026),(.045,.040,.029))
        self.line('linha da boca',[P((-.067,-.176,-.092)),P((0,-.205,-.099)),P((.067,-.176,-.092))],.008*k,'Bronze escuro')
        self.line('labio inferior',[P((-.041,-.188,-.112)),P((0,-.203,-.116)),P((.041,-.188,-.112))],.007*k,'Bronze luz')
        if child:
            U('cabelo infantil',(0,.015,.11),(.197,.173,.15),'Bronze escuro')
            for j in range(7):
                x=(j-3)*.046
                self.line('mecha de cabelo',[P((x,-.132,.17)),P((x+.025,-.174,.12)),P((x+.038,-.162,.075))],.012*k,'Bronze')
            return
        if helmet:
            U('casco do capacete',(0,.025,.205),(.255,.244,.178),'Bronze luz')
            U('aba do capacete',(0,-.005,.108),(.325,.310,.033),'Bronze')
            U('protetor de nuca',(0,.195,.045),(.235,.105,.112),'Bronze escuro')
            for s in [-1,1]:
                self.line('friso do capacete',[P((s*.13,-.17,.29)),P((s*.16,.01,.35)),P((s*.13,.20,.25))],.014,'Bronze')
                self.line('jugular',[P((s*.22,-.06,.08)),P((s*.16,-.18,-.12)),P((0,-.16,-.217))],.014,'Bronze escuro')
            self.line('crista do capacete',[P((0,-.227,.20)),P((0,-.13,.36)),P((0,.08,.397)),P((0,.24,.22))],.023,'Bronze luz')
            # Front identification shield, deliberately generic rather than an invented official crest.
            plate=self.box('distintivo frontal do capacete',P((0,-.274,.225)),(.14,.024,.15),'Bronze escuro',.020)
            plate.rotation_euler.z=yaw
            p=P((0,-.291,.230))
            o=M.text(self.name+' | numero 193','193',self.point(p),.062*self.scale,'Bronze luz',extrude=.003)
            o.rotation_euler=(pi/2,0,yaw)
    def hand(self,wrist,direction=(0,-.2,-1),label='luva'):
        w=Vector(wrist);d=Vector(direction).normalized()
        side=d.cross(Vector((0,-1,0)))
        if side.length<.1:side=Vector((1,0,0))
        side.normalize()
        center=w+d*.09
        palm=self.uv(label+' palma',center,(.096,.062,.124),'Bronze',20)
        palm.rotation_euler=d.to_track_quat('Z','Y').to_euler()
        normal=d.cross(side).normalized()
        for i in range(4):
            start=center+side*((i-1.5)*.043)+d*.065
            joint=start+d*(.075-abs(i-1.3)*.009)
            end=joint+d*.040+normal*.027
            self.rod(label+' dedo proximal',start,joint,.022,'Bronze luz',.019)
            self.rod(label+' ponta do dedo',joint,end,.019,'Bronze',.014)
            self.uv(label+' articulacao',joint,(.022,.022,.022),'Bronze luz',12)
        a=center-side*.087-d*.03;b=a-side*.055+d*.06;c=b+d*.055+normal*.025
        self.rod(label+' polegar',a,b,.027,'Bronze luz',.022)
        self.rod(label+' polegar distal',b,c,.022,'Bronze',.017)
    def boot(self,ankle,yaw=0):
        a=Vector(ankle)
        self.uv('bota corpo',a+Vector((0,-.09,-.01)),(.158,.275,.143),'Bronze escuro')
        self.box('solado da bota',a+Vector((0,-.09,-.09)),(.33,.54,.075),'Bronze escuro',.036)
        self.limb('cano da bota',a,a+Vector((0,.015,.34)),.14,.155,'Bronze escuro')
        self.band('borda do cano',a,a+Vector((0,0,.4)),.79,.155,'Bronze luz',.024)
        for j in range(4):
            z=a.z+.03+j*.045
            self.line('cadarco',[a+Vector((-.105,-.19,z-a.z)),a+Vector((0,-.225,z-a.z+.012)),a+Vector((.105,-.19,z-a.z))],.009,'Bronze luz')
        for x in [-.13,.13]:
            for j in range(4):
                self.box('dente do solado',a+Vector((x,-.24+j*.11,-.125)),(.035,.07,.035),'Bronze',.005)
    def body(self,hips,shoulders,knees,ankles,elbows,wrists,head,head_yaw=0):
        hips=[Vector(p) for p in hips];shoulders=[Vector(p) for p in shoulders]
        hip=(hips[0]+hips[1])/2;chest=(shoulders[0]+shoulders[1])/2
        axis=chest-hip
        # Tailored jacket surface with continuous ring topology and small cast fabric folds.
        vs=[];nr=28;ns=48
        for j in range(nr+1):
            t=j/nr;c=hip+axis*t+Vector((0,0,-.10+.14*t))
            rx=.34+.10*sin(pi*t*.75);ry=.215+.025*sin(pi*t)
            if t>.88:rx*=1-(t-.88)*1.6
            for i in range(ns):
                q=2*pi*i/ns;fold=.009*sin(q*7+t*34)+.006*sin(q*13-t*49)
                vs.append(tuple(self.point(c+Vector(((rx+fold)*cos(q),(ry+fold)*sin(q),.005*sin(q*9+t*12))))))
        fs=[tuple(reversed(range(ns))),tuple(range(nr*ns,(nr+1)*ns))]
        for j in range(nr):
            for i in range(ns):fs.append((j*ns+i,j*ns+(i+1)%ns,(j+1)*ns+(i+1)%ns,(j+1)*ns+i))
        M.mesh(self.name+' | casaco com pregas esculpidas',vs,fs,'Bronze',True)
        self.uv('quadril da calca',hip,(.33,.23,.22))
        for s in range(2):
            h,k,a=hips[s],Vector(knees[s]),Vector(ankles[s])
            shoulder,elbow,wrist=shoulders[s],Vector(elbows[s]),Vector(wrists[s])
            self.limb('coxa com tecido',h,k,.22,.177)
            self.uv('joelho articulado',k,(.18,.17,.18))
            self.limb('calca perna',k,a+Vector((0,0,.20)),.178,.145)
            self.band('faixa inferior da calca',k,a,.65,.164,w=.065)
            self.band('filete da faixa',k,a,.70,.164,'Bronze escuro',.014)
            self.line('costura lateral da calca',[h+Vector(((-1 if s==0 else 1)*.19,0,0)),k+Vector(((-1 if s==0 else 1)*.17,0,0)),a+Vector(((-1 if s==0 else 1)*.14,0,.23))],.009,'Bronze escuro')
            self.uv('ombreira',shoulder,(.215,.20,.20))
            self.limb('manga superior',shoulder,elbow,.205,.145)
            self.uv('cotovelo',elbow,(.15,.14,.145))
            self.limb('manga antebraco',elbow,wrist,.155,.12)
            self.band('faixa da manga',elbow,wrist,.67,.142,w=.06)
            self.band('punho da manga',elbow,wrist,.94,.125,'Bronze escuro',.035)
            for j in [.2,.33,.46]:self.band('prega do cotovelo',elbow,wrist,j,.158-.03*j,'Bronze luz',.012)
            self.boot(a)
        neck=Vector(head)+Vector((0,0,-.24))
        self.limb('pescoco',chest+Vector((0,0,.05)),neck,.145,.12,'Bronze luz')
        self.uv('gola alta',chest+Vector((0,-.005,.10)),(.22,.19,.11),'Bronze escuro')
        self.head(head,head_yaw)
        # Zipper, storm flap, reflective trim, chest pockets and belt hardware.
        front=.247
        points=[hip+axis*t+Vector((0,-front,.04)) for t in [.04,.25,.5,.75,.98]]
        self.line('fecho central do casaco',points,.018,'Bronze escuro')
        for i in range(7):
            p=hip+axis*(.10+i*.125)+Vector((.042,-.248,.025))
            self.uv('botao de pressao',p,(.019,.010,.019),'Bronze luz',12)
        for side in [-1,1]:
            p=hip+axis*.64+Vector((side*.20,-.249,0))
            self.box('bolso peitoral',p,(.225,.055,.19),'Bronze',.024)
            self.box('aba do bolso',p+Vector((0,-.018,.085)),(.24,.055,.056),'Bronze luz',.011)
            self.uv('botao do bolso',p+Vector((0,-.052,.070)),(.017,.01,.017),'Bronze escuro',12)
            line=[hip+axis*t+Vector((side*(.14+.17*t),-.25,.025)) for t in [.05,.3,.6,.92]]
            self.line('tira do suspensor',line,.024,'Bronze escuro')
            self.line('friso do suspensor',[p+Vector((side*.025,-.004,0)) for p in line],.008,'Bronze luz')
        belt_z=hip.z+.04
        self.line('cinto operacional',[(hip.x+.35*cos(2*pi*i/64),hip.y+.234*sin(2*pi*i/64),belt_z) for i in range(65)],.045,'Bronze escuro')
        self.box('fivela do cinto',(hip.x,hip.y-.27,belt_z),(.13,.04,.10),'Bronze luz',.012)
        for side in [-1,1]:
            self.box('bolso utilitario',(hip.x+side*.32,hip.y-.02,hip.z-.15),(.15,.23,.29),'Bronze escuro',.026)
            self.box('fecho do bolso',(hip.x+side*.32,hip.y-.145,hip.z-.11),(.10,.03,.04),'Bronze luz',.006)
        # SCBA backplate, air bottle, valve, harness and breathing hose.
        tank=hip+axis*.48+Vector((0,.35,0))
        self.box('placa dorsal SCBA',tank,(.42,.09,.65),'Bronze escuro',.035)
        self.limb('cilindro de ar comprimido',tank+Vector((0,.11,-.31)),tank+Vector((0,.11,.35)),.145,.145,'Bronze luz')
        self.uv('calota do cilindro',tank+Vector((0,.11,.34)),(.145,.145,.12),'Bronze luz')
        self.uv('fundo do cilindro',tank+Vector((0,.11,-.31)),(.145,.145,.12),'Bronze escuro')
        for z in [-.16,.20]:self.band('cinta do cilindro',tank+Vector((0,.11,-.35)),tank+Vector((0,.11,.4)),(z+.35)/.75,.152,'Bronze escuro',.055)
        self.rod('valvula do cilindro',tank+Vector((0,.11,.41)),tank+Vector((0,.11,.49)),.05,'Bronze')
        self.line('mangueira respiratoria',[tank+Vector((.06,.1,.46)),chest+Vector((.39,.20,.03)),hip+axis*.55+Vector((.40,-.17,.02)),hip+axis*.53+Vector((.20,-.30,0))],.026,'Bronze escuro')
        for side in [-1,1]:
            self.line('arnes sobre os ombros',[tank+Vector((side*.15,0,.29)),chest+Vector((side*.29,.10,.14)),chest+Vector((side*.30,-.18,.05)),hip+Vector((side*.19,-.26,.15))],.039,'Bronze escuro')
        # Radio with grille and antenna.
        radio=hip+axis*.75+Vector((-.26,-.30,.03))
        self.box('radio comunicador',radio,(.14,.075,.23),'Bronze escuro',.015)
        self.rod('antena do radio',radio+Vector((-.035,0,.10)),radio+Vector((-.035,0,.36)),.012,'Bronze escuro')
        for j in range(4):self.line('grelha do radio',[radio+Vector((-.044,-.044,-.04+j*.025)),radio+Vector((.044,-.044,-.04+j*.025))],.005,'Bronze luz')
        self.line('faixa inferior do casaco',[(hip.x+.34*cos(2*pi*i/64),hip.y+.22*sin(2*pi*i/64),hip.z+.14) for i in range(65)],.026,'Bronze luz')

def central():
    f=Figure('06A • Bombeiro central em bronze',(0,-.10,2.35),1.07)
    f.body([(-.20,0,1.43),(.20,0,1.43)],[(-.43,0,2.32),(.43,0,2.32)],
           [(-.28,-.025,.79),(.30,.12,.80)],[(-.36,-.07,.15),(.37,.12,.15)],
           [(-.50,-.055,1.88),(.52,-.09,1.86)],[(-.49,-.18,1.43),(.51,-.20,1.41)],(0,-.015,2.80),-.02)
    f.hand((-.49,-.18,1.43),(-.05,-.12,-1));f.hand((.51,-.20,1.41),(.08,-.08,-1))
    for side in [-1,1]:
        f.rod('mosquetao no cinto',(side*.31,-.25,1.46),(side*.32,-.26,1.24),.018,'Bronze luz')
    return f

def hose_operator():
    f=Figure('06B • Bombeiro ajoelhado com mangueira',(-1.90,-.20,2.35),1.02)
    f.body([(-.18,.06,.89),(.18,.06,.89)],[(-.34,-.06,1.72),(.34,-.06,1.72)],
           [(-.58,-.36,.76),(.30,.18,.18)],[(-.74,-.62,.15),(.42,.63,.14)],
           [(-.68,-.40,1.57),(.14,-.59,1.48)],[(-.94,-.61,1.65),(-.57,-.75,1.67)],(-.05,-.11,2.15),-.90)
    f.hand((-.94,-.61,1.65),(-1,-.25,.07),'luva no esguicho')
    f.hand((-.57,-.75,1.67),(-1,-.1,.09),'luva na mangueira')
    f.rod('esguicho de combate',(-1.57,-.74,1.73),(-.76,-.65,1.67),.061,'Bronze escuro',.082)
    for i in range(5):
        a=Vector((-1.57,-.74,1.73));b=Vector((-.76,-.65,1.67));p=a.lerp(b,.43+i*.075)
        f.band('anel de acoplamento',a,b,.43+i*.075,.086,'Bronze luz',.024)
    f.line('mangueira de incendio',[(-.76,-.65,1.67),(-.2,-.64,1.49),(.57,-.38,.67),(.77,.21,.10),(.25,.81,.08),(-.68,.80,.08),(-1.11,.21,.10)],.064,'Bronze escuro')
    return f

def rescue():
    f=Figure('06C • Bombeiro em resgate com crianca',(1.86,-.08,2.35),1.04)
    f.body([(-.18,0,1.39),(.18,0,1.39)],[(-.38,0,2.27),(.38,0,2.27)],
           [(-.23,-.08,.77),(.30,.18,.80)],[(-.28,-.11,.15),(.37,.23,.15)],
           [(-.49,-.47,1.98),(.57,-.43,2.06)],[(-.02,-.72,1.98),(.34,-.72,2.30)],(-.035,-.04,2.72),.22)
    f.hand((-.02,-.72,1.98),(1,0,.2),'luva de apoio')
    f.hand((.34,-.72,2.30),(.4,0,.8),'luva de resgate')
    # Child held in both arms: separate sculpted body, clothes and articulated limbs.
    f.limb('crianca torso',(-.22,-.77,2.12),(.28,-.76,2.42),.13,.14,'Bronze luz')
    f.head((.43,-.79,2.56),.3,False,True)
    for a,b,c in [((-.20,-.77,2.14),(-.46,-.82,1.98),(-.36,-.85,1.78)),((-.23,-.70,2.14),(-.60,-.65,2.01),(-.51,-.58,1.83))]:
        f.limb('crianca perna superior',a,b,.078,.067,'Bronze luz')
        f.uv('crianca joelho',b,(.07,.07,.07),'Bronze luz')
        f.limb('crianca perna inferior',b,c,.067,.048,'Bronze luz')
        f.uv('sapato infantil',Vector(c)+Vector((0,-.04,-.02)),(.065,.11,.055),'Bronze escuro')
    for a,b,c in [((.18,-.77,2.42),(.02,-.95,2.30),(.13,-.98,2.13)),((.21,-.71,2.42),(.37,-.57,2.36),(.37,-.38,2.48))]:
        f.limb('crianca braco',a,b,.055,.045,'Bronze luz');f.limb('crianca antebraco',b,c,.045,.035,'Bronze luz')
        f.uv('mao infantil',c,(.046,.037,.055),'Bronze luz',20)
    for j in range(4):f.line('pregas da roupa infantil',[(-.13+j*.08,-.90,2.18+j*.045),(-.07+j*.08,-.92,2.26+j*.045),(.01+j*.08,-.89,2.27+j*.045)],.009,'Bronze')
    return f

def rocks():
    M.collection('06D • Base rochosa e fixacao das esculturas')
    # Jagged continuous cast base, with a shallow bronze footing and overlapping stone facets.
    M.rounded_rect('Base fundida das esculturas',6.24,2.35,2.29,.11,.55,'Bronze escuro',center=(0,-.08),edge=.025)
    for i in range(43):
        x=random.uniform(-2.95,2.95);y=random.uniform(-1.02,.94)
        z=2.34
        o=M.ico('Rocha fundida com marcas de cinzel',(x,y,z),(random.uniform(.24,.55),random.uniform(.20,.43),random.uniform(.10,.20)),'Bronze',2)
        o.rotation_euler=(random.uniform(-.25,.25),random.uniform(-.25,.25),random.uniform(0,pi))
    for x in [-2.3,-.5,.5,2.3]:
        for y in [-.97,.91]:
            M.box('Chapa de fixacao das esculturas',(x,y,2.315),(.25,.20,.025),'Aco estrutural',.01)
            for dx in [-.075,.075]:M.cylinder('Porca de ancoragem',(x+dx,y,2.327),(x+dx,y,2.365),.025,'Bronze luz',vertices=6)
    print('Base rochosa concluida')
