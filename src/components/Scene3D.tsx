import React, { useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line as DreiLine } from '@react-three/drei';
import * as THREE from 'three';
import { useProjectStore } from '../store/useProjectStore';
import type { Vec3, Anchor, Sail } from '../store/useProjectStore';
import { getSunPosition } from '../domain/sun';
import { triangulateSail, generateSailTriangleMesh } from '../domain/geometry';
import { Sun, Video, Layers } from 'lucide-react';

// Sub-component to manage smooth camera movements
interface CameraControllerProps {
  preset: 'free' | 'top' | 'terrace' | 'sun';
  sunVector: { x: number; y: number; z: number };
}

function CameraController({ preset, sunVector }: CameraControllerProps) {
  const { camera, controls } = useThree();
  
  useEffect(() => {
    const orbitControls = controls as any;
    if (!orbitControls) return;

    // Reset target to origin
    orbitControls.target.set(0, 0, 0);

    if (preset === 'top') {
      camera.position.set(0, 0, 12);
      camera.up.set(0, 1, 0);
    } else if (preset === 'terrace') {
      // Perspective close to ground looking at the sail
      camera.position.set(0, -6, 1.8);
      camera.up.set(0, 0, 1);
    } else if (preset === 'sun') {
      // Position camera directly behind the sun looking down
      if (sunVector.z > 0.05) {
        camera.position.set(sunVector.x * 12, sunVector.y * 12, sunVector.z * 12);
      } else {
        camera.position.set(0, -8, 8); // fallback if sun is down
      }
      camera.up.set(0, 0, 1);
    } else {
      // Free preset: set standard angled perspective if reset
      camera.position.set(5, -7, 6);
      camera.up.set(0, 0, 1);
    }
    camera.lookAt(0, 0, 0);
    orbitControls.update();
  }, [preset, sunVector, camera, controls]);

  return null;
}

// Custom Procedural Sail Mesh Component
interface SailMeshProps {
  sail: Sail;
  anchors: Anchor[];
}

