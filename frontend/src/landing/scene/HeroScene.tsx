import { Html, Sparkles, Stars } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import type { MotionValue } from "motion/react";
import { type RefObject, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { chapterOf } from "./chapters";
import { AttackPath, Firewall, PowerLine, Ripples, ShieldDome, SignalLine, arc, span } from "./flows";
import { City, Facilities, Ground, POS, Substation, Tower } from "./parts";

type V3 = [number, number, number];
const KEYS: { p: number; pos: V3; look: V3 }[] = [
  { p: 0.0, pos: [0, 74, 140], look: [0, 0, -8] },
  { p: 0.16, pos: [60, 46, 86], look: [0, 4, 0] },
  { p: 0.31, pos: [20, 13, 30], look: [1, 3, 3] },
  { p: 0.46, pos: [-34, 26, 30], look: [-8, 4, -2] },
  { p: 0.62, pos: [-6, 40, 66], look: [4, 2, 16] },
  { p: 0.78, pos: [30, 22, 38], look: [-2, 3, 4] },
  { p: 0.92, pos: [0, 96, 150], look: [0, 0, 0] },
  { p: 1.0, pos: [0, 118, 172], look: [0, 0, 0] },
];

const ease = (t: number) => t * t * (3 - 2 * t);
const damp = THREE.MathUtils.damp;

interface Levels {
  cyber: RefObject<number>;
  threat: RefObject<number>;
  shield: RefObject<number>;
  dim: RefObject<number>;
  tint: RefObject<number>;
}

function Director({ progress, levels, onChapter }: { progress: MotionValue<number>; levels: Levels; onChapter: (c: number) => void }) {
  const smooth = useRef(0);
  const look = useRef(new THREE.Vector3(0, 0, -8));
  const tmpPos = useMemo(() => new THREE.Vector3(), []);
  const tmpLook = useMemo(() => new THREE.Vector3(), []);
  const last = useRef(-1);
  useFrame((state, dt) => {
    const d = Math.min(dt, 0.05);
    smooth.current = damp(smooth.current, progress.get(), 3.4, d);
    const p = smooth.current;
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = ease(THREE.MathUtils.clamp((p - a.p) / (b.p - a.p), 0, 1));
    tmpPos.set(...a.pos).lerp(new THREE.Vector3(...b.pos), t);
    tmpLook.set(...a.look).lerp(new THREE.Vector3(...b.look), t);
    const orbit = Math.sin(state.clock.elapsedTime * 0.06) * 0.12 * (p < 0.12 || p > 0.86 ? 1 : 0.25);
    tmpPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit);
    tmpPos.x += state.pointer.x * 3.5;
    tmpPos.y += state.pointer.y * 2;
    state.camera.position.lerp(tmpPos, 1 - Math.exp(-5 * d));
    look.current.lerp(tmpLook, 1 - Math.exp(-5 * d));
    state.camera.lookAt(look.current);

    const ch = chapterOf(p);
    if (ch !== last.current) {
      last.current = ch;
      onChapter(ch);
    }
    levels.cyber.current = damp(levels.cyber.current, ch >= 3 && ch <= 5 ? 1 : ch === 2 ? 0.45 : 0.18, 3, d);
    levels.threat.current = damp(levels.threat.current, ch === 4 ? 1 : ch === 5 ? 0.1 : 0, 2.6, d);
    levels.shield.current = damp(levels.shield.current, ch === 5 ? 1 : ch === 6 ? 0.25 : 0, 2.4, d);
    levels.dim.current = damp(levels.dim.current, ch >= 2 && ch <= 5 ? 0.7 : 0, 2, d);
    levels.tint.current = damp(levels.tint.current, ch === 4 ? 1 : 0, 2.2, d);
  });
  return null;
}

function Tag({ position, title, sub, color, show }: { position: V3; title: string; sub?: string; color: string; show: boolean }) {
  return (
    <Html position={position} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <div
        style={{ opacity: show ? 1 : 0, transform: `translate(-50%, calc(-100% - ${show ? 0 : 10}px))`, transition: "opacity .6s ease, transform .6s ease" }}
        className="flex flex-col items-center"
      >
        <div className="flex items-center gap-1.5 rounded-[4px] border px-2 py-1 font-mono text-[10px] whitespace-nowrap backdrop-blur-md" style={{ borderColor: `${color}88`, background: "rgb(4 10 22 / 0.78)", color, boxShadow: `0 0 18px -4px ${color}` }}>
          <span className="size-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
          {title}
        </div>
        {sub && <div className="mt-0.5 rounded-[3px] bg-black/50 px-1.5 py-0.5 font-mono text-[9px] whitespace-nowrap text-[#b6c6e6]">{sub}</div>}
        <div className="h-5 w-px" style={{ background: `linear-gradient(${color}, transparent)` }} />
      </div>
    </Html>
  );
}

