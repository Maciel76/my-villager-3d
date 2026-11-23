"""Named SolidCraft CAD features: 60 x 48 m fire station, millimetres / Z-up."""
import json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
stages=[[],[],[]];stage=0;finishes={};parts=[]
def command(cmd,**params):stages[stage].append({'command':cmd,'params':params})
def solid(kind,name,finish,rig='static',**params):
    full=f'{rig}-{finish}-{name}'
    command('solid.'+kind,name=full,body_name=full,operation='new',**params)
    finishes.setdefault(finish,[]).append(full);parts.append({'name':full,'finish':finish,'rig':rig});return full
def box(name,finish,at,size,rig='static'):
    return solid('box',name,finish,rig,center=at,length=size[0],width=size[1],height=size[2])
def cylinder(name,finish,base,r,h,axis='Z',rig='static'):
    return solid('cylinder',name,finish,rig,base=base,radius=r,height=h,axis=axis)
def rod(name,finish,a,b,r,rig='static'):
    d=[b[i]-a[i] for i in range(3)];return cylinder(name,finish,a,r,math.sqrt(sum(v*v for v in d)),d,rig)
def ring(name,finish,at,r,tube,rig='static'):
    return solid('torus',name,finish,rig,center=at,major=r,minor=tube)
for name,value in [('L',60000),('W',48000),('T',450),('TowerH',22000)]:command('parameters.add',name=name,expression=f'{value} mm')
box('Foundation','concrete',[0,0,'T/2'],['L','W','T'])
box('Apron','asphalt',[0,-12500,505],['L - 1600',20200,110])
box('Sidewalk','paving',[0,'-W/2 + 1200',590],['L - 1200',1600,270])
box('GarageFloor','concrete',[-11000,7500,650],[34800,19500,400])
box('GarageBackWall','ivory',[-11000,17250,3890],[34800,380,6100])
box('GarageWestWall','ivory',[-28200,7500,3890],[400,19500,6100])
box('GarageEastWall','ivory',[6200,7500,3890],[400,19500,6100])
box('GarageRoof','charcoal',[-11000,7500,7120],[36000,20700,400])
box('GarageRoofRedTrim','red',[-11000,7500,7460],[36300,21000,300])
box('GarageFrontFascia','red',[-11000,-2400,7140],[36000,600,1880])
box('GarageLightCanopy','ivory',[-11000,-3200,6080],[35500,2500,180])
for i,x in enumerate([-27600,-20200,-12800,-5400,2000,6200]):
    box(f'GaragePier{i}','ivory',[x,-2100,3440],[500,750,5600])
    box(f'PierBase{i}','charcoal',[x,-2100,1050],[650,900,460])
# The dispatch/admin block is separate from the apparatus hall.
box('AdminCore','ivory',[18100,4900,4550],[17800,18300,7900])
box('AdminRedSpine','red',[25500,4900,4650],[2600,18400,8100])
box('AdminGlassGround','glass',[17000,-4340,2400],[12500,100,2800])
box('AdminGlassUpper','glass',[17000,-4350,6100],[12500,100,2300])
box('AdminGlassEast','glass',[27050,3500,6050],[90,11100,2150])
box('AdminCanopy','charcoal',[17200,-5500,4200],[15100,3200,240])
box('AdminRoof','charcoal',[18100,4900,8670],[18800,19300,400])
box('AdminCornice','ivory',[18100,4900,9030],[19200,19700,300])
box('AdminEntranceRedPortal','red',[16900,-4450,3850],[3600,450,5900])
box('EntranceDoors','glass',[16900,-4750,2300],[2850,90,3250])
box('EntranceThreshold','paving',[17100,-6800,700],[7000,3800,500])
# Training / hose drying tower with a visible stair and rappel frame.
box('TrainingTower','red',[-23500,19100,'TowerH/2 + 500'],[7000,6600,'TowerH'])
box('TowerCap','ivory',[-23500,19100,'TowerH + 720'],[7700,7300,440])
box('TowerRoof','charcoal',[-23500,19100,'TowerH + 980'],[8000,7600,180])
box('TowerStairBlock','ivory',[-27600,19000,6900],[1600,6500,12800])
box('ServiceShed','ivory',[12000,18400,2250],[10400,6700,3500])
box('ServiceShedRoof','charcoal',[12000,18400,4100],[11000,7300,260])
for j in range(3):
    cylinder(f'ReserveWater{j}','steel',[21100+j*2900,18700,480],1050,3300)
    cylinder(f'ReserveTankCap{j}','charcoal',[21100+j*2900,18700,3780],1120,180)

