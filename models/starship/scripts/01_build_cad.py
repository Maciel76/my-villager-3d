"""Generate named, editable SolidCraft features (millimetres, Z up)."""
import json, math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
stages, bodies, finishes = [[], [], []], [], {}
stage = 0
def cmd(command, **params):
    stages[stage].append({'command': command, 'params': params})
def body(kind, name, material, **params):
    cmd('solid.' + kind, name=name, body_name=name, operation='new', **params)
    bodies.append(name)
    finishes.setdefault(material, []).append(name)
def box(name, mat, xyz, size):
    body('box', name, mat, center=xyz, length=size[0], width=size[1], height=size[2])
def cyl(name, mat, xyz, radius, height, axis='Z'):
    body('cylinder', name, mat, base=xyz, radius=radius, height=height, axis=axis)
def cone(name, mat, xyz, radius, top, height):
    body('cone', name, mat, base=xyz, radius=radius, top_radius=top, height=height)
def rod(name, mat, a, b, radius):
    v=[b[i]-a[i] for i in range(3)]
    cyl(name,mat,a,radius,math.sqrt(sum(n*n for n in v)),v)
def ring(name, mat, xyz, major, minor):
    body('torus', name, mat, center=xyz, major=major, minor=minor)

for name, value in [('L',72000),('W',60000),('D',9000),('BoosterH',65000),('ShipH',50000),('MountH',8500)]:
    cmd('parameters.add',name=name,expression=f'{value} mm')
box('STATIC_Foundation','Concrete',[0,0,400],['L','W',800])
box('STATIC_Apron','Concrete',[0,0,870],['L - 1200','W - 1200',140])
box('STATIC_ServiceRoad','Asphalt',[0,-25100,980],['L - 2400',6000,100])
cyl('STATIC_LandingPad','Landing',[21000,-6500,1040],11200,220)
ring('STATIC_LandingRing','Yellow',[21000,-6500,1270],10200,100)
for i in range(6):
    a=math.tau*i/6
    cyl(f'STATIC_MountLeg_{i}','SteelDark',[-5000+6500*math.cos(a),6500*math.sin(a),940],620,6500)
cyl('STATIC_LaunchTable','SteelDark',[-5000,0,7440],7900,1060)
cmd('solid.cylinder',radius='D/2 + 300',height=1400,base=[-5000,0,7300],operation='cut',targets=['STATIC_LaunchTable'],name='Flame aperture')
box('STATIC_Control','Navy',[-23000,-17000,3400],[16000,9000,4900])
box('STATIC_ControlRoof','SteelDark',[-23000,-17000,6000],[17000,10000,340])
box('STATIC_ControlGlass','Glass',[-23000,-21550,4100],[14200,120,1700])
for x in [15000,23500,30000]:
    cyl(f'STATIC_Cryotank_{x}','White',[x,20000,1040],2700,14500)
    cone(f'STATIC_CryoDome_{x}','White',[x,20000,15540],2700,700,1700)
    cyl(f'STATIC_CryoVent_{x}','Steel',[x,20000,17240],240,2000)
    rod(f'STATIC_Cryopipe_{x}','Steel',[x,16800,2000],[x,10500,2000],210)
box('STATIC_FlameDeflector','SteelDark',[-5000,0,1740],[12000,14000,1600])
box('STATIC_WaterReservoir','Blue',[-25000,21500,3000],[14000,10000,4200])

stage=1
for x in [-24500,-15500]:
    for y in [4000,13000]:
        box(f'STATIC_TowerColumn_{x}_{y}','SteelDark',[x,y,69700],[950,950,137000])
for k in range(12):
    z=3500+k*11500
    for y in [4000,13000]:
        box(f'STATIC_TowerBeamX_{k}_{y}','Steel',[-20000,y,z],[10000,650,650])
    for x in [-24500,-15500]:
        box(f'STATIC_TowerBeamY_{k}_{x}','Steel',[x,8500,z],[650,9000,650])
    if k<11:
        for y in [4000,13000]:
            a,b=(-24500,-15500) if k%2==0 else (-15500,-24500)
            rod(f'STATIC_TowerBraceX_{k}_{y}','Steel',[a,y,z],[b,y,z+11500],180)
        for x in [-24500,-15500]:
            a,b=(4000,13000) if k%2==0 else (13000,4000)
            rod(f'STATIC_TowerBraceY_{k}_{x}','Steel',[x,a,z],[x,b,z+11500],180)
box('STATIC_Elevator','Navy',[-25100,8500,69200],[1700,2700,136000])
box('STATIC_TowerCrown','White',[-20000,8500,139000],[11300,11300,1800])
box('STATIC_CatchRail','Yellow',[-15000,8500,70000],[500,6000,128000])
for side,y in [('L',-4000),('R',4000)]:
    box(f'ARM_{side}_Main','Yellow',[-11000,y,48000],[14000,1300,1700])
    box(f'ARM_{side}_Upper','Steel',[-11000,y,49600],[14000,400,400])
    for i in range(6):
        box(f'ARM_{side}_Brace_{i}','Steel',[-16500+i*2200,y,48800],[300,900,1800])
    cyl(f'ARM_{side}_Tip','SteelDark',[-4600,y,46700],850,3100)
box('QD_Main','Steel',[-11300,0,75500],[13000,1800,1300])
box('QD_Hose','Blue',[-7200,-1000,74500],[9000,450,500])

