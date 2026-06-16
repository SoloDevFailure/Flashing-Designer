import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Download,
  FlipVertical,
  Fullscreen,
  Hand,
  Menu,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  Scissors,
  Settings2,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { ChangeEvent, PointerEvent, ReactNode, RefObject, WheelEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  angleBetween,
  makeSegment,
  pointFrom,
  profileBounds,
  rebuildConnectedSegments,
  segmentMidpoint,
  snapAngle,
  totalLength,
} from './geometry';
import { createProfile, templateNames } from './templates';
import type { Point, Profile, Segment, ToolMode } from './types';

const materials = ['Colorbond', 'Zincalume', 'Galvanised', 'Stainless', 'Copper'];
const foldTypes: Segment['foldType'][] = ['none', 'safety-edge', 'hem', 'open'];

type Camera = {
  x: number;
  y: number;
  scale: number;
};

export default function App() {
  const [profile, setProfile] = useState<Profile>(() => createProfile());
  const [mode, setMode] = useState<ToolMode>('draw');
  const [selectedIndex, setSelectedIndex] = useState(1);
  const [gridSpacing, setGridSpacing] = useState(10);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1.2 });
  const [history, setHistory] = useState<Profile[]>([]);
  const [future, setFuture] = useState<Profile[]>([]);
  const [draftPoint, setDraftPoint] = useState<Point | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const lastPan = useRef<Point | null>(null);
  const lastPinchDist = useRef<number | null>(null);
  const drawStart = useRef<Point | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const didFitRef = useRef(false);

  const selectedSegment = profile.segments[selectedIndex] ?? profile.segments[0];
  const warnings = useMemo(() => getWarnings(profile), [profile]);

  // Fit to drawing on first render once the SVG has size
  useEffect(() => {
    if (didFitRef.current) return;
    const id = setTimeout(() => {
      fitToDrawing();
      didFitRef.current = true;
    }, 120);
    return () => clearTimeout(id);
  }, []);

  function commit(nextProfile: Profile) {
    setHistory((items) => [...items.slice(-30), profile]);
    setFuture([]);
    setProfile(nextProfile);
  }

  function updateProfile(updater: (current: Profile) => Profile) {
    commit(updater(profile));
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((items) => [profile, ...items]);
    setProfile(previous);
    setHistory((items) => items.slice(0, -1));
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setHistory((items) => [...items, profile]);
    setProfile(next);
    setFuture((items) => items.slice(1));
  }

  function screenToWorld(clientX: number, clientY: number): Point {
    const rect = svgRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 1;
    const height = rect?.height ?? 1;
    return {
      x: (clientX - (rect?.left ?? 0) - width / 2 - camera.x) / camera.scale,
      y: (clientY - (rect?.top ?? 0) - height / 2 - camera.y) / camera.scale,
    };
  }

  function onWorkspacePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType === 'touch' && event.isPrimary === false) return;
    if (event.pointerType === 'mouse' && event.button === 2) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    if (event.pointerType === 'mouse' && event.button === 1) {
      event.preventDefault();
      setIsPanning(true);
      lastPan.current = { x: event.clientX, y: event.clientY };
      return;
    }

    if (event.pointerType === 'mouse' && event.button === 0 && event.altKey) {
      setIsPanning(true);
      lastPan.current = { x: event.clientX, y: event.clientY };
      return;
    }

    const point = screenToWorld(event.clientX, event.clientY);
    if (mode === 'move') {
      setIsPanning(true);
      lastPan.current = { x: event.clientX, y: event.clientY };
      return;
    }
    if (mode !== 'draw') {
      return;
    }

    if (event.pointerType === 'mouse') {
      drawStart.current = profile.segments.at(-1)?.endPoint ?? { x: 0, y: 0 };
      setDraftPoint(point);
      return;
    }

    const last = profile.segments.at(-1)?.endPoint ?? { x: 0, y: 0 };
    const angle = snapEnabled ? snapAngle(angleBetween(last, point)) : angleBetween(last, point);
    const endPoint = pointFrom(last, Math.max(10, Math.round(Math.hypot(point.x - last.x, point.y - last.y))), angle);
    const segment = makeSegment(last, endPoint);
    commit({ ...profile, segments: [...profile.segments, { ...segment, angle }] });
    setSelectedIndex(profile.segments.length);
    setDraftPoint(null);
  }

  function onWorkspacePointerMove(event: PointerEvent<SVGSVGElement>) {
    if ((isPanning || (event.pointerType === 'mouse' && (event.buttons & 4) === 4)) && lastPan.current) {
      event.preventDefault();
      const dx = event.clientX - lastPan.current.x;
      const dy = event.clientY - lastPan.current.y;
      lastPan.current = { x: event.clientX, y: event.clientY };
      setCamera((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
      return;
    }

    if (mode === 'draw') {
      setDraftPoint(screenToWorld(event.clientX, event.clientY));
    }
  }

  function onWorkspacePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (drawStart.current && mode === 'draw') {
      const point = screenToWorld(event.clientX, event.clientY);
      const start = drawStart.current;
      const rawLength = Math.hypot(point.x - start.x, point.y - start.y);
      const angle = snapEnabled ? snapAngle(angleBetween(start, point)) : angleBetween(start, point);
      const endPoint = pointFrom(start, Math.max(10, Math.round(rawLength)), angle);
      const segment = makeSegment(start, endPoint);
      commit({ ...profile, segments: [...profile.segments, { ...segment, angle }] });
      setSelectedIndex(profile.segments.length);
    }
    drawStart.current = null;
    setDraftPoint(null);
    setIsPanning(false);
    lastPan.current = null;
  }

  // Pinch-to-zoom on touch
  function onWorkspaceTouchMove(event: React.TouchEvent<SVGSVGElement>) {
    if (event.touches.length !== 2) {
      lastPinchDist.current = null;
      return;
    }
    event.preventDefault();
    const t0 = event.touches[0];
    const t1 = event.touches[1];
    const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    const midX = (t0.clientX + t1.clientX) / 2;
    const midY = (t0.clientY + t1.clientY) / 2;

    if (lastPinchDist.current !== null) {
      const factor = dist / lastPinchDist.current;
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) {
        const screenX = midX - rect.left - rect.width / 2;
        const screenY = midY - rect.top - rect.height / 2;
        setCamera((current) => {
          const nextScale = Math.max(0.35, Math.min(5, current.scale * factor));
          const worldX = (screenX - current.x) / current.scale;
          const worldY = (screenY - current.y) / current.scale;
          return {
            scale: nextScale,
            x: screenX - worldX * nextScale,
            y: screenY - worldY * nextScale,
          };
        });
      }
    }
    lastPinchDist.current = dist;
  }

  function onWorkspaceWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextScaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const screenX = event.clientX - rect.left - rect.width / 2;
    const screenY = event.clientY - rect.top - rect.height / 2;

    setCamera((current) => {
      const nextScale = Math.max(0.35, Math.min(5, current.scale * nextScaleFactor));
      const worldX = (screenX - current.x) / current.scale;
      const worldY = (screenY - current.y) / current.scale;
      return {
        scale: nextScale,
        x: screenX - worldX * nextScale,
        y: screenY - worldY * nextScale,
      };
    });
  }

  function updateSegment(partial: Partial<Pick<Segment, 'length' | 'angle' | 'foldType'>>) {
    if (!selectedSegment) return;
    updateProfile((current) => {
      const segment = current.segments[selectedIndex];
      const nextSegment = {
        ...segment,
        ...partial,
        endPoint: pointFrom(segment.startPoint, partial.length ?? segment.length, partial.angle ?? segment.angle),
      };
      return { ...current, segments: rebuildConnectedSegments(current.segments, selectedIndex, nextSegment) };
    });
  }

  function flipSegment() {
    if (!selectedSegment) return;
    updateSegment({ angle: (selectedSegment.angle + 180) % 360 });
  }

  function splitSegment() {
    if (!selectedSegment) return;
    updateProfile((current) => {
      const first = { ...selectedSegment, id: crypto.randomUUID(), length: Math.round(selectedSegment.length / 2) };
      first.endPoint = pointFrom(first.startPoint, first.length, first.angle);
      const second = {
        ...selectedSegment,
        id: crypto.randomUUID(),
        startPoint: first.endPoint,
        length: selectedSegment.length - first.length,
      };
      second.endPoint = pointFrom(second.startPoint, second.length, second.angle);
      return {
        ...current,
        segments: rebuildConnectedSegments(
          [...current.segments.slice(0, selectedIndex), first, second, ...current.segments.slice(selectedIndex + 1)],
          selectedIndex + 1,
          second,
        ),
      };
    });
  }

  function deleteSegment() {
    if (profile.segments.length <= 1) return;
    updateProfile((current) => ({
      ...current,
      segments: current.segments.filter((_, index) => index !== selectedIndex),
    }));
    setSelectedIndex(Math.max(0, selectedIndex - 1));
  }

  function fitToDrawing() {
    const bounds = profileBounds(profile);
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scale = Math.min(rect.width / (bounds.width + 220), rect.height / (bounds.height + 240));
    setCamera({
      scale: Math.max(0.4, Math.min(scale, 4)),
      x: -((bounds.minX + bounds.maxX) / 2) * Math.max(0.4, Math.min(scale, 4)),
      y: -((bounds.minY + bounds.maxY) / 2) * Math.max(0.4, Math.min(scale, 4)),
    });
  }

  function zoom(delta: number) {
    setCamera((current) => ({ ...current, scale: Math.max(0.35, Math.min(5, current.scale + delta)) }));
  }

  function exportImage(type: 'png' | 'jpeg') {
    const bounds = profileBounds(profile);
    const width = Math.max(900, bounds.width + 300);
    const height = Math.max(650, bounds.height + 300);
    const svg = renderExportSvg(profile, width, height);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * 2;
      canvas.height = height * 2;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = `${profile.name.replace(/\s+/g, '-').toLowerCase()}.${type === 'png' ? 'png' : 'jpg'}`;
      link.href = canvas.toDataURL(type === 'png' ? 'image/png' : 'image/jpeg', 0.95);
      link.click();
      URL.revokeObjectURL(url);
    };
    image.src = url;
  }

  function saveJson() {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `${profile.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function loadJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      const loaded = JSON.parse(text) as Profile;
      commit(loaded);
      setSelectedIndex(0);
    });
  }

  return (
    <main className="h-full w-full bg-white">
      <section className="flex h-full flex-col overflow-hidden">
        <header className="z-20 border-b border-slate-200 bg-white/95 px-4 pb-3 pt-4 shadow-sm backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            <button className="touch-button rounded-xl text-slate-700"><Menu /></button>
            <div className="min-w-0 flex-1">
              <label className="flex items-center gap-2 text-lg font-bold md:text-xl">
                <select
                  value={profile.name}
                  onChange={(event) => { commit(createProfile(event.target.value)); didFitRef.current = false; setTimeout(fitToDrawing, 80); }}
                  className="max-w-full appearance-none truncate bg-transparent pr-1 outline-none"
                >
                  {templateNames.map((name) => <option key={name}>{name}</option>)}
                </select>
                <ChevronDown size={18} />
              </label>
              <p className="text-sm text-slate-500">All changes saved locally</p>
            </div>
            <button onClick={undo} className="touch-button rounded-xl text-slate-700 disabled:opacity-30" disabled={!history.length}><Undo2 /></button>
            <button onClick={redo} className="touch-button rounded-xl text-slate-700 disabled:opacity-30" disabled={!future.length}><Redo2 /></button>
            <button onClick={() => exportImage('png')} className="touch-button flex items-center gap-2 rounded-xl bg-brand px-4 font-semibold text-white shadow-sm">
              <Download size={20} />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
          <div className="no-scrollbar mt-4 flex gap-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <ControlLabel label="Units"><Select value="mm" options={['mm']} /></ControlLabel>
            <ControlLabel label="Grid">
              <Select value={`${gridSpacing}`} options={['5', '10', '25', '50']} onChange={(value) => setGridSpacing(Number(value))} suffix=" mm" />
            </ControlLabel>
            <ControlLabel label="Snap">
              <button onClick={() => setSnapEnabled((value) => !value)} className={`touch-button rounded-xl px-4 font-semibold ${snapEnabled ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600'}`}>
                45° 90°
              </button>
            </ControlLabel>
            <button onClick={fitToDrawing} className="touch-button rounded-xl border border-slate-200 px-3 text-slate-700"><Fullscreen /></button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-50">
          <Workspace
            camera={camera}
            draftPoint={draftPoint}
            gridSpacing={gridSpacing}
            mode={mode}
            onPointerDown={onWorkspacePointerDown}
            onPointerMove={onWorkspacePointerMove}
            onPointerUp={onWorkspacePointerUp}
            onTouchMove={onWorkspaceTouchMove}
            onWheel={onWorkspaceWheel}
            profile={profile}
            selectedIndex={selectedIndex}
            setSelectedIndex={setSelectedIndex}
            svgRef={svgRef}
          />

          <div className="absolute left-4 top-6 z-10 flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-soft">
            <ToolButton active={mode === 'draw'} icon={<Pencil />} label="Draw" onClick={() => setMode('draw')} />
            <ToolButton active={mode === 'edit'} icon={<MousePointer2 />} label="Select" onClick={() => setMode('edit')} />
            <ToolButton active={mode === 'move'} icon={<Hand />} label="Move" onClick={() => setMode('move')} />
            <ToolButton active={mode === 'delete'} icon={<Trash2 />} label="Delete" onClick={deleteSegment} />
          </div>

          <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-soft">
            <button onClick={() => zoom(0.2)} className="touch-button rounded-xl bg-slate-50 text-2xl font-bold">+</button>
            <button onClick={() => zoom(-0.2)} className="touch-button rounded-xl bg-slate-50 text-2xl font-bold">-</button>
            <button onClick={fitToDrawing} className="touch-button rounded-xl bg-slate-50"><Fullscreen /></button>
          </div>

          <div className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded-xl bg-white px-5 py-3 text-slate-700 shadow-soft sm:block">
            {mode === 'move' ? 'Drag to pan · Pinch to zoom' : 'Tap a segment to edit · Move tool to pan'}
          </div>
        </div>

        <BottomSheet
          deleteSegment={deleteSegment}
          exportImage={exportImage}
          flipSegment={flipSegment}
          loadJson={loadJson}
          mode={mode}
          open={sheetOpen}
          onToggle={() => setSheetOpen((v) => !v)}
          profile={profile}
          saveJson={saveJson}
          selectedIndex={selectedIndex}
          selectedSegment={selectedSegment}
          setMode={setMode}
          setProfile={(next) => updateProfile(() => next)}
          setSelectedIndex={setSelectedIndex}
          snapEnabled={snapEnabled}
          splitSegment={splitSegment}
          toggleSnap={() => setSnapEnabled((value) => !value)}
          updateSegment={updateSegment}
          warnings={warnings}
        />
      </section>
    </main>
  );
}

