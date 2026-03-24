'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, OrbitControls, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { SubstationData, GeneratorFuel } from '@/lib/types';

const FUEL_COLORS: Record<string, string> = {
  solar: '#F5A623',
  wind: '#4A90D9',
  gas: '#D9534F',
  hydro: '#5BC0DE',
  nuclear: '#999999',
  biogas: '#00A35C',
};

/* ── Fuel-specific generator geometry ──────────────────── */
function SolarPanel({ scale, color }: { scale: number; color: string }) {
  return (
    <group>
      {[-0.3, 0, 0.3].map((xOff, i) => (
        <mesh key={i} position={[xOff * scale * 2, 0.1, 0]} rotation={[-0.5, 0, 0]} scale={scale * 0.7}>
          <boxGeometry args={[0.8, 0.05, 0.6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} metalness={0.8} roughness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, -0.25, 0]} scale={[0.05, 0.5, 0.05]}>
        <cylinderGeometry args={[1, 1, 1, 8]} />
        <meshStandardMaterial color="#888888" />
      </mesh>
    </group>
  );
}

function WindTurbine({ scale, color, elapsedTime }: { scale: number; color: string; elapsedTime: number }) {
  const bladesRef = useRef<THREE.Group>(null!);
  useFrame(() => {
    if (bladesRef.current) bladesRef.current.rotation.z = elapsedTime * 2.5;
  });
  return (
    <group scale={scale}>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.04, 0.08, 1.2, 8]} />
        <meshStandardMaterial color="#dddddd" />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[0.15, 0.1, 0.08]} />
        <meshStandardMaterial color="#eeeeee" />
      </mesh>
      <group ref={bladesRef} position={[0, 1.2, 0.06]}>
        {[0, 120, 240].map((deg) => (
          <mesh key={deg} rotation={[0, 0, (deg * Math.PI) / 180]}>
            <boxGeometry args={[0.03, 0.7, 0.01]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function GasPlant({ scale, color }: { scale: number; color: string }) {
  return (
    <group scale={scale}>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.6, 0.5, 0.4]} />
        <meshStandardMaterial color="#777777" />
      </mesh>
      <mesh position={[0.15, 0.65, 0]}>
        <cylinderGeometry args={[0.04, 0.06, 0.5, 8]} />
        <meshStandardMaterial color="#999999" />
      </mesh>
      <mesh position={[0.15, 0.92, 0]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

function HydroPlant({ scale, color }: { scale: number; color: string }) {
  return (
    <group scale={scale}>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[1.0, 0.5, 0.15]} />
        <meshStandardMaterial color="#8899aa" />
      </mesh>
      <mesh position={[0, -0.05, -0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.0, 0.4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

function NuclearPlant({ scale, color }: { scale: number; color: string }) {
  return (
    <group scale={scale}>
      <mesh position={[-0.15, 0.35, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 0.7, 12]} />
        <meshStandardMaterial color="#aaaaaa" />
      </mesh>
      <mesh position={[0.15, 0.35, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 0.7, 12]} />
        <meshStandardMaterial color="#aaaaaa" />
      </mesh>
      <mesh position={[0, 0.3, 0.2]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function BiogasPlant({ scale, color }: { scale: number; color: string }) {
  return (
    <group scale={scale}>
      <mesh position={[0, 0.25, 0]}>
        <sphereGeometry args={[0.3, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.1, 16]} />
        <meshStandardMaterial color="#888888" />
      </mesh>
    </group>
  );
}

function FuelGeometry({ fuel, scale, color, elapsedTime }: {
  fuel: GeneratorFuel; scale: number; color: string; elapsedTime: number;
}) {
  switch (fuel) {
    case 'solar': return <SolarPanel scale={scale} color={color} />;
    case 'wind': return <WindTurbine scale={scale} color={color} elapsedTime={elapsedTime} />;
    case 'gas': return <GasPlant scale={scale} color={color} />;
    case 'hydro': return <HydroPlant scale={scale} color={color} />;
    case 'nuclear': return <NuclearPlant scale={scale} color={color} />;
    case 'biogas': return <BiogasPlant scale={scale} color={color} />;
    default:
      return (
        <mesh scale={scale * 0.5}>
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
        </mesh>
      );
  }
}

/* ── Animated energy particle flowing from source to hub ─ */
function EnergyParticle({ start, end, color, speed, active, size }: {
  start: [number, number, number];
  end: [number, number, number];
  color: string;
  speed: number;
  active: boolean;
  size?: number;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  const t = useRef(Math.random());

  useFrame((_, delta) => {
    if (!active || !ref.current) return;
    t.current = (t.current + delta * speed) % 1;
    const p = t.current;
    ref.current.position.set(
      start[0] + (end[0] - start[0]) * p,
      start[1] + (end[1] - start[1]) * p + Math.sin(p * Math.PI) * 0.25,
      start[2] + (end[2] - start[2]) * p,
    );
  });

  if (!active) return null;

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[size || 0.05, 8, 8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} transparent opacity={0.9} />
    </mesh>
  );
}

/* ── Transmission Line with energy flow particles ─────── */
function TransmissionLine({ start, end, color, active }: {
  start: [number, number, number];
  end: [number, number, number];
  color: string;
  active: boolean;
}) {
  const mid: [number, number, number] = [
    (start[0] + end[0]) / 2,
    Math.min(start[1], end[1]) - 0.1,
    (start[2] + end[2]) / 2,
  ];

  return (
    <>
      <Line
        points={[start, mid, end]}
        color={active ? color : '#555555'}
        lineWidth={active ? 2 : 0.8}
        transparent
        opacity={active ? 0.6 : 0.2}
      />
      {/* Many particles for visible energy flow */}
      {active && [0.2, 0.35, 0.5, 0.65, 0.8, 0.95].map((speed, i) => (
        <EnergyParticle
          key={i}
          start={start}
          end={end}
          color={color}
          speed={speed}
          active={active}
          size={0.06}
        />
      ))}
    </>
  );
}

/* ── Central VPP Hub ──────────────────────────────────── */
function CentralHub({ totalMW, isRunning }: { totalMW: number; isRunning: boolean }) {
  const ref = useRef<THREE.Mesh>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);
  const ring2Ref = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.3;
    if (ringRef.current) {
      ringRef.current.rotation.z = state.clock.elapsedTime * 0.5;
      ringRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.1;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z = -state.clock.elapsedTime * 0.35;
      ring2Ref.current.rotation.y = Math.cos(state.clock.elapsedTime * 0.2) * 0.15;
    }
  });

  return (
    <group position={[0, 0.5, 0]}>
      {/* Platform base */}
      <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.9, 32]} />
        <meshStandardMaterial color="#c8d0cc" emissive={isRunning ? '#004422' : '#000000'} emissiveIntensity={0.3} />
      </mesh>
      {/* Core */}
      <mesh ref={ref}>
        <dodecahedronGeometry args={[0.4, 1]} />
        <meshStandardMaterial
          color={isRunning ? '#00ED64' : '#999999'}
          emissive={isRunning ? '#00ED64' : '#555555'}
          emissiveIntensity={isRunning ? 0.8 : 0.2}
          wireframe
        />
      </mesh>
      {/* Inner glow */}
      <mesh>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshStandardMaterial
          color={isRunning ? '#00ED64' : '#888888'}
          emissive={isRunning ? '#00A35C' : '#444444'}
          emissiveIntensity={isRunning ? 1.2 : 0.1}
          transparent
          opacity={0.35}
        />
      </mesh>
      {/* Ring 1 */}
      <mesh ref={ringRef}>
        <torusGeometry args={[0.65, 0.015, 16, 64]} />
        <meshStandardMaterial
          color={isRunning ? '#00ED64' : '#888888'}
          emissive={isRunning ? '#00ED64' : '#555555'}
          emissiveIntensity={isRunning ? 1.5 : 0.1}
        />
      </mesh>
      {/* Ring 2 */}
      <mesh ref={ring2Ref}>
        <torusGeometry args={[0.55, 0.01, 16, 64]} />
        <meshStandardMaterial
          color={isRunning ? '#66ffaa' : '#777777'}
          emissive={isRunning ? '#66ffaa' : '#444444'}
          emissiveIntensity={isRunning ? 1.0 : 0.05}
        />
      </mesh>
      {/* Labels */}
      <Text position={[0, -0.85, 0]} fontSize={0.18} color="#333333" anchorX="center">
        VPP Control Hub
      </Text>
      <Text position={[0, -1.05, 0]} fontSize={0.13} color={isRunning ? '#00874a' : '#888888'} anchorX="center">
        {isRunning ? `${totalMW.toFixed(0)} MW Aggregated` : 'Offline'}
      </Text>
    </group>
  );
}

/* ── Generator Node ───────────────────────────────────── */
function GeneratorNode({ substation, position, isRunning }: {
  substation: SubstationData;
  position: [number, number, number];
  isRunning: boolean;
}) {
  const elapsedRef = useRef(0);
  const color = FUEL_COLORS[substation.fuel] || '#888888';
  const isOnline = isRunning && substation.status === 'online';
  const outputRatio = isOnline ? substation.latest.output_mw / substation.capacity_mw : 0;
  const scale = 0.6 + outputRatio * 0.4;

  useFrame((state) => {
    elapsedRef.current = state.clock.elapsedTime;
  });

  return (
    <group position={position}>
      {/* Ground pad */}
      <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 24]} />
        <meshStandardMaterial color="#bcc4be" emissive={isOnline ? color : '#000000'} emissiveIntensity={0.1} />
      </mesh>
      {/* Fuel-specific 3D model */}
      <FuelGeometry fuel={substation.fuel} scale={scale} color={color} elapsedTime={elapsedRef.current} />
      {/* Status indicator ring */}
      {isOnline && (
        <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.5, 0.012, 8, 32]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
        </mesh>
      )}
      {/* Name label */}
      <Text position={[0, -0.6, 0]} fontSize={0.11} color="#444444" anchorX="center" maxWidth={2}>
        {substation.name.split(' ').slice(0, 2).join(' ')}
      </Text>
      <Text position={[0, -0.75, 0]} fontSize={0.09} color={color} anchorX="center">
        {isOnline
          ? `${substation.latest.output_mw.toFixed(0)}/${substation.capacity_mw} MW`
          : `${substation.capacity_mw} MW`}
      </Text>
    </group>
  );
}

/* ── Ground Plane — light grey ────────────────────────── */
function GroundPlane() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#8db88c" roughness={0.9} />
      </mesh>
      <gridHelper args={[30, 60, '#7aaa78', '#9cc49a']} position={[0, -0.01, 0]} />
    </>
  );
}

/* ── Main Scene ───────────────────────────────────────── */
function Scene({ substations, isRunning }: { substations: SubstationData[]; isRunning: boolean }) {
  const positions = useMemo(() => {
    const radius = 3.2;
    return substations.map((_, i) => {
      const angle = (i / substations.length) * Math.PI * 2 - Math.PI / 2;
      return [
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
      ] as [number, number, number];
    });
  }, [substations.length]);

  const totalMW = substations
    .filter((s) => s.status === 'online')
    .reduce((sum, s) => sum + s.latest.output_mw, 0);

  const center: [number, number, number] = [0, 0.1, 0];

  return (
    <>
      {/* Bright ambient + directional lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[8, 15, 5]} intensity={1.0} color="#ffffff" />
      <directionalLight position={[-5, 10, -3]} intensity={0.4} color="#f0f8ff" />
      <pointLight position={[0, 6, 0]} intensity={isRunning ? 0.5 : 0.1} color="#00ED64" />
      {/* Light fog */}
      <fog attach="fog" args={['#e8ede9', 12, 30]} />

      <GroundPlane />
      <CentralHub totalMW={totalMW} isRunning={isRunning} />

      {substations.map((sub, i) => (
        <group key={sub.id}>
          <GeneratorNode
            substation={sub}
            position={positions[i]}
            isRunning={isRunning}
          />
          <TransmissionLine
            start={positions[i]}
            end={center}
            color={FUEL_COLORS[sub.fuel] || '#888888'}
            active={isRunning && sub.status === 'online'}
          />
        </group>
      ))}

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        autoRotate={isRunning}
        autoRotateSpeed={0.4}
        maxPolarAngle={Math.PI / 2.2}
        minPolarAngle={0.3}
        minDistance={3}
        maxDistance={14}
      />
    </>
  );
}

/* ── Exported Component ───────────────────────────────── */
export default function VPPScene({ substations, isRunning }: {
  substations: SubstationData[];
  isRunning: boolean;
}) {
  return (
    <Canvas
      camera={{ position: [4, 3.5, 5], fov: 50 }}
      style={{ background: 'linear-gradient(180deg, #e8ede9 0%, #d0d8d2 100%)' }}
    >
      <Scene substations={substations} isRunning={isRunning} />
    </Canvas>
  );
}
