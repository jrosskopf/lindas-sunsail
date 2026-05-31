import { useEffect } from 'react';
import { useProjectStore } from './store/useProjectStore';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import Editor2D from './components/Editor2D';
import Scene3D from './components/Scene3D';
import ValidationPanel from './components/ValidationPanel';
import StatusBar from './components/StatusBar';

export default function App() {
  const {
    project,
    splitRatio,
    selectedAnchorId,
    selectedSailId,
    selectedObstacleId,
    setEditorMode,
    deleteAnchor,
    deleteSail,
    deleteObstacle,
    undo,
    redo,
    updateBackground,
    addObstacle
  } = useProjectStore();

  // Register Clipboard Image Paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) {
                updateBackground({
                  imageUrl: event.target.result as string,
                  scale: 1,
                  rotationDeg: 0,
                  opacity: 0.6,
                  origin: { x: 0, y: 0 },
                  pixelsPerMeter: 50,
                  calibrationPoints: []
                });
              }
            };
            reader.readAsDataURL(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [updateBackground]);

  // Register Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Check Undo/Redo (Ctrl+Z, Ctrl+Y, Cmd+Z, Cmd+Y)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }

      // Avoid key shortcuts when user is typing in forms (inputs, textareas)
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      // 2. Select tools hotkeys
      switch (e.key.toLowerCase()) {
        case 'v':
          setEditorMode('select');
          break;
        case 'p':
          setEditorMode('add_point');
          break;
        case 's':
          setEditorMode('add_sail');
          break;
        case 'r':
          setEditorMode('add_axis');
          break;
        case 'o':
          const obsId = `obs-${Date.now()}`;
          addObstacle({
            id: obsId,
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
          break;
        case 't':
          setEditorMode('add_terrace');
          break;
        
        // 3. Delete Selected Entity
        case 'delete':
        case 'backspace':
          if (selectedAnchorId) {
            deleteAnchor(selectedAnchorId);
          } else if (selectedSailId) {
            deleteSail(selectedSailId);
          } else if (selectedObstacleId) {
            deleteObstacle(selectedObstacleId);
          }
          break;
        
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedAnchorId,
    selectedSailId,
    selectedObstacleId,
    setEditorMode,
    deleteAnchor,
    deleteSail,
    deleteObstacle,
    undo,
    redo
  ]);

  // Translate split ratio string into CSS layout class
  let splitClass = "";
  if (splitRatio === '70/30') splitClass = "split-70-30";
  if (splitRatio === '100/0') splitClass = "split-100-0";
  if (splitRatio === '0/100') splitClass = "split-0-100";

  return (
    <div className="app-container">
      {/* Top Application Toolbar */}
      <Toolbar />

      {/* Central Split Workspace Panels */}
      <div className="workspace-container">
        
        {/* Left Drawer Configuration Panel */}
        <Sidebar />

        {/* Dynamic Split Screen Canvas Layer */}
        <div className={`main-panes-split ${splitClass}`}>
          {/* Left Split Pane: 2D Editor */}
          <Editor2D />

          {/* Right Split Pane: 3D Scene */}
          <Scene3D />

          {/* Floating diagnostic alerts warning flags overlay */}
          <ValidationPanel />
        </div>
      </div>

      {/* Bottom status indicators bar */}
      <StatusBar />
    </div>
  );
}