stage=2
cyl('BOOSTER_Hull','Steel',[-5000,0,'MountH'],'D/2','BoosterH - 1800')
cyl('BOOSTER_HotStage','SteelDark',[-5000,0,'MountH + BoosterH - 1800'],'D/2',1800)
for i in range(35):
    ring(f'BOOSTER_Weld_{i}','Weld',[-5000,0,f'MountH + {i} * 1800 + 500'],'D/2 + 10',22)
for i in range(12):
    a=math.tau*i/12
    box(f'BOOSTER_HotVent_{i}','Black',[-5000+4540*math.cos(a),4540*math.sin(a),72700],[400,400,1000])
# Thirty-three bells, arranged in three physically separated rings.
for count, radius in [(20,3350),(10,2050),(3,700)]:
    for i in range(count):
        a=math.tau*i/count
        x,y=-5000+radius*math.cos(a),radius*math.sin(a)
        cone(f'BOOSTER_Engine_{count}_{i}','Engine',[x,y,7300],460,240,1200)
        cyl(f'BOOSTER_Throat_{count}_{i}','Copper',[x,y,8500],220,320)
for i in range(4):
    a=math.tau*i/4+math.pi/4
    x,y=-5000+4600*math.cos(a),4600*math.sin(a)
    box(f'BOOSTER_GridFin_{i}','SteelDark',[x,y,69000],[4100,2700,350])
    for j in range(6):
        box(f'BOOSTER_GridBar_{i}_{j}','Steel',[x-1850+j*720,y,69240],[110,2600,180])
cyl('SHIP_Hull','Steel',[-5000,0,'MountH + BoosterH'],'D/2','ShipH - 12500')
# An ogive, built as tangent-looking frusta with 12 radial stations.
for i in range(12):
    t0,t1=i/12,(i+1)/12
    r0=4500*math.cos(t0*math.pi/2)
    r1=max(12,4500*math.cos(t1*math.pi/2))
    cone(f'SHIP_Nose_{i}','Steel',[-5000,0,f'MountH + BoosterH + ShipH - 12500 + {i*12500/12}'],r0,r1,12500/12)
for i in range(22):
    ring(f'SHIP_Weld_{i}','Weld',[-5000,0,f'MountH + BoosterH + {i*1650} + 500'],'D/2 + 10',20)
for i in range(6):
    a=math.tau*i/6
    r=2400 if i%2==0 else 1200
    x,y=-5000+r*math.cos(a),r*math.sin(a)
    cone(f'SHIP_Engine_{i}','Engine',[x,y,72000],850 if i%2==0 else 570,320,1500)
for side in [-1,1]:
    for level,height,span in [('Aft',77800,8500),('Forward',110800,5100)]:
        name=f'SHIP_Flap_{level}_{side}'
        # Sketch x is radial, sketch y is vertical; normal points into the thickness.
        plane={'origin':[-5000,-280,0],'x_dir':[1,0,0],'y_dir':[0,0,1]}
        cmd('sketch.create',plane=plane,name=name+'_profile')
        points=[[side*4100,height],[side*(4100+span),height+1200],[side*(4100+span*.70),height+7000],[side*4100,height+10500]]
        cmd('sketch.line',points=points,closed=True,infer=False)
        cmd('sketch.constraint.fix',entities=['l1','l2','l3','l4'],fixed=True)
        cmd('sketch.solve')
        cmd('sketch.finish')
        cmd('solid.extrude',distance=560,direction='symmetric',operation='new',name=name,body_name=name)
        bodies.append(name);finishes.setdefault('Black',[]).append(name)

colors={'Concrete':('#b7b7ae',0,.85),'Asphalt':('#29343c',0,.94),'Landing':('#35444b',.1,.9),
        'Yellow':('#f3ae38',.45,.36),'SteelDark':('#34454e',.7,.48),'Steel':('#bac7cf',.82,.32),
        'Weld':('#687a86',.85,.39),'Navy':('#142c3f',.4,.48),'Glass':('#48a7bd',.6,.22),
        'White':('#e0e8eb',.3,.48),'Blue':('#30798b',.4,.4),'Black':('#151d24',.25,.9),
        'Engine':('#514b4c',.85,.55),'Copper':('#ad8050',.8,.4)}
for material,names in finishes.items():
    col,metal,rough=colors[material]
    cmd('appearance.assign',bodies=names,color=col,name=material,pbr={'metallic':metal,'roughness':rough,'dielectric_ior':1.45})
for i,commands in enumerate(stages):
    (ROOT/'cad'/f'stage-{i+1}.json').write_text(json.dumps(commands,indent=2),encoding='utf-8')
(ROOT/'cad'/'parts.json').write_text(json.dumps({'bodies':bodies,'finishes':finishes,'colors':colors},indent=2),encoding='utf-8')
(ROOT/'design-plan.json').write_text(json.dumps({
    'units':'mm','base':[72000,60000,800],'foundationVolume':72000*60000*800,
    'boosterRadius':4500,'boosterCylinderHeight':63200,'boosterHullVolume':math.pi*4500**2*63200,
    'shipCylinderHeight':37500,'shipHullVolume':math.pi*4500**2*37500,
    'towerTop':139900,'stackTop':123500,'launchOrigin':[-5000,0,8500],
    'landingOrigin':[21000,-6500,1260],'bodyCount':len(bodies),
    'stages':[len(s) for s in stages]},indent=2),encoding='utf-8')
print('CAD stages:',[len(s) for s in stages],'bodies:',len(bodies))