function Network({ levels }: { levels: Levels }) {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const top = 10.1;
  const lines = useMemo(() => {
    const towersIn: [number, number][] = [[-178, -68], [-138, -54], [-98, -41], [-58, -28], [-24, -14]];
    const conductors = [-1.6, 1.6].map((off) => {
      const pts: THREE.Vector3[] = [];
      towersIn.forEach(([x, z], i) => {
        if (i === towersIn.length - 1) return;
        const [x2, z2] = towersIn[i + 1];
        pts.push(...span(v(x, top, z + off), v(x2, top, z2 + off), 2.4, 14).slice(i === 0 ? 0 : 1));
      });
      const [lx, lz] = towersIn[towersIn.length - 1];
      pts.push(...span(v(lx, top, lz + off), v(-10, 7.1, 4 + off * 0.5), 1.2, 10).slice(1));
      return pts;
    });
    const feeder = (from: THREE.Vector3, towers: [number, number][], to: THREE.Vector3) => {
      const stops = [from, ...towers.map(([x, z]) => v(x, top, z)), to];
      const pts: THREE.Vector3[] = [];
      stops.forEach((s, i) => {
        if (i === stops.length - 1) return;
        pts.push(...span(s, stops[i + 1], 1.3, 12).slice(i === 0 ? 0 : 1));
      });
      return pts;
    };
    return {
      incoming: conductors,
      hospital: feeder(v(10, 7.1, 4), [[20, 15]], v(POS.hospital.x, 6.5, POS.hospital.z)),
      water: feeder(v(-4, 7.1, 4), [[-6, 21]], v(POS.water.x, 4.9, POS.water.z)),
      rail: feeder(v(4, 7.1, 4), [[14, -12]], v(POS.rail.x, 2.9, POS.rail.z)),
      east: feeder(v(10, 7.1, 4), [[36, -2], [62, -8]], v(90, top, -14)),
      north: feeder(v(-10, 7.1, 4), [[-26, -40], [-40, -66]], v(-54, top, -92)),
      towers: [...towersIn, [20, 15], [-6, 21], [14, -12], [36, -2], [62, -8], [-26, -40], [-40, -66]] as [number, number][],
    };
  }, []);
  const comms = useMemo(() => {
    const cc = v(POS.control.x, 6, POS.control.z);
    return {
      gateway: arc(cc, v(POS.gateway.x, 2.2, POS.gateway.z), 16),
      far: [v(-150, 2, 90), v(130, 2, -100), v(155, 2, 70)].map((p) => arc(cc, p, 34, 50)),
      control: [v(-7, 4, -3), v(0, 4, -3), v(7, 4, -3)].map((p) => arc(v(POS.rtu.x, 2.2, POS.rtu.z), p, 3, 24)),
      plc: [v(-7, 4, -3), v(0, 4, -3)].map((p) => arc(v(POS.plc.x, 2.2, POS.plc.z), p, 2.2, 24)),
      attack: arc(v(POS.corporate.x, 16, POS.corporate.z), v(POS.gateway.x, 2.2, POS.gateway.z), 10, 60),
    };
  }, []);
  return (
    <group>
      {lines.towers.map(([x, z], i) => (
        <Tower key={i} position={[x, 0, z]} rotation={Math.atan2(z, x) + Math.PI / 2} />
      ))}
      {lines.incoming.map((pts, i) => (
        <PowerLine key={i} points={pts} particles={16} speed={0.035} />
      ))}
      <PowerLine points={lines.hospital} tint={levels.tint} />
      <PowerLine points={lines.water} tint={levels.tint} />
      <PowerLine points={lines.rail} tint={levels.tint} />
      <PowerLine points={lines.east} particles={10} tint={levels.tint} speed={0.05} />
      <PowerLine points={lines.north} particles={10} speed={0.05} />
      <SignalLine points={comms.gateway} color="#60a5fa" level={levels.cyber} width={2} particles={4} />
      {comms.far.map((pts, i) => (
        <SignalLine key={i} points={pts} color="#60a5fa" level={levels.cyber} width={1.4} particles={3} />
      ))}
      {[...comms.control, ...comms.plc].map((pts, i) => (
        <SignalLine key={i} points={pts} color="#facc15" level={levels.cyber} width={1.2} dash={0.35} gap={0.3} particles={2} />
      ))}
      <AttackPath points={comms.attack} threat={levels.threat} shield={levels.shield} wallX={-17} />
      <Firewall level={levels.shield} position={[-17, 0, 22]} />
      <Ripples at={POS.gateway} level={levels.threat} />
      <ShieldDome level={levels.shield} />
    </group>
  );
}

