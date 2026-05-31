import { useProjectStore } from '../store/useProjectStore';
import { checkSlopeWarning } from '../domain/geometry';
import { ShieldAlert, Ruler, Compass, AlertCircle } from 'lucide-react';

export default function ValidationPanel() {
  const { project } = useProjectStore();
  const anchors = project.anchors;
  const bg = project.background;
  const sail = project.sails[0];

  const warnings: { id: string; type: 'warning' | 'info' | 'error'; icon: any; title: string; message: string }[] = [];

  // 1. Check scale calibration warning
  const isDefaultPPM = bg?.pixelsPerMeter === 50 && bg?.calibrationPoints.length === 0;
  if (isDefaultPPM && bg?.imageUrl) {
    warnings.push({
      id: 'scale-calib',
      type: 'warning',
      icon: Ruler,
      title: 'Scale Not Calibrated',
      message: 'Plan coordinates are using default scale. Click "Calibrate Scale" in toolbar to set real-world meter metrics.'
    });
  }

  // 2. Check default north orientation warning
  const isDefaultNorth = project.location.northOffsetDeg === 15 && !(bg?.northPoints && bg.northPoints.length === 2);
  if (isDefaultNorth) {
    warnings.push({
      id: 'north-angle',
      type: 'info',
      icon: Compass,
      title: 'North Offset is Default',
      message: 'True North orientation is set to default 15°. Click "Set North Arrow" in the toolbar or adjust the slider in "Location & Site" to align with your plan image.'
    });
  }

  // 3. Check rain runoff slope warning
  if (sail) {
    const slope = checkSlopeWarning(sail, anchors);
    if (slope.hasWarning) {
      warnings.push({
        id: 'drainage-slope',
        type: 'warning',
        icon: ShieldAlert,
        title: 'Rain Drainage Slope Warning',
        message: slope.message
      });
    }
  }

  // 4. Invalid polygon warning (fewer than 3 anchors)
  if (sail && sail.anchorIds.length < 3) {
    warnings.push({
      id: 'invalid-poly',
      type: 'error',
      icon: AlertCircle,
      title: 'Invalid Sail Polygon',
      message: 'The sail polygon has fewer than 3 connected anchor points. Drag anchors or redraw.'
    });
  }

  if (warnings.length === 0) return null;

  return (
    <div className="diagnostics-panel select-none">
      {warnings.map(w => {
        const IconComponent = w.icon;
        
        let cardClass = "diagnostic-card glass-panel";
        if (w.type === 'error') cardClass += " error";
        if (w.type === 'info') cardClass += " info";

        return (
          <div key={w.id} className={cardClass}>
            <div className="shrink-0 mt-0.5">
              {w.type === 'error' && <IconComponent className="text-rose-500" size={16} />}
              {w.type === 'warning' && <IconComponent className="text-amber-500" size={16} />}
              {w.type === 'info' && <IconComponent className="text-sky-500" size={16} />}
            </div>
            <div>
              <span className="font-bold text-slate-100 block mb-0.5 text-xs">{w.title}</span>
              <p className="text-[10.5px] leading-relaxed text-slate-300 opacity-90">{w.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