function Workspace({
  camera,
  draftPoint,
  gridSpacing,
  mode,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onTouchMove,
  onWheel,
  profile,
  selectedIndex,
  setSelectedIndex,
  svgRef,
}: {
  camera: Camera;
  draftPoint: Point | null;
  gridSpacing: number;
  mode: ToolMode;
  onPointerDown: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: PointerEvent<SVGSVGElement>) => void;
  onTouchMove: (event: React.TouchEvent<SVGSVGElement>) => void;
  onWheel: (event: WheelEvent<SVGSVGElement>) => void;
  profile: Profile;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  svgRef: RefObject<SVGSVGElement | null>;
}) {
  const transform = `translate(50% 50%) translate(${camera.x}px ${camera.y}px) scale(${camera.scale})`;
  const lastPoint = profile.segments.at(-1)?.endPoint;
  const draftEnd = draftPoint && lastPoint ? pointFrom(lastPoint, Math.hypot(draftPoint.x - lastPoint.x, draftPoint.y - lastPoint.y), angleBetween(lastPoint, draftPoint)) : null;

  return (
    <svg
      ref={svgRef}
      className="h-full w-full touch-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onTouchMove={onTouchMove}
      onAuxClick={(event) => event.preventDefault()}
    >
      <defs>
        <pattern id="smallGrid" width={gridSpacing * camera.scale} height={gridSpacing * camera.scale} patternUnits="userSpaceOnUse">
          <path d={`M ${gridSpacing * camera.scale} 0 L 0 0 0 ${gridSpacing * camera.scale}`} fill="none" stroke="#e9eef6" strokeWidth="1" />
        </pattern>
        <pattern id="largeGrid" width={gridSpacing * 5 * camera.scale} height={gridSpacing * 5 * camera.scale} patternUnits="userSpaceOnUse">
          <rect width={gridSpacing * 5 * camera.scale} height={gridSpacing * 5 * camera.scale} fill="url(#smallGrid)" />
          <path d={`M ${gridSpacing * 5 * camera.scale} 0 L 0 0 0 ${gridSpacing * 5 * camera.scale}`} fill="none" stroke="#d9e3f3" strokeWidth="1.4" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#largeGrid)" />
      <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#b6d4ff" strokeDasharray="8 8" />
      <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#b6d4ff" strokeDasharray="8 8" />
      <g transform={transform}>
        {profile.segments.map((segment, index) => (
          <g key={segment.id}>
            <line
              x1={segment.startPoint.x}
              y1={segment.startPoint.y}
              x2={segment.endPoint.x}
              y2={segment.endPoint.y}
              stroke={index === selectedIndex ? '#1473ff' : '#111827'}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={index === selectedIndex ? 7 / camera.scale : 5 / camera.scale}
              onPointerDown={(event) => {
                if (event.pointerType === 'mouse' && event.button === 1) return;
                event.stopPropagation();
                if (mode === 'delete') return;
                setSelectedIndex(index);
              }}
            />
            <circle cx={segment.startPoint.x} cy={segment.startPoint.y} r={5 / camera.scale} fill="#1473ff" />
            <DimensionLabel camera={camera} point={segmentMidpoint(segment)} text={`${segment.length}`} />
          </g>
        ))}
        {draftEnd && lastPoint && <line x1={lastPoint.x} y1={lastPoint.y} x2={draftEnd.x} y2={draftEnd.y} stroke="#1473ff" strokeDasharray="8 6" strokeWidth={3 / camera.scale} />}
        {profile.segments.slice(1).map((segment, index) => (
          <AngleLabel camera={camera} key={segment.id} point={segment.startPoint} angle={Math.round(Math.abs(segment.angle - profile.segments[index].angle)) || 90} />
        ))}
      </g>
    </svg>
  );
}

