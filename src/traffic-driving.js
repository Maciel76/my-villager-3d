import * as THREE from "three";
import { ASPHALT_Y, tileKey } from "./road-layout.js";
import { LOT_SIZE } from "./village-area.js";

const HALF=LOT_SIZE/2, LANE=1.55, STEP=1/30;
const key=tile=>tileKey(tile.x,tile.z);

export function carCurve(tile,from,to){
  const dx=(tile.x-from.x)/LOT_SIZE,dz=(tile.z-from.z)/LOT_SIZE;
  const ex=(to.x-tile.x)/LOT_SIZE,ez=(to.z-tile.z)/LOT_SIZE;
  const start=from.entryPoint?.clone()??new THREE.Vector3(tile.x-dx*HALF-dz*LANE,0,tile.z-dz*HALF+dx*LANE);
  const end=new THREE.Vector3(tile.x+ex*HALF-ez*LANE,0,tile.z+ez*HALF+ex*LANE);
  start.y=end.y=0;
  const bend=to===from?9:5;
  const curve=new THREE.CubicBezierCurve3(start,start.clone().add(new THREE.Vector3(dx*bend,0,dz*bend)),end.clone().sub(new THREE.Vector3(ex*bend,0,ez*bend)),end);
  curve.arcLengthDivisions=40;
  return curve;
}

export function vehiclesOverlap(a,b,clearance=.16){
  if(Math.abs(a.position.y-b.position.y)>3)return false;
  const dx=b.position.x-a.position.x,dz=b.position.z-a.position.z;
  const afx=Math.sin(a.yaw),afz=Math.cos(a.yaw),arx=afz,arz=-afx;
  const bfx=Math.sin(b.yaw),bfz=Math.cos(b.yaw),brx=bfz,brz=-bfx;
  const al=a.halfLength+clearance,aw=a.halfWidth+clearance,bl=b.halfLength+clearance,bw=b.halfWidth+clearance;
  for(const [x,z]of[[afx,afz],[arx,arz],[bfx,bfz],[brx,brz]]){
    const radius=al*Math.abs(x*afx+z*afz)+aw*Math.abs(x*arx+z*arz)+bl*Math.abs(x*bfx+z*bfz)+bw*Math.abs(x*brx+z*brz);
    if(Math.abs(dx*x+dz*z)>=radius)return false;
  }
  return true;
}

