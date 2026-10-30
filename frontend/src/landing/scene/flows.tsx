import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import * as THREE from "three";

/** Points along a sagging conductor between two attachment points. */
export function span(a: THREE.Vector3, b: THREE.Vector3, sag = 1.6, n = 20): THREE.Vector3[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    return p;
  });
}

/** Elevated arc for communication links. */
export function arc(a: THREE.Vector3, b: THREE.Vector3, lift = 14, n = 40): THREE.Vector3[] {
  const mid = a.clone().lerp(b, 0.5);
  mid.y += lift;
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
  return curve.getPoints(n);
}

const GREEN = new THREE.Color("#4ade80");
const RED = new THREE.Color("#ff2d55");
const AMBER = new THREE.Color("#f59e0b");

export function PowerLine({ points, particles = 8, speed = 0.08, tint }: { points: THREE.Vector3[]; particles?: number; speed?: number; tint?: RefObject<number> }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, Math.max(24, points.length * 3), 0.045, 5, false), [curve, points.length]);
  const lineMat = useRef<THREE.MeshBasicMaterial>(null);
  const inst = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const k = tint?.current ?? 0;
    color.copy(GREEN).lerp(k > 0.5 ? RED : AMBER, Math.min(1, k * 1.2));
    if (lineMat.current) lineMat.current.color.copy(color).multiplyScalar(0.55);
    if (!inst.current) return;
    for (let i = 0; i < particles; i++) {
      const u = (i / particles + t * speed * (1 - k * 0.7)) % 1;
      dummy.position.copy(curve.getPointAt(u));
      const s = 0.16 + 0.06 * Math.sin(t * 6 + i);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      inst.current.setMatrixAt(i, dummy.matrix);
    }
    inst.current.instanceMatrix.needsUpdate = true;
    (inst.current.material as THREE.MeshBasicMaterial).color.copy(color).multiplyScalar(2.2);
  });
  return (
    <group>
      <mesh geometry={tube}>
        <meshBasicMaterial ref={lineMat} color="#2f9e5c" toneMapped={false} />
      </mesh>
      <instancedMesh ref={inst} args={[undefined, undefined, particles]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

export function SignalLine({ points, color, level, speed = 1.6, dash = 0.7, gap = 0.55, width = 1.6, particles = 3 }: { points: THREE.Vector3[]; color: string; level: RefObject<number>; speed?: number; dash?: number; gap?: number; width?: number; particles?: number }) {
  const line = useRef<any>(null);
  const inst = useRef<THREE.InstancedMesh>(null);
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }, dt) => {
    const v = level.current ?? 0;
    if (line.current) {
      line.current.material.dashOffset -= dt * speed;
      line.current.material.opacity = v;
    }
    if (!inst.current) return;
    for (let i = 0; i < particles; i++) {
      const u = (i / particles + clock.elapsedTime * 0.18) % 1;
      dummy.position.copy(curve.getPointAt(u));
      dummy.scale.setScalar(0.22 * v);
      dummy.updateMatrix();
      inst.current.setMatrixAt(i, dummy.matrix);
    }
    inst.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <Line ref={line} points={points} color={color} lineWidth={width} dashed dashSize={dash} gapSize={gap} transparent opacity={0} toneMapped={false} />
      <instancedMesh ref={inst} args={[undefined, undefined, particles]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** Hypothetical attack path from the corporate network to the gateway, stopped by the shield. */
export function AttackPath({ points, threat, shield, wallX }: { points: THREE.Vector3[]; threat: RefObject<number>; shield: RefObject<number>; wallX: number }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 80, 0.07, 6, false), [curve]);
  const wallU = useMemo(() => {
    for (let u = 0; u <= 1; u += 0.005) if (curve.getPointAt(u).x > wallX) return u;
    return 1;
  }, [curve, wallX]);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const inst = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const N = 14;
  useFrame(({ clock }) => {
    const th = threat.current ?? 0;
    const sh = shield.current ?? 0;
    if (mat.current) mat.current.opacity = Math.max(th, sh * 0.25) * 0.9;
    if (!inst.current) return;
    for (let i = 0; i < N; i++) {
      let u = (i / N + clock.elapsedTime * 0.22) % 1;
      const blocked = sh > 0.5 && u > wallU;
      if (blocked) u = wallU;
      dummy.position.copy(curve.getPointAt(u));
      dummy.scale.setScalar((blocked ? 0.05 : 0.26) * Math.max(th, sh * 0.6));
      dummy.updateMatrix();
      inst.current.setMatrixAt(i, dummy.matrix);
    }
    inst.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <mesh geometry={tube}>
        <meshBasicMaterial ref={mat} color="#ff2d55" transparent opacity={0} toneMapped={false} />
      </mesh>
      <instancedMesh ref={inst} args={[undefined, undefined, N]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial color="#ff4d6d" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

export function Ripples({ at, level, color = "#ff2d55", max = 16 }: { at: THREE.Vector3; level: RefObject<number>; color?: string; max?: number }) {
  const rings = useRef<THREE.Mesh[]>([]);
  useFrame(({ clock }) => {
    const v = level.current ?? 0;
    rings.current.forEach((m, i) => {
      if (!m) return;
      const p = (clock.elapsedTime * 0.45 + i / 3) % 1;
      m.scale.setScalar(0.5 + p * max);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - p) * v * 0.9;
    });
  });
  return (
    <group position={[at.x, 0.06, at.z]} rotation-x={-Math.PI / 2}>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => (rings.current[i] = m!)}>
          <ringGeometry args={[0.92, 1, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0} toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

const shieldVertex = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = position;
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const shieldFragment = /* glsl */ `
uniform float uTime;
uniform float uLevel;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vPos;
float hexEdge(vec2 p) {
  p *= 1.6;
  vec2 r = vec2(1.0, 1.732);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 q = abs(g);
  float d = max(dot(q, normalize(vec2(1.0, 1.732))), q.x);
  return smoothstep(0.42, 0.5, d);
}
void main() {
  float fres = pow(1.0 - abs(dot(vNormal, vView)), 2.2);
  vec2 uv = vec2(atan(vPos.z, vPos.x) * 6.0, vPos.y * 0.9);
  float hex = hexEdge(uv);
  float scan = smoothstep(0.0, 0.08, fract(vPos.y * 0.08 - uTime * 0.35)) * smoothstep(0.16, 0.08, fract(vPos.y * 0.08 - uTime * 0.35));
  vec3 col = vec3(0.25, 0.85, 1.0);
  float a = (fres * 0.85 + hex * 0.22 + scan * 0.35) * uLevel;
  gl_FragColor = vec4(col * (1.0 + hex), a);
}`;

export function ShieldDome({ level, radius = 21 }: { level: RefObject<number>; radius?: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uLevel: { value: 0 } }), []);
  useFrame((_, dt) => {
    if (!mat.current) return;
    mat.current.uniforms.uTime.value += dt;
    mat.current.uniforms.uLevel.value = level.current ?? 0;
  });
  return (
    <mesh>
      <sphereGeometry args={[radius, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <shaderMaterial ref={mat} vertexShader={shieldVertex} fragmentShader={shieldFragment} uniforms={uniforms} transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

export function Firewall({ level, position, height = 14, width = 26 }: { level: RefObject<number>; position: [number, number, number]; height?: number; width?: number }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const edge = useRef<THREE.LineBasicMaterial>(null);
  useFrame(({ clock }) => {
    const v = level.current ?? 0;
    if (mat.current) mat.current.opacity = v * (0.12 + 0.05 * Math.sin(clock.elapsedTime * 3));
    if (edge.current) edge.current.opacity = v;
  });
  const frame = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const w = width / 2;
    const pts: number[] = [];
    for (let i = 0; i <= 10; i++) {
      const z = -w + (i / 10) * width;
      pts.push(0, 0, z, 0, height, z);
    }
    for (let j = 0; j <= 6; j++) {
      const y = (j / 6) * height;
      pts.push(0, y, -w, 0, y, w);
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [height, width]);
  return (
    <group position={position}>
      <mesh position-y={height / 2} rotation-y={Math.PI / 2}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial ref={mat} color="#22d3ee" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <lineSegments geometry={frame}>
        <lineBasicMaterial ref={edge} color="#67e8f9" transparent opacity={0} toneMapped={false} />
      </lineSegments>
    </group>
  );
}
