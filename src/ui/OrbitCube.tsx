import { Box, Tooltip } from '@mui/material';
import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { DEFAULT_VIEW_PITCH, MIN_VIEW_PITCH, useDeeperMapsStore } from '../state/store';

// Degrees of camera rotation per pixel dragged.
const DRAG_SENSITIVITY = 0.6;
// Pointer travel (px) below which a press counts as a click, not a drag.
const CLICK_SLOP = 4;
// Tilt used when snapping to a side (N/S/E/W) face — a steep, near-side-on look.
const SIDE_PITCH = 70;

const CUBE = 62; // px
const HALF = CUBE / 2;

interface DragState {
  x: number;
  y: number;
  bearing: number;
  pitch: number;
  moved: boolean;
  face: string | null;
}

/**
 * Canonical camera view each labelled face snaps to on click. Side faces set a
 * bearing (which way the camera faces) and a steep tilt; Top keeps the current
 * bearing and looks nearly straight down (clamped to the tilt floor).
 */
const FACE_VIEWS: Record<string, { bearing?: number; pitch: number }> = {
  N: { bearing: 0, pitch: SIDE_PITCH },
  S: { bearing: 180, pitch: SIDE_PITCH },
  E: { bearing: 90, pitch: SIDE_PITCH },
  W: { bearing: 270, pitch: SIDE_PITCH },
  Top: { pitch: MIN_VIEW_PITCH },
};

const faceBase: CSSProperties = {
  position: 'absolute',
  width: CUBE,
  height: CUBE,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 600,
  color: '#37474f',
  background: 'rgba(255,255,255,0.92)',
  border: '1px solid #b0bec5',
  boxSizing: 'border-box',
  userSelect: 'none',
  // Hide faces pointing away so only visible faces catch clicks.
  backfaceVisibility: 'hidden',
  cursor: 'pointer',
};

const FACES: Array<{ label: string; transform: string; accent?: boolean }> = [
  { label: 'N', transform: `translateZ(${HALF}px)`, accent: true },
  { label: 'S', transform: `rotateY(180deg) translateZ(${HALF}px)` },
  { label: 'E', transform: `rotateY(90deg) translateZ(${HALF}px)` },
  { label: 'W', transform: `rotateY(-90deg) translateZ(${HALF}px)` },
  { label: 'Top', transform: `rotateX(90deg) translateZ(${HALF}px)` },
  { label: '', transform: `rotateX(-90deg) translateZ(${HALF}px)` }, // bottom
];

/**
 * An interactive orientation cube (à la CAD "view cubes") for the 3D view.
 * Drag it to orbit the camera — horizontal drag rotates (bearing), vertical
 * drag tilts (pitch) — and it always reflects the current orientation, making
 * 3D navigation discoverable in a way the old tilt slider and the
 * undiscoverable two-finger drag did not. Click a labelled face to snap to that
 * standard view (Top → plan; N/S/E/W → that elevation); a click off the faces
 * resets to the default three-quarter view. Shown only in 3D with data.
 */
export function OrbitCube(): JSX.Element | null {
  const viewMode = useDeeperMapsStore((s) => s.viewMode);
  const bearing = useDeeperMapsStore((s) => s.viewBearing);
  const pitch = useDeeperMapsStore((s) => s.viewPitch);
  const setViewBearing = useDeeperMapsStore((s) => s.setViewBearing);
  const setViewPitch = useDeeperMapsStore((s) => s.setViewPitch);
  const layerBundle = useDeeperMapsStore((s) => s.layerBundle);
  const drag = useRef<DragState | null>(null);

  if (viewMode !== '3d' || !layerBundle?.depthGrid) return null;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const faceEl = (e.target as HTMLElement).closest?.('[data-face]');
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      bearing,
      pitch,
      moved: false,
      face: faceEl?.getAttribute('data-face') ?? null,
    };
    // Capture so the drag keeps tracking outside the small cube; ignored where
    // unsupported (e.g. jsdom) or when the browser rejects it.
    /* c8 ignore start */
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // no-op
    }
    /* c8 ignore stop */
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > CLICK_SLOP) d.moved = true;
    // Drag right → turn clockwise; drag down → tilt toward the horizon.
    setViewBearing(d.bearing + dx * DRAG_SENSITIVITY);
    setViewPitch(d.pitch + dy * DRAG_SENSITIVITY);
  };

  const onPointerUp = (): void => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const view = d.face ? FACE_VIEWS[d.face] : undefined;
    if (view) {
      // Snap to the clicked face's standard view.
      if (view.bearing !== undefined) setViewBearing(view.bearing);
      setViewPitch(view.pitch);
    } else {
      // Click off the faces resets to the default three-quarter view.
      setViewBearing(0);
      setViewPitch(DEFAULT_VIEW_PITCH);
    }
  };

  // The cube mirrors the camera: pitch tilts it forward (about the horizontal
  // axis), bearing spins it about the vertical axis — so turning to face south
  // actually brings the S face around, not just spins the N face in place.
  const cubeTransform = `rotateX(${pitch - 90}deg) rotateY(${-bearing}deg)`;

  return (
    <Tooltip title="Drag to orbit · click a face for that view" placement="right">
      <Box
        role="button"
        aria-label="Orbit view"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        sx={{
          // Sits just below the compass (top-left).
          position: 'absolute',
          top: 64,
          left: 4,
          width: 88,
          height: 88,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          perspective: '260px',
          cursor: 'grab',
          touchAction: 'none',
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <Box
          sx={{ position: 'relative', width: CUBE, height: CUBE, transformStyle: 'preserve-3d' }}
          style={{ transform: cubeTransform }}
        >
          {FACES.map((f, i) => (
            <div
              key={i}
              data-face={f.label || undefined}
              style={{
                ...faceBase,
                transform: f.transform,
                ...(f.accent ? { background: 'rgba(211,47,47,0.9)', color: '#fff' } : {}),
              }}
            >
              {f.label}
            </div>
          ))}
        </Box>
      </Box>
    </Tooltip>
  );
}
