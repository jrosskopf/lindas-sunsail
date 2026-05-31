import React, { useRef } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { 
  Upload, 
  Download, 
  Grid, 
  RefreshCw, 
  FileJson,
  Sun,
  Compass
} from 'lucide-react';

export default function Toolbar() {
  const {
    project,
    isCalibrating,
    isSettingNorth,
    orientationType,
    splitRatio,
    updateBackground,
    startCalibration,
    startSettingNorth,
    cancelSettingNorth,
    setSplitRatio,
    resetToDefaultProject
  } = useProjectStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const bg = project.background;
  const calState: 'idle' | 'calibrating' | 'calibrated' = isCalibrating
    ? 'calibrating'
    : (bg?.calibrationPoints && bg.calibrationPoints.length === 2)
      ? 'calibrated'
      : 'idle';

  const northState: 'idle' | 'drawing' | 'set' = isSettingNorth
    ? 'drawing'
    : (bg?.northPoints && bg.northPoints.length === 2)
      ? 'set'
      : 'idle';

  const handleCalibrationClick = () => {
    if (calState === 'calibrating') {
      useProjectStore.getState().cancelCalibration();
    } else {
      startCalibration();
    }
  };



  // Handle plan image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          updateBackground({
            imageUrl: event.target.result as string,
            scale: 1,
            rotationDeg: 0,
            pixelsPerMeter: 50, // reset to default
            calibrationPoints: []
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Save project as JSON
  const handleSaveProject = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${project.name.toLowerCase().replace(/\s+/g, '-')}-config.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Load project from JSON
  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed && Array.isArray(parsed.anchors) && Array.isArray(parsed.sails)) {
            // Restore full project in store
            useProjectStore.setState({ project: parsed });
            alert("Project restored successfully!");
          } else {
            alert("Error: JSON does not contain a valid Sunsail project schema.");
          }
        } catch (err) {
          alert("Error parsing JSON config file.");
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <header className="top-toolbar glass-panel">
      {/* Brand logo section */}
      <div className="brand-section">
        <Sun className="text-indigo-400 animate-pulse" size={24} />
        <div>
          <h1 className="brand-title">Linda's Sunsail</h1>
        </div>
        <span className="brand-badge">Simulation Grade</span>
      </div>

      {/* Center metadata display */}
      <div className="hidden md:flex items-center gap-4 text-xs">
        <div className="px-3 py-1 bg-slate-900/60 rounded border border-slate-800">
          <span className="text-slate-400">Project: </span>
          <span className="text-indigo-300 font-semibold">{project.name}</span>
        </div>
        <div className="px-3 py-1 bg-slate-900/60 rounded border border-slate-800">
          <span className="text-slate-400">Site: </span>
          <span className="text-emerald-300 font-semibold">{project.locationName}</span>
        </div>
      </div>

      {/* Toolbar actions */}
      <div className="toolbar-actions">
        {/* Underlay upload */}
        <button 
          className="btn-secondary flex items-center gap-2 text-xs py-1.5" 
          onClick={() => fileInputRef.current?.click()}
          title="Import Floor Plan JPG/PNG"
        >
          <Upload size={14} />
          <span>Plan Image</span>
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleImageUpload} 
          accept="image/*" 
          style={{ display: 'none' }} 
        />

        {/* Calibration trigger - Three-State Toggle Button */}
        {calState === 'idle' && (
          <button 
            className="btn-secondary flex items-center gap-2 text-xs py-1.5"
            onClick={handleCalibrationClick}
            title="Calibrate Scale (Click two points)"
          >
            <Grid size={14} className="text-slate-500" />
            <span>Calibrate Scale</span>
          </button>
        )}
        {calState === 'calibrating' && (
          <button 
            className="flex items-center gap-2 text-xs py-1.5 px-3 rounded-lg font-semibold bg-amber-500 hover:bg-amber-600 text-white border border-amber-400 shadow-md animate-pulse cursor-pointer transition-all"
            onClick={handleCalibrationClick}
            title="Calibration Active. Click first then second point on floor plan. Click button to cancel."
          >
            <Grid size={14} />
            <span>Calibration Active</span>
          </button>
        )}
        {calState === 'calibrated' && (
          <button 
            className="flex items-center gap-2 text-xs py-1.5 px-3 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500 shadow-md cursor-pointer transition-all"
            onClick={handleCalibrationClick}
            title={`Scale Calibrated: ${Math.round(bg?.pixelsPerMeter || 50)} px/m. Click to recalibrate.`}
          >
            <Grid size={14} />
            <span>Calibrated ({Math.round(bg?.pixelsPerMeter || 50)} px/m)</span>
          </button>
        )}

        {/* Orientation calibration button group */}
        {northState === 'idle' && (
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
            <button 
              className="btn-secondary flex items-center gap-1 text-[11px] py-1 px-2 border-0 bg-transparent hover:bg-black/5 rounded-md"
              onClick={() => startSettingNorth('north')}
              title="Set North Arrow (Click two points: South base to North tip)"
            >
              <Compass size={13} className="text-slate-500" />
              <span>Set North</span>
            </button>
            <div className="w-px h-4 bg-slate-300 mx-0.5" />
            <button 
              className="btn-secondary flex items-center gap-1 text-[11px] py-1 px-2 border-0 bg-transparent hover:bg-black/5 rounded-md"
              onClick={() => startSettingNorth('east')}
              title="Set East Arrow (Click two points: West base to East tip)"
            >
              <Compass size={13} className="text-slate-500" />
              <span>Set East</span>
            </button>
          </div>
        )}
        {northState === 'drawing' && (
          <button 
            className={`flex items-center gap-2 text-xs py-1.5 px-3 rounded-lg font-semibold text-white border shadow-md animate-pulse cursor-pointer transition-all ${
              orientationType === 'east' 
                ? 'bg-amber-500 border-amber-400 hover:bg-amber-600' 
                : 'bg-sky-500 border-sky-400 hover:bg-sky-600'
            }`}
            onClick={cancelSettingNorth}
            title={`${orientationType === 'east' ? 'East' : 'North'} Drawing Active. Click base then tip on floor plan. Click button to cancel.`}
          >
            <Compass size={14} />
            <span>{orientationType === 'east' ? 'East Vector Drawing' : 'North Vector Drawing'}</span>
          </button>
        )}
        {northState === 'set' && (
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
            <button 
              className="flex items-center gap-1.5 text-xs py-1 px-2.5 rounded-md font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-all"
              onClick={() => startSettingNorth('north')}
              title={`Orientation Offset: ${project.simulation.northOffsetDeg}°. Click to draw a new North arrow.`}
            >
              <Compass size={13} />
              <span>North Offset ({project.simulation.northOffsetDeg}°)</span>
            </button>
            <div className="w-px h-4 bg-slate-300 mx-1" />
            <button 
              className="text-[10px] py-1 px-2 text-slate-500 hover:text-slate-800 transition-colors bg-transparent border-0 cursor-pointer font-medium"
              onClick={() => startSettingNorth('east')}
              title="Click to recalibrate by drawing an East arrow instead."
            >
              Set East
            </button>
          </div>
        )}

        {/* Save/Load JSON */}
        <button 
          className="btn-secondary flex items-center gap-2 text-xs py-1.5" 
          onClick={handleSaveProject}
          title="Export JSON Configuration"
        >
          <Download size={14} />
          <span>Save JSON</span>
        </button>
        <button 
          className="btn-secondary flex items-center gap-2 text-xs py-1.5" 
          onClick={() => jsonInputRef.current?.click()}
          title="Import JSON Configuration"
        >
          <FileJson size={14} />
          <span>Load JSON</span>
        </button>
        <input 
          type="file" 
          ref={jsonInputRef} 
          onChange={handleLoadProject} 
          accept=".json" 
          style={{ display: 'none' }} 
        />

        {/* Reset project */}
        <button 
          className="btn-secondary flex items-center gap-2 text-xs py-1.5"
          onClick={resetToDefaultProject}
          title="Reset to Default Planning Preset"
        >
          <RefreshCw size={14} />
          <span>Reset Preset</span>
        </button>

        <div className="h-6 w-px bg-slate-800" />

        {/* Split screen ratios */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button 
            className={`px-2 py-1 text-[10px] font-bold rounded ${splitRatio === '100/0' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
            onClick={() => setSplitRatio('100/0')}
            title="2D Fullscreen"
          >
            2D
          </button>
          <button 
            className={`px-2 py-1 text-[10px] font-bold rounded ${splitRatio === '50/50' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
            onClick={() => setSplitRatio('50/50')}
            title="50/50 Split View"
          >
            Split
          </button>
          <button 
            className={`px-2 py-1 text-[10px] font-bold rounded ${splitRatio === '70/30' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
            onClick={() => setSplitRatio('70/30')}
            title="70/30 2D Focus"
          >
            70:30
          </button>
          <button 
            className={`px-2 py-1 text-[10px] font-bold rounded ${splitRatio === '0/100' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
            onClick={() => setSplitRatio('0/100')}
            title="3D Fullscreen"
          >
            3D
          </button>
        </div>
      </div>
    </header>
  );
}
