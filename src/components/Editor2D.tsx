import { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Line, Text, Group } from 'react-konva';
import { useProjectStore } from '../store/useProjectStore';
import type { Vec2 } from '../store/useProjectStore';
import { getSunPosition, projectShadow } from '../domain/sun';
import { getDistance2D, getBearing, triangulateSail } from '../domain/geometry';
import { Compass, ZoomIn, ZoomOut, MousePointer, MapPin, Triangle, Home, Grid, Ruler } from 'lucide-react';

export default function Editor2D() {
  const {
    project,
    selectedAnchorId,
    selectedSailId,
    selectedObstacleId,
    editorMode,
    isCalibrating,
    calibrationClicks,
    isSettingNorth,
    orientationType,
    northClicks,
    setSelectedAnchorId,
    setSelectedSailId,
    setSelectedObstacleId,
    updateAnchor,
    addAnchor,
    addCalibrationClick,
    setEditorMode,
    updateSail,
    updateObstacle,
    setTerrace,
    setSimulation,
    addObstacle
  } = useProjectStore();

  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 600 });
  
  // Local zoom/pan state (separate from project scale for fast drawing)
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 300, y: 300 }); // start centered
  
  // Track drawing points for sails/obstacles/terrace
  const [activeDrawPoints, setActiveDrawPoints] = useState<string[]>([]);
  const [activeObstaclePoints, setActiveObstaclePoints] = useState<Vec2[]>([]);
  const [activeTerracePoints, setActiveTerracePoints] = useState<Vec2[]>([]);
  const [hoverPos, setHoverPos] = useState<Vec2 | null>(null);
  const [compassPos, setCompassPos] = useState<Vec2>({ x: -4.0, y: 4.0 }); // draggable compass pos in plan meters

  // Update container size dynamically
  useEffect(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight || 600
      });
      setStagePos({
        x: containerRef.current.clientWidth / 2,
        y: (containerRef.current.clientHeight || 600) / 2
      });
    }
    
    // Listen to resize
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight || 600
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load background image
  useEffect(() => {
    if (project.background?.imageUrl) {
      const img = new window.Image();
      img.src = project.background.imageUrl;
      img.onload = () => {
        setBgImage(img);
      };
    } else {
      setBgImage(null);
    }
  }, [project.background?.imageUrl]);

  const ppm = project.background?.pixelsPerMeter || 50;

  // Zooming via mouse wheel
  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    const oldScale = stageScale;
    const pointer = stage.getPointerPosition();

    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    
    // Limit zoom between 0.1x and 20x
    const clampedScale = Math.max(0.1, Math.min(20, newScale));
    
    setStageScale(clampedScale);
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    });
  };

  // Convert canvas pixel (relative to coordinate origin) into meters
  const pxToMeters = (px: Vec2): Vec2 => {
    return {
      x: px.x / ppm,
      y: -px.y / ppm, // reverse y
    };
  };

  // Convert meters into canvas pixels (relative to coordinate origin)
  const metersToPx = (m: Vec2): Vec2 => {
    return {
      x: m.x * ppm,
      y: -m.y * ppm, // reverse y
    };
  };

  // Calculate pixel coordinate from pointer position
  const getRelativePointerPosition = (stage: any): Vec2 => {
    const pointer = stage.getPointerPosition();
    if (!pointer) return { x: 0, y: 0 };
    return {
      x: (pointer.x - stagePos.x) / stageScale,
      y: (pointer.y - stagePos.y) / stageScale,
    };
  };

  const handleStageClick = (e: any) => {
    const stage = e.target.getStage();
    const relPos = getRelativePointerPosition(stage);
    const mPos = pxToMeters(relPos);

    // If scale calibrating
    if (isCalibrating) {
      if (calibrationClicks.length === 0) {
        addCalibrationClick(relPos, 1); // dummy distance for first click
      } else if (calibrationClicks.length === 1) {
        const distStr = prompt("Enter the real-world distance between these two points in CENTIMETERS (cm):", "100");
        const distCm = parseFloat(distStr || "0");
        if (distCm > 0) {
          const distM = distCm / 100;
          addCalibrationClick(relPos, distM);
          setHoverPos(null); // reset hover
        } else {
          alert("Calibration cancelled: Invalid distance entered.");
          useProjectStore.getState().cancelCalibration();
          setHoverPos(null); // reset hover
        }
      }
      return;
    }

    // If setting orientation (North or East) direction arrow
    if (isSettingNorth) {
      const clicks = [...northClicks, relPos];
      if (clicks.length === 1) {
        useProjectStore.setState({ northClicks: clicks });
      } else if (clicks.length === 2) {
        // Calculate bearing angle of this vector from click 0 to click 1 in metrical plan coordinates
        const angle = getBearing(pxToMeters(clicks[0]), pxToMeters(clicks[1]));
        
        let calculatedOffset = Math.round(angle);
        if (orientationType === 'east') {
          // East vector represents 90 degrees bearing geographically, so True North is at angle - 90
          calculatedOffset = (calculatedOffset - 90 + 360) % 360;
        }
        
        setSimulation({ northOffsetDeg: calculatedOffset });
        
        // Save drawn north points to persistent background plan configuration
        useProjectStore.getState().updateBackground({ northPoints: clicks });

        useProjectStore.setState({ isSettingNorth: false, northClicks: [] });
        setHoverPos(null); // reset hover
      }
      return;
    }

    // Standard additions depending on mode
    if (editorMode === 'add_point') {
      const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789";
      const nextLabel = labels[project.anchors.length % labels.length];
      const id = `anchor-${Date.now()}`;
      
      addAnchor({
        id,
        label: nextLabel,
        pos2d: mPos,
        z: 2.5,
        type: 'post',
        notes: `New Anchor Point ${nextLabel}`
      });
      setEditorMode('select');
    } else if (editorMode === 'add_obstacle') {
      // Collect outline clicks
      setActiveObstaclePoints(prev => [...prev, mPos]);
    } else if (editorMode === 'add_terrace') {
      setActiveTerracePoints(prev => [...prev, mPos]);
    } else if (e.target === stage) {
      // Clicked background, clear selections
      setSelectedAnchorId(null);
      setSelectedSailId(null);
      setSelectedObstacleId(null);
    }
  };

  const handleStageMouseMove = (e: any) => {
    if ((isCalibrating && calibrationClicks.length === 1) || (isSettingNorth && northClicks.length === 1)) {
      const stage = e.target.getStage();
      const relPos = getRelativePointerPosition(stage);
      setHoverPos(relPos);
    } else if (hoverPos !== null) {
      setHoverPos(null);
    }
  };

  const handleAnchorDrag = (id: string, e: any) => {
    // Get dragged node position relative to parent layer Group (coordinate origin)
    const relPos = {
      x: e.target.x(),
      y: e.target.y()
    };
    const mPos = pxToMeters(relPos);
    updateAnchor(id, { pos2d: mPos });
  };

  // Compile projected shadows
  const dateObj = new Date(`${project.simulation.date}T${project.simulation.time}:00`);
  const sun = getSunPosition(
    dateObj,
    project.simulation.latitude,
    project.simulation.longitude,
    project.simulation.northOffsetDeg
  );

  // Compute 2D projected shadow shapes
  const sailShadows: Vec2[][] = [];
  const postShadowLines: { start: Vec2; end: Vec2 }[] = [];
  const obstacleShadows: Vec2[][] = [];

  if (sun.isUp) {
    // 1. Compute shadows for sails
    project.sails.forEach(s => {
      const tris = triangulateSail(s, project.anchors);
      tris.forEach(triIds => {
        const poly: Vec2[] = [];
        triIds.forEach(aid => {
          const anchor = project.anchors.find(a => a.id === aid);
          if (anchor) {
            // Project vertex
            const shad = projectShadow({ x: anchor.pos2d.x, y: anchor.pos2d.y, z: anchor.z }, sun.vector);
            poly.push(shad);
          }
        });
        if (poly.length >= 3) {
          sailShadows.push(poly);
        }
      });
    });

    // 2. Compute shadows for posts
    project.anchors.forEach(a => {
      if (a.type === 'post') {
        const shad = projectShadow({ x: a.pos2d.x, y: a.pos2d.y, z: a.z }, sun.vector);
        postShadowLines.push({ start: a.pos2d, end: shad });
      }
    });

    // 3. Compute shadows for obstacles
    project.obstacles.forEach(o => {
      const poly: Vec2[] = [];
      
      // Project the top cap of the obstacle
      o.points.forEach(pt => {
        const shad = projectShadow({ x: pt.x, y: pt.y, z: o.height }, sun.vector);
        poly.push(shad);
      });

      // To represent the extrusion shadow beautifully:
      // We merge the top shadow and base corners to form a closed shadow polygon.
      // Standard quick shadow outline is: union of base points + top shadow points.
      // We can just append both sets
      const shadowHull: Vec2[] = [...o.points, ...poly];
      obstacleShadows.push(shadowHull);
    });
  }

  // Handle active drawing commit
  const commitObstacle = () => {
    if (activeObstaclePoints.length >= 3) {
      updateObstacle(`obs-${Date.now()}`, {
        id: `obs-${Date.now()}`,
        label: `Obstacle ${project.obstacles.length + 1}`,
        points: activeObstaclePoints,
        height: 3.0
      });
    }
    setActiveObstaclePoints([]);
    setEditorMode('select');
  };

  const commitTerrace = () => {
    if (activeTerracePoints.length >= 3) {
      setTerrace(activeTerracePoints);
    }
    setActiveTerracePoints([]);
    setEditorMode('select');
  };

  // Quick UI resets
  const resetZoom = () => {
    setStageScale(1);
    if (containerRef.current) {
      setStagePos({
        x: containerRef.current.clientWidth / 2,
        y: containerRef.current.clientHeight / 2
      });
    }
  };

  return (
    <div className="editor-2d-container" ref={containerRef}>
      {/* 2D Canvas Toolbar Overlay */}
      <div className="canvas-overlay-toolbar glass-panel">
        <button className={`btn-icon ${editorMode === 'select' ? 'active' : ''}`} onClick={() => setEditorMode('select')} title="Select & Move Tool">
          <MousePointer size={16} />
        </button>
        <button className={`btn-icon ${editorMode === 'add_point' ? 'active' : ''}`} onClick={() => setEditorMode('add_point')} title="Place Anchor Pillar (P)">
          <MapPin size={16} />
        </button>
        <button className={`btn-icon ${editorMode === 'add_sail' ? 'active' : ''}`} onClick={() => { setEditorMode('add_sail'); setActiveDrawPoints([]); }} title="Draw Shade Sail (S)">
          <Triangle size={16} />
        </button>
        <button className={`btn-icon ${editorMode === 'add_axis' ? 'active' : ''}`} onClick={() => setEditorMode('add_axis')} title="Define Roller Axis (R)">
          <Ruler size={16} />
        </button>
        <button 
          className="btn-icon" 
          onClick={() => {
            const id = `obs-${Date.now()}`;
            addObstacle({
              id,
              label: `House Box ${project.obstacles.length + 1}`,
              points: [
                { x: -1.5, y: 1.0 },
                { x: 1.5, y: 1.0 },
                { x: 1.5, y: -1.0 },
                { x: -1.5, y: -1.0 }
              ],
              height: 3.5
            });
            setEditorMode('select');
          }} 
          title="Spawn House Obstacle Box (O)"
        >
          <Home size={16} />
        </button>
        <button className={`btn-icon ${editorMode === 'add_terrace' ? 'active' : ''}`} onClick={() => { setEditorMode('add_terrace'); setActiveTerracePoints([]); }} title="Draw Terrace Area (T)">
          <Grid size={16} />
        </button>

        <div className="toolbar-separator" />
        
        <button className="btn-icon" onClick={() => setStageScale(prev => Math.min(20, prev * 1.2))} title="Zoom In">
          <ZoomIn size={16} />
        </button>
        <button className="btn-icon" onClick={() => setStageScale(prev => Math.max(0.1, prev / 1.2))} title="Zoom Out">
          <ZoomOut size={16} />
        </button>
        <button className="btn-icon" onClick={resetZoom} title="Reset View">
          <Compass size={16} />
        </button>
      </div>

      {/* Floating Instructions/Status overlay */}
      <div className="canvas-mode-status glass-panel">
        {isCalibrating && (
          <span className="text-amber-400 font-medium">
            Calibration: Click two known points on plan image. (Point {calibrationClicks.length + 1})
          </span>
        )}
        {isSettingNorth && (
          <span className="text-sky-500 font-medium animate-pulse">
            {orientationType === 'east'
              ? `Orientation Calibration: Click two points to define True East (West base to East tip). (Point ${northClicks.length + 1})`
              : `Orientation Calibration: Click two points to define True North (South base to North tip). (Point ${northClicks.length + 1})`}
          </span>
        )}
        {!isCalibrating && !isSettingNorth && editorMode === 'add_point' && <span>Mode: Click anywhere to place a new Anchor.</span>}
        {!isCalibrating && !isSettingNorth && editorMode === 'add_sail' && (
          <span>
            Mode: Click anchors in order to create sail. (Selected: {activeDrawPoints.join(' → ') || 'none'})
            {activeDrawPoints.length >= 3 && (
              <button 
                className="ml-3 px-2 py-0.5 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-500 transition-colors"
                onClick={() => {
                  const newSailId = `sail-${Date.now()}`;
                  // Create consecutive curved edges
                  const edges = activeDrawPoints.map((aid, index) => {
                    const nextAid = activeDrawPoints[(index + 1) % activeDrawPoints.length];
                    return {
                      startAnchorId: aid,
                      endAnchorId: nextAid,
                      edgeType: 'curved' as const,
                      curvatureInward: 0.2
                    };
                  });
                  
                  useProjectStore.getState().addSail({
                    id: newSailId,
                    anchorIds: activeDrawPoints,
                    edges,
                    previewModel: { mode: 'stylized', curvature: 0.3, sag: 0.08 }
                  });
                  setActiveDrawPoints([]);
                  setEditorMode('select');
                }}
              >
                Create Sail
              </button>
            )}
          </span>
        )}
        {!isCalibrating && !isSettingNorth && editorMode === 'add_obstacle' && (
          <span>
            Mode: Click 4 points to define house corners, then click Done. ({activeObstaclePoints.length} points)
            {activeObstaclePoints.length >= 3 && (
              <button className="ml-3 px-2 py-0.5 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-500" onClick={commitObstacle}>
                Done
              </button>
            )}
          </span>
        )}
        {!isCalibrating && !isSettingNorth && editorMode === 'add_terrace' && (
          <span>
            Mode: Click to define terrace corners. ({activeTerracePoints.length} points)
            {activeTerracePoints.length >= 3 && (
              <button className="ml-3 px-2 py-0.5 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-500" onClick={commitTerrace}>
                Done
              </button>
            )}
          </span>
        )}
        {!isCalibrating && !isSettingNorth && editorMode === 'add_axis' && <span>Mode: Click start and end anchors to define roller axis.</span>}
        {!isCalibrating && !isSettingNorth && editorMode === 'select' && <span>Drag points to move them. Wheel scrolls to zoom, drag background to pan.</span>}
      </div>

      <Stage
        width={dimensions.width}
        height={dimensions.height}
        x={stagePos.x}
        y={stagePos.y}
        scaleX={stageScale}
        scaleY={stageScale}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onMouseMove={handleStageMouseMove}
        draggable={editorMode === 'select'}
        onDragEnd={(e) => {
          // If stage was dragged, save coordinate offset
          if (e.target === e.target.getStage()) {
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }
        }}
        className="canvas-stage"
      >
        <Layer>
          
          {/* 1. Background floor plan image */}
          {bgImage && (
            <KonvaImage
              image={bgImage}
              x={project.background?.origin.x || 0}
              y={project.background?.origin.y || 0}
              opacity={project.background?.opacity ?? 0.6}
              rotation={project.background?.rotationDeg || 0}
              scaleX={project.background?.scale || 1}
              scaleY={project.background?.scale || 1}
              offsetX={bgImage.width / 2}
              offsetY={bgImage.height / 2}
            />
          )}

          {/* 1.1 Planning Layers - Hidden during calibration and North settings for clear view */}
          {!isCalibrating && !isSettingNorth && (
            <Group>
              {project.simulation.showGroundGrid && (
            <Group opacity={bgImage ? 0.2 : 0.4}>
              {/* Draw horizontal and vertical meter lines from -20m to +20m */}
              {Array.from({ length: 41 }).map((_, idx) => {
                const meterVal = idx - 20;
                const pos = metersToPx({ x: meterVal, y: meterVal });
                
                return (
                  <Group key={idx}>
                    {/* Vertical lines */}
                    <Line
                      points={[pos.x, -1000, pos.x, 1000]}
                      stroke={meterVal === 0 ? "#4f46e5" : "#cbd5e1"}
                      strokeWidth={meterVal === 0 ? 2 : 0.5}
                    />
                    {/* Horizontal lines */}
                    <Line
                      points={[-1000, pos.y, 1000, pos.y]}
                      stroke={meterVal === 0 ? "#4f46e5" : "#cbd5e1"}
                      strokeWidth={meterVal === 0 ? 2 : 0.5}
                    />
                  </Group>
                );
              })}
            </Group>
          )}

          {/* 2. Projected ground shadows of obstacles and sails */}
          {sun.isUp && (project.simulation.showShadows ?? true) && (
            <Group opacity={project.simulation.shadowOpacity}>
              {/* Obstacle Shadows */}
              {obstacleShadows.map((poly, idx) => {
                const flatPoints = poly.flatMap(pt => {
                  const px = metersToPx(pt);
                  return [px.x, px.y];
                });
                return (
                  <Line
                    key={`obs-shad-${idx}`}
                    points={flatPoints}
                    fill="#111317"
                    closed={true}
                  />
                );
              })}

              {/* Sail Shadows */}
              {sailShadows.map((poly, idx) => {
                const flatPoints = poly.flatMap(pt => {
                  const px = metersToPx(pt);
                  return [px.x, px.y];
                });
                return (
                  <Line
                    key={`sail-shad-${idx}`}
                    points={flatPoints}
                    fill="#0f1115"
                    closed={true}
                  />
                );
              })}

              {/* Post Shadow Lines */}
              {postShadowLines.map((line, idx) => {
                const pStart = metersToPx(line.start);
                const pEnd = metersToPx(line.end);
                return (
                  <Line
                    key={`post-shad-${idx}`}
                    points={[pStart.x, pStart.y, pEnd.x, pEnd.y]}
                    stroke="#111317"
                    strokeWidth={4}
                    lineCap="round"
                  />
                );
              })}
            </Group>
          )}

          {/* 3. Terrace Boundary Outline */}
          {project.terrace.length >= 3 && (
            <Line
              points={project.terrace.flatMap(pt => {
                const px = metersToPx(pt);
                return [px.x, px.y];
              })}
              stroke="#f97316"
              strokeWidth={2}
              dash={[8, 4]}
              fill="rgba(249, 115, 22, 0.08)"
              closed={true}
              draggable={editorMode === 'select'}
              onDragEnd={(e) => {
                const dx = e.target.x();
                const dy = e.target.y();
                
                // Convert pixel translation to plan meters
                const dxMeters = dx / ppm;
                const dyMeters = -dy / ppm;
                
                const newTerrace = project.terrace.map(pt => ({
                  x: pt.x + dxMeters,
                  y: pt.y + dyMeters
                }));
                
                setTerrace(newTerrace);
                
                // Reset visual position back to origin, letting the updated state handle the drawing
                e.target.position({ x: 0, y: 0 });
              }}
              onMouseEnter={(e) => {
                if (editorMode === 'select') {
                  const stage = e.target.getStage();
                  if (stage) stage.container().style.cursor = 'move';
                }
              }}
              onMouseLeave={(e) => {
                const stage = e.target.getStage();
                if (stage) stage.container().style.cursor = 'default';
              }}
            />
          )}

          {/* 3.1 Terrace Boundary Corner Handles */}
          {!isCalibrating && !isSettingNorth && editorMode === 'select' && project.terrace.map((pt, idx) => {
            const px = metersToPx(pt);
            return (
              <Circle
                key={`terrace-corner-${idx}`}
                x={px.x}
                y={px.y}
                radius={7}
                fill="#f97316"
                stroke="#ffffff"
                strokeWidth={1.5}
                draggable={true}
                shadowColor="#000"
                shadowBlur={3}
                shadowOffset={{ x: 0, y: 1.5 }}
                shadowOpacity={0.25}
                onDragMove={(e) => {
                  const relPos = {
                    x: e.target.x(),
                    y: e.target.y()
                  };
                  const mPos = pxToMeters(relPos);
                  const newTerrace = [...project.terrace];
                  newTerrace[idx] = mPos;
                  setTerrace(newTerrace);
                }}
                onMouseEnter={(e) => {
                  const stage = e.target.getStage();
                  if (stage) stage.container().style.cursor = 'pointer';
                }}
                onMouseLeave={(e) => {
                  const stage = e.target.getStage();
                  if (stage) stage.container().style.cursor = 'default';
                }}
              />
            );
          })}

          {/* 3.1 Draw active drawing outlines */}
          {activeObstaclePoints.length > 0 && (
            <Line
              points={activeObstaclePoints.flatMap(pt => {
                const px = metersToPx(pt);
                return [px.x, px.y];
              })}
              stroke="#a8a29e"
              strokeWidth={2}
              closed={false}
            />
          )}

          {activeTerracePoints.length > 0 && (
            <Line
              points={activeTerracePoints.flatMap(pt => {
                const px = metersToPx(pt);
                return [px.x, px.y];
              })}
              stroke="#f97316"
              strokeWidth={2}
              closed={false}
            />
          )}

          {/* 4. Obstacles Outline */}
          {project.obstacles.map(obs => {
            const flatPoints = obs.points.flatMap(pt => {
              const px = metersToPx(pt);
              return [px.x, px.y];
            });
            const isSelected = selectedObstacleId === obs.id;
            return (
              <Group 
                key={obs.id} 
                onClick={(e) => {
                  e.cancelBubble = true;
                  setSelectedObstacleId(obs.id);
                }}
              >
                <Line
                  points={flatPoints}
                  stroke={isSelected ? "#38bdf8" : "#64748b"}
                  strokeWidth={isSelected ? 3 : 2}
                  fill="rgba(156, 163, 175, 0.12)"
                  closed={true}
                  draggable={editorMode === 'select'}
                  onDragEnd={(e) => {
                    const dx = e.target.x();
                    const dy = e.target.y();
                    
                    // Convert pixel translation to plan meters
                    const dxMeters = dx / ppm;
                    const dyMeters = -dy / ppm;
                    
                    const newPoints = obs.points.map(pt => ({
                      x: pt.x + dxMeters,
                      y: pt.y + dyMeters
                    }));
                    
                    updateObstacle(obs.id, { points: newPoints });
                    
                    // Reset visual position back to origin
                    e.target.position({ x: 0, y: 0 });
                  }}
                  onMouseEnter={(e) => {
                    if (editorMode === 'select') {
                      const stage = e.target.getStage();
                      if (stage) stage.container().style.cursor = 'move';
                    }
                  }}
                  onMouseLeave={(e) => {
                    const stage = e.target.getStage();
                    if (stage) stage.container().style.cursor = 'default';
                  }}
                />
                {/* Height Label */}
                {obs.points.length > 0 && (
                  <Text
                    x={metersToPx(obs.points[0]).x}
                    y={metersToPx(obs.points[0]).y - 16}
                    text={`${obs.label} (H:${obs.height}m)`}
                    fill={isSelected ? "#0284c7" : "#334155"}
                    fontSize={10.5}
                    fontStyle="bold"
                    backgroundColor="rgba(255, 255, 255, 0.85)"
                    padding={1.5}
                  />
                )}
              </Group>
            );
          })}

          {/* 4.1 Obstacles Corner Handles */}
          {!isCalibrating && !isSettingNorth && editorMode === 'select' && project.obstacles.map(obs => {
            const isSelected = selectedObstacleId === obs.id;
            return (
              <Group key={`obs-corners-${obs.id}`}>
                {obs.points.map((pt, idx) => {
                  const px = metersToPx(pt);
                  return (
                    <Circle
                      key={`obs-corner-${obs.id}-${idx}`}
                      x={px.x}
                      y={px.y}
                      radius={6.5}
                      fill={isSelected ? "#38bdf8" : "#64748b"}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      draggable={true}
                      shadowColor="#000"
                      shadowBlur={2.5}
                      shadowOffset={{ x: 0, y: 1 }}
                      shadowOpacity={0.2}
                      onDragMove={(e) => {
                        const relPos = {
                          x: e.target.x(),
                          y: e.target.y()
                        };
                        const mPos = pxToMeters(relPos);
                        
                        // Update the point in this specific obstacle's points array
                        const newPoints = [...obs.points];
                        newPoints[idx] = mPos;
                        updateObstacle(obs.id, { points: newPoints });
                      }}
                      onMouseEnter={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = 'pointer';
                      }}
                      onMouseLeave={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = 'default';
                      }}
                    />
                  );
                })}
              </Group>
            );
          })}

          {/* 5. Sails polygons and edge curved profiles */}
          {project.sails.map(s => {
            const isSelected = selectedSailId === s.id;
            
            // Generate exact 2D curves for displaying curved inward edges
            return (
              <Group key={s.id} onClick={() => setSelectedSailId(s.id)}>
                {s.anchorIds.map((startId, idx) => {
                  const endId = s.anchorIds[(idx + 1) % s.anchorIds.length];
                  const startAnchor = project.anchors.find(a => a.id === startId);
                  const endAnchor = project.anchors.find(a => a.id === endId);

                  if (!startAnchor || !endAnchor) return null;

                  const p1 = metersToPx(startAnchor.pos2d);
                  const p2 = metersToPx(endAnchor.pos2d);

                  const edge = s.edges.find(e => 
                    (e.startAnchorId === startId && e.endAnchorId === endId) ||
                    (e.startAnchorId === endId && e.endAnchorId === startId)
                  );

                  const isCurved = edge?.edgeType === 'curved' && (edge.curvatureInward || 0) > 0;
                  
                  // Draw edge dimension line
                  const dist = getDistance2D(startAnchor.pos2d, endAnchor.pos2d);
                  const bearing = getBearing(startAnchor.pos2d, endAnchor.pos2d);
                  const midX = (p1.x + p2.x) / 2;
                  const midY = (p1.y + p2.y) / 2;

                  if (isCurved) {
                    // Compute quadratic bezier anchor point towards centroid
                    const centroid = {
                      x: s.anchorIds.reduce((sum, aid) => sum + (project.anchors.find(a => a.id === aid)?.pos2d.x || 0), 0) / s.anchorIds.length,
                      y: s.anchorIds.reduce((sum, aid) => sum + (project.anchors.find(a => a.id === aid)?.pos2d.y || 0), 0) / s.anchorIds.length
                    };

                    const midMeters = {
                      x: (startAnchor.pos2d.x + endAnchor.pos2d.x) / 2,
                      y: (startAnchor.pos2d.y + endAnchor.pos2d.y) / 2
                    };

                    const dir = {
                      x: centroid.x - midMeters.x,
                      y: centroid.y - midMeters.y
                    };

                    const len = Math.sqrt(dir.x**2 + dir.y**2) || 1;
                    const offset = edge.curvatureInward;
                    const curvedMidM = {
                      x: midMeters.x + (dir.x / len) * offset,
                      y: midMeters.y + (dir.y / len) * offset
                    };

                    // Draw quadratic curve
                    const pCtrl = metersToPx({
                      x: midMeters.x + (dir.x / len) * offset * 2.0,
                      y: midMeters.y + (dir.y / len) * offset * 2.0
                    });

                    return (
                      <Group key={idx}>
                        <Line
                          points={[p1.x, p1.y, pCtrl.x, pCtrl.y, p2.x, p2.y]}
                          stroke={isSelected ? "#4f46e5" : "#312e81"}
                          strokeWidth={isSelected ? 4 : 2}
                          tension={0.5}
                        />
                        {/* Curved dimension label */}
                        <Text
                          x={metersToPx(curvedMidM).x - 20}
                          y={metersToPx(curvedMidM).y + 5}
                          text={`${dist.toFixed(1)}m (${Math.round(bearing)}°)`}
                          fill="#818cf8"
                          fontSize={10}
                        />
                      </Group>
                    );
                  } else {
                    return (
                      <Group key={idx}>
                        <Line
                          points={[p1.x, p1.y, p2.x, p2.y]}
                          stroke={isSelected ? "#4f46e5" : "#312e81"}
                          strokeWidth={isSelected ? 4 : 2}
                        />
                        {/* Straight dimension label */}
                        <Text
                          x={midX - 20}
                          y={midY - 12}
                          text={`${dist.toFixed(1)}m (${Math.round(bearing)}°)`}
                          fill="#a5b4fc"
                          fontSize={10}
                        />
                      </Group>
                    );
                  }
                })}

                {/* 5.1 Draw Roller/Wave Axis Seam */}
                {s.rollerAxis && s.rollerAxis.startAnchorId && s.rollerAxis.endAnchorId && (() => {
                  const startA = project.anchors.find(a => a.id === s.rollerAxis?.startAnchorId);
                  const endA = project.anchors.find(a => a.id === s.rollerAxis?.endAnchorId);
                  if (startA && endA) {
                    const p1 = metersToPx(startA.pos2d);
                    const p2 = metersToPx(endA.pos2d);
                    return (
                      <Group>
                        <Line
                          points={[p1.x, p1.y, p2.x, p2.y]}
                          stroke="#e11d48"
                          strokeWidth={2}
                          dash={[6, 3]}
                        />
                        <Text
                          x={(p1.x + p2.x) / 2 - 25}
                          y={(p1.y + p2.y) / 2 + 10}
                          text="Roller Axis"
                          fill="#fda4af"
                          fontSize={10}
                          fontStyle="bold"
                        />
                      </Group>
                    );
                  }
                  return null;
                })()}
              </Group>
            );
          })}
        </Group>
      )}

          {/* 6. Calibration markers overlay */}
          {isCalibrating && calibrationClicks.map((click, idx) => (
            <Group key={`cal-${idx}`}>
              {/* Glowing outer halo */}
              <Circle
                x={click.x}
                y={click.y}
                radius={12}
                stroke="#f59e0b"
                strokeWidth={1.5}
                opacity={0.7}
              />
              {/* Inner core */}
              <Circle
                x={click.x}
                y={click.y}
                radius={6}
                fill="#f59e0b"
                stroke="#fff"
                strokeWidth={2}
              />
              {/* crosshair ticks */}
              <Line
                points={[click.x - 16, click.y, click.x + 16, click.y]}
                stroke="#f59e0b"
                strokeWidth={1}
              />
              <Line
                points={[click.x, click.y - 16, click.x, click.y + 16]}
                stroke="#f59e0b"
                strokeWidth={1}
              />
              <Text
                x={click.x + 18}
                y={click.y - 10}
                text={`Point ${idx + 1}`}
                fill="#f59e0b"
                fontSize={11}
                fontStyle="bold"
                backgroundColor="rgba(255, 255, 255, 0.9)"
                padding={2.5}
              />
            </Group>
          ))}

          {/* Active dashed laser measurement guideline */}
          {isCalibrating && calibrationClicks.length === 1 && hoverPos && (
            <Line
              points={[calibrationClicks[0].x, calibrationClicks[0].y, hoverPos.x, hoverPos.y]}
              stroke="#f59e0b"
              strokeWidth={2.5}
              dash={[6, 4]}
            />
          )}

          {/* Active interactive North Arrow guideline */}
          {isSettingNorth && northClicks.map((click, idx) => (
            <Group key={`north-${idx}`}>
              {/* Glowing outer halo */}
              <Circle
                x={click.x}
                y={click.y}
                radius={12}
                stroke="#38bdf8"
                strokeWidth={1.5}
                opacity={0.7}
              />
              {/* Inner core */}
              <Circle
                x={click.x}
                y={click.y}
                radius={6}
                fill="#38bdf8"
                stroke="#fff"
                strokeWidth={2}
              />
              {/* crosshair ticks */}
              <Line
                points={[click.x - 16, click.y, click.x + 16, click.y]}
                stroke="#38bdf8"
                strokeWidth={1}
              />
              <Line
                points={[click.x, click.y - 16, click.x, click.y + 16]}
                stroke="#38bdf8"
                strokeWidth={1}
              />
              <Text
                x={click.x + 18}
                y={click.y - 10}
                text={idx === 0 ? (orientationType === 'east' ? "Base (W)" : "Base (S)") : (orientationType === 'east' ? "Tip (E)" : "Tip (N)")}
                fill="#0284c7"
                fontSize={11}
                fontStyle="bold"
                backgroundColor="rgba(255, 255, 255, 0.9)"
                padding={2.5}
              />
            </Group>
          ))}

          {/* Active dashed North arrow vector with arrowhead */}
          {isSettingNorth && northClicks.length === 1 && hoverPos && (() => {
            const p1 = northClicks[0];
            const p2 = hoverPos;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx*dx + dy*dy) || 1;
            
            // Draw arrowhead ticks if length is substantial
            const arrowHeadPoints: number[] = [];
            if (len > 15) {
              const ux = dx / len;
              const uy = dy / len;
              const nx = -uy;
              const ny = ux;
              
              // Arrowhead back corners
              const cx1 = p2.x - 14 * ux + 6 * nx;
              const cy1 = p2.y - 14 * uy + 6 * ny;
              const cx2 = p2.x - 14 * ux - 6 * nx;
              const cy2 = p2.y - 14 * uy - 6 * ny;
              arrowHeadPoints.push(p2.x, p2.y, cx1, cy1, cx2, cy2);
            }
            
            return (
              <Group>
                <Line
                  points={[p1.x, p1.y, p2.x, p2.y]}
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dash={[6, 4]}
                />
                {arrowHeadPoints.length > 0 && (
                  <Line
                    points={arrowHeadPoints}
                    fill="#38bdf8"
                    closed={true}
                  />
                )}
                {/* Visual compass bearing angle readout */}
                <Text
                  x={p2.x + 10}
                  y={p2.y + 10}
                  text={`Bearing: ${Math.round(getBearing(pxToMeters(p1), pxToMeters(p2)))}°`}
                  fill="#0284c7"
                  fontSize={10.5}
                  fontStyle="bold"
                  backgroundColor="rgba(255, 255, 255, 0.9)"
                  padding={2}
                />
              </Group>
            );
          })()}

          {/* 7. Anchor Points - Hidden during calibration & North settings */}
          {!isCalibrating && !isSettingNorth && project.anchors.map(anchor => {
            const pos = metersToPx(anchor.pos2d);
            const isSelected = selectedAnchorId === anchor.id;
            
            return (
              <Group
                key={anchor.id}
                x={pos.x}
                y={pos.y}
                draggable={editorMode === 'select'}
                onDragMove={(e) => handleAnchorDrag(anchor.id, e)}
                onClick={(e) => {
                  e.cancelBubble = true;
                  
                  if (editorMode === 'add_sail') {
                    // Clicked anchor in sail drawing mode
                    if (!activeDrawPoints.includes(anchor.id)) {
                      setActiveDrawPoints(prev => [...prev, anchor.id]);
                    }
                  } else if (editorMode === 'add_axis') {
                    // Roller axis endpoint picking
                    const axis = project.sails[0]?.rollerAxis; // set to first sail for v1
                    if (axis) {
                      if (!axis.startAnchorId) {
                        updateSail(project.sails[0].id, {
                          rollerAxis: { ...axis, startAnchorId: anchor.id }
                        });
                      } else if (axis.startAnchorId && axis.startAnchorId !== anchor.id) {
                        updateSail(project.sails[0].id, {
                          rollerAxis: { ...axis, endAnchorId: anchor.id, kind: 'roller' }
                        });
                        setEditorMode('select');
                      }
                    }
                  } else {
                    setSelectedAnchorId(anchor.id);
                  }
                }}
              >
                {/* Background Glow when selected */}
                {isSelected && (
                  <Circle
                    radius={16}
                    fill="rgba(79, 70, 229, 0.4)"
                  />
                )}

                {/* Main Circle */}
                <Circle
                  radius={11}
                  fill={anchor.type === 'wall' ? "#f43f5e" : "#10b981"}
                  stroke="#fff"
                  strokeWidth={isSelected ? 3 : 1.5}
                  shadowColor="#000"
                  shadowBlur={4}
                  shadowOffset={{ x: 0, y: 2 }}
                  shadowOpacity={0.3}
                />

                {/* Anchor Identifier label */}
                <Text
                  text={anchor.label}
                  x={-4.5}
                  y={-5.5}
                  fill="#fff"
                  fontSize={11}
                  fontStyle="bold"
                />

                {/* Floating height tag next to circle */}
                <Text
                  text={`${anchor.z.toFixed(1)}m`}
                  x={14}
                  y={-6}
                  fill={isSelected ? "#4f46e5" : "#334155"}
                  fontSize={10.5}
                  fontStyle="bold"
                  backgroundColor="rgba(255, 255, 255, 0.9)"
                  padding={2}
                />
              </Group>
            );
          })}

          {/* 8. Draggable Glassmorphic Compass Rose */}
          {!isCalibrating && !isSettingNorth && (() => {
            const px = metersToPx(compassPos);
            
            return (
              <Group
                x={px.x}
                y={px.y}
                draggable={true}
                onDragMove={(e) => {
                  const relPos = {
                    x: e.target.x(),
                    y: e.target.y()
                  };
                  setCompassPos(pxToMeters(relPos));
                }}
                onMouseEnter={(e) => {
                  const stage = e.target.getStage();
                  if (stage) stage.container().style.cursor = 'move';
                }}
                onMouseLeave={(e) => {
                  const stage = e.target.getStage();
                  if (stage) stage.container().style.cursor = 'default';
                }}
              >
                {/* 1. Translucent Glass Backing */}
                <Circle
                  radius={42}
                  fill="rgba(255, 255, 255, 0.85)"
                  stroke="rgba(0, 0, 0, 0.08)"
                  strokeWidth={1}
                  shadowColor="#000"
                  shadowBlur={8}
                  shadowOffset={{ x: 0, y: 4 }}
                  shadowOpacity={0.12}
                />
                            {/* 2. Rotating Compass Dial Group (Needle, Ring, and Labels rotate together by +northOffsetDeg) */}
                <Group rotation={project.simulation.northOffsetDeg}>
                  {/* Outer decorative ring */}
                  <Circle
                    radius={35}
                    stroke="rgba(79, 70, 229, 0.15)"
                    strokeWidth={1.5}
                  />
                  
                  {/* Cardinal labels */}
                  <Text
                    text="N"
                    x={-5}
                    y={-32}
                    fill="#ef4444" // red North
                    fontSize={11}
                    fontStyle="bold"
                    align="center"
                    width={10}
                  />
                  <Text
                    text="E"
                    x={23}
                    y={-5}
                    fill="#475569"
                    fontSize={10}
                    fontStyle="bold"
                    align="center"
                    width={10}
                  />
                  <Text
                    text="S"
                    x={-5}
                    y={22}
                    fill="#475569"
                    fontSize={10}
                    fontStyle="bold"
                    align="center"
                    width={10}
                  />
                  <Text
                    text="W"
                    x={-33}
                    y={-5}
                    fill="#475569"
                    fontSize={10}
                    fontStyle="bold"
                    align="center"
                    width={10}
                  />

                  {/* Compass needle aligned with the N-S dial axis */}
                  {/* North pointer (red) */}
                  <Line
                    points={[0, -25, 4, 0, -4, 0]}
                    closed={true}
                    fill="#f43f5e"
                  />
                  {/* South pointer (grey) */}
                  <Line
                    points={[0, 25, 4, 0, -4, 0]}
                    closed={true}
                    fill="#94a3b8"
                  />
                  {/* Center silver pin */}
                  <Circle
                    radius={3.5}
                    fill="#e2e8f0"
                    stroke="#64748b"
                    strokeWidth={1}
                  />
                </Group>
              </Group>
            );
          })()}
        </Layer>
      </Stage>
    </div>
  );
}
