import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Slider,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useDeeperMapsStore } from '../state/store';
import type { PipelineOptions } from '../analysis/types';
import type { StoredScan } from '../storage/types';

interface ThresholdSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}

function ThresholdSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: ThresholdSliderProps): JSX.Element {
  return (
    <Stack spacing={0.5}>
      <Typography variant="caption">{`${label}: ${value}`}</Typography>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(_, v) => onChange(Array.isArray(v) ? (v[0] ?? value) : v)}
        size="small"
        aria-label={label}
      />
    </Stack>
  );
}

export interface ThresholdControlsProps {
  scan: StoredScan;
}

export function ThresholdControls({ scan }: ThresholdControlsProps): JSX.Element {
  const updateThresholds = useDeeperMapsStore((s) => s.updateThresholds);
  const t = scan.thresholds;

  function update(patch: Partial<PipelineOptions>): void {
    const next: PipelineOptions = {
      liftout: { ...t.liftout, ...(patch.liftout ?? {}) },
      sonar: { ...t.sonar, ...(patch.sonar ?? {}) },
      cell: { ...t.cell, ...(patch.cell ?? {}) },
      category: { ...t.category, ...(patch.category ?? {}) },
      colorScale: { ...t.colorScale, ...(patch.colorScale ?? {}) },
    };
    updateThresholds(scan.id, next);
  }

  return (
    <Stack>
      <Typography variant="subtitle2">Thresholds</Typography>

      <Accordion disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="body2">Lift-out detection</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <ThresholdSlider
              label="Hard threshold (m)"
              value={t.liftout.hardThresholdM}
              min={1}
              max={30}
              step={0.5}
              onChange={(n) => update({ liftout: { ...t.liftout, hardThresholdM: n } })}
            />
            <ThresholdSlider
              label="Session gap (s)"
              value={t.liftout.sessionGapS}
              min={30}
              max={1800}
              step={30}
              onChange={(n) => update({ liftout: { ...t.liftout, sessionGapS: n } })}
            />
            <ThresholdSlider
              label="MAD multiplier"
              value={t.liftout.madMultiplier}
              min={2}
              max={12}
              step={0.5}
              onChange={(n) => update({ liftout: { ...t.liftout, madMultiplier: n } })}
            />
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Accordion disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="body2">Sonar analysis</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <ThresholdSlider
              label="Bottom-hug zone (m)"
              value={t.sonar.bottomHugM}
              min={0.05}
              max={2}
              step={0.05}
              onChange={(n) => update({ sonar: { ...t.sonar, bottomHugM: n } })}
            />
            <ThresholdSlider
              label="Fish min amplitude"
              value={t.sonar.fishMinAmp}
              min={50}
              max={1000}
              step={10}
              onChange={(n) => update({ sonar: { ...t.sonar, fishMinAmp: n } })}
            />
            <ThresholdSlider
              label="Fish min run length (bins)"
              value={t.sonar.fishMinRun}
              min={1}
              max={10}
              step={1}
              onChange={(n) => update({ sonar: { ...t.sonar, fishMinRun: n } })}
            />
            <ThresholdSlider
              label="Weed min amplitude"
              value={t.sonar.weedMinAmp}
              min={5}
              max={200}
              step={5}
              onChange={(n) => update({ sonar: { ...t.sonar, weedMinAmp: n } })}
            />
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Accordion disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="body2">Cell aggregation</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <ThresholdSlider
              label="Cell size (m)"
              value={t.cell.cellSizeM}
              min={1}
              max={10}
              step={0.5}
              onChange={(n) => update({ cell: { ...t.cell, cellSizeM: n } })}
            />
            <ThresholdSlider
              label="Min pings per cell"
              value={t.cell.minPingsPerCell}
              min={1}
              max={20}
              step={1}
              onChange={(n) => update({ cell: { ...t.cell, minPingsPerCell: n } })}
            />
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Accordion disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="body2">Sweet-spot categories</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <ThresholdSlider
              label="Gold fish-rate threshold"
              value={t.category.goldFishRate}
              min={0.01}
              max={0.5}
              step={0.01}
              onChange={(n) => update({ category: { ...t.category, goldFishRate: n } })}
            />
            <ThresholdSlider
              label="Gold max weed (m)"
              value={t.category.goldMaxWeed}
              min={0}
              max={0.3}
              step={0.005}
              onChange={(n) => update({ category: { ...t.category, goldMaxWeed: n } })}
            />
            <ThresholdSlider
              label="Bronze fish-rate threshold"
              value={t.category.bronzeFishRate}
              min={0.01}
              max={0.3}
              step={0.005}
              onChange={(n) => update({ category: { ...t.category, bronzeFishRate: n } })}
            />
            <ThresholdSlider
              label="Weeded min weed (m)"
              value={t.category.weededMinWeed}
              min={0.05}
              max={0.5}
              step={0.005}
              onChange={(n) => update({ category: { ...t.category, weededMinWeed: n } })}
            />
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}
