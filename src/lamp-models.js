import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { markNightLight } from "./daylight.js";
import { addLampEmitter } from "./night-lights.js";

const up = new THREE.Vector3(0, 1, 0);

function buildLamp() {
  const model = new THREE.Group();
  const batches = new Map();
  function put(material, geometry) {
    if (!batches.has(material)) batches.set(material, []);
    if (geometry.index) {
      const faces = geometry.toNonIndexed();
      geometry.dispose();
      geometry = faces;
    }
    batches.get(material).push(geometry);
  }
  function box(material, w, h, d, x, y, z, rotate = 0) {
    put(material, new THREE.BoxGeometry(w, h, d).rotateY(rotate).translate(x, y, z));
  }
  function cylinder(material, bottom, top, height, x, y, z, sides = 16) {
    put(material, new THREE.CylinderGeometry(top, bottom, height, sides).translate(x, y, z));
  }
  function tube(material, points, radius, resolution = 24) {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
    put(material, new THREE.TubeGeometry(curve, resolution, radius, 8));
  }
  function bar(material, from, to, width, depth = width) {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const axis = b.clone().sub(a);
    const rotation = new THREE.Quaternion().setFromUnitVectors(up, axis.clone().normalize());
    put(material, new THREE.BoxGeometry(width, axis.length(), depth)
      .applyQuaternion(rotation).translate(...a.lerp(b, 0.5).toArray()));
  }
  function lathe(material, profile, x, y, z, sections = 16) {
    const points = profile.map(([r, h]) => new THREE.Vector2(r, h));
    put(material, new THREE.LatheGeometry(points, sections).translate(x, y, z));
  }
  function finish() {
    for (const [material, geometries] of batches) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
      mesh.castShadow = !material.userData.nightGlow;
      mesh.receiveShadow = true;
      model.add(mesh);
      geometries.forEach((geometry) => geometry.dispose());
    }
    return model;
  }
  return { model, put, box, cylinder, tube, bar, lathe, finish };
}

