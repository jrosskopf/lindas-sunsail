import { useProjectStore } from '../store/useProjectStore';
import { getSunPosition } from '../domain/sun';
import { Compass, Info, Map } from 'lucide-react';

export default function StatusBar() {
  const { project, selectedAnchorId, selectedSailId, selectedObstacleId } = useProjectStore();

  const selectedAnchor = project.anchors.find(a => a.id === selectedAnchorId);
  const selectedSail = project.sails.find(s => s.id === selectedSailId);
  const selectedObstacle = project.obstacles.find(o => o.id === selectedObstacleId);

  // Compute sun vector for active display
  const dateObj = new Date(`${project.simulation.date}T${project.simulation.time}:00`);
  const sun = getSunPosition(
    dateObj,
    project.simulation.latitude,
    project.simulation.longitude,
    project.simulation.northOffsetDeg
  );

  // Format compass directions (0 = North, 90 = East, 180 = South, 270 = West)
  const getCompassDirection = (deg: number): string => {
    if (deg >= 337.5 || deg < 22.5) return 'North';
    if (deg >= 22.5 && deg < 67.5) return 'North-East';
    if (deg >= 67.5 && deg < 112.5) return 'East';
    if (deg >= 112.5 && deg < 157.5) return 'South-East';
    if (deg >= 157.5 && deg < 202.5) return 'South';
    if (deg >= 202.5 && deg < 247.5) return 'South-West';
    if (deg >= 247.5 && deg < 292.5) return 'West';
    return 'North-West';
  };

  return (
    <footer className="status-bar">
      {/* 1. Selection indicator */}
      <div className="status-group">
        <Info size={13} className="text-indigo-400" />
        {selectedAnchor && (
          <span>
            Selected: <span className="font-semibold text-indigo-300">Anchor {selectedAnchor.label}</span> ({selectedAnchor.type === 'wall' ? 'Wall mount' : 'Steel post'}) at Z: <span className="font-semibold text-emerald-300">{selectedAnchor.z.toFixed(2)}m</span>
          </span>
        )}
        {selectedSail && (
          <span>
            Selected: <span className="font-semibold text-indigo-300">Sail Canvas ({selectedSail.anchorIds.join('-')})</span> | Mode: <span className="text-slate-300 font-medium">{selectedSail.previewModel.mode}</span>
          </span>
        )}
        {selectedObstacle && (
          <span>
            Selected: <span className="font-semibold text-indigo-300">{selectedObstacle.label}</span> | Height: <span className="font-semibold text-emerald-300">{selectedObstacle.height.toFixed(2)}m</span>
          </span>
        )}
        {!selectedAnchor && !selectedSail && !selectedObstacle && (
          <span className="text-slate-400">Ready | Double-click plan to add points. Drag points to adjust layout.</span>
        )}
      </div>

      {/* 2. Solar coordinates readouts */}
      <div className="status-group">
        <div className="flex items-center gap-1">
          <Compass size={13} className="text-amber-400 shrink-0" />
          <span>
            Sun: <span className="font-semibold text-amber-300">{sun.azimuthDeg.toFixed(0)}° ({getCompassDirection(sun.azimuthDeg)})</span> 
            {', '}
            Elev: <span className={`font-semibold ${sun.isUp ? 'text-amber-300' : 'text-slate-500'}`}>
              {sun.elevationDeg.toFixed(1)}° ({sun.isUp ? 'Day' : 'Night'})
            </span>
          </span>
        </div>

        <div className="h-4 w-px bg-slate-800" />

        <div className="flex items-center gap-1">
          <Map size={13} className="text-slate-400 shrink-0" />
          <span>
            Lat: <span className="font-semibold text-slate-300">{project.simulation.latitude.toFixed(4)}°</span> 
            {', '}
            Lon: <span className="font-semibold text-slate-300">{project.simulation.longitude.toFixed(4)}°</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
