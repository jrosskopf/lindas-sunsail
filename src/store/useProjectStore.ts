import { create } from 'zustand';

export interface Vec2 { x: number; y: number; }
export interface Vec3 { x: number; y: number; z: number; }

export type AnchorType = 'wall' | 'post' | 'structure';

export interface BackgroundPlan {
  imageUrl: string;
  opacity: number;
  origin: Vec2;           // Pixel offset translation of the background plan image
  rotationDeg: number;    // Rotation offset of the plan (degrees)
  scale: number;          // Zoom scale of the image
  pixelsPerMeter: number; // Calibration factor
  calibrationPoints: Vec2[]; // Pixel coordinates of calibration
  northPoints?: Vec2[];   // Pixel coordinates of north arrow calibration
}

export interface Anchor {
  id: string;
  label: string;
  pos2d: Vec2;            // Location in plan meters relative to plan origin
  z: number;              // Absolute height above datum in meters
  type: AnchorType;
  postHeightAboveGround?: number;
  notes?: string;
}

export interface SailEdge {
  startAnchorId: string;
  endAnchorId: string;
  edgeType: 'straight' | 'curved';
  curvatureInward: number; // inward sag in meters
}

export interface Sail {
  id: string;
  anchorIds: string[]; // Order of anchors (e.g. A, B, C, D)
  edges: SailEdge[];
  rollerAxis?: {
    startAnchorId?: string;
    endAnchorId?: string;
    kind: 'reference' | 'ridge' | 'roller';
  };
  previewModel: {
    mode: 'planar' | 'stylized';
    curvature: number; // saddle curvature factor
    sag: number;       // graphic sag factor
  };
}

export interface Obstacle {
  id: string;
  label: string;
  points: Vec2[]; // 2D vertices in meters
  height: number; // height in meters
}

export interface SimulationSettings {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  playbackMinutesStep: number;
  shadowOpacity: number;
  showGroundGrid: boolean;
  showSunVector: boolean;
  showShadows?: boolean;
  latitude: number;
  longitude: number;
  northOffsetDeg: number;
}

export interface Project {
  name: string;
  description: string;
  locationName: string;
  location: {
    lat: number;
    lon: number;
    northOffsetDeg: number;
  };
  units: 'm';
  background?: BackgroundPlan;
  anchors: Anchor[];
  sails: Sail[];
  obstacles: Obstacle[];
  terrace: Vec2[]; // polygon boundary in plan meters
  simulation: SimulationSettings;
}

interface ProjectState {
  project: Project;
  
  // Selection & UI State
  selectedAnchorId: string | null;
  selectedSailId: string | null;
  selectedObstacleId: string | null;
  editorMode: 'select' | 'add_point' | 'add_sail' | 'add_obstacle' | 'add_terrace' | 'add_axis' | 'ruler';
  splitRatio: '50/50' | '70/30' | '100/0' | '0/100';
  isPlaying: boolean;
  
  // Calibration Helper State
  isCalibrating: boolean;
  calibrationClicks: Vec2[]; // stores pixel coordinates of the two clicks
  isSettingNorth: boolean;
  orientationType: 'north' | 'east';
  northClicks: Vec2[]; // stores pixel coordinates of the two clicks for North orientation
  
  // Undo/Redo History
  history: string[]; // JSON string snapshots
  historyIndex: number;

  // Actions
  undo: () => void;
  redo: () => void;
  setProject: (project: Partial<Project>) => void;
  updateBackground: (updates: Partial<BackgroundPlan>) => void;
  
  // Anchor Actions
  addAnchor: (anchor: Anchor) => void;
  updateAnchor: (id: string, updates: Partial<Anchor>) => void;
  deleteAnchor: (id: string) => void;
  
  // Sail Actions
  addSail: (sail: Sail) => void;
  updateSail: (id: string, updates: Partial<Sail>) => void;
  deleteSail: (id: string) => void;
  
  // Obstacle Actions
  addObstacle: (obstacle: Obstacle) => void;
  updateObstacle: (id: string, updates: Partial<Obstacle>) => void;
  deleteObstacle: (id: string) => void;
  
  // Terrace Actions
  setTerrace: (points: Vec2[]) => void;
  