export function createRoadTraffic({random=Math.random,heightAt=()=>ASPHALT_Y}={}){
  const vehicles=new Set(),locks=new Map(),accessTiles=new Map();
  const point=new THREE.Vector3(),tangent=new THREE.Vector3();
  let clock=0,accumulator=0,serial=0;
  const junction=tile=>Boolean(tile&&(accessTiles.has(key(tile))||tile.neighbors.length!==2||
    tile.neighbors[0].x+tile.neighbors[1].x!==2*tile.x||tile.neighbors[0].z+tile.neighbors[1].z!==2*tile.z));
  function choose(car,tile,from){
    const options=tile.neighbors.filter(n=>n!==from);
    if(!options.length)return from;
    const weights=options.map(n=>{
      const straight=n.x===2*tile.x-from.x&&n.z===2*tile.z-from.z;
      let load=0;for(const other of vehicles)if(other!==car&&(other.tile===n||other.to===n))load++;
      const visited=car.history.slice(-5).filter(k=>k===key(n)).length;
      return (straight?2.2:1)/(1+load*.65+visited*1.8);
    });
    let n=car.random()*weights.reduce((a,b)=>a+b,0);
    return options[weights.findIndex(w=>(n-=w)<0)]??options.at(-1);
  }
  function pose(car,distance=car.distance,target=car){
    const fraction=THREE.MathUtils.clamp(distance/car.length,0,1);
    car.curve.getPointAt(fraction,point);car.curve.getTangentAt(fraction,tangent);
    target.position.copy(point);target.yaw=Math.atan2(tangent.x,tangent.z);
    target.position.y=car.mode==="driveway"?point.y:(heightAt(point.x,point.z)??ASPHALT_Y)+(car.groundOffset??0);
    return target;
  }
  function startRoad(car,tile,from){
    car.mode="road";car.tile=tile;car.from=from;car.to=choose(car,tile,from);
    car.nextTo=null;car.curve=carCurve(tile,from,car.to);car.length=car.curve.getLength();car.distance=0;
    car.history.push(key(tile));if(car.history.length>12)car.history.shift();
  }
  function release(car){for(const [tile,owner]of locks)if(owner===car)locks.delete(tile);}
  function make(options={}){
    const seed=Math.floor(random()*4294967295)||1;
    let state=seed;const rng=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    return {id:++serial,position:new THREE.Vector3(),yaw:0,halfLength:1.78,halfWidth:.84,speed:6+random()*2.4,
      velocity:0,wait:0,meters:0,history:[],random:rng,mode:"parked",readyAt:Infinity,held:false,...options};
  }
  function clearAt(candidate,ignored){
    for(const other of vehicles)if(other!==ignored&&!other.held&&vehiclesOverlap(candidate,other))return false;
    return true;
  }
  function addRoadVehicle(tile,from,fraction=0,options={}){
    if(!tile?.neighbors.length)return null;
    const car=make(options);startRoad(car,tile,from);car.distance=car.length*THREE.MathUtils.clamp(fraction,0,1);pose(car);
    if(!clearAt(car)||junction(tile)&&(locks.has(key(tile))||junction(car.to)&&locks.has(key(car.to))))return null;
    vehicles.add(car);if(junction(tile))locks.set(key(tile),car);return car;
  }
  function addDeparture(options){
    const car=make({...options,mode:"parked",halfLength:2.45,halfWidth:1.2,groundOffset:-.18});
    car.curve=options.curve;car.length=car.curve.getLength();car.distance=0;pose({...car,mode:"driveway"},0,car);
    vehicles.add(car);return car;
  }
  function nextEntry(car){return car.mode==="driveway"?car.exitTile:car.to;}
  function movement(car){
    const tile=nextEntry(car),from=car.mode==="driveway"?car.access:car.tile;
    car.nextTo??=choose(car,tile,from);
    return {tile,from,to:car.nextTo};
  }
  function canReserve(car){
    const {tile,from,to}=movement(car),id=key(tile),owner=locks.get(id);
    if(owner&&owner!==car)return false;
    // A previous vehicle may still have its rear over the tile boundary.
    for(const other of vehicles)if(other!==car&&!other.held&&other.tile===tile)return false;
    const onward=tile.neighbors.filter(n=>n!==from&&n!==to),offset=Math.floor(car.random()*Math.max(1,onward.length));
    const exits=car.wait>2?[to,...onward.slice(offset),...onward.slice(0,offset)]:[to];
    for(const destination of exits){
      if(junction(destination)&&locks.has(key(destination))&&locks.get(key(destination))!==car)continue;
      // Never stop across a junction: reserve only when the receiving lane fits this vehicle.
      const curve=carCurve(tile,from,destination),end=curve.getPointAt(1),dir=curve.getTangentAt(1);
      const exit={position:end.addScaledVector(dir,car.halfLength+1),yaw:Math.atan2(dir.x,dir.z),halfLength:car.halfLength,halfWidth:car.halfWidth};
      exit.position.y=heightAt(exit.position.x,exit.position.z)??ASPHALT_Y;
      if(!clearAt(exit,car))continue;
      car.nextTo=destination;locks.set(id,car);return true;
    }
    return false;
  }
  function rerouteInsideJunction(car){
    if(car.mode!=="road"||!junction(car.tile)||locks.get(key(car.tile))!==car)return false;
    const alternatives=car.tile.neighbors.filter(n=>n!==car.to&&(!locks.has(key(n))||locks.get(key(n))===car));
    alternatives.sort((a,b)=>Number(a===car.from)-Number(b===car.from));
    for(const destination of alternatives){
      const dx=(destination.x-car.tile.x)/LOT_SIZE,dz=(destination.z-car.tile.z)/LOT_SIZE;
      const start=car.position.clone().setY(0),end=new THREE.Vector3(car.tile.x+dx*HALF-dz*LANE,0,car.tile.z+dz*HALF+dx*LANE);
      const control=start.clone().add(new THREE.Vector3(Math.sin(car.yaw)*3,0,Math.cos(car.yaw)*3));
      control.x=THREE.MathUtils.clamp(control.x,car.tile.x-HALF,car.tile.x+HALF);
      control.z=THREE.MathUtils.clamp(control.z,car.tile.z-HALF,car.tile.z+HALF);
      const curve=new THREE.CubicBezierCurve3(start,control,end.clone().sub(new THREE.Vector3(dx*3,0,dz*3)),end);
      curve.arcLengthDivisions=40;
      let clear=true;
      for(let i=1;i<=16;i++){
        const position=curve.getPointAt(i/16),direction=curve.getTangentAt(i/16);position.y=car.position.y;
        if(!clearAt({...car,position,yaw:Math.atan2(direction.x,direction.z)},car)){clear=false;break;}
      }
      if(!clear)continue;
      if(locks.get(key(car.to))===car&&car.to!==car.tile)locks.delete(key(car.to));
      car.to=destination;car.nextTo=null;car.curve=curve;car.length=curve.getLength();car.distance=0;car.wait=0;car.velocity=0;
      return true;
    }
    return false;
  }
  function wait(car,dt){car.wait+=dt;if(car.wait>4)rerouteInsideJunction(car);}
  function advance(car,dt){
    if(car.held)return;
    if(car.mode==="parked"){
      if(clock<car.readyAt)return;
      car.mode="driveway";
    }
    if(car.previousJunction&&car.distance>car.halfLength+1){
      if(locks.get(car.previousJunction)===car)locks.delete(car.previousJunction);car.previousJunction=null;
    }
    let limit=car.mode==="driveway"?Math.min(4.5,car.speed):junction(car.tile)?Math.min(5.5,car.speed):car.speed;
    const remaining=car.length-car.distance,next=nextEntry(car);
    if(next&&junction(next)&&remaining<car.halfLength+5&&!canReserve(car)){
      const space=Math.max(0,remaining-car.halfLength-2.4);
      limit=Math.min(limit,Math.sqrt(space*6),space/dt);
    }
    for(const other of vehicles){
      if(other===car||other.held||Math.abs(other.position.y-car.position.y)>3)continue;
      const dx=other.position.x-car.position.x,dz=other.position.z-car.position.z;
      const ahead=dx*Math.sin(car.yaw)+dz*Math.cos(car.yaw),side=Math.abs(dx*Math.cos(car.yaw)-dz*Math.sin(car.yaw));
      if(ahead>0&&side<car.halfWidth+other.halfWidth+.15&&Math.cos(other.yaw-car.yaw)>.82){
        const gap=Math.max(0,ahead-car.halfLength-other.halfLength-1.1);
        limit=Math.min(limit,Math.sqrt(6*gap),gap/dt);
      }
    }
    car.velocity=Math.min(limit,car.velocity+2.2*dt);
    if(car.stopAt!==undefined)car.velocity=Math.min(car.velocity,Math.max(0,car.stopAt-car.distance)/dt);
    const amount=Math.min(car.velocity*dt,remaining);
    if(amount<1e-5){wait(car,dt);return;}
    const candidate={position:new THREE.Vector3(),yaw:0,halfLength:car.halfLength,halfWidth:car.halfWidth};
    // Test the whole oriented body and its swept midpoint, including turns.
    pose(car,car.distance+amount,candidate);
    if(!clearAt(candidate,car)){car.velocity=0;wait(car,dt);return;}
    const middle={...candidate,position:new THREE.Vector3()};pose(car,car.distance+amount*.5,middle);
    if(!clearAt(middle,car)){car.velocity=0;wait(car,dt);return;}
    car.position.copy(candidate.position);car.yaw=candidate.yaw;car.distance+=amount;car.meters+=amount;car.wait=0;
    if(car.distance>=car.length-1e-7){
      if(!next){car.mode="parked";return;}
      const oldTile=car.tile,from=car.mode==="driveway"?car.access:oldTile,to=car.nextTo;
      if(oldTile&&junction(oldTile))car.previousJunction=key(oldTile);
      startRoad(car,next,from);
      if(to){car.to=to;car.curve=carCurve(next,from,to);car.length=car.curve.getLength();}
      // Endpoints of adjacent tiles share one exact lane boundary.
      pose(car);
    }
  }
  return {
    get vehicles(){return [...vehicles];},get time(){return clock;},get reservations(){return locks;},
    addRoadVehicle,addDeparture,isJunction:junction,
    addAccess(tile){accessTiles.set(key(tile),(accessTiles.get(key(tile))??0)+1);},
    removeAccess(tile){
      const id=key(tile),count=(accessTiles.get(id)??0)-1;
      if(count>0)accessTiles.set(id,count);else{accessTiles.delete(id);if(!junction(tile))locks.delete(id);}
    },
    rebindTiles(tiles){
      const byKey=new Map(tiles.map(tile=>[key(tile),tile]));
      for(const car of vehicles){
        for(const field of["tile","to","nextTo","exitTile"])if(car[field])car[field]=byKey.get(key(car[field]));
        if(car.from&&!car.from.entryPoint)car.from=byKey.get(key(car.from));
      }
    },
    remove(car){vehicles.delete(car);release(car);},
    clear(){vehicles.clear();locks.clear();accessTiles.clear();accumulator=0;},
    canPlace:clearAt,
    update(dt){
      // Clamp suspended-tab time; subdivide every frame so a long frame cannot tunnel through a car.
      accumulator+=THREE.MathUtils.clamp(dt,0,.15);
      while(accumulator>=STEP){
        clock+=STEP;accumulator-=STEP;
        const ordered=[...vehicles].sort((a,b)=>Number(junction(b.tile))-Number(junction(a.tile))||b.wait-a.wait||a.id-b.id);
        for(const car of ordered)advance(car,STEP);
      }
    },
  };
}
