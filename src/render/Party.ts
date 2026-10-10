import * as THREE from 'three';
import { mulberry32 } from '../util/noise';

/**
 * Decoración de cumpleaños para el plano general de la intro (y que se intuya de fondo): guirnaldas de
 * banderines, globos atados a la mesa, una torta con velitas y serpentinas sobre el mantel. Todo
 * pastel, con movimiento suave (los banderines se mecen, los globos flotan, las llamitas titilan).
 */
export interface Party {
  group: THREE.Group;
  update(dt: number): void;
}

const PASTEL = ['#ffb3c7', '#9fe0c9', '#c9b6f2', '#ffe08f', '#9fd0f5', '#ffc9a3'];

export function buildParty(): Party {
  const group = new THREE.Group();
  group.name = 'fiesta';
  const animated: ((t: number) => void)[] = [];
  const rnd = mulberry32(2024);

  // ── Guirnaldas de banderines (cuelgan en catenaria detrás de la mesa) ──
  const garlands: [THREE.Vector3, THREE.Vector3, number][] = [
    [new THREE.Vector3(-0.95, 0.66, -1.05), new THREE.Vector3(0.95, 0.62, -1.05), 0.16],
    [new THREE.Vector3(-0.7, 0.52, -1.32), new THREE.Vector3(0.8, 0.56, -1.32), 0.12],
  ];
  const stringMat = new THREE.MeshStandardMaterial({ color: '#f4ede4', roughness: 0.8 });
  const flagMats = PASTEL.map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.6, sheen: 0.4, side: THREE.DoubleSide }));
  const flagGeo = new THREE.BufferGeometry();
  // Banderín triangular (cuelga desde el hilo, punta abajo), con un leve pliegue al medio.
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.024, 0, 0, 0, 0, 0.004, 0, -0.058, 0, 0, 0, 0.004, 0.024, 0, 0, 0, -0.058, 0], 3));
  flagGeo.computeVertexNormals();
  garlands.forEach(([a, b, sag], gi) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.0018, 6), stringMat));
    const n = Math.round(curve.getLength() / 0.075);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const pivot = new THREE.Group();
      pivot.position.copy(p);
      pivot.rotation.y = Math.atan2(-tan.z, tan.x);
      pivot.rotation.z = Math.atan2(tan.y, Math.hypot(tan.x, tan.z));
      const flag = new THREE.Mesh(flagGeo, flagMats[(i + gi * 2) % flagMats.length]);
      pivot.add(flag);
      group.add(pivot);
      const ph = rnd() * 6;
      animated.push((time) => {
        flag.rotation.x = Math.sin(time * 1.4 + ph + i * 0.35) * 0.12;
      });
    }
  });

  // ── Globos atados a la mesa ──
  const knotGeo = new THREE.ConeGeometry(0.006, 0.01, 10);
  const balloonGeo = new THREE.SphereGeometry(1, 32, 24);
  balloonGeo.scale(1, 1.18, 1);
  const clusters: [number, number, number][] = [
    [-0.72, -0.85, 3],
    [0.78, -0.95, 3],
  ];
  for (const [cx, cz, count] of clusters) {
    for (let i = 0; i < count; i++) {
      const color = PASTEL[Math.floor(rnd() * PASTEL.length)];
      const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.9, clearcoatRoughness: 0.1, sheen: 0.3 });
      const r = 0.055 + rnd() * 0.015;
      const base = new THREE.Vector3(cx + (rnd() - 0.5) * 0.04, 0, cz + (rnd() - 0.5) * 0.04);
      const top = new THREE.Vector3(cx + (i - 1) * 0.075 + (rnd() - 0.5) * 0.02, 0.36 + rnd() * 0.16, cz + (rnd() - 0.5) * 0.08);
      const balloon = new THREE.Mesh(balloonGeo, mat);
      balloon.scale.setScalar(r);
      const knot = new THREE.Mesh(knotGeo, mat);
      knot.rotation.x = Math.PI;
      knot.position.y = -r * 1.18 - 0.004;
      const holder = new THREE.Group();
      holder.add(balloon, knot);
      group.add(holder);
      const string = new THREE.Mesh(new THREE.BufferGeometry(), stringMat);
      group.add(string);
      const ph = rnd() * 6;
      const p = new THREE.Vector3();
      animated.push((time) => {
        p.copy(top).add(new THREE.Vector3(Math.sin(time * 0.6 + ph) * 0.01, Math.sin(time * 0.9 + ph) * 0.008, 0));
        holder.position.copy(p);
        holder.rotation.z = Math.sin(time * 0.7 + ph) * 0.06;
        // Hilo desde la mesa hasta el nudo, con una leve curva.
        const end = p.clone().add(new THREE.Vector3(0, -r * 1.18 - 0.008, 0));
        const mid = base.clone().lerp(end, 0.5).add(new THREE.Vector3(0.015 * Math.sin(time + ph), 0, 0));
        string.geometry.dispose();
        string.geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(base, mid, end), 16, 0.0009, 4);
      });
    }
  }

  // ── Torta con velitas ──
  const cake = new THREE.Group();
  cake.position.set(0.34, 0, -0.78);
  const sponge = new THREE.MeshPhysicalMaterial({ color: '#ffd1dc', roughness: 0.55, sheen: 0.5, sheenColor: new THREE.Color('#fff0f4') });
  const cream = new THREE.MeshPhysicalMaterial({ color: '#fffaf3', roughness: 0.4, clearcoat: 0.3 });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.095, 0.006, 48), cream);
  plate.position.y = 0.003;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.07, 48), sponge);
  body.position.y = 0.041;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.077, 0.077, 0.012, 48), cream);
  top.position.y = 0.079;
  cake.add(plate, body, top);
  // Gotitas de crema por el borde.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const drip = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.01 + rnd() * 0.012, 4, 8), cream);
    drip.position.set(Math.cos(a) * 0.076, 0.068, Math.sin(a) * 0.076);
    cake.add(drip);
  }
  // Granitos de colores.
  const sprinkleGeo = new THREE.CapsuleGeometry(0.0012, 0.004, 2, 4);
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()) * 0.068;
    const s = new THREE.Mesh(sprinkleGeo, flagMats[i % flagMats.length]);
    s.position.set(Math.cos(a) * rr, 0.0855, Math.sin(a) * rr);
    s.rotation.set(Math.PI / 2, 0, rnd() * Math.PI);
    cake.add(s);
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffd27a', toneMapped: false });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.04, 12), flagMats[i % flagMats.length]);
    candle.position.set(Math.cos(a) * 0.04, 0.105, Math.sin(a) * 0.04);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 12, 8), flameMat);
    flame.scale.set(1, 1.8, 1);
    flame.position.set(candle.position.x, 0.131, candle.position.z);
    cake.add(candle, flame);
    const ph = rnd() * 6;
    animated.push((time) => {
      const k = 1 + 0.12 * Math.sin(time * 17 + ph) + 0.08 * Math.sin(time * 29 + ph * 2);
      flame.scale.set(1 / Math.sqrt(k), 1.8 * k, 1 / Math.sqrt(k));
    });
  }
  group.add(cake);

  // ── Serpentinas sobre el mantel ──
  const curls: [number, number, number, string][] = [
    [-0.36, -0.42, 0.4, PASTEL[0]],
    [0.4, -0.36, -0.6, PASTEL[2]],
    [-0.08, -0.62, 1.4, PASTEL[3]],
    [0.62, -0.62, 2.2, PASTEL[1]],
  ];
  for (const [x, z, yaw, color] of curls) {
    const pts: THREE.Vector3[] = [];
    const turns = 3.5;
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const a = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(t * 0.16, 0.006 + 0.005 * Math.sin(a), 0.006 * Math.cos(a)));
    }
    const m = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.0012, 5),
      new THREE.MeshPhysicalMaterial({ color, roughness: 0.4, sheen: 0.5 }),
    );
    m.position.set(x, 0, z);
    m.rotation.y = yaw;
    group.add(m);
  }

  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.userData.noPick = true;
    }
  });
  flameMat.userData.noShadow = true;

  let time = 0;
  return {
    group,
    update(dt: number) {
      time += dt;
      for (const f of animated) f(time);
    },
  };
}
