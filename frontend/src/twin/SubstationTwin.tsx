import { Edges, Html, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { scoreColor } from "../lib/format";
import type { TwinNode } from "../lib/types";

const CABINET_TYPES = new Set(["gateway", "rtu", "plc", "switch", "workstation", "scada", "remote_access"]);

function Cabinet({ node, position, selected, onSelect }: { node: TwinNode; position: [number, number, number]; selected: boolean; onSelect: (id: string) => void }) {
  const mesh = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const color = node.risk ? scoreColor(node.risk.score) : "#60a5fa";
  const hot = node.risk?.priority === "NOW" || Boolean(node.activity);
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const m = mesh.current.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = hot ? 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4) : hover || selected ? 0.6 : 0.25;
  });
  const h = node.type === "scada" ? 2.6 : node.type === "switch" ? 0.9 : 2;
  return (
    <group position={position}>
      <mesh
        ref={mesh}
        position-y={h / 2}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        <boxGeometry args={[1, h, 0.7]} />
        <meshStandardMaterial color="#0c1a31" emissive={color} emissiveIntensity={0.25} metalness={0.4} roughness={0.5} />
        <Edges color={selected ? "#ffffff" : color} />
      </mesh>
      {hot && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
          <ringGeometry args={[0.9, 1.05, 48]} />
          <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.8} />
        </mesh>
      )}
      <Html position={[0, h + 0.5, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div className="flex flex-col items-center">
          <div className="rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap backdrop-blur" style={{ borderColor: `${color}99`, color, background: "rgb(4 10 22 / 0.8)" }}>
            {node.id}
            {node.risk && <span className="ml-1 text-white">{Math.round(node.risk.score)}</span>}
          </div>
          {(hover || selected) && <div className="mt-0.5 rounded bg-black/60 px-1.5 font-mono text-[9px] whitespace-nowrap text-[#c9d6ee]">{node.model ?? node.type}</div>}
        </div>
      </Html>
    </group>
  );
}

function Transformer({ node, position, onSelect, selected, state }: { node: TwinNode; position: [number, number, number]; onSelect: (id: string) => void; selected: boolean; state?: string }) {
  const color = state === "lost" ? "#f43f5e" : state ? "#fb923c" : "#5fb2ff";
  return (
    <group position={position} onClick={(e) => (e.stopPropagation(), onSelect(node.id))}>
      <mesh position-y={1.5}>
        <boxGeometry args={[2.6, 2.6, 1.9]} />
        <meshStandardMaterial color="#0d1a30" emissive={color} emissiveIntensity={state ? 0.35 : 0.08} metalness={0.6} roughness={0.45} />
        <Edges color={selected ? "#ffffff" : color} />
      </mesh>
      {[-0.7, 0, 0.7].map((x) => (
        <mesh key={x} position={[x, 3.3, 0]}>
          <cylinderGeometry args={[0.08, 0.12, 1, 8]} />
          <meshStandardMaterial color="#b9d6ff" emissive="#5aa8ff" emissiveIntensity={0.7} />
        </mesh>
      ))}
      <Html position={[0, 4.4, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div className="rounded-[4px] border border-[#5fb2ff66] bg-[#040a16cc] px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-[#9fd0ff]">{node.id}</div>
      </Html>
    </group>
  );
}

function Pad({ width, depth }: { width: number; depth: number }) {
  const fence = useMemo(() => {
    const pts: number[] = [];
    const w = width / 2;
    const d = depth / 2;
    const c = [[-w, -d], [w, -d], [w, d], [-w, d]];
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = c[i];
      const [x1, z1] = c[(i + 1) % 4];
      for (const y of [0.5, 1.4]) pts.push(x0, y, z0, x1, y, z1);
      for (let s = 0; s <= 10; s++) {
        const x = x0 + ((x1 - x0) * s) / 10;
        const z = z0 + ((z1 - z0) * s) / 10;
        pts.push(x, 0, z, x, 1.6, z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [width, depth]);
  return (
    <group>
      <mesh position-y={0.1}>
        <boxGeometry args={[width, 0.2, depth]} />
        <meshStandardMaterial color="#071122" />
        <Edges color="#2f6fd6" />
      </mesh>
      <lineSegments geometry={fence}>
        <lineBasicMaterial color="#4c8ff0" transparent opacity={0.45} />
      </lineSegments>
      <gridHelper args={[80, 40, "#173262", "#0b1830"]} position-y={-0.01} />
    </group>
  );
}

export default function SubstationTwin({ site, nodes, selected, onSelect, states }: { site: string; nodes: TwinNode[]; selected?: string | null; onSelect: (id: string) => void; states?: Record<string, string> }) {
  const here = nodes.filter((n) => n.site === site);
  const transformers = here.filter((n) => n.type === "transformer");
  const cabinets = here.filter((n) => CABINET_TYPES.has(n.type));
  const width = Math.max(18, transformers.length * 4.2 + 6, cabinets.length * 1.7 + 8);
  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [width * 0.72, width * 0.66, width * 1.05], fov: 40 }} onCreated={({ gl }) => gl.setClearColor("#03060d")}>
      <fog attach="fog" args={["#03060d", 30, 90]} />
      <ambientLight intensity={0.5} color="#9cbcff" />
      <directionalLight position={[10, 20, 8]} intensity={1} color="#bcd4ff" />
      <Pad width={width} depth={16} />
      {transformers.map((t, i) => (
        <Transformer key={t.id} node={t} position={[(i - (transformers.length - 1) / 2) * 4.2 - 2.2, 0, -3]} onSelect={onSelect} selected={selected === t.id} state={states?.[t.id]} />
      ))}
      <mesh position={[width / 2 - 2.8, 1.6, -3]}>
        <boxGeometry args={[3.6, 3.2, 3.2]} />
        <meshStandardMaterial color="#0b1830" metalness={0.3} roughness={0.6} />
        <Edges color="#5fb2ff" />
      </mesh>
      {cabinets.map((c, i) => (
        <Cabinet key={c.id} node={c} position={[(i - (cabinets.length - 1) / 2) * 1.7, 0, 4.2]} selected={selected === c.id} onSelect={onSelect} />
      ))}
      <OrbitControls autoRotate autoRotateSpeed={0.5} enableDamping maxPolarAngle={Math.PI / 2.1} minDistance={8} maxDistance={60} />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.25} radius={0.7} />
        <Vignette offset={0.3} darkness={0.75} />
      </EffectComposer>
    </Canvas>
  );
}