stage=1
bay_centers=[-23900,-16500,-9100,-1700]
for i,x in enumerate(bay_centers):
    # Raised sectional doors expose the vehicles; the last door remains halfway down.
    for j in range(4 if i<3 else 9):
        box(f'BayDoor{i}Slat{j}','door',[x,-2310,5750-j*220],[6550,140,200])
    box(f'BayDoor{i}Glazing','garageGlass',[x,-2410,5600],[5900,60,220])
    for side in [-1,1]:
        box(f'BayDoor{i}Guide{side}','steel',[x+side*3320,-2330,3330],[90,210,5150])
        for j in range(5):
            box(f'Bay{i}BollardStripe{side}_{j}','yellow' if j%2==0 else 'charcoal',[x+side*3070,-2820,890+j*170],[220,160,150])
    box(f'Bay{i}FloorLine','yellow',[x-3200,-10100,569],[110,14300,14])
    for y in [-16500,-15000,-13500]:
        box(f'Bay{i}ApronStop{y}','white',[x,y,570],[4700,120,14])
    box(f'Bay{i}CeilingLight','warm',[x,3500,6740],[3200,480,140])
for row in [0,1]:
    z=1800+row*3700
    for i,x in enumerate([11000,14000,20000,23000]):
        box(f'AdminMullion{row}_{i}','ivory',[x,-4440,z+500],[90,140,2800 if row==0 else 2300])
for y in [-1300,1600,4500,7400,10300]:
    box(f'AdminEastMullion{y}','ivory',[27120,y,6050],[130,90,2250])
for z in [4200,7850]:box(f'AdminHorizontalBand{z}','ivory',[17400,-4460,z],[13900,180,180])
for i in range(10):
    box(f'SunshadeFin{i}','charcoal',[10400+i*1460,-4610,7670],[120,650,570])