function DimensionLabel({ camera, point, text }: { camera: Camera; point: Point; text: string }) {
  return (
    <text
      x={point.x}
      y={point.y - 14 / camera.scale}
      fill="#1473ff"
      fontSize={22 / camera.scale}
      fontWeight={700}
      paintOrder="stroke"
      stroke="#ffffff"
      strokeWidth={5 / camera.scale}
      textAnchor="middle"
    >
      {text}
    </text>
  );
}

function AngleLabel({ angle, camera, point }: { angle: number; camera: Camera; point: Point }) {
  return (
    <text
      x={point.x + 22 / camera.scale}
      y={point.y + 24 / camera.scale}
      fill="#1473ff"
      fontSize={19 / camera.scale}
      fontWeight={700}
      paintOrder="stroke"
      stroke="#ffffff"
      strokeWidth={5 / camera.scale}
    >
      {angle}°
    </text>
  );
}

function BottomSheet({
  deleteSegment,
  exportImage,
  flipSegment,
  loadJson,
  mode,
  open,
  onToggle,
  profile,
  saveJson,
  selectedIndex,
  selectedSegment,
  setMode,
  setProfile,
  setSelectedIndex,
  snapEnabled,
  splitSegment,
  toggleSnap,
  updateSegment,
  warnings,
}: {
  deleteSegment: () => void;
  exportImage: (type: 'png' | 'jpeg') => void;
  flipSegment: () => void;
  loadJson: (event: ChangeEvent<HTMLInputElement>) => void;
  mode: ToolMode;
  open: boolean;
  onToggle: () => void;
  profile: Profile;
  saveJson: () => void;
  selectedIndex: number;
  selectedSegment?: Segment;
  setMode: (mode: ToolMode) => void;
  setProfile: (profile: Profile) => void;
  setSelectedIndex: (index: number) => void;
  snapEnabled: boolean;
  splitSegment: () => void;
  toggleSnap: () => void;
  updateSegment: (partial: Partial<Pick<Segment, 'length' | 'angle' | 'foldType'>>) => void;
  warnings: string[];
}) {
  return (
    <aside className="safe-bottom z-30 rounded-t-[2rem] bg-white shadow-soft md:rounded-none md:border-t md:border-slate-200">
      {/* Drag handle / toggle bar */}
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-3 md:hidden"
        aria-label={open ? 'Collapse panel' : 'Expand panel'}
      >
        <div className="mx-auto h-1.5 w-14 rounded-full bg-slate-300" />
        <span className="absolute right-5 text-slate-400">
          {open ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
        </span>
      </button>

      {/* Collapsible content */}
      <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[60vh] overflow-y-auto' : 'max-h-0'} md:max-h-none md:overflow-visible md:grid md:grid-cols-[1.1fr_0.9fr] md:gap-6 md:px-8 md:pb-6`}>
        <div className="px-5 md:px-0">
          <div className="mb-5 flex items-center gap-4">
            <div className="flex-1">
              <h2 className="text-xl font-bold">Segment {selectedIndex + 1} <span className="ml-2 text-sm font-medium text-slate-500">of {profile.segments.length}</span></h2>
            </div>
            <button onClick={() => setSelectedIndex(Math.max(0, selectedIndex - 1))} className="touch-button rounded-xl border border-slate-200"><ArrowLeft /></button>
            <button onClick={() => setSelectedIndex(Math.min(profile.segments.length - 1, selectedIndex + 1))} className="touch-button rounded-xl border border-slate-200"><ArrowRight /></button>
          </div>

          {selectedSegment && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Length">
                <input value={selectedSegment.length} onChange={(event) => updateSegment({ length: Number(event.target.value) })} type="number" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-xl outline-brand" />
              </Field>
              <Field label="Angle">
                <input value={selectedSegment.angle} onChange={(event) => updateSegment({ angle: Number(event.target.value) })} type="number" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-xl outline-brand" />
              </Field>
              <Field label="Fold">
                <select value={selectedSegment.foldType} onChange={(event) => updateSegment({ foldType: event.target.value as Segment['foldType'] })} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base outline-brand">
                  {foldTypes.map((fold) => <option key={fold}>{fold}</option>)}
                </select>
              </Field>
            </div>
          )}

          <div className="mt-5 grid grid-cols-3 gap-3">
            <button onClick={flipSegment} className="touch-button rounded-xl border border-slate-200 px-3 py-3 font-medium"><FlipVertical className="mx-auto mb-1" />Flip</button>
            <button onClick={splitSegment} className="touch-button rounded-xl border border-slate-200 px-3 py-3 font-medium"><Scissors className="mx-auto mb-1" />Split</button>
            <button onClick={deleteSegment} className="touch-button rounded-xl border border-red-200 px-3 py-3 font-medium text-red-600"><Trash2 className="mx-auto mb-1" />Delete</button>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-3 border-t border-slate-100 pt-4 text-sm">
            <Metric label="Total" value={`${totalLength(profile)} mm`} />
            <Metric label="Bends" value={`${Math.max(0, profile.segments.length - 1)}`} />
            <Metric label="Min. fold" value="8 mm" />
            <Metric label="Tolerance" value="±2 mm" />
          </div>
        </div>

        <div className="mt-5 px-5 pb-4 md:mt-0 md:px-0">
          <div className="grid grid-cols-5 gap-1 rounded-2xl bg-slate-50 p-1">
            <NavButton active={mode === 'draw'} icon={<Pencil />} label="Draw" onClick={() => setMode('draw')} />
            <NavButton active={mode === 'edit'} icon={<Settings2 />} label="Edit" onClick={() => setMode('edit')} />
            <NavButton active={false} icon={<Plus />} label="Add Bend" onClick={() => setMode('draw')} />
            <NavButton active={snapEnabled} icon={<Settings2 />} label="Snap" onClick={toggleSnap} />
            <NavButton active={false} icon={<Upload />} label="Export" onClick={() => exportImage('png')} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Material">
              <select value={profile.material} onChange={(event) => setProfile({ ...profile, material: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-brand">
                {materials.map((material) => <option key={material}>{material}</option>)}
              </select>
            </Field>
            <Field label="Thickness">
              <input value={profile.thickness} onChange={(event) => setProfile({ ...profile, thickness: Number(event.target.value) })} type="number" step="0.01" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-brand" />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={saveJson} className="touch-button rounded-xl border border-slate-200 px-4 font-semibold">Save JSON</button>
            <label className="touch-button flex cursor-pointer items-center rounded-xl border border-slate-200 px-4 font-semibold">
              Load JSON
              <input type="file" accept="application/json" className="hidden" onChange={loadJson} />
            </label>
            <button onClick={() => exportImage('jpeg')} className="touch-button rounded-xl border border-slate-200 px-4 font-semibold">JPEG</button>
          </div>

          {warnings.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function ToolButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`touch-button rounded-xl px-2 py-2 text-sm font-medium ${active ? 'bg-blue-50 text-brand' : 'text-slate-700'}`}>
      <span className="mx-auto block w-fit">{icon}</span>
      {label}
    </button>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`touch-button rounded-xl px-2 py-2 text-xs font-semibold ${active ? 'bg-white text-brand shadow-sm' : 'text-slate-600'}`}>
      <span className="mx-auto mb-1 block w-fit">{icon}</span>
      {label}
    </button>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className="mt-1 text-base font-bold text-slate-950">{value}</p>
    </div>
  );
}

function ControlLabel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="flex shrink-0 items-center gap-3 border-r border-slate-100 pr-3 text-slate-600 last:border-0">
      {label}
      {children}
    </label>
  );
}

