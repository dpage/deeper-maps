import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  Divider,
  Drawer,
  IconButton,
  Link,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useState, type ReactNode } from 'react';

export interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
}

// --- Small presentational helpers, so the docs read cleanly below. ---------

function Lead({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Typography variant="body1" sx={{ mb: 1.5 }}>
      {children}
    </Typography>
  );
}

function Para({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
      {children}
    </Typography>
  );
}

function Head({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Typography variant="subtitle2" sx={{ mt: 2.5, mb: 0.75, fontWeight: 700 }}>
      {children}
    </Typography>
  );
}

function Bullets({ items }: { items: ReactNode[] }): JSX.Element {
  return (
    <Box component="ul" sx={{ m: 0, mb: 1.5, pl: 2.5 }}>
      {items.map((it, i) => (
        <Typography key={i} component="li" variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          {it}
        </Typography>
      ))}
    </Box>
  );
}

const b = (s: string): JSX.Element => (
  <Box component="span" sx={{ fontWeight: 600 }}>
    {s}
  </Box>
);

// --- The documentation content ---------------------------------------------

interface Section {
  id: string;
  title: string;
  content: JSX.Element;
}

const SECTIONS: Section[] = [
  {
    id: 'start',
    title: 'Getting started',
    content: (
      <>
        <Lead>
          Deeper Maps turns a Deeper sonar scan into an explorable map of the lake bed — depth,
          weed, fish activity and the best-looking spots — all in your browser.
        </Lead>
        <Head>Add a scan</Head>
        <Para>Click {b('Upload scan')} and choose one of:</Para>
        <Bullets
          items={[
            <>
              A {b('Deeper Quest')} export — the folder (zipped) containing {b('bathymetry.csv')}{' '}
              and {b('sonar.csv')}. Zips made on a Mac work too (the resource-fork files are
              ignored).
            </>,
            <>
              A {b('Deeper mobile')} export — the single {b('scan_data_*.csv')} the phone app
              produces. This carries depth and water temperature but no raw sonar, so it maps depth
              and temperature only (weed, fish density and sweet spots need sonar).
            </>,
          ]}
        />
        <Para>
          Analysis runs locally in a background worker; the map appears in a few seconds. Your scans
          are saved in the browser (see {b('Your scans')}) so they’re still there next time.
        </Para>
        <Head>Everything stays on your device</Head>
        <Para>
          There’s no account and no server — every byte is processed in your browser, and nothing
          about your scans is ever uploaded. Only the background map tiles are fetched from the map
          provider.
        </Para>
      </>
    ),
  },
  {
    id: 'views',
    title: 'Views & the map',
    content: (
      <>
        <Lead>The {b('View')} selector (top-right) chooses how a scan is shown.</Lead>
        <Bullets
          items={[
            <>
              {b('2D OpenStreetMap')} / {b('2D Satellite')} — the classic top-down map with the data
              layers drawn over a street or aerial basemap.
            </>,
            <>
              {b('3D Model')} — an explorable 3D model of the lake bed on a plain backdrop (no map
              underneath). See {b('The 3D lake bed')}.
            </>,
          ]}
        />
        <Head>Getting around (2D)</Head>
        <Bullets
          items={[
            'Drag to pan, scroll or pinch to zoom.',
            'Right-drag (or two-finger drag) to rotate.',
            <>
              The {b('compass')} (top-left) shows which way is north; click it to snap back to
              north-up.
            </>,
          ]}
        />
        <Para>
          The map frames itself on your scan when it loads. Your basemap choice is remembered
          between visits.
        </Para>
      </>
    ),
  },
  {
    id: '3d',
    title: 'The 3D lake bed',
    content: (
      <>
        <Lead>
          {b('3D Model')} builds a surface from the interpolated depth grid and colours it by depth
          (the same viridis scale as the 2D contours — deeper is darker). It’s a standalone view, so
          there’s no basemap to distract from the shape of the bed.
        </Lead>
        <Head>Navigating</Head>
        <Bullets
          items={[
            'Drag the surface to pan; pinch or scroll to zoom.',
            <>
              Use the {b('view cube')} (top-left) to orbit: drag it to rotate and tilt, or click a
              labelled face to jump to a standard view — {b('Top')} for a plan view, {b('N/S/E/W')}{' '}
              for that side. A click off the faces returns to the default three-quarter view.
            </>,
            <>The {b('compass')} above the cube always points north.</>,
          ]}
        />
        <Head>Controls (top-right panel)</Head>
        <Bullets
          items={[
            <>
              {b('Vertical exaggeration')} — lakes are nearly flat in true scale, so the relief is
              stretched to be legible. Slide from 1× to 20× to taste.
            </>,
            <>{b('Reset view')} — re-frames the scan and levels the camera.</>,
            'The depth colour key sits at the top of the panel.',
          ]}
        />
        <Para>
          The 3D model shows depth only; the weed, fish-density and sweet-spot layers apply to the
          2D map view.
        </Para>
      </>
    ),
  },
  {
    id: 'layers',
    title: 'Layers',
    content: (
      <>
        <Lead>
          The {b('Layers')} switches in the sidebar turn each overlay on or off (2D view). The
          legend (bottom-right) shows the colour scale for whatever is visible.
        </Lead>
        <Bullets
          items={[
            <>
              {b('Bathymetry')} — filled depth contours (viridis: deeper = darker). When another
              filled layer is also on, depth switches to thin contour lines so both are readable.
            </>,
            <>
              {b('Weed')} — estimated weed height above the bed (Greens: taller = darker), from the
              sonar return just above the bottom.
            </>,
            <>
              {b('Fish density')} — a heatmap of fish activity, weighted by how often fish were
              detected in each spot. It warms up (yellow → red) where fish concentrated and stays
              clear where few or none were seen.
            </>,
            <>
              {b('Sweet spots')} — the best combinations of fish activity and clear bottom, as
              categorised markers. See {b('Sweet spots')}.
            </>,
            <>
              {b('Temperature')} — filled contours of water temperature (only shown when the scan
              recorded it). The active-scan panel shows the min / average / max.
            </>,
          ]}
        />
        <Para>
          Depth- or temperature-only scans (e.g. a Deeper mobile export) disable the sonar-derived
          layers, since they need the raw sonar returns.
        </Para>
      </>
    ),
  },
  {
    id: 'sweet',
    title: 'Sweet spots',
    content: (
      <>
        <Lead>
          Sweet spots highlight where a high fish-detection rate meets a clean (low-weed) bottom.
          Each qualifying cell gets one of four markers:
        </Lead>
        <Bullets
          items={[
            <>{b('Gold')} — high fish rate over a clear bottom. The pick of the lake.</>,
            <>{b('Silver')} — high fish rate with a little more weed.</>,
            <>{b('Bronze')} — a moderate fish rate over a clear bottom.</>,
            <>{b('Weeded')} — high fish rate, but the bottom is too weedy to fish easily.</>,
          ]}
        />
        <Head>Max shown</Head>
        <Para>
          A busy lake can produce hundreds of sweet spots, which turns into an unreadable blanket of
          markers. The {b('Max shown')} slider caps how many appear at once; the map keeps the best
          within the current view (gold → silver → bronze → weeded, then higher fish rate) and
          re-picks them as you pan and zoom.
        </Para>
        <Para>
          The thresholds that decide each category are adjustable — see {b('Fine-tuning')}.
        </Para>
      </>
    ),
  },
  {
    id: 'inspect',
    title: 'Inspecting spots',
    content: (
      <>
        <Lead>Tap or click anywhere on the scanned area to inspect the nearest surveyed spot.</Lead>
        <Para>The popup shows, for that spot:</Para>
        <Bullets
          items={[
            'When it was scanned (a date/time, or a range if you crossed it on more than one visit).',
            'Depth, and water temperature if recorded.',
            'Weed height, fish rate and how many sonar pings went into the reading.',
          ]}
        />
        <Para>
          Tap another spot to move the popup, or tap off the scan to close it. Only depth and
          temperature are shown for scans without sonar.
        </Para>
      </>
    ),
  },
  {
    id: 'tuning',
    title: 'Fine-tuning',
    content: (
      <>
        <Lead>
          The defaults are calibrated for carp, bream and tench in shallow lakes. For other species
          or deeper water, expand the {b('Thresholds')} accordions and adjust — the map updates a
          second or two after each change. {b('Reset defaults')} restores everything.
        </Lead>
        <Head>Lift-out detection</Head>
        <Para>
          Removes readings taken while the sonar was out of the water (packing up, drifting between
          swims), which would otherwise show as false shallows.
        </Para>
        <Bullets
          items={[
            <>
              {b('Hard threshold (m)')} — depths shallower than this are treated as “out of water”.
            </>,
            <>
              {b('Session gap (s)')} — a pause longer than this starts a new session (separate visit
              or swim).
            </>,
            <>
              {b('MAD multiplier')} — how far a reading must stray from its neighbours to be
              dropped. Lower is stricter.
            </>,
            <>
              {b('Global outlier strictness')} — a final pass catching sustained lift-outs across
              the whole trip. Lower is stricter.
            </>,
          ]}
        />
        <Head>Sonar analysis</Head>
        <Bullets
          items={[
            <>
              {b('Bottom-hug zone (m)')} — how close to the bed a return counts as “bottom” rather
              than a fish.
            </>,
            <>
              {b('Fish min amplitude')} — how strong an echo must be to count as a fish. Raise it to
              ignore weaker returns.
            </>,
            <>
              {b('Fish min run length (bins)')} — how many consecutive echo samples a fish must
              span. Raise it to reject noise.
            </>,
            <>
              {b('Weed min amplitude')} — how strong a near-bottom return must be to count as weed.
            </>,
          ]}
        />
        <Head>Cell aggregation</Head>
        <Bullets
          items={[
            <>
              {b('Cell size (m)')} — the grid the lake is divided into. Smaller is more detailed but
              needs denser coverage.
            </>,
            <>
              {b('Min pings per cell')} — how many readings a cell needs before it’s trusted. Raise
              it to hide thinly-covered areas.
            </>,
          ]}
        />
        <Head>Sweet-spot categories</Head>
        <Bullets
          items={[
            <>{b('Gold fish-rate threshold')} — the fish rate needed for gold/silver/weeded.</>,
            <>{b('Gold max weed (m)')} — the most weed a gold spot may have.</>,
            <>{b('Bronze fish-rate threshold')} — the lower fish rate that still earns bronze.</>,
            <>
              {b('Weeded min weed (m)')} — above this weed height, a fishy spot is marked “weeded”.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'scans',
    title: 'Your scans',
    content: (
      <>
        <Lead>
          Every scan you open is saved in your browser and listed in the sidebar, so your library
          persists between visits. Each scan’s ⋮ menu offers:
        </Lead>
        <Bullets
          items={[
            <>{b('Rename')} — give the scan a memorable name.</>,
            <>
              {b('Merge scan…')} — fold a later export of the same lake into this one. Ideal for a
              venue you re-visit: the combined data is analysed as one map, with separate visits
              kept apart automatically.
            </>,
            <>
              {b('Export')} — download the scan (including any merged-in data) as a{' '}
              {b('bathymetry.csv')} + {b('sonar.csv')} zip, in the exact layout the app imports — to
              back it up or share it.
            </>,
            <>{b('Delete')} — remove the scan from the library.</>,
          ]}
        />
        <Para>
          Because everything lives in your browser’s storage, clearing site data will remove your
          library — export anything you want to keep.
        </Para>
      </>
    ),
  },
  {
    id: 'about',
    title: 'About & privacy',
    content: (
      <>
        <Lead>
          Deeper Maps is a 100% client-side app for visualising Deeper sonar scans. No account, no
          server, no tracking.
        </Lead>
        <Bullets
          items={[
            'All analysis and storage happen in your browser; scan data never leaves your device.',
            'It runs from a single self-contained page — you can even save it and use it offline (map tiles aside).',
            'Only background map tiles are requested from the map provider.',
          ]}
        />
        <Para>
          Licensed under the PostgreSQL License. Source code, releases and the roadmap are on the{' '}
          <Link
            href="https://github.com/dpage/deeper-maps"
            target="_blank"
            rel="noopener noreferrer"
          >
            project repository
          </Link>
          .
        </Para>
      </>
    ),
  },
];

/**
 * A slide-out help & documentation panel (right-anchored drawer). A category
 * list runs down the left (a scrollable tab bar across the top on narrow
 * screens) with the selected category's content on the right.
 */
export function HelpPanel({ open, onClose }: HelpPanelProps): JSX.Element {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [tab, setTab] = useState(0);
  const active = SECTIONS[tab]!;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: isMobile ? '100vw' : 'min(860px, 96vw)' } }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          flexShrink: 0,
        }}
      >
        <Typography variant="h6">Help &amp; guide</Typography>
        <IconButton onClick={onClose} aria-label="Close help" edge="end">
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider />

      <Box
        sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', flex: 1, minHeight: 0 }}
      >
        <Tabs
          orientation={isMobile ? 'horizontal' : 'vertical'}
          variant="scrollable"
          scrollButtons="auto"
          value={tab}
          onChange={(_e, v: number) => setTab(v)}
          aria-label="Help categories"
          sx={{
            flexShrink: 0,
            ...(isMobile
              ? { borderBottom: 1, borderColor: 'divider' }
              : {
                  borderRight: 1,
                  borderColor: 'divider',
                  minWidth: 190,
                  '& .MuiTab-root': { alignItems: 'flex-start', textAlign: 'left' },
                }),
          }}
        >
          {SECTIONS.map((s) => (
            <Tab key={s.id} label={s.title} />
          ))}
        </Tabs>

        <Box sx={{ flex: 1, overflowY: 'auto', p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            {active.title}
          </Typography>
          {active.content}
        </Box>
      </Box>
    </Drawer>
  );
}
