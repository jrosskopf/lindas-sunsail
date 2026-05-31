import React, { useEffect } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import type { AnchorType, Vec2 } from '../store/useProjectStore';
import { getSunPosition, projectShadow } from '../domain/sun';
import { calculateTerraceShadeKPI, checkSlopeWarning, triangulateSail } from '../domain/geometry';
import { 
  MapPin, 
  Sliders, 
  Anchor as AnchorIcon, 
  Compass, 
  Play, 
  Pause, 
  TrendingUp, 
  AlertTriangle,
  Image as ImageIcon,
  Layers
} from 'lucide-react';

const GLOBAL_PRESETS = [
  { name: "Munich, Germany", lat: 48.1351, lon: 11.5820 },
  { name: "Berlin, Germany", lat: 52.5200, lon: 13.4050 },
  { name: "London, UK", lat: 51.5074, lon: -0.1278 },
  { name: "New York, USA", lat: 40.7128, lon: -74.0060 },
  { name: "San Francisco, USA", lat: 37.7749, lon: -122.4194 },
  { name: "Tokyo, Japan", lat: 35.6762, lon: 139.6503 },
  { name: "Sydney, Australia", lat: -33.8688, lon: 151.2093 }
];

export default function Sidebar() {
  const {
    project,
    selectedAnchorId,
    selectedObstacleId,
    isPlaying,
    updateAnchor,
    updateSail,
    updateObstacle,
    deleteObstacle,
    setSimulation,
    tickSimulation,
    setIsPlaying,
    updateBackground
  } = useProjectStore();

  const sim = project.simulation;
  const anchors = project.anchors;
  const selectedAnchor = anchors.find(a => a.id === selectedAnchorId);
  const selectedObstacle = project.obstacles.find(o => o.id === selectedObstacleId);
  const sail = project.sails[0]; // first sail in v1

  // Handle play/pause timer
  useEffect(() => {
    let intervalId: any;
    if (isPlaying) {
      intervalId = setInterval(() => {
        tickSimulation();
      }, 350); // tick every 350ms
    }
    return () => clearInterval(intervalId);
  }, [isPlaying, tickSimulation]);

  // Convert time HH:MM into range minutes index (0 to 287 for 5-minute steps)
  const [hStr, mStr] = sim.time.split(':');
  const totalMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
  const sliderValue = Math.floor(totalMinutes / 5);

  const handleTimeSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10) * 5;
    const hour = Math.floor(val / 60);
    const minute = val % 60;
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    setSimulation({ time: timeStr });
  };

  // Convert location preset selection
  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value, 10);
    if (!isNaN(idx)) {
      const preset = GLOBAL_PRESETS[idx];
      useProjectStore.getState().setProject({
        locationName: preset.name,
        location: {
          lat: preset.lat,
          lon: preset.lon,
          northOffsetDeg: project.location.northOffsetDeg
        }
      });
      setSimulation({
        latitude: preset.lat,
        longitude: preset.lon
      });
    }
  };

  // Z-height slider handler
  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedAnchor) {
      updateAnchor(selectedAnchor.id, { z: parseFloat(e.target.value) });
    }
  };

  // Bulk operation: Set all anchor heights
  const bulkSetHeight = (h: number) => {
    anchors.forEach(a => updateAnchor(a.id, { z: h }));
  };

  // Bulk operation: Raise all by delta
  const bulkAdjustHeight = (delta: number) => {
    anchors.forEach(a => updateAnchor(a.id, { z: Math.max(0.5, a.z + delta) }));
  };

  // 1. Calculate active shadow coverage KPI
  const computeShadeForTime = (timeStr: string): number => {
    const dateObj = new Date(`${sim.date}T${timeStr}:00`);
    const sun = getSunPosition(dateObj, sim.latitude, sim.longitude, sim.northOffsetDeg);
    
    if (!sun.isUp || project.terrace.length < 3) return 0;

    const projectedSailShadows: Vec2[][] = [];
    const projectedObstacles: Vec2[][] = [];

    // Triangulate sail
    project.sails.forEach(s => {
      const tris = triangulateSail(s, anchors);
      tris.forEach(triIds => {
        const poly: Vec2[] = [];
        triIds.forEach(aid => {
          const anchor = anchors.find(a => a.id === aid);
          if (anchor) {
            poly.push(projectShadow({ x: anchor.pos2d.x, y: anchor.pos2d.y, z: anchor.z }, sun.vector));
          }
        });
        if (poly.length >= 3) projectedSailShadows.push(poly);
      });
    });

    // Project obstacles
    project.obstacles.forEach(o => {
      const poly: Vec2[] = [];
      o.points.forEach(pt => {
        poly.push(projectShadow({ x: pt.x, y: pt.y, z: o.height }, sun.vector));
      });
      projectedObstacles.push([...o.points, ...poly]);
    });

    const kpi = calculateTerraceShadeKPI(project.terrace, projectedSailShadows, projectedObstacles, 15);
    return kpi.percentage;
  };

  const currentCoverage = computeShadeForTime(sim.time);

  // 2. Generate hourly chart coverage data points (08:00, 10:00, 12:00, 14:00, 16:00, 18:00)
  const hourlyHours = [8, 10, 12, 14, 16, 18];
  const hourlyData = hourlyHours.map(h => {
    const timeStr = `${String(h).padStart(2, '0')}:00`;
    return { hour: h, shade: computeShadeForTime(timeStr) };
  });

  // Calculate SVG line path coordinates inside [0, 100] scale
  // x goes from 10 to 90
  // y goes from 90 (0% shade) to 10 (100% shade)
  const chartPoints = hourlyData.map((d, index) => {
    const x = 10 + (index / (hourlyData.length - 1)) * 80;
    const y = 90 - (d.shade / 100) * 80;
    return `${x},${y}`;
  }).join(' ');

  // Compute slope drainage warning
  const slopeWarning = sail ? checkSlopeWarning(sail, anchors) : null;

  return (
    <aside className="sidebar-panel">
      {/* 0. Floor Plan Underlay Controls */}
      <div className="sidebar-section bg-indigo-50/20">
        <h3 className="sidebar-title">
          <ImageIcon size={15} className="text-indigo-600" />
          <span>Floor Plan Underlay</span>
        </h3>

        <div className="p-2.5 text-[10.5px] text-indigo-900 bg-indigo-50/60 rounded border border-indigo-100 mb-3 leading-relaxed">
          💡 <strong>Pro Tip:</strong> Focus the window and press <strong>Ctrl+V</strong> (or <strong>Cmd+V</strong>) to paste your copied floor plan screenshot directly onto the planning grid!
        </div>

        {project.background?.imageUrl ? (
          <div className="space-y-3">
            <div className="form-group">
              <div className="flex justify-between items-center mb-1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label mb-0">Plan Opacity ({Math.round(project.background.opacity * 100)}%)</label>
                {project.background.calibrationPoints.length > 0 && (
                  <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 py-0.5 rounded">
                    Calibrated
                  </span>
                )}
              </div>
              <input 
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={project.background.opacity}
                onChange={(e) => updateBackground({ opacity: parseFloat(e.target.value) })}
                className="slider-input w-full"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Plan Image Rotation ({project.background.rotationDeg}°)</label>
              <input 
                type="range"
                min="-180"
                max="180"
                step="1"
                value={project.background.rotationDeg}
                onChange={(e) => updateBackground({ rotationDeg: parseInt(e.target.value, 10) })}
                className="slider-input w-full"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Plan Image Scale Offset ({project.background.scale.toFixed(2)}x)</label>
              <input 
                type="range"
                min="0.1"
                max="4.0"
                step="0.05"
                value={project.background.scale}
                onChange={(e) => updateBackground({ scale: parseFloat(e.target.value) })}
                className="slider-input w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2" style={{ display: 'flex', gap: '8px' }}>
              <div>
                <label className="form-label">Image X Offset (px)</label>
                <input 
                  type="number"
                  value={project.background.origin.x}
                  onChange={(e) => updateBackground({ origin: { ...project.background!.origin, x: parseFloat(e.target.value) || 0 } })}
                  className="input-text"
                />
              </div>
              <div>
                <label className="form-label">Image Y Offset (px)</label>
                <input 
                  type="number"
                  value={project.background.origin.y}
                  onChange={(e) => updateBackground({ origin: { ...project.background!.origin, y: parseFloat(e.target.value) || 0 } })}
                  className="input-text"
                />
              </div>
            </div>

            <button 
              className="btn-secondary w-full text-[11px] py-1 mt-2 text-rose-600 hover:text-rose-700 bg-rose-50 border-rose-100 hover:bg-rose-100 transition-colors"
              onClick={() => updateBackground({ imageUrl: "" })}
            >
              Clear Underlay Image
            </button>
          </div>
        ) : (
          <div className="p-4 text-xs text-slate-500 bg-slate-50 rounded border border-dashed border-slate-200 text-center">
            No image underlay loaded. Paste (Ctrl+V) an image or click "Plan Image" in toolbar to load drawing.
          </div>
        )}
      </div>

      {/* 1. Global site orientation section */}
      <div className="sidebar-section">
        <h3 className="sidebar-title">
          <MapPin size={15} className="text-emerald-400" />
          <span>Location & Site</span>
        </h3>
        
        <div className="form-group">
          <label className="form-label">Global Coordinates Preset</label>
          <select 
            className="select-input"
            onChange={handlePresetChange}
            defaultValue=""
          >
            <option value="" disabled>-- Select Preset --</option>
            {GLOBAL_PRESETS.map((preset, idx) => (
              <option key={idx} value={idx}>{preset.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3" style={{ display: 'flex', gap: '8px' }}>
          <div>
            <label className="form-label">Latitude (°N)</label>
            <input 
              type="number" 
              step="0.0001"
              value={sim.latitude} 
              onChange={(e) => setSimulation({ latitude: parseFloat(e.target.value) || 0 })}
              className="input-text"
            />
          </div>
          <div>
            <label className="form-label">Longitude (°E)</label>
            <input 
              type="number" 
              step="0.0001"
              value={sim.longitude} 
              onChange={(e) => setSimulation({ longitude: parseFloat(e.target.value) || 0 })}
              className="input-text"
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Plan North Offset ({sim.northOffsetDeg}°)</label>
          <input 
            type="range"
            min="0"
            max="360"
            value={sim.northOffsetDeg}
            onChange={(e) => setSimulation({ northOffsetDeg: parseInt(e.target.value, 10) })}
            className="slider-input w-full"
          />
        </div>
      </div>

      {/* 2. Anchor heights dashboard */}
      <div className="sidebar-section">
        <h3 className="sidebar-title">
          <AnchorIcon size={15} className="text-rose-400" />
          <span>Anchors & Heights</span>
        </h3>

        {/* Selected anchor controls */}
        {selectedAnchor ? (
          <div className="item-card selected">
            <div className="item-header">
              <span className="font-bold text-sm text-indigo-200">Anchor {selectedAnchor.label}</span>
              <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded">
                Selected
              </span>
            </div>
            
            <div className="form-group">
              <label className="form-label">Attachment Height ({selectedAnchor.z.toFixed(2)} m)</label>
              <input 
                type="range"
                min="0.5"
                max="5.0"
                step="0.05"
                value={selectedAnchor.z}
                onChange={handleHeightChange}
                className="slider-input w-full"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Anchor Type</label>
              <select
                value={selectedAnchor.type}
                onChange={(e) => updateAnchor(selectedAnchor.id, { type: e.target.value as AnchorType })}
                className="select-input"
              >
                <option value="wall">Wall Mount (Flush Bracket)</option>
                <option value="post">Support Pillar (Cylinder Post)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Notes</label>
              <input 
                type="text" 
                value={selectedAnchor.notes || ''}
                onChange={(e) => updateAnchor(selectedAnchor.id, { notes: e.target.value })}
                placeholder="Anchor notes..."
                className="input-text"
              />
            </div>
          </div>
        ) : (
          <div className="p-3 text-xs text-slate-500 bg-slate-100/40 rounded border border-dashed border-slate-200 text-center mb-3">
            Click an anchor point on canvas to adjust height.
          </div>
        )}

        {/* Bulk tools */}
        <div className="mt-3">
          <label className="form-label mb-2 block">Bulk Anchor Operations</label>
          <div className="flex gap-2 flex-wrap" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button className="btn-secondary text-[10px] py-1 px-2" onClick={() => bulkSetHeight(2.8)}>
              Set All to 2.8m
            </button>
            <button className="btn-secondary text-[10px] py-1 px-2" onClick={() => bulkAdjustHeight(0.15)}>
              Raise All +15cm
            </button>
            <button className="btn-secondary text-[10px] py-1 px-2" onClick={() => bulkAdjustHeight(-0.15)}>
              Lower All -15cm
            </button>
          </div>
        </div>
      </div>

      {/* 3. Sail details & Saddle tuning */}
      {sail && (
        <div className="sidebar-section">
          <h3 className="sidebar-title">
            <Sliders size={15} className="text-indigo-400" />
            <span>Sail Properties</span>
          </h3>

          <div className="form-group">
            <label className="form-label">Geometry Preview Mode</label>
            <div className="grid grid-cols-2 gap-2" style={{ display: 'flex', gap: '6px' }}>
              <button 
                className={`btn-secondary text-[11px] py-1 flex-1 ${sail.previewModel.mode === 'planar' ? 'bg-indigo-600/30 border-indigo-500 text-white' : ''}`}
                onClick={() => updateSail(sail.id, { previewModel: { ...sail.previewModel, mode: 'planar' } })}
              >
                Flat Triangles
              </button>
              <button 
                className={`btn-secondary text-[11px] py-1 flex-1 ${sail.previewModel.mode === 'stylized' ? 'bg-indigo-600/30 border-indigo-500 text-white' : ''}`}
                onClick={() => updateSail(sail.id, { previewModel: { ...sail.previewModel, mode: 'stylized' } })}
              >
                Stylized Saddle
              </button>
            </div>
          </div>

          {sail.previewModel.mode === 'stylized' && (
            <div className="space-y-3">
              <div className="form-group">
                <label className="form-label">Tension Curvature Inward ({sail.edges[0]?.curvatureInward.toFixed(2)}m)</label>
                <input 
                  type="range"
                  min="0"
                  max="0.8"
                  step="0.05"
                  value={sail.edges[0]?.curvatureInward || 0}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    const updatedEdges = sail.edges.map(edge => ({
                      ...edge,
                      curvatureInward: val
                    }));
                    updateSail(sail.id, { edges: updatedEdges });
                  }}
                  className="slider-input w-full"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Saddle Twist Deflection ({sail.previewModel.curvature.toFixed(2)}m)</label>
                <input 
                  type="range"
                  min="0"
                  max="1.0"
                  step="0.05"
                  value={sail.previewModel.curvature}
                  onChange={(e) => updateSail(sail.id, {
                    previewModel: { ...sail.previewModel, curvature: parseFloat(e.target.value) }
                  })}
                  className="slider-input w-full"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Fabric Sag Deflection ({sail.previewModel.sag.toFixed(2)}m)</label>
                <input 
                  type="range"
                  min="0"
                  max="0.3"
                  step="0.01"
                  value={sail.previewModel.sag}
                  onChange={(e) => updateSail(sail.id, {
                    previewModel: { ...sail.previewModel, sag: parseFloat(e.target.value) }
                  })}
                  className="slider-input w-full"
                />
              </div>
            </div>
          )}

          {/* Roller Axis binding config */}
          <div className="form-group border-t border-slate-900 pt-3">
            <label className="form-label">Diagonal Wave Roller Axis</label>
            <select
              value={sail.rollerAxis?.startAnchorId && sail.rollerAxis?.endAnchorId ? "A-C" : "none"}
              onChange={(e) => {
                if (e.target.value === 'A-C') {
                  updateSail(sail.id, {
                    rollerAxis: { startAnchorId: 'A', endAnchorId: 'C', kind: 'roller' }
                  });
                } else {
                  updateSail(sail.id, { rollerAxis: undefined });
                }
              }}
              className="select-input"
            >
              <option value="none">No roller axis (Continuous canvas)</option>
              <option value="A-C">Hinged Roller Axis A → C (Split Quad)</option>
            </select>
          </div>
        </div>
      )}

      {/* House & Obstacle Properties Section */}
      <div className="sidebar-section">
        <h3 className="sidebar-title">
          <Layers size={15} className="text-sky-400" />
          <span>House & Obstacles</span>
        </h3>

        {selectedObstacle ? (
          <div className="item-card selected">
            <div className="item-header">
              <span className="font-bold text-sm text-sky-200">{selectedObstacle.label}</span>
              <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded">
                Selected
              </span>
            </div>
            
            <div className="form-group">
              <label className="form-label">House Name</label>
              <input 
                type="text" 
                value={selectedObstacle.label}
                onChange={(e) => updateObstacle(selectedObstacle.id, { label: e.target.value })}
                className="input-text"
              />
            </div>

            <div className="form-group">
              <label className="form-label">House Height ({selectedObstacle.height.toFixed(2)} m)</label>
              <input 
                type="range"
                min="1.0"
                max="10.0"
                step="0.1"
                value={selectedObstacle.height}
                onChange={(e) => updateObstacle(selectedObstacle.id, { height: parseFloat(e.target.value) })}
                className="slider-input w-full"
              />
            </div>

            <button 
              className="w-full mt-2 py-1 px-3 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors cursor-pointer"
              onClick={() => deleteObstacle(selectedObstacle.id)}
            >
              Delete House Box
            </button>
          </div>
        ) : (
          <div className="p-3 text-xs text-slate-500 bg-slate-100/40 rounded border border-dashed border-slate-200 text-center mb-3">
            Click a house box on plan or click "O+" to spawn a new one.
          </div>
        )}
      </div>

      {/* 4. Solstices and Date/Time scrubbers */}
      <div className="sidebar-section">
        <h3 className="sidebar-title">
          <Compass size={15} className="text-amber-400" />
          <span>Solar Simulation</span>
        </h3>

        <div className="sim-controls-panel">
          <div className="grid grid-cols-2 gap-3" style={{ display: 'flex', gap: '8px' }}>
            <div>
              <label className="form-label">Simulation Date</label>
              <input 
                type="date"
                value={sim.date}
                onChange={(e) => setSimulation({ date: e.target.value })}
                className="input-text"
              />
            </div>
            <div>
              <label className="form-label">Sim Time ({sim.time})</label>
              <div className="time-scrubber-row">
                <button 
                  className={`btn-icon ${isPlaying ? 'bg-amber-600/30' : ''}`}
                  onClick={() => setIsPlaying(!isPlaying)}
                  title={isPlaying ? "Pause playback" : "Play daily path loops"}
                  style={{ width: '28px', height: '28px' }}
                >
                  {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <span className="font-bold text-indigo-400">{sim.time}</span>
              </div>
            </div>
          </div>

          <div className="form-group">
            <input 
              type="range"
              min="0"
              max="287" // 288 steps of 5 mins
              value={sliderValue}
              onChange={handleTimeSliderChange}
              className="slider-input w-full"
            />
          </div>

          {/* Simulation View Toggles */}
          <div className="pt-2 border-t border-slate-200/50" style={{ paddingTop: '8px', borderTop: '1px solid rgba(226, 232, 240, 0.5)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={sim.showShadows ?? true}
                  onChange={(e) => setSimulation({ showShadows: e.target.checked })}
                  style={{ marginRight: '6px', cursor: 'pointer' }}
                />
                <span>Show Shadows Simulation</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={sim.showGroundGrid}
                  onChange={(e) => setSimulation({ showGroundGrid: e.target.checked })}
                  style={{ marginRight: '6px', cursor: 'pointer' }}
                />
                <span>Show Ground Grid (1m)</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input 
                  type="checkbox"
                  checked={sim.showSunVector}
                  onChange={(e) => setSimulation({ showSunVector: e.target.checked })}
                  style={{ marginRight: '6px', cursor: 'pointer' }}
                />
                <span>Show Sun Direction Vector</span>
              </label>
            </div>
          </div>

          {/* Astronomical presets */}
          <div>
            <label className="form-label mb-2 block">Solar Presets</label>
            <div className="flex gap-2 flex-wrap" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button 
                className="btn-secondary text-[10px] py-1 px-2"
                onClick={() => setSimulation({ date: "2026-06-21", time: "12:00" })}
                title="Max elevation sun shadow"
              >
                Summer Solstice
              </button>
              <button 
                className="btn-secondary text-[10px] py-1 px-2"
                onClick={() => setSimulation({ date: "2026-12-21", time: "12:00" })}
                title="Min elevation sun shadow"
              >
                Winter Solstice
              </button>
              <button 
                className="btn-secondary text-[10px] py-1 px-2"
                onClick={() => setSimulation({ date: "2026-03-21", time: "12:00" })}
                title="Equinox sun shadow"
              >
                Spring Equinox
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Terrace coverage KPI and hourly chart */}
      <div className="sidebar-section">
        <h3 className="sidebar-title">
          <TrendingUp size={15} className="text-emerald-400" />
          <span>Terrace Shade Performance</span>
        </h3>

        <div className="kpi-container">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-400">Current Terrace Shaded:</span>
            <span className="font-bold text-emerald-400 text-sm">{currentCoverage}%</span>
          </div>

          <div className="kpi-meter">
            <div className="kpi-fill" style={{ width: `${currentCoverage}%` }} />
            <div className="kpi-text">{currentCoverage}% Coverage</div>
          </div>

          {/* Hour coverage line chart */}
          <div className="mt-4 p-2 bg-slate-50 rounded border border-slate-200">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
              Daily Shade Profile (8 AM - 6 PM)
            </span>
            
            <div className="relative h-28 w-full flex items-center justify-center">
              {/* Custom SVG Line Chart */}
              <svg viewBox="0 0 100 100" className="w-full h-full">
                {/* Horizontal grid guide lines */}
                <line x1="10" y1="10" x2="90" y2="10" stroke="#e2e8f0" strokeWidth="0.5" />
                <line x1="10" y1="50" x2="90" y2="50" stroke="#e2e8f0" strokeWidth="0.5" />
                <line x1="10" y1="90" x2="90" y2="90" stroke="#e2e8f0" strokeWidth="0.5" />

                {/* Vertical labels mapping */}
                {hourlyData.map((d, index) => {
                  const x = 10 + (index / (hourlyData.length - 1)) * 80;
                  return (
                    <text 
                      key={index} 
                      x={x} 
                      y="98" 
                      fill="#64748b" 
                      fontSize="6" 
                      textAnchor="middle"
                    >
                      {d.hour}h
                    </text>
                  );
                })}

                {/* Plot line */}
                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2.0"
                  points={chartPoints}
                />

                {/* Glowing coordinate circular dots */}
                {hourlyData.map((d, index) => {
                  const x = 10 + (index / (hourlyData.length - 1)) * 80;
                  const y = 90 - (d.shade / 100) * 80;
                  return (
                    <circle
                      key={index}
                      cx={x}
                      cy={y}
                      r="2.5"
                      fill="#10b981"
                      stroke="#fff"
                      strokeWidth="0.5"
                    />
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Drainage Warn flags in sidebar */}
      {slopeWarning && slopeWarning.hasWarning && (
        <div className="sidebar-section bg-rose-950/20 border-t border-rose-900/50">
          <div className="flex items-start gap-2.5 text-xs text-rose-300">
            <AlertTriangle className="text-rose-400 shrink-0 mt-0.5" size={16} />
            <div>
              <span className="font-bold block text-rose-200 mb-0.5">Rain Runoff Alert</span>
              <p className="text-[11px] leading-relaxed opacity-90">{slopeWarning.message}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