  // UI Actions
  setSelectedAnchorId: (id: string | null) => void;
  setSelectedSailId: (id: string | null) => void;
  setSelectedObstacleId: (id: string | null) => void;
  setEditorMode: (mode: 'select' | 'add_point' | 'add_sail' | 'add_obstacle' | 'add_terrace' | 'add_axis' | 'ruler') => void;
  setSplitRatio: (ratio: '50/50' | '70/30' | '100/0' | '0/100') => void;
  setIsPlaying: (isPlaying: boolean) => void;
  
  // Calibration Actions
  startCalibration: () => void;
  addCalibrationClick: (pt: Vec2, distanceMeters: number) => void;
  cancelCalibration: () => void;
  startSettingNorth: (type?: 'north' | 'east') => void;
  cancelSettingNorth: () => void;
  
  // Simulation Actions
  tickSimulation: () => void;
  setSimulation: (updates: Partial<SimulationSettings>) => void;
  resetToDefaultProject: () => void;
}

const DEFAULT_PROJECT: Project = {
  name: "My Sunny Terrace Planning",
  description: "Planning a custom diagonal rollable shade sail over my patio.",
  locationName: "Munich, Germany",
  location: {
    lat: 48.1351,
    lon: 11.5820,
    northOffsetDeg: 15,
  },
  units: 'm',
  background: {
    imageUrl: "",
    opacity: 0.6,
    origin: { x: 300, y: 300 },
    rotationDeg: 0,
    scale: 1,
    pixelsPerMeter: 50, // default 50 pixels = 1 meter
    calibrationPoints: [],
    northPoints: []
  },
  anchors: [
    { id: "A", label: "A", pos2d: { x: -2, y: 2 }, z: 3.2, type: "wall", notes: "Wall mount high left" },
    { id: "B", label: "B", pos2d: { x: 2, y: 2 }, z: 3.2, type: "wall", notes: "Wall mount high right" },
    { id: "C", label: "C", pos2d: { x: 2, y: -2 }, z: 2.3, type: "post", notes: "Steel post low right" },
    { id: "D", label: "D", pos2d: { x: -2, y: -2 }, z: 1.9, type: "post", notes: "Steel post low left" }
  ],
  sails: [
    {
      id: "sail-1",
      anchorIds: ["A", "B", "C", "D"],
      edges: [
        { startAnchorId: "A", endAnchorId: "B", edgeType: "curved", curvatureInward: 0.25 },
        { startAnchorId: "B", endAnchorId: "C", edgeType: "curved", curvatureInward: 0.25 },
        { startAnchorId: "C", endAnchorId: "D", edgeType: "curved", curvatureInward: 0.25 },
        { startAnchorId: "D", endAnchorId: "A", edgeType: "curved", curvatureInward: 0.25 }
      ],
      rollerAxis: {
        startAnchorId: "A",
        endAnchorId: "C",
        kind: "roller"
      },
      previewModel: {
        mode: "stylized",
        curvature: 0.35,
        sag: 0.1
      }
    }
  ],
  obstacles: [],
  terrace: [
    { x: -2.5, y: 2.2 },
    { x: 2.5, y: 2.2 },
    { x: 2.5, y: -2.5 },
    { x: -2.5, y: -2.5 }
  ],
  simulation: {
    date: "2026-05-31", // Current time matching context
    time: "12:00",
    playbackMinutesStep: 15,
    shadowOpacity: 0.55,
    showGroundGrid: true,
    showSunVector: true,
    showShadows: false,
    latitude: 48.1351,
    longitude: 11.5820,
    northOffsetDeg: 15
  }
};

