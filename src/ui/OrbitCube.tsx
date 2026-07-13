import { Box, Tooltip } from '@mui/material';
import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { DEFAULT_VIEW_PITCH, useDeeperMapsStore } from '../state/store';

// Degrees of camera rotation per pixel dragged.
const DRAG_SENSITIVITY = 0.6;
// Pointer travel (px) below which a press counts as a click, not a drag.
const CLICK_SLOP = 4;

const CUBE = 62; // px
const HALF = CUBE / 2;

interface DragState {
  x: number;
  y: number;
  bearing: number;
  pitch: number;
  moved: boolean;
}

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
 * drag tilts (pitch) — and it always reflects the current orientation, which
 * makes 3D navigation discoverable in a way the old tilt slider and the
 * undiscoverable two-finger drag did not. A plain click (no drag) snaps back to
 * the default north-facing three-quarter view. Shown only in 3D with data.
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
    drag.current = { x: e.clientX, y: e.clientY, bearing, pitch, moved: false };
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
    if (d && !d.moved) {
      // A click resets to the default three-quarter view (north-up, tilted).
      setViewBearing(0);
      setViewPitch(DEFAULT_VIEW_PITCH);
    }
  };

  // The cube mirrors the camera: pitch tilts it forward, bearing spins it.
  const cubeTransform = `rotateX(${pitch - 90}deg) rotateZ(${bearing}deg)`;

  return (
    <Tooltip title="Drag to orbit · click to reset" placement="right">
      <Box
        role="button"
        aria-label="Orbit view"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        sx={{
          position: 'absolute',
          top: 16,
          left: 16,
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
