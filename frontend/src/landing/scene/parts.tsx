import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type ReactNode, type RefObject, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

export const POS = {
  gateway: new THREE.Vector3(2.6, 1.1, 10.6),
  rtu: new THREE.Vector3(3.9, 1.1, 10.6),
  plc: new THREE.Vector3(5.2, 1.1, 10.6),
  control: new THREE.Vector3(-40, 0, -20),
  corporate: new THREE.Vector3(-58, 0, 36),
  hospital: new THREE.Vector3(32, 0, 28),
  water: new THREE.Vector3(-8, 0, 36),
  rail: new THREE.Vector3(24, 0, -28),
};

// --------------------------------------------------------------------------- ground

const groundVertex = /* glsl */ `
varying vec3 vPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const groundFragment = /* glsl */ `
uniform float uTime;
uniform float uThreat;
varying vec3 vPos;
float gridLine(vec2 p, float s) {
  vec2 q = p / s;
  vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
  return 1.0 - min(min(g.x, g.y), 1.0);
}
void main() {
  float d = length(vPos.xz);
  float minor = gridLine(vPos.xz, 6.0);
  float major = gridLine(vPos.xz, 36.0);
  // Colours authored in sRGB, converted to linear at the end for the post-processing pipeline.
  vec3 col = vec3(0.020, 0.040, 0.085);
  col += vec3(0.10, 0.22, 0.46) * minor * 0.55;
  col += vec3(0.22, 0.48, 1.00) * major * 0.70;
  float sweep = smoothstep(3.0, 0.0, abs(d - mod(uTime * 22.0, 300.0)));
  col += vec3(0.30, 0.60, 1.0) * sweep * 0.35 * (1.0 - uThreat);
  float threatRing = smoothstep(2.5, 0.0, abs(d - mod(uTime * 30.0, 120.0))) * uThreat;
  col += vec3(1.0, 0.25, 0.35) * threatRing * 0.5 * smoothstep(120.0, 0.0, d);
  float fade = smoothstep(430.0, 40.0, d);
  gl_FragColor = vec4(pow(col * fade, vec3(2.2)), 1.0);
}`;

export function Ground({ threat }: { threat: RefObject<number> }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uThreat: { value: 0 } }), []);
  useFrame((_, dt) => {
    if (!mat.current) return;
    mat.current.uniforms.uTime.value += dt;
    mat.current.uniforms.uThreat.value = threat.current;
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
      <planeGeometry args={[1000, 1000, 1, 1]} />
      <shaderMaterial ref={mat} vertexShader={groundVertex} fragmentShader={groundFragment} uniforms={uniforms} />
    </mesh>
  );
}

// --------------------------------------------------------------------------- city

const cityVertex = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vRand;
varying float vY;
void main() {
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vRand = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  vY = position.y + 0.5;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const cityFragment = /* glsl */ `
uniform float uTime;
uniform float uDim;
uniform float uThreat;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vRand;
varying float vY;
float hash(vec3 p) { return fract(sin(dot(p, vec3(17.1, 113.7, 41.3))) * 43758.5453); }
void main() {
  float d = length(vWorld.xz);
  // Colours authored in sRGB, converted to linear at the end for the post-processing pipeline.
  vec3 col = mix(vec3(0.030, 0.055, 0.110), vec3(0.060, 0.110, 0.210), vY);
  if (abs(vNormalW.y) < 0.5) {
    float h = abs(vNormalW.x) > 0.5 ? vWorld.z : vWorld.x;
    float fy = vWorld.y / 1.15;
    float fh = h / 0.95;
    float win = step(0.28, fract(fy)) * step(fract(fy), 0.74) * step(0.25, fract(fh)) * step(fract(fh), 0.78);
    float r = hash(vec3(floor(fy), floor(fh), vRand * 91.0));
    float lit = step(0.76, r);
    float flicker = 0.85 + 0.15 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
    vec3 warm = mix(vec3(1.0, 0.74, 0.42), vec3(0.62, 0.82, 1.0), step(0.5, fract(r * 7.0)));
    col = mix(col, warm * 0.95 * flicker, win * lit * (1.0 - uDim * 0.6));
    col += win * (1.0 - lit) * vec3(0.02, 0.04, 0.08);
  } else {
    col = vec3(0.035, 0.070, 0.140);
  }
  float edge = smoothstep(0.965, 1.0, vY);
  col += vec3(0.25, 0.50, 1.0) * edge * 0.35;
  col = mix(col, col * vec3(1.3, 0.55, 0.6), uThreat * smoothstep(90.0, 20.0, d) * 0.6);
  float fade = smoothstep(380.0, 50.0, d);
  gl_FragColor = vec4(pow(col * fade, vec3(2.2)), 1.0);
}`;

export function City({ dim, threat }: { dim: RefObject<number>; threat: RefObject<number> }) {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const { geometry, matrices, count } = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const list: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    const keepClear = [new THREE.Vector3(0, 0, 0), POS.control, POS.hospital, POS.water, POS.rail, POS.corporate];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let x = -190; x <= 190; x += 6.5) {
      for (let z = -190; z <= 190; z += 6.5) {
        const jx = x + (rnd() - 0.5) * 2.2;
        const jz = z + (rnd() - 0.5) * 2.2;
        const p = new THREE.Vector3(jx, 0, jz);
        if (p.length() < 30 || p.length() > 175 || jz > 92 || keepClear.some((c) => c.distanceTo(p) < 13)) continue;
        if (Math.abs(jz - (jx * 0.35 - 20)) < 4 || Math.abs(jx + 70) < 3.5) continue; // two avenues
        if (rnd() < 0.18) continue;
        const downtown = Math.exp(-((jx - 70) ** 2 + (jz + 70) ** 2) / 3500) + Math.exp(-((jx + 90) ** 2 + (jz - 60) ** 2) / 2500) * 0.7;
        const h = 2 + rnd() * 7 + downtown * (18 + rnd() * 38) + (rnd() < 0.04 ? 20 : 0);
        const w = 2.4 + rnd() * 2.6;
        const dpt = 2.4 + rnd() * 2.6;
        dummy.position.set(jx, h / 2, jz);
        dummy.scale.set(w, h, dpt);
        dummy.rotation.y = rnd() < 0.15 ? 0.3 : 0;
        dummy.updateMatrix();
        list.push(dummy.matrix.clone());
      }
    }
    return { geometry: g, matrices: list, count: list.length };
  }, []);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uDim: { value: 0 }, uThreat: { value: 0 } }), []);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    matrices.forEach((m, i) => mesh.current!.setMatrixAt(i, m));
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [matrices]);
  useFrame((_, dt) => {
    if (!mat.current) return;
    mat.current.uniforms.uTime.value += dt;
    mat.current.uniforms.uDim.value = dim.current;
    mat.current.uniforms.uThreat.value = threat.current;
  });
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, count]} frustumCulled={false}>
      <shaderMaterial ref={mat} vertexShader={cityVertex} fragmentShader={cityFragment} uniforms={uniforms} />
    </instancedMesh>
  );
}

// --------------------------------------------------------------------------- towers

function towerGeometry(height = 13) {
  const pts: number[] = [];
  const levels = 6;
  const leg = (y: number) => THREE.MathUtils.lerp(1.4, 0.35, y / height);
  const corners = (y: number) => {
    const s = leg(y);
    return [
      [-s, y, -s],
      [s, y, -s],
      [s, y, s],
      [-s, y, s],
    ];
  };
  for (let i = 0; i < levels; i++) {
    const y0 = (i / levels) * height;
    const y1 = ((i + 1) / levels) * height;
    const a = corners(y0);
    const b = corners(y1);
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      pts.push(...a[k], ...b[k]); // legs
      pts.push(...a[k], ...b[n], ...a[n], ...b[k]); // cross bracing
      pts.push(...b[k], ...b[n]); // ring
    }
  }
  for (const y of [height * 0.78, height * 0.94]) {
    const w = y > height * 0.9 ? 2.6 : 3.4;
    pts.push(-w, y, 0, w, y, 0);
    pts.push(-w, y, 0, -0.4, y + 0.9, 0, w, y, 0, 0.4, y + 0.9, 0);
  }
  pts.push(0, height, 0, 0, height + 1.6, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

const TOWER = towerGeometry();

export function Tower({ position, rotation = 0, color = "#7fb6ff" }: { position: [number, number, number]; rotation?: number; color?: string }) {
  return (
    <lineSegments geometry={TOWER} position={position} rotation-y={rotation}>
      <lineBasicMaterial color={color} transparent opacity={0.85} />
    </lineSegments>
  );
}

// --------------------------------------------------------------------------- substation

const steel = new THREE.MeshStandardMaterial({ color: "#0d1a30", metalness: 0.6, roughness: 0.45, emissive: "#061226", emissiveIntensity: 0.6 });

function Transformer({ x, label }: { x: number; label: string }) {
  return (
    <group position={[x, 0, -3]} name={label}>
      <mesh position-y={1.7} material={steel}>
        <boxGeometry args={[3.2, 3, 2.2]} />
        <Edges color="#5fb2ff" />
      </mesh>
      {Array.from({ length: 7 }).map((_, i) => (
        <mesh key={i} position={[-1.35 + i * 0.45, 1.6, 1.3]} material={steel}>
          <boxGeometry args={[0.08, 2.2, 0.5]} />
        </mesh>
      ))}
      {[-0.9, 0, 0.9].map((bx) => (
        <group key={bx} position={[bx, 3.2, 0]}>
          <mesh position-y={0.5}>
            <cylinderGeometry args={[0.09, 0.14, 1.1, 8]} />
            <meshStandardMaterial color="#b9d6ff" emissive="#5aa8ff" emissiveIntensity={0.6} />
          </mesh>
          <mesh position-y={1.1}>
            <sphereGeometry args={[0.12, 10, 10]} />
            <meshBasicMaterial color="#cfe8ff" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Cabinet({ position, color }: { position: THREE.Vector3; color: string }) {
  const led = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (led.current) (led.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 6 + position.x);
  });
  return (
    <group position={[position.x, 0, position.z]}>
      <mesh position-y={1} material={steel}>
        <boxGeometry args={[0.9, 2, 0.6]} />
        <Edges color={color} />
      </mesh>
      <mesh ref={led} position={[0.25, 1.7, 0.31]}>
        <boxGeometry args={[0.12, 0.12, 0.02]} />
        <meshBasicMaterial color={color} transparent />
      </mesh>
    </group>
  );
}

export function Substation({ alert }: { alert: RefObject<number> }) {
  const glow = useRef<THREE.PointLight>(null);
  const fence = useMemo(() => {
    const pts: number[] = [];
    const w = 15;
    const d = 13;
    const corners = [
      [-w, -d],
      [w, -d],
      [w, d],
      [-w, d],
    ];
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = corners[i];
      const [x1, z1] = corners[(i + 1) % 4];
      for (const y of [0.4, 1.2, 2.0]) pts.push(x0, y, z0, x1, y, z1);
      const steps = 12;
      for (let s = 0; s <= steps; s++) {
        const x = THREE.MathUtils.lerp(x0, x1, s / steps);
        const z = THREE.MathUtils.lerp(z0, z1, s / steps);
        pts.push(x, 0, z, x, 2.2, z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);
  useFrame(() => {
    if (glow.current) glow.current.intensity = 6 + alert.current * 90;
  });
  return (
    <group>
      <mesh position-y={0.15}>
        <boxGeometry args={[30, 0.3, 26]} />
        <meshStandardMaterial color="#071122" metalness={0.2} roughness={0.8} />
        <Edges color="#2f6fd6" />
      </mesh>
      <lineSegments geometry={fence}>
        <lineBasicMaterial color="#4c8ff0" transparent opacity={0.5} />
      </lineSegments>
      <Transformer x={-7} label="TX-A1" />
      <Transformer x={0} label="TX-A2" />
      <Transformer x={7} label="TX-A3" />
      {/* busbar gantry */}
      {[-10, -5, 0, 5, 10].map((x) => (
        <mesh key={x} position={[x, 3.6, 4]} material={steel}>
          <boxGeometry args={[0.25, 7.2, 0.25]} />
          <Edges color="#3f86ee" />
        </mesh>
      ))}
      <mesh position={[0, 7.1, 4]} material={steel}>
        <boxGeometry args={[20.5, 0.3, 0.3]} />
        <Edges color="#5fb2ff" />
      </mesh>
      {/* control building */}
      <group position={[9, 0, 7]}>
        <mesh position-y={1.9} material={steel}>
          <boxGeometry args={[7, 3.8, 4.6]} />
          <Edges color="#5fb2ff" />
        </mesh>
        {[-2.2, -0.7, 0.8, 2.3].map((x) => (
          <mesh key={x} position={[x, 2.3, 2.31]}>
            <planeGeometry args={[0.9, 0.7]} />
            <meshBasicMaterial color="#7fc4ff" toneMapped={false} />
          </mesh>
        ))}
      </group>
      <Cabinet position={POS.gateway} color="#ff6b8a" />
      <Cabinet position={POS.rtu} color="#facc15" />
      <Cabinet position={POS.plc} color="#facc15" />
      <pointLight ref={glow} position={[2, 5, 9]} color="#ff2850" distance={40} decay={1.4} />
    </group>
  );
}

// --------------------------------------------------------------------------- facilities

function Holo({ position, children, color }: { position: THREE.Vector3; children: ReactNode; color: string }) {
  return (
    <group position={position}>
      {children}
      <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
        <ringGeometry args={[6.5, 6.8, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Facilities() {
  const holo = (c: string) => new THREE.MeshStandardMaterial({ color: "#0b1a33", emissive: c, emissiveIntensity: 0.12, metalness: 0.3, roughness: 0.6 });
  return (
    <group>
      <Holo position={POS.hospital} color="#ff6b8a">
        <mesh position-y={3.2} material={holo("#ff6b8a")}>
          <boxGeometry args={[9, 6.4, 6]} />
          <Edges color="#ffc2cf" />
        </mesh>
        <mesh position={[0, 6.6, 0]}>
          <boxGeometry args={[2.6, 0.25, 0.7]} />
          <meshBasicMaterial color="#ff3d64" toneMapped={false} />
        </mesh>
        <mesh position={[0, 6.6, 0]}>
          <boxGeometry args={[0.7, 0.25, 2.6]} />
          <meshBasicMaterial color="#ff3d64" toneMapped={false} />
        </mesh>
      </Holo>
      <Holo position={POS.water} color="#38bdf8">
        {[-2.2, 2.2].map((x) => (
          <mesh key={x} position={[x, 2.4, 0]} material={holo("#38bdf8")}>
            <cylinderGeometry args={[1.8, 1.8, 4.8, 24]} />
            <Edges color="#9be3ff" threshold={30} />
          </mesh>
        ))}
        <mesh position={[0, 1, 3.2]} material={holo("#38bdf8")}>
          <boxGeometry args={[6, 2, 2]} />
          <Edges color="#9be3ff" />
        </mesh>
      </Holo>
      <Holo position={POS.rail} color="#c4b5fd">
        <mesh position-y={1.4} material={holo("#a78bfa")}>
          <boxGeometry args={[12, 2.8, 4]} />
          <Edges color="#ddd6fe" />
        </mesh>
      </Holo>
      <Holo position={POS.control} color="#60a5fa">
        <mesh position-y={2.8} material={holo("#60a5fa")}>
          <boxGeometry args={[11, 5.6, 8]} />
          <Edges color="#bfdbfe" />
        </mesh>
        <mesh position={[3.5, 7.4, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 3.6, 6]} />
          <meshBasicMaterial color="#93c5fd" />
        </mesh>
      </Holo>
      <group position={POS.corporate}>
        <mesh position-y={9}>
          <boxGeometry args={[7, 18, 7]} />
          <meshStandardMaterial color="#0a1528" emissive="#1e3a6e" emissiveIntensity={0.25} transparent opacity={0.92} />
          <Edges color="#7aa5e8" />
        </mesh>
      </group>
    </group>
  );
}