function Labels({ chapter }: { chapter: number }) {
  return (
    <group>
      <Tag position={[-7, 5.6, -3]} title="TX-A1 · 20 MVA" sub="Zone A primary" color="#7cc4ff" show={chapter === 2} />
      <Tag position={[0, 5.6, -3]} title="TX-A2 · standby" sub="auto-changeover" color="#7cc4ff" show={chapter === 2} />
      <Tag position={[7, 5.6, -3]} title="TX-A3 · Hospital Feeder 01" sub="criticality: very high" color="#7cc4ff" show={chapter === 2} />
      <Tag position={[POS.gateway.x - 1.2, 2.6, POS.gateway.z]} title="GW-001 · SG-4000 fw 2.4.1" sub="single comms path" color="#ff8fa6" show={chapter === 2 || chapter === 3} />
      <Tag position={[POS.rtu.x + 0.4, 3.6, POS.rtu.z]} title="RTU-001 · DNP3" sub="breaker control" color="#facc15" show={chapter === 2 || chapter === 3} />
      <Tag position={[POS.plc.x + 1.4, 2.6, POS.plc.z]} title="PLC-001" sub="changeover logic" color="#facc15" show={chapter === 2} />
      <Tag position={[POS.control.x, 9, POS.control.z]} title="SCADA · Control Centre BKC" sub="IEC 60870-5-104 polling" color="#60a5fa" show={chapter === 3} />
      <Tag position={[POS.corporate.x, 19, POS.corporate.z]} title="Corporate IT" sub="legacy rule FW-CORP-117 → GW-001:8443" color="#fbbf24" show={chapter === 3} />
      <Tag position={[POS.gateway.x, 3.4, POS.gateway.z]} title="⚠ CONTINGENCY DETECTED · GW-001" sub="T+00:05 · auth bypass + unusual sessions" color="#ff4d6d" show={chapter === 4} />
      <Tag position={[POS.hospital.x, 8, POS.hospital.z]} title="City General Hospital" sub="on backup · 8h endurance" color="#f59e0b" show={chapter === 4} />
      <Tag position={[POS.water.x, 6.4, POS.water.z]} title="Water Pumping Station A" sub="backup exhausted in 1.5h" color="#ff4d6d" show={chapter === 4} />
      <Tag position={[POS.rail.x, 4.4, POS.rail.z]} title="Rail signalling hub" sub="on backup · 4h" color="#f59e0b" show={chapter === 4} />
      <Tag position={[-17, 15, 22]} title="SEGMENTATION APPLIED" sub="FW-CORP-117 removed · conduit controlled" color="#22d3ee" show={chapter === 5} />
      <Tag position={[POS.gateway.x + 0.6, 3.4, POS.gateway.z]} title="GW-001 · priority 86 → 32" sub="NOW → MONITOR" color="#34d399" show={chapter === 5} />
    </group>
  );
}

export default function HeroScene({ progress, onChapter }: { progress: MotionValue<number>; onChapter?: (c: number) => void }) {
  const [chapter, setChapter] = useState(0);
  const levels: Levels = {
    cyber: useRef(0.18),
    threat: useRef(0),
    shield: useRef(0),
    dim: useRef(0),
    tint: useRef(0),
  };
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 74, 140], fov: 38, near: 0.5, far: 1400 }}
      onCreated={({ gl }) => gl.setClearColor("#03060d")}
    >
      <fog attach="fog" args={["#03060d", 110, 460]} />
      <ambientLight intensity={0.45} color="#9cbcff" />
      <directionalLight position={[60, 120, 40]} intensity={0.9} color="#a9c8ff" />
      <Stars radius={360} depth={80} count={1800} factor={4} fade speed={0.4} />
      <Sparkles count={260} scale={[320, 70, 320]} position={[0, 30, 0]} size={2.2} speed={0.25} color="#8cc8ff" opacity={0.5} />
      <Ground threat={levels.threat} />
      <City dim={levels.dim} threat={levels.threat} />
      <Substation alert={levels.threat} />
      <Facilities />
      <Network levels={levels} />
      <Labels chapter={chapter} />
      <Director
        progress={progress}
        levels={levels}
        onChapter={(c) => {
          setChapter(c);
          onChapter?.(c);
        }}
      />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={1.05} luminanceThreshold={0.28} luminanceSmoothing={0.25} radius={0.72} />
        <Vignette offset={0.28} darkness={0.78} />
        <Noise opacity={0.035} />
      </EffectComposer>
    </Canvas>
  );
}
