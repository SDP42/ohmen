import { Float, Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function Swarm({ count = 2600, accent }: { count?: number; accent: string }) {
  const ref = useRef<THREE.Points>(null);
  const { positions, seeds } = useMemo(() => {
    const p = new Float32Array(count * 3);
    const s = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 6 + Math.random() * 18;
      const a = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 6 * Math.exp(-r / 14);
      p.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
      s[i] = Math.random();
    }
    return { positions: p, seeds: s };
  }, [count]);
  const color = useMemo(() => new THREE.Color(accent), [accent]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * 0.05;
    (ref.current.material as THREE.PointsMaterial).color.lerp(color, 0.04);
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-seed" args={[seeds, 1]} />
      </bufferGeometry>
      <pointsMaterial size={0.06} color={accent} transparent opacity={0.85} sizeAttenuation toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function Ring({ radius, tilt, speed, color }: { radius: number; tilt: [number, number, number]; speed: number; color: string }) {
  const group = useRef<THREE.Group>(null);
  const sat = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed;
    if (sat.current) sat.current.position.set(Math.cos(t) * radius, 0, Math.sin(t) * radius);
    if (group.current) group.current.rotation.y += 0.001;
  });
  return (
    <group ref={group} rotation={tilt}>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[radius, 0.012, 8, 160]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.7} />
      </mesh>
      <mesh ref={sat}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
    </group>
  );
}

function Core({ accent, pulse }: { accent: string; pulse: number }) {
  const shell = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  const color = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (shell.current) {
      shell.current.rotation.x += dt * 0.12;
      shell.current.rotation.y += dt * 0.18;
      color.set(accent);
      (shell.current.material as THREE.MeshBasicMaterial).color.lerp(color, 0.06);
    }
    if (inner.current) {
      const s = 1 + Math.sin(t * 2.2) * 0.06 + pulse * 0.35;
      inner.current.scale.setScalar(s);
      (inner.current.material as THREE.MeshBasicMaterial).color.lerp(color, 0.05);
    }
  });
  return (
    <Float speed={1.2} rotationIntensity={0.2} floatIntensity={0.6}>
      <mesh ref={shell}>
        <icosahedronGeometry args={[2.4, 1]} />
        <meshBasicMaterial wireframe color={accent} toneMapped={false} transparent opacity={0.9} />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[1.7, 2]} />
        <meshBasicMaterial wireframe color="#1e3a8a" transparent opacity={0.35} />
      </mesh>
      <mesh ref={inner}>
        <sphereGeometry args={[0.75, 32, 32]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <Ring radius={3.6} tilt={[0.4, 0, 0.2]} speed={0.7} color="#60a5fa" />
      <Ring radius={4.6} tilt={[-0.6, 0.3, 0]} speed={-0.45} color="#a78bfa" />
      <Ring radius={5.6} tilt={[1.1, -0.2, 0.4]} speed={0.3} color="#22d3ee" />
    </Float>
  );
}

function Floor() {
  return (
    <gridHelper args={[80, 64, "#1d3a6e", "#0e1d38"]} position={[0, -4.5, 0]}>
      <meshBasicMaterial attach="material" transparent opacity={0.4} />
    </gridHelper>
  );
}

function Rig() {
  useFrame((state) => {
    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, state.pointer.x * 2.2, 0.04);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, 1.5 + state.pointer.y * 1.2, 0.04);
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function CoreScene({ accent = "#4f8dff", pulse = 0 }: { accent?: string; pulse?: number }) {
  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [0, 1.5, 13], fov: 42 }} onCreated={({ gl }) => gl.setClearColor("#03060d")}>
      <fog attach="fog" args={["#03060d", 14, 40]} />
      <group position={[3.4, 0.2, 0]}>
        <Core accent={accent} pulse={pulse} />
        <Swarm accent={accent} />
      </group>
      <Sparkles count={120} scale={[24, 10, 24]} size={2} speed={0.3} color="#8cc8ff" />
      <Floor />
      <Rig />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={1.3} luminanceThreshold={0.15} radius={0.8} />
        <Vignette offset={0.25} darkness={0.85} />
      </EffectComposer>
    </Canvas>
  );
}