export const useProjectStore = create<ProjectState>((set, get) => {
  // Helper to serialize current project state
  const saveState = (proj: Project): string => JSON.stringify(proj);

  const pushToHistory = (newProject: Project, stateUpdate: any) => {
    const { history, historyIndex } = get();
    const slicedHistory = history.slice(0, historyIndex + 1);
    
    // Limit history stack size to 50
    if (slicedHistory.length >= 50) {
      slicedHistory.shift();
    }
    
    const newSnapshot = saveState(newProject);
    set({
      project: newProject,
      history: [...slicedHistory, newSnapshot],
      historyIndex: slicedHistory.length,
      ...stateUpdate
    });
  };

  const initialSnapshot = saveState(DEFAULT_PROJECT);

  return {
    project: DEFAULT_PROJECT,
    selectedAnchorId: null,
    selectedSailId: null,
    selectedObstacleId: null,
    editorMode: 'select',
    splitRatio: '50/50',
    isPlaying: false,
    isCalibrating: false,
    calibrationClicks: [],
    isSettingNorth: false,
    orientationType: 'north',
    northClicks: [],
    history: [initialSnapshot],
    historyIndex: 0,

    undo: () => {
      const { history, historyIndex } = get();
      if (historyIndex > 0) {
        const nextIndex = historyIndex - 1;
        const restoredProject = JSON.parse(history[nextIndex]) as Project;
        set({
          project: restoredProject,
          historyIndex: nextIndex,
          selectedAnchorId: null,
          selectedSailId: null,
          selectedObstacleId: null
        });
      }
    },

    redo: () => {
      const { history, historyIndex } = get();
      if (historyIndex < history.length - 1) {
        const nextIndex = historyIndex + 1;
        const restoredProject = JSON.parse(history[nextIndex]) as Project;
        set({
          project: restoredProject,
          historyIndex: nextIndex,
          selectedAnchorId: null,
          selectedSailId: null,
          selectedObstacleId: null
        });
      }
    },

    setProject: (updates) => {
      const newProject = { ...get().project, ...updates };
      pushToHistory(newProject, {});
    },

    updateBackground: (updates) => {
      const newBg = get().project.background 
        ? { ...get().project.background!, ...updates } 
        : { imageUrl: "", opacity: 0.6, origin: { x: 300, y: 300 }, rotationDeg: 0, scale: 1, pixelsPerMeter: 50, calibrationPoints: [], ...updates };
      
      const newProject = { ...get().project, background: newBg };
      pushToHistory(newProject, {});
    },

    addAnchor: (anchor) => {
      const newAnchors = [...get().project.anchors, anchor];
      const newProject = { ...get().project, anchors: newAnchors };
      pushToHistory(newProject, { selectedAnchorId: anchor.id });
    },

    updateAnchor: (id, updates) => {
      const newAnchors = get().project.anchors.map(a => 
        a.id === id ? { ...a, ...updates } : a
      );
      const newProject = { ...get().project, anchors: newAnchors };
      
      // Update sail edge mappings if label changes (redundancy check)
      pushToHistory(newProject, {});
    },

    deleteAnchor: (id) => {
      const newAnchors = get().project.anchors.filter(a => a.id !== id);
      
      // Also clean up any sails referencing this anchor
      const newSails = get().project.sails.map(s => {
        const remainingAnchorIds = s.anchorIds.filter(aid => aid !== id);
        return {
          ...s,
          anchorIds: remainingAnchorIds,
          edges: s.edges.filter(e => e.startAnchorId !== id && e.endAnchorId !== id)
        };
      }).filter(s => s.anchorIds.length >= 3); // delete sail if fewer than 3 anchors

      const newProject = { ...get().project, anchors: newAnchors, sails: newSails };
      pushToHistory(newProject, { selectedAnchorId: null });
    },

    addSail: (sail) => {
      const newSails = [...get().project.sails, sail];
      const newProject = { ...get().project, sails: newSails };
      pushToHistory(newProject, { selectedSailId: sail.id });
    },

    updateSail: (id, updates) => {
      const newSails = get().project.sails.map(s => 
        s.id === id ? { ...s, ...updates } : s
      );
      const newProject = { ...get().project, sails: newSails };
      pushToHistory(newProject, {});
    },

    deleteSail: (id) => {
      const newSails = get().project.sails.filter(s => s.id !== id);
      const newProject = { ...get().project, sails: newSails };
      pushToHistory(newProject, { selectedSailId: null });
    },

    addObstacle: (obstacle) => {
      const newObstacles = [...get().project.obstacles, obstacle];
      const newProject = { ...get().project, obstacles: newObstacles };
      pushToHistory(newProject, { selectedObstacleId: obstacle.id });
    },

    updateObstacle: (id, updates) => {
      const newObstacles = get().project.obstacles.map(o => 
        o.id === id ? { ...o, ...updates } : o
      );
      const newProject = { ...get().project, obstacles: newObstacles };
      pushToHistory(newProject, {});
    },

    deleteObstacle: (id) => {
      const newObstacles = get().project.obstacles.filter(o => o.id !== id);
      const newProject = { ...get().project, obstacles: newObstacles };
      pushToHistory(newProject, { selectedObstacleId: null });
    },

    setTerrace: (points) => {
      const newProject = { ...get().project, terrace: points };
      pushToHistory(newProject, {});
    },

    setSelectedAnchorId: (id) => set({ selectedAnchorId: id, selectedSailId: null, selectedObstacleId: null }),
    setSelectedSailId: (id) => set({ selectedSailId: id, selectedAnchorId: null, selectedObstacleId: null }),
    setSelectedObstacleId: (id) => set({ selectedObstacleId: id, selectedAnchorId: null, selectedSailId: null }),
    
    setEditorMode: (mode) => set({ editorMode: mode }),
    setSplitRatio: (ratio) => set({ splitRatio: ratio }),
    setIsPlaying: (isPlaying) => set({ isPlaying }),

    startCalibration: () => set({ isCalibrating: true, calibrationClicks: [] }),
    
    addCalibrationClick: (pt, distanceMeters) => {
      const clicks = [...get().calibrationClicks, pt];
      if (clicks.length === 2) {
        // Calculate standard Euclidean distance in pixels
        const dx = clicks[1].x - clicks[0].x;
        const dy = clicks[1].y - clicks[0].y;
        const pixelDist = Math.sqrt(dx*dx + dy*dy);
        const pixelsPerMeter = pixelDist / distanceMeters;
        
        const newBg = get().project.background 
          ? { ...get().project.background!, pixelsPerMeter, calibrationPoints: clicks }
          : { imageUrl: "", opacity: 0.6, origin: { x: 300, y: 300 }, rotationDeg: 0, scale: 1, pixelsPerMeter, calibrationPoints: clicks };

        const newProject = { ...get().project, background: newBg };
        pushToHistory(newProject, { isCalibrating: false, calibrationClicks: [] });
      } else {
        set({ calibrationClicks: clicks });
      }
    },

    cancelCalibration: () => set({ isCalibrating: false, calibrationClicks: [] }),

    startSettingNorth: (type: 'north' | 'east' = 'north') => set({ isSettingNorth: true, orientationType: type, northClicks: [] }),
    cancelSettingNorth: () => set({ isSettingNorth: false, northClicks: [] }),

    tickSimulation: () => {
      const { time, playbackMinutesStep } = get().project.simulation;
      
      // Parse current HH:MM
      const [hStr, mStr] = time.split(':');
      let hour = parseInt(hStr, 10);
      let minute = parseInt(mStr, 10);
      
      minute += playbackMinutesStep;
      if (minute >= 60) {
        hour += Math.floor(minute / 60);
        minute = minute % 60;
      }
      if (hour >= 24) {
        hour = hour % 24;
      }
      
      const newTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const newSim = { ...get().project.simulation, time: newTime };
      const newProject = { ...get().project, simulation: newSim };
      
      // Update project (without filling history loop during fast animation playback to preserve history memory)
      set({ project: newProject });
    },

    setSimulation: (updates) => {
      const newSim = { ...get().project.simulation, ...updates };
      
      // If latitude/longitude/northOffset changes, synchronize standard project coordinate state as well
      const newLocation = { ...get().project.location };
      if (updates.latitude !== undefined) newLocation.lat = updates.latitude;
      if (updates.longitude !== undefined) newLocation.lon = updates.longitude;
      if (updates.northOffsetDeg !== undefined) newLocation.northOffsetDeg = updates.northOffsetDeg;

      const newProject = { 
        ...get().project, 
        simulation: newSim,
        location: newLocation
      };
      pushToHistory(newProject, {});
    },

    resetToDefaultProject: () => {
      pushToHistory(DEFAULT_PROJECT, {
        selectedAnchorId: null,
        selectedSailId: null,
        selectedObstacleId: null,
        editorMode: 'select'
      });
    }
  };
});
