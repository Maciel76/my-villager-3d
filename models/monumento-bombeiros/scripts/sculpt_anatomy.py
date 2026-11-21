"""Anatomical surfaces adapted from the MakeHuman hm08 CC0 base mesh.
Source and asset license are preserved in ../assets/ORIGEM-CC0.txt.
"""
from pathlib import Path
from collections import defaultdict
import math
from mathutils import Vector,Matrix

ROOT=Path(__file__).resolve().parents[1]
V=[];G=defaultdict(list);g='body'
for line in (ROOT/'assets'/'makehuman_base_cc0.obj').read_text().splitlines():
    if line.startswith('v '):V.append(Vector(tuple(map(float,line.split()[1:4]))))
    elif line.startswith('g '):g=line[2:].strip()
    elif line.startswith('f '):G[g].append(tuple(int(q.split('/')[0])-1 for q in line.split()[1:]))

def morphed(kind):
    out=[v.copy() for v in V]
    names={'leader':[('caucasian-male-young.target',.72),('caucasian-male-old.target',.28)],
           'male':[('caucasian-male-young.target',1)],
           'female':[('caucasian-female-young.target',1)],
           'child':[('caucasian-female-young.target',1)]}[kind]
    for name,weight in names:
        for line in (ROOT/'assets'/name).read_text().splitlines():
            if line and not line.startswith('#'):
                p=line.split()
                if len(p)==4:out[int(p[0])]+=Vector(tuple(map(float,p[1:])))*weight
    return out

def subset(faces,coords):
    indices=sorted({i for face in faces for i in face})
    remap={old:new for new,old in enumerate(indices)}
    return [coords[i] for i in indices],[tuple(remap[i] for i in f) for f in faces]

def head(f,center,yaw=0,pitch=0,kind='leader',size=1):
    import bpy
    coords=morphed(kind)
    if kind=='child':
        eye_indices={i for side in ['l','r'] for face in G['helper-'+side+'-eye'] for i in face}
        eye_y=sum(coords[i].y for i in eye_indices)/len(eye_indices)
        for i,p in enumerate(V):
            if p.y>6.8 and p.z>1.0:
                weight=math.exp(-((abs(p.x)-.31)/.19)**4-((p.y-7.28)/.17)**4)*min(1,max(0,(p.z-1.0)/.20))
                coords[i].y=eye_y+(coords[i].y-eye_y)*(1-.93*weight)
    faces=[face for face in G['body'] if all(V[i].y>6.12 for i in face)]
    top=max(coords[i].y for face in faces for i in face)
    cy=top-1.48
    rot=Matrix.Rotation(yaw,4,'Z')@Matrix.Rotation(pitch,4,'X')
    if kind=='child':rot=rot@Matrix.Rotation(-.45,4,'Y')
    center=Vector(center)
    def transform(v):
        p=Vector((v.x*.14,-(v.z-.15)*.14,(v.y-cy)*.14))
        if kind=='child':
            p.x*=1.12;p.y*=1.05
            if p.z<0:p.z*=.75
        return f.P(center+(rot.to_3x3()@p)*size)
    vs,fs=subset(faces,coords)
    obj=f.M.mesh(f.name+' | rosto anatomico '+kind,[transform(v) for v in vs],fs,'Bronze escultura',True)
    sub=obj.modifiers.new('Subdivisao anatomica de rosto','SUBSURF');sub.levels=2;sub.render_levels=2
    obj['Base anatomica']='MakeHuman hm08 CC0, adaptada ao monumento'
    # Anatomical eyeball meshes sit inside the modeled eyelids, not on the face.
    for side in ([] if kind=='child' else ['l','r']):
        vs,fs=subset(G['helper-'+side+'-eye'],coords)
        eye=f.M.mesh(f.name+' | globo ocular '+side,[transform(v) for v in vs],fs,'Bronze escuro escultura',True)
        sub=eye.modifiers.new('Suavizacao do olho','SUBSURF');sub.levels=2;sub.render_levels=2
    if kind=='child':
        hair_faces=[face for face in G['body'] if all(V[i].y>7.55 or (V[i].z<.55 and V[i].y>6.9) for i in face)]
        vs,fs=subset(hair_faces,coords)
        hair=f.M.mesh(f.name+' | cabelo infantil anatomico',[transform(v) for v in vs],fs,'Bronze escuro escultura',True)
        sub=hair.modifiers.new('Fios e volume de cabelo','SUBSURF');sub.levels=2;sub.render_levels=2
        solid=hair.modifiers.new('Espessura do cabelo','SOLIDIFY');solid.thickness=.0035;solid.offset=1
    return obj,rot,center,size

def hand(f,wrist,direction,side=1,curl=.3,roll=0):
    import bpy
    # Hands keep the base mesh's anatomical topology and all five fingers.
    w=Vector((4.3118,2.4518,1.7565))
    tip=Vector((4.7841,1.3028,3.0147));axis=(tip-w).normalized()
    cross=Vector((1,0,0));cross=(cross-axis*cross.dot(axis)).normalized()
    normal=axis.cross(cross).normalized()
    faces=[face for face in G['body'] if all(V[i].x>3.66 and (V[i]-w).dot(axis)>-.18 for i in face)]
    raw,fs=subset(faces,V)
    direction=Vector(direction).normalized()
    tangent=Vector((1,0,0))-direction*direction.x
    if tangent.length<.1:tangent=Vector((0,1,0))-direction*direction.y
    tangent.normalize();norm=direction.cross(tangent).normalized()
    tangent,norm=tangent*math.cos(roll)+norm*math.sin(roll),-tangent*math.sin(roll)+norm*math.cos(roll)
    points=[]
    for v in raw:
        d=v-w;x=d.dot(cross)*.125*side;y=d.dot(normal)*.125;z=d.dot(axis)*.125
        if curl and z>.075:
            q=z-.075;r=.145/max(curl,.01)
            z=.075+r*math.sin(q/r);y+=r*(1-math.cos(q/r))
        p=Vector(wrist)+tangent*x+norm*y*1.1+direction*z
        points.append(f.P(p))
    obj=f.M.mesh(f.name+' | luva anatomica cinco dedos',points,fs,'Bronze escuro escultura',True)
    sub=obj.modifiers.new('Suavizacao da luva','SUBSURF');sub.levels=2;sub.render_levels=2
    return obj