for i in range(4):
    box(f'SolarPanel{i}','solar',[13300+(i%2)*6000,2400+(i//2)*6500,9400],[5000,5000,140])
    for j in range(5):box(f'SolarGrid{i}_{j}','steel',[13300+(i%2)*6000,400+(i//2)*6500+j*1000,9480],[5000,25,15])
for i in range(5):
    z=2700+i*3900
    box(f'TowerTrainingOpening{i}','charcoal',[-23500,15750,z],[3750,100,2000])
    box(f'TowerSill{i}','ivory',[-23500,15580,z-1050],[4300,500,190])
    box(f'TowerLandingStripe{i}','yellow',[-23500,15550,z-940],[3500,80,80])
    for x in [-24850,-22150]:
        rod(f'TowerRail{i}_{x}','steel',[x,15400,z-930],[x,15400,z-150],50)
    rod(f'TowerHandrail{i}','steel',[-24900,15400,z-150],[-22100,15400,z-150],50)
for x in [-26100,-20900]:
    rod(f'RappelPost{x}','charcoal',[x,16300,22500],[x,16300,23900],140)
rod('RappelCrossbar','charcoal',[-26100,16300,23900],[-20900,16300,23900],160)
for x in [-25400,-21600]:rod(f'RappelRope{x}','tan',[x,16200,23600],[x,15100,2500],25)
for i in range(8):
    box(f'HoseRack{i}','steel',[9200+i*850,15000,1850],[90,700,2400])
    rod(f'HoseRoll{i}','tan',[9200+i*850,14600,1600],[9200+i*850,15100,1600],270)
for x in [-28400,28300]:
    for y in [-20300,7800,21400]:
        cylinder(f'FloodPole{x}_{y}','steel',[x,y,500],90,5700)
        box(f'FloodLight{x}_{y}','warm',[x,y,6280],[800,450,180])
for x in [-26400,26400]:
    cylinder(f'Hydrant{x}','red',[x,-18400,500],180,1030)
    cylinder(f'HydrantCap{x}','red',[x,-18400,1530],240,100)
    cylinder(f'HydrantOutlet{x}','steel',[x-330,-18400,1190],95,660,'X')
    for side in [-1,1]:box(f'HydrantBollard{x}_{side}','yellow',[x+side*650,-18300,950],[150,150,900])
for i in range(8):
    x=10500+i*2050
    box(f'VisitorParking{i}','white',[x,-16000,571],[70,7200,15])
box('VisitorAccessible','blue',[11500,-16000,578],[1700,2200,18])
for y in [-20900,21500]:
    for x in [-19000,-4000,16000]:
        box(f'Planter{x}_{y}','concrete',[x,y,800],[3600,1300,600])
        box(f'PlanterSoil{x}_{y}','soil',[x,y,1120],[3250,1000,90])
        for k in range(5):
            cylinder(f'Plant{x}_{y}_{k}','green',[x-1200+k*600,y,1150],330,400+(k%2)*180)
for x in [-29200,29200]:
    box(f'SideFence{x}','charcoal',[x,7500,1530],[100,29500,1900])
for i in range(17):
    box(f'RearFencePost{i}','steel',[-28200+i*3500,23200,1650],[100,110,2200])
for z in [1000,2350]:rod(f'RearFenceRail{z}','steel',[-28800,23200,z],[28800,23200,z],38)
for x in [9200,11100,13000]:
    cylinder(f'Flagpole{x}','steel',[x,-10200,700],45,7900)
    box(f'Flag{x}','green' if x==9200 else 'white' if x==11100 else 'red',[x+700,-10200,7500],[1400,60,1000])

stage=2
def truck(index,x,y,kind):
    rig=f'truck{index}'
    # Front faces -Y. Wheels and steps are true cylindrical/solid CAD features.
    box('Chassis','charcoal',[x,y,1170],[2450,8200,340],rig)
    box('Cab','red',[x,y-2700,2360],[2580,2700,2500],rig)
    box('CabRoof','red',[x,y-2650,3690],[2700,2800,180],rig)
    box('Windshield','vehicleGlass',[x,y-4080,2930],[2250,75,1060],rig)
    box('CabRear','vehicleGlass',[x,y-1370,2860],[1700,65,740],rig)
    for side in [-1,1]:
        box(f'CabWindow{side}','vehicleGlass',[x+side*1300,y-2650,2910],[70,1900,950],rig)
        box(f'CabDoorStripe{side}','white',[x+side*1308,y-2600,2110],[45,2250,190],rig)
        box(f'CabHandle{side}','steel',[x+side*1360,y-1950,2250],[70,280,60],rig)
        box(f'CabStep{side}','steel',[x+side*1390,y-2900,1110],[300,1800,130],rig)
        box(f'Mirror{side}','charcoal',[x+side*1510,y-3750,2810],[180,230,370],rig)
        rod(f'MirrorArm{side}','steel',[x+side*1250,y-3550,2710],[x+side*1490,y-3750,2810],35,rig)
    box('Grille','charcoal',[x,y-4130,1760],[1750,65,480],rig)
    for j in range(5):box(f'GrilleBar{j}','steel',[x,y-4180,1580+j*90],[1600,50,26],rig)
    box('FrontBumper','steel',[x,y-4300,1250],[2750,230,250],rig)
    for side in [-1,1]:
        box(f'Headlight{side}','warm',[x+side*970,y-4170,1850],[320,65,240],rig)
        box(f'EmergencyFront{side}','siren',[x+side*780,y-4180,2270],[180,65,100],rig)
    box('SirenBridge','charcoal',[x,y-2800,3850],[1800,420,130],rig)
    for side in [-1,1]:box(f'Siren{side}','siren',[x+side*650,y-2800,3980],[520,360,160],rig)
    for axle,zoff in enumerate([-2700,2150,3150] if kind=='ladder' else [-2700,2650]):
        for side in [-1,1]:
            cylinder(f'Tire{axle}_{side}','rubber',[x+side*1150,y+zoff,1020],600,280,[side,0,0],rig)
            cylinder(f'Wheel{axle}_{side}','steel',[x+side*1440,y+zoff,1020],330,35,[side,0,0],rig)
            cylinder(f'WheelHub{axle}_{side}','charcoal',[x+side*1480,y+zoff,1020],120,45,[side,0,0],rig)
            for j in range(6):
                a=math.tau*j/6
                cylinder(f'WheelBolt{axle}_{side}_{j}','steel',[x+side*1525,y+zoff+225*math.cos(a),1020+225*math.sin(a)],28,25,[side,0,0],rig)
    color='white' if kind=='rescue' else 'red'
    box('EquipmentBody',color,[x,y+1350,2280],[2520,4900,2200],rig)
    box('EquipmentRoof','steel',[x,y+1350,3440],[2600,5000,110],rig)
    for side in [-1,1]:
        box(f'BodyStripe{side}','white' if kind!='rescue' else 'red',[x+side*1270,y+1350,2510],[50,4750,220],rig)
        for compartment in range(3):
            cy=y-200+compartment*1550
            box(f'Compartment{side}_{compartment}','door',[x+side*1290,cy,2060],[65,1390,1450],rig)
            for j in range(6):box(f'ShutterSlat{side}_{compartment}_{j}','steel',[x+side*1330,cy,1510+j*200],[30,1350,24],rig)
            box(f'ShutterHandle{side}_{compartment}','charcoal',[x+side*1350,cy,1390],[40,350,65],rig)
    box('RearBumper','steel',[x,y+3930,1190],[2700,220,220],rig)
    for side in [-1,1]:
        box(f'RearLamp{side}','siren',[x+side*1020,y+3860,1950],[240,80,270],rig)
    if kind=='ladder':
        cylinder('LadderTurntable','charcoal',[x,y+600,3500],850,310,rig=rig)
        for height,width,length in [(3950,1600,7800),(4200,1200,6500),(4450,800,5200)]:
            for side in [-1,1]:
                rod(f'LadderRail{height}_{side}','steel',[x+side*width/2,y-length/2,height],[x+side*width/2,y+length/2,height],75,rig)
            for k in range(int(length/450)):
                rod(f'LadderRung{height}_{k}','steel',[x-width/2,y-length/2+k*450,height],[x+width/2,y-length/2+k*450,height],42,rig)
        box('LadderBasket','white',[x,y-3850,4580],[2200,1200,850],rig)
    else:
        for k in range(3):
            rod(f'RoofHose{k}','tan',[x-750+k*750,y-800,3680],[x-750+k*750,y+3100,3680],130,rig)
        cylinder('RoofMonitor','red',[x,y+1100,3490],180,400,rig=rig)
        rod('MonitorNozzle','steel',[x,y+1100,3890],[x,y+300,4180],95,rig)
        for side in [-1,1]:
            cylinder(f'PumpOutlet{side}','steel',[x+side*1350,y+350,2330],140,150,[side,0,0],rig)
truck(0,-23900,-9100,'pumper')
truck(1,-16500,4300,'pumper')
truck(2,-9100,4300,'ladder')
truck(3,-1700,4300,'rescue')

colors={'concrete':('#a9afa9',0,.88),'asphalt':('#343b40',0,.96),'paving':('#d1cdc0',0,.86),
 'ivory':('#ece8dc',.03,.68),'white':('#eef0e8',.05,.55),'red':('#b91423',.22,.38),
 'charcoal':('#26323b',.45,.55),'steel':('#aab9c2',.8,.29),'door':('#9eabb0',.55,.58),
 'glass':('#3c879e',.45,.21),'garageGlass':('#508a9c',.38,.25),'vehicleGlass':('#183e54',.48,.16),
 'yellow':('#f1bd35',.1,.62),'blue':('#2c6a9e',.08,.65),'solar':('#162b55',.55,.29),
 'warm':('#fff0c1',.05,.25),'siren':('#ff2539',.1,.25),'rubber':('#1b2125',0,.94),
 'tan':('#bca582',0,.87),'green':('#4b7148',0,.91),'soil':('#3f3d33',0,.98)}
for finish,names in finishes.items():
    color,metal,rough=colors[finish]
    command('appearance.assign',bodies=names,color=color,name='fire_'+finish,
            pbr={'metallic':metal,'roughness':rough,'dielectric_ior':1.45})
for i,commands in enumerate(stages):
    (ROOT/'cad'/f'stage-{i+1}.json').write_text(json.dumps(commands,indent=2),encoding='utf-8')
    for offset in range(0,len(commands),150):
        (ROOT/'cad'/f'stage-{i+1}-part-{offset//150+1}.json').write_text(json.dumps(commands[offset:offset+150],separators=(',',':')),encoding='utf-8')
(ROOT/'cad/parts.json').write_text(json.dumps({'parts':parts,'finishes':finishes,'colors':colors},indent=2),encoding='utf-8')
(ROOT/'design-plan.json').write_text(json.dumps({'units':'mm','footprint':[60000,48000],
  'height':24060,'foundationVolume':60000*48000*450,'foundationBounds':{'min':[-30000,-24000,0],'max':[30000,24000,450]},
  'garageBays':4,'trucks':4,'trainingTower':22000,'bodies':len(parts),'stages':[len(x) for x in stages]},indent=2),encoding='utf-8')
print(json.dumps({'commands':[len(x) for x in stages],'bodies':len(parts)}))