export function createLampModels() {
  const metal = (color, roughness = .56, metalness = .28) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const iron = metal("#252423");
  const bronze = metal("#a6703e", .46, .48);
  const graphite = metal("#333942", .6);
  const aluminum = metal("#727780", .45, .5);
  const wood = metal("#a02a22", .74, .08);
  const stone = metal("#756d64", .93, .02);
  const slate = metal("#252e3a", .6);
  const ink = metal("#482b23", .8, .04);
  const solarBlue = [metal("#143258", .36, .22), metal("#1c4370", .35, .2)];
  const display = metal("#142238", .35);
  const icon = metal("#8acbe2", .55);
  const glass = markNightLight(metal("#ad8454", .48, .1), 2.8);
  const paper = markNightLight(metal("#dbb77d", .8, .02), 2.22);
  const led = markNightLight(metal("#bdb39c", .58, .05), 3.75);
  led.emissive.set("#ffdec1");

  function castPedestal(b, shaftTop) {
    b.lathe(iron, [[0,0],[.282,0],[.312,.035],[.312,.103],[.259,.127],
      [.24,.199],[.187,.237],[.174,.525],[.212,.56],[.216,.615],[.171,.641],
      [.118,.68],[.102,shaftTop-.1],[.131,shaftTop-.048],[.132,shaftTop],[0,shaftTop]],0,0,0,12);
    for (let i=0;i<8;i++) {
      const a=i * Math.PI / 4;
      const x = Math.sin(a), z = Math.cos(a);
      b.bar(iron, [x*.182,.246,z*.182], [x*.167,.51,z*.167], .053, .053);
      b.bar(bronze, [x*.116,.76,z*.116], [x*.104,shaftTop-.15,z*.104], .012, .012);
    }
    for (const [r, y] of [[.25,.157],[.181,.558],[.156,.656],[.124,shaftTop-.1],[.131,shaftTop]])
      b.cylinder(bronze,r,r*.98,.033,0,y,0,16);
  }

  function colonialLantern(b, x, y, z, k = 1) {
    const cyl = (mat, low, top, height, center) =>
      b.cylinder(mat, low*k, top*k, height*k, x, y+center*k, z, 6);
    cyl(glass,.168,.305,.58,0);
    cyl(iron,.185,.211,.058,-.294);
    cyl(bronze,.192,.19,.024,-.263);
    cyl(bronze,.32,.313,.037,.28);
    cyl(iron,.355,.25,.057,.324);
    cyl(iron,.252,.172,.105,.396);
    cyl(iron,.174,.103,.109,.503);
    b.cylinder(bronze,.086*k,.11*k,.061*k,x,y+.567*k,z);
    b.lathe(iron, [[0,0],[.063,0],[.087,.062],[.025,.128],[0,.168]]
      .map(([r,h]) => [r*k,h*k]), x,y+.586*k,z);
    b.cylinder(iron,.037*k,.098*k,.124*k,x,y-.382*k,z,10);
    for (let corner=0;corner<6;corner++) {
      const a=corner*Math.PI/3, u=Math.sin(a), v=Math.cos(a);
      b.bar(iron,[x+u*.181*k,y-.29*k,z+v*.181*k],[x+u*.320*k,y+.306*k,z+v*.320*k],.027*k);
      b.tube(bronze, [[x+u*.309*k,y+.277*k,z+v*.309*k],
        [x+u*.372*k,y+.308*k,z+v*.372*k],[x+u*.405*k,y+.367*k,z+v*.405*k]], .014*k, 5);
    }
  }

  const colonial = buildLamp();
  castPedestal(colonial, 2.28);
  colonialLantern(colonial,0,2.70,0);
  addLampEmitter(colonial.model, [0,2.71,0], { color: "#ffbe77", intensity: 36, range: 8.5, halo: 2.8 });

  const oriental = buildLamp();
  oriental.box(stone,.64,.15,.62,0,.075,0);
  oriental.box(stone,.49,.35,.47,0,.31,0);
  oriental.box(slate,.52,.088,.50,0,.497,0);
  oriental.box(wood,.25,2.63,.26,0,1.81,0);
  oriental.box(iron,.287,.23,.29,0,.627,0);
  oriental.box(bronze,.306,.038,.309,0,.738,0);
  for (const z of [-.24,.24]) {
    const front = Math.sign(z);
    oriental.box(ink,.27,.245,.022,0,.31,z);
    oriental.box(stone,.192,.173,.025,0,.31,z+.013*front);
    oriental.box(ink,.047,.115,.026,0,.31,z+.03*front,Math.PI/4);
  }
  oriental.tube(wood,[[-.38,2.99,0],[0,2.91,0],[.62,2.89,0],[1.11,2.92,0],[1.5,3.02,0]],.116);
  oriental.tube(slate,[[-.43,3.11,0],[0,3.035,0],[.62,3.02,0],[1.11,3.055,0],[1.53,3.145,0]],.064);
  for (let i=0;i<3;i++) {
    const x=.175+i*.158, y=2.54+i*.119;
    oriental.box(wood,.19,.063,.16,x-.044,y,0);
    oriental.box(wood,.062,2.89-y,.17,x,y+(2.89-y)/2,0);
  }
  function shoji(b,x,y,z,w,h,roof = true) {
    b.box(paper,w,h,w,x,y,z);
    for (const edge of [-1,1]) {
      b.box(ink,w+.092,.08,w+.092,x,y+edge*(h/2+.025),z);
      for (const side of [-1,1])
        b.box(ink,.027,h+.021,.027,x+side*w/2,y,z+edge*w/2);
      for (const v of [-h/5,h/5]) {
        b.box(ink,w,.024,.03,x,y+v,z+edge*w/2);
        b.box(ink,.03,.024,w,x+edge*w/2,y+v,z);
      }
      b.box(ink,.024,h,.03,x,y,z+edge*w/2);
      b.box(ink,.03,h,.024,x+edge*w/2,y,z);
    }
    if (roof) b.cylinder(slate,w*.83,w*.26,w*.34,x,y+h/2+w*.21,z,4);
  }
  shoji(oriental,1.19,2.39,0,.37,.51);
  oriental.box(iron,.065,.21,.063,1.19,2.84,0);
  shoji(oriental,0,3.255,0,.235,.225);
  addLampEmitter(oriental.model, [1.19,2.39,0], { color: "#ffb86c", intensity: 32, range: 7.7, halo: 2.3 });

  function flatHead(b, x, y, w, d) {
    b.box(graphite,w,.153,d,x,y,0);
    b.box(aluminum,w-.068,.035,d-.037,x,y-.073,0);
    b.box(led,w-.127,.021,d-.086,x,y-.097,0);
  }
  const urban = buildLamp();
  urban.box(graphite,.49,.079,.50,0,.0395,0);
  urban.box(aluminum,.24,.082,.23,0,.092,0);
  urban.box(graphite,.194,4.04,.215,0,2.10,0);
  urban.box(graphite,1.17,.173,.214,.48,4.04,0);
  urban.bar(aluminum,[.04,3.657,0],[.435,4.003,0],.132,.158);
  urban.box(iron,.086,1.63,.028,0,2.81,.114);
  urban.box(led,.044,1.51,.018,0,2.81,.133);
  flatHead(urban,1.037,4.044,1.01,.47);
  addLampEmitter(urban.model, [1.04,3.925,0], {
    color: "#ffdb9f", intensity: 66, range: 11, halo: 1.95, direction: [.1,-1,0], angle: .9,
  });

  const double = buildLamp();
  castPedestal(double, 3.87);
  double.lathe(bronze,[[0,0],[.081,0],[.117,.109],[.076,.189],[0,.271]],0,3.83,0);
  for (const side of [-1,1]) {
    double.tube(iron,[[side*.09,2.92,0],[side*.21,3.525,0],[side*.50,3.83,0],
      [side*.86,3.875,0],[side*1.125,3.70,0],[side*1.23,3.43,0]],.054);
    const curl = Array.from({ length: 14 }, (_, i) => {
      const t = i/13;
      const a = -Math.PI*.31 - Math.PI*1.94*t;
      const r = .176*(1-t)+.025;
      return [side*(.993+r*Math.cos(a)),3.596+r*Math.sin(a),0];
    });
    double.tube(bronze, curl, .026, 23);
    colonialLantern(double,side*1.23,2.98,0,.78);
    addLampEmitter(double.model, [side*1.23,2.98,0], {
      color: "#ffc07d", intensity: 32, range: 8.8, halo: 2.65,
    });
  }

  const zen = buildLamp();
  zen.box(stone,.60,.134,.60,0,.067,0);
  zen.box(ink,.48,.31,.48,0,.276,0);
  zen.box(bronze,.493,.046,.493,0,.431,0);
  zen.box(paper,.414,1.37,.414,0,1.13,0);
  for (const side of [-1,1]) {
    for (const other of [-1,1])
      zen.box(ink,.037,1.48,.037,side*.216,1.135,other*.216);
    for (const y of [.48,.80,1.59,1.82]) {
      zen.box(ink,.465,.031,.032,0,y,side*.222);
      zen.box(ink,.032,.031,.465,side*.222,y,0);
    }
  }
  zen.box(slate,.54,.087,.54,0,1.857,0);
  zen.cylinder(slate,.46,.14,.235,0,2.00,0,4);
  zen.cylinder(iron,.071,.035,.135,0,2.17,0,10);
  for (let side=0;side<4;side++) {
    const yaw=side*Math.PI/2;
    const face = (u,v) => [
      u*Math.cos(yaw)+.212*Math.sin(yaw),v,.212*Math.cos(yaw)-u*Math.sin(yaw),
    ];
    for (const x of [-.083,.057]) {
      zen.bar(ink,face(x,.50),face(x+.035,1.63),.014,.012);
      for (let i=0;i<3;i++) {
        const y = .88 + i*.20 + x;
        const sign = i%2 ? -1 : 1;
        const leaf = new THREE.Shape()
          .moveTo(x,y).quadraticCurveTo(x+sign*.052,y+.098,x+sign*.108,y+.123)
          .quadraticCurveTo(x+sign*.071,y+.036,x,y);
        zen.put(ink,new THREE.ShapeGeometry(leaf,5).translate(0,0,.219).rotateY(yaw));
      }
    }
  }
  addLampEmitter(zen.model, [0,1.19,0], { color: "#ffb369", intensity: 15, range: 6.4, halo: 2.5 });

  const solar = buildLamp();
  solar.box(graphite,.48,.08,.49,0,.04,0);
  solar.box(graphite,.208,4.26,.234,0,2.19,0);
  solar.bar(graphite,[0,3.69,0],[.48,4.027,0],.155,.161);
  flatHead(solar,.785,4.065,.91,.43);
  solar.box(led,.038,2.26,.019,-.052,1.56,.122);
  solar.box(aluminum,.23,.408,.10,0,1.435,.149);
  solar.box(display,.167,.328,.014,0,1.452,.206);
  const bolt = new THREE.Shape().moveTo(.018,1.551).lineTo(-.055,1.431)
    .lineTo(-.002,1.431).lineTo(-.013,1.35)
    .lineTo(.058,1.473).lineTo(.011,1.473).lineTo(.018,1.551);
  solar.put(icon,new THREE.ShapeGeometry(bolt).translate(0,0,.215));

  const panel = (material,w,h,d,x,y,z) => {
    solar.put(material,new THREE.BoxGeometry(w,h,d).translate(x,y,z)
      .rotateX(-.32).translate(-.26,4.42,0));
  };
  panel(aluminum,1.82,.075,1.18,0,0,0);
  panel(slate,1.75,.026,1.106,0,.049,0);
  for(let i=0;i<6;i++) for(let j=0;j<4;j++)
    panel(solarBlue[(i+j)%2],.268,.015,.244,(i-2.5)*.284,.069,(j-1.5)*.26);
  for (const x of [-.575,.575]) panel(aluminum,.011,.012,1.087,x,.078,0);
  panel(aluminum,1.74,.012,.012,0,.079,0);
  solar.bar(graphite,[-.032,4.17,.07],[-.52,4.365,.21],.078);
  addLampEmitter(solar.model, [.785,3.943,0], {
    color: "#ffdea9", intensity: 58, range: 10.5, halo: 1.8, direction: [.16,-1,0],
  });

  return {
    lightBlock: createLightBlock(),
    lampColonial: colonial.finish(),
    lampOriental: oriental.finish(),
    lampUrban: urban.finish(),
    lampDouble: double.finish(),
    lampZen: zen.finish(),
    lampSolar: solar.finish(),
  };
}

function createLightBlock() {
  const model = new THREE.Group();
  const material = markNightLight(new THREE.MeshStandardMaterial({
    color: "#ffe6b6", roughness: .55, emissive: "#ffbd70", depthTest: false, depthWrite: false,
  }), 3.5);
  const marker = new THREE.Mesh(new THREE.BoxGeometry(.18, .18, .18), material);
  marker.name = "Pequeno marcador da luz livre";
  marker.renderOrder = 20;
  model.add(marker);
  addLampEmitter(model, [0, 0, 0], { color: "#ffbe77", intensity: 36, range: 8.5, halo: 1.3 });
  return model;
}