function Select({ onChange, options, suffix = '', value }: { onChange?: (value: string) => void; options: string[]; suffix?: string; value: string }) {
  return (
    <select value={value} onChange={(event) => onChange?.(event.target.value)} className="touch-button rounded-xl border border-slate-200 bg-white px-3 outline-brand">
      {options.map((option) => <option key={option} value={option}>{option}{suffix}</option>)}
    </select>
  );
}

function getWarnings(profile: Profile) {
  const warnings: string[] = [];
  if (totalLength(profile) > 8000) warnings.push('Maximum flashing length is 8 m.');
  if (profile.segments.some((segment) => segment.length < 8)) warnings.push('Minimum fold is 8 mm.');
  if (profile.segments.some((segment) => segment.foldType === 'safety-edge' && segment.length < 16)) warnings.push('Safety edge needs 2 bends and enough return length.');
  return warnings;
}

function renderExportSvg(profile: Profile, width: number, height: number) {
  const bounds = profileBounds(profile);
  const scale = Math.min((width - 180) / bounds.width, (height - 180) / bounds.height);
  const offsetX = width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale;
  const offsetY = height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale;
  const line = profile.segments
    .map((segment) => `<line x1="${segment.startPoint.x * scale + offsetX}" y1="${segment.startPoint.y * scale + offsetY}" x2="${segment.endPoint.x * scale + offsetX}" y2="${segment.endPoint.y * scale + offsetY}" stroke="#111827" stroke-width="8" stroke-linecap="round" />`)
    .join('');
  const labels = profile.segments
    .map((segment, index) => {
      const mid = segmentMidpoint(segment);
      const angle = index > 0 ? `<text x="${segment.startPoint.x * scale + offsetX + 24}" y="${segment.startPoint.y * scale + offsetY + 34}" fill="#1473ff" font-size="24" font-weight="700">${Math.round(Math.abs(segment.angle - profile.segments[index - 1].angle))}°</text>` : '';
      return `<text x="${mid.x * scale + offsetX}" y="${mid.y * scale + offsetY - 22}" fill="#1473ff" font-size="28" font-weight="700" text-anchor="middle">${segment.length}</text>${angle}`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ffffff"/><text x="48" y="56" font-size="30" font-weight="800" fill="#0f172a">${profile.name}</text><text x="48" y="92" font-size="18" fill="#64748b">${profile.material} · ${profile.thickness} mm · Total ${totalLength(profile)} mm</text>${line}${labels}</svg>`;
}