function SailMesh({ sail, anchors }: SailMeshProps) {
  const geomRef = useRef<THREE.BufferGeometry>(null);

  const tris = triangulateSail(sail, anchors);

  // Rebuild the mesh buffers whenever anchors or sail settings change
  useEffect(() => {
    if (!geomRef.current || tris.length === 0) return;

    const allPositions: number[] = [];
    const allIndices: number[] = [];
    let vertexOffset = 0;

    tris.forEach(triIds => {
      const v0Anchor = anchors.find(a => a.id === triIds[0]);
      const v1Anchor = anchors.find(a => a.id === triIds[1]);
      const v2Anchor = anchors.find(a => a.id === triIds[2]);

      if (!v0Anchor || !v1Anchor || !v2Anchor) return;

      const v0: Vec3 = { x: v0Anchor.pos2d.x, y: v0Anchor.pos2d.y, z: v0Anchor.z };
      const v1: Vec3 = { x: v1Anchor.pos2d.x, y: v1Anchor.pos2d.y, z: v1Anchor.z };
      const v2: Vec3 = { x: v2Anchor.pos2d.x, y: v2Anchor.pos2d.y, z: v2Anchor.z };

      const { positions, indices } = generateSailTriangleMesh(
        v0, v1, v2,
        sail,
        v0Anchor.id, v1Anchor.id, v2Anchor.id,
        20 // subdivision quality
      );

      // Append positions
      allPositions.push(...positions);
      
      // Append indices with offset
      indices.forEach(idx => {
        allIndices.push(idx + vertexOffset);
      });

      vertexOffset += positions.length / 3;
    });

    // Update BufferGeometry attributes
    geomRef.current.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(allPositions, 3)
    );
    geomRef.current.setIndex(allIndices);
    geomRef.current.computeVertexNormals();
  }, [sail, anchors, tris]);

  if (tris.length === 0) return null;

  return (
    <mesh castShadow receiveShadow>
      <bufferGeometry ref={geomRef} />
      <meshStandardMaterial
        color="#3b82f6" // royal blue shade sail
        roughness={0.4}
        metalness={0.1}
        transparent
        opacity={0.8}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// 3D Solar Trajectory Arc Component
interface SolarPathArcProps {
  date: string;
  lat: number;
  lon: number;
  northOffsetDeg: number;
}

function SolarPathArc({ date, lat, lon, northOffsetDeg }: SolarPathArcProps) {
  const points: THREE.Vector3[] = [];

  // Sample sun position every 30 minutes from 06:00 to 18:00
  for (let hour = 6; hour <= 18; hour += 0.5) {
    const hStr = String(Math.floor(hour)).padStart(2, '0');
    const mStr = hour % 1 === 0 ? '00' : '30';
    const sampleDate = new Date(`${date}T${hStr}:${mStr}:00`);
    const sun = getSunPosition(sampleDate, lat, lon, northOffsetDeg);
    
    if (sun.elevationDeg > 0) {
      // Place arc points at radius of 10 meters
      points.push(new THREE.Vector3(sun.vector.x * 10, sun.vector.y * 10, sun.vector.z * 10));
    }
  }

  if (points.length < 2) return null;

  return (
    <DreiLine
      points={points}
      color="#eab308" // glowing yellow
      lineWidth={1.5}
      dashed={true}
      dashSize={0.4}
      gapSize={0.2}
    />
  );
}

export default function Scene3D() {
  const { project, selectedAnchorId, selectedObstacleId, setSelectedAnchorId } = useProjectStore();
  const [cameraPreset, setCameraPreset] = React.useState<'free' | 'top' | 'terrace' | 'sun'>('free');

  // Compute sun vector
  const dateObj = new Date(`${project.simulation.date}T${project.simulation.time}:00`);
  const sun = getSunPosition(
    dateObj,
    project.simulation.latitude,
    project.simulation.longitude,
    project.simulation.northOffsetDeg
  );

  return (
    <div className="scene-3d-container">
      {/* 3D Scene Presets Toolbar */}
      <div className="canvas-overlay-toolbar glass-panel z-10 absolute top-4 left-4">
        <button 
          className={`btn-icon ${cameraPreset === 'free' ? 'active' : ''}`} 
          onClick={() => setCameraPreset('free')} 
          title="Perspective View"
        >
          <Video size={16} />
        </button>
        <button 
          className={`btn-icon ${cameraPreset === 'top' ? 'active' : ''}`} 
          onClick={() => setCameraPreset('top')} 
          title="Top-down View"
        >
          <Layers size={16} />
        </button>
        <button 
          className={`btn-icon ${cameraPreset === 'terrace' ? 'active' : ''}`} 
          onClick={() => setCameraPreset('terrace')} 
          title="Terrace View"
        >
          <span className="text-xs font-bold">Patio</span>
        </button>
        <button 
          className={`btn-icon ${cameraPreset === 'sun' ? 'active' : ''}`} 
          onClick={() => setCameraPreset('sun')} 
          title="Sun Path View"
        >
          <Sun size={16} />
        </button>
      </div>

      <div className="canvas-container-3d">
        <Canvas
          shadows={project.simulation.showShadows ?? true}
          camera={{ position: [5, -7, 6], up: [0, 0, 1], fov: 45 }}
        >
          <color attach="background" args={["#e2e8f0"]} />
          
          {/* Lights */}
          <ambientLight intensity={0.4} />
          
          {/* Main Directional Sun Light */}
          {sun.isUp && (
            <directionalLight
              castShadow={project.simulation.showShadows ?? true}
              position={[sun.vector.x * 15, sun.vector.y * 15, sun.vector.z * 15]}
              intensity={1.2}
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
              shadow-camera-near={0.5}
              shadow-camera-far={40}
              shadow-camera-left={-8}
              shadow-camera-right={8}
              shadow-camera-top={8}
              shadow-camera-bottom={-8}
            />
          )}

          {/* Smooth Camera control presets */}
          <CameraController preset={cameraPreset} sunVector={sun.vector} />

          <OrbitControls 
            enableDamping 
            dampingFactor={0.05} 
            maxPolarAngle={Math.PI / 2 - 0.05} // prevent going below ground
          />

          {/* 1. Ground Grid Plane */}
          <mesh receiveShadow position={[0, 0, 0]}>
            <planeGeometry args={[40, 40]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.9} />
          </mesh>

          {/* Ground grid overlay */}
          {project.simulation.showGroundGrid && (
            <gridHelper 
              args={[40, 40, "#4f46e5", "#94a3b8"]} 
              rotation={[Math.PI / 2, 0, 0]}
              position={[0, 0, 0.01]}
            />
          )}

          {/* 1.2 Terrace Boundary Outline in 3D */}
          {project.terrace.length >= 3 && (() => {
            const points3d = project.terrace.map(pt => [pt.x, pt.y, 0.02]);
            points3d.push([project.terrace[0].x, project.terrace[0].y, 0.02]);
            return (
              <DreiLine
                points={points3d as any}
                color="#f97316"
                lineWidth={2}
                dashed={true}
                dashSize={0.3}
                gapSize={0.15}
              />
            );
          })()}

          {/* 2. Anchor Points, Posts, Wall Brackets */}
          {project.anchors.map(anchor => {
            const isSelected = selectedAnchorId === anchor.id;
            
            return (
              <group key={anchor.id} position={[anchor.pos2d.x, anchor.pos2d.y, 0]}>
                
                {/* 2.1 Post cylinder extrusion */}
                {anchor.type === 'post' && (
                  <mesh 
                    castShadow 
                    receiveShadow 
                    position={[0, 0, anchor.z / 2]}
                    rotation={[Math.PI / 2, 0, 0]}
                  >
                    <cylinderGeometry args={[0.07, 0.09, anchor.z, 16]} />
                    <meshStandardMaterial 
                      color={isSelected ? "#6366f1" : "#854d0e"} // wood pillar / copper highlight when selected
                      roughness={0.7} 
                    />
                  </mesh>
                )}

                {/* 2.2 Wall Bracket representation */}
                {anchor.type === 'wall' && (
                  <mesh castShadow position={[0, 0, anchor.z]}>
                    <boxGeometry args={[0.2, 0.2, 0.2]} />
                    <meshStandardMaterial color={isSelected ? "#4f46e5" : "#64748b"} roughness={0.4} />
                  </mesh>
                )}

                {/* 2.3 Guide vertical height line */}
                <DreiLine
                  points={[
                    [0, 0, 0],
                    [0, 0, anchor.z]
                  ]}
                  color={isSelected ? "#4f46e5" : "#94a3b8"}
                  lineWidth={1.5}
                />

                {/* 2.4 Floating HTML height label */}
                <Html position={[0, 0, anchor.z + 0.35]} center>
                  <div 
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors select-none shadow-sm ${
                      isSelected 
                        ? "bg-indigo-600 text-white border-indigo-400" 
                        : "bg-white/95 text-slate-700 border-slate-300"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAnchorId(anchor.id);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {anchor.label}: {anchor.z.toFixed(1)}m
                  </div>
                </Html>
              </group>
            );
          })}

          {/* 3. Dynamic Sail Mesh */}
          {project.sails.map(s => (
            <group key={s.id}>
              <SailMesh sail={s} anchors={project.anchors} />

              {/* Roller Axis seam visualizer tube */}
              {s.rollerAxis && s.rollerAxis.startAnchorId && s.rollerAxis.endAnchorId && (() => {
                const startA = project.anchors.find(a => a.id === s.rollerAxis?.startAnchorId);
                const endA = project.anchors.find(a => a.id === s.rollerAxis?.endAnchorId);
                if (startA && endA) {
                  const p1 = new THREE.Vector3(startA.pos2d.x, startA.pos2d.y, startA.z);
                  const p2 = new THREE.Vector3(endA.pos2d.x, endA.pos2d.y, endA.z);
                  
                  // Compute tube path
                  const curve = new THREE.LineCurve3(p1, p2);
                  
                  return (
                    <mesh castShadow position={[0, 0, 0]}>
                      <tubeGeometry args={[curve, 8, 0.05, 8, false]} />
                      <meshStandardMaterial color="#f43f5e" roughness={0.3} metalness={0.8} />
                    </mesh>
                  );
                }
                return null;
              })()}
            </group>
          ))}

          {/* 4. Extruded Context Obstacles - Solid Extruded Black Boxes */}
          {project.obstacles.map(obs => {
            const isSelected = selectedObstacleId === obs.id;
            if (obs.points.length < 3) return null;

            // Create solid extruded shape in 2D XY plane
            const shape = new THREE.Shape();
            shape.moveTo(obs.points[0].x, obs.points[0].y);
            for (let i = 1; i < obs.points.length; i++) {
              shape.lineTo(obs.points[i].x, obs.points[i].y);
            }
            shape.closePath();

            const extrudeSettings = {
              depth: obs.height,
              bevelEnabled: false
            };

            return (
              <mesh 
                key={obs.id} 
                castShadow 
                receiveShadow
              >
                <extrudeGeometry args={[shape, extrudeSettings]} />
                <meshStandardMaterial 
                  color={isSelected ? "#38bdf8" : "#111317"} // charcoal/black box representing the house
                  roughness={0.9} 
                />
              </mesh>
            );
          })}

          {/* 5. Glowing Sun Sphere (if sun is up) */}
          {sun.isUp && (
            <mesh position={[sun.vector.x * 10, sun.vector.y * 10, sun.vector.z * 10]}>
              <sphereGeometry args={[0.3, 16, 16]} />
              <meshBasicMaterial color="#fef08a" />
            </mesh>
          )}

          {/* Sun directional compass trajectory path */}
          <SolarPathArc
            date={project.simulation.date}
            lat={project.simulation.latitude}
            lon={project.simulation.longitude}
            northOffsetDeg={project.location.northOffsetDeg}
          />
        </Canvas>
      </div>
    </div>
  );
}
