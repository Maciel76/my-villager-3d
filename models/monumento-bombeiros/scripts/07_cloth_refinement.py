import bpy,math
from mathutils import Vector
from math import sin,cos,pi,exp
poses={
 '06A v2':((0,-.08,2.42),1.38,[(-.345,-.012,1.43),(.355,-.015,1.43)],1.04),
 '06B v2':((-1.72,-.05,2.42),1.38,[(-.48,-.35,1.20),(.10,-.48,1.10)],.71),
 '06C v2':((1.56,-.08,2.42),1.07,[(-.39,-.27,1.41),(.35,-.32,1.36)],1.04),
}
for prefix,(origin,scale,elbows,hip_z) in poses.items():
    origin=Vector(origin)
    coll=next(c for c in bpy.context.scene.collection.children if c.name.startswith(prefix))
    for obj in coll.objects:
        if obj.type!='MESH':continue
        if 'casaco esculpido continuo' in obj.name:
            # Sculpt folds into the surface normals, localized at the waist and bent elbows.
            # Cache normals once: reading a normal after each vertex edit forces costly recalculation.
            normals=[v.normal.copy() for v in obj.data.vertices]
            for vertex,normal in zip(obj.data.vertices,normals):
                p=(vertex.co-origin)/scale
                belly=exp(-((p.z-(hip_z+.18))/.18)**2)*exp(-((p.y+.155)/.13)**2)
                elbow=max(exp(-((p-Vector(e)).length/.18)**2) for e in elbows)
                disp=.014*belly*sin(p.x*42+p.z*48+.5*sin(p.x*12))+.018*elbow*sin(p.z*46+p.y*22+p.x*30)
                vertex.co+=normal*(disp*scale)
        elif 'calca continua com dobras' in obj.name:
            ns=48;nr=44
            if len(obj.data.vertices)!=(nr+1)*ns:continue
            for j in range(nr+1):
                t=j/nr;center=sum((obj.data.vertices[j*ns+i].co for i in range(ns)),Vector())/ns
                weight=exp(-((t-.5)/.16)**2)+.55*exp(-((t-.88)/.12)**2)
                for i in range(ns):
                    q=2*pi*i/ns;v=obj.data.vertices[j*ns+i];delta=v.co-center
                    if delta.length:
                        v.co+=delta.normalized()*(.012*scale*weight*sin(28*t+3*q))
print('Dobras esculpidas de tecido aplicadas')
