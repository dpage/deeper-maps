import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('switch to the 3D lake-bed view → surface renders, exaggeration tunes', async ({ page }) => {
  // Fail loudly on any uncaught error or WebGL console error during the switch —
  // the custom GL layer's onAdd/render run for real in this browser. Basemap
  // tile fetches (OSM/Esri) legitimately fail in a network-restricted sandbox;
  // filter that noise so only real script/GL errors trip the assertion.
  const isNetworkNoise = (s: string): boolean =>
    /failed to fetch|err_tunnel|err_(name|internet|connection|network)|load resource|net::/i.test(
      s,
    );
  const errors: string[] = [];
  page.on('pageerror', (e) => {
    if (!isNetworkNoise(String(e))) errors.push(String(e));
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !isNetworkNoise(m.text())) errors.push(m.text());
  });

  await page.goto('/');

  // Upload the synthetic scan and wait for the 2D legend (bundle landed).
  await page.getByRole('button', { name: /upload scan/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .locator('input[type="file"][aria-label="upload"]')
    .setInputFiles(resolve(__dirname, 'fixtures/synthetic.zip'));
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /save\s*&\s*analyse|save/i }).click();
  await expect(page.getByText(/depth:/i)).toBeVisible({ timeout: 30000 });

  // Switch the view-mode selector from "2D map" to "3D lake bed".
  await page.getByRole('combobox').filter({ hasText: '2D map' }).click();
  await page.getByRole('option', { name: /3D lake bed/i }).click();

  // The 3D controls appear only when a depth grid is present and the layer is up.
  const slider = page.getByRole('slider', { name: /vertical exaggeration/i });
  await expect(slider).toBeVisible();
  await expect(page.getByText(/tilt & rotate/i)).toBeVisible();

  // Give the GL layer a couple of frames to build the mesh and draw.
  await page.waitForTimeout(500);

  // Tune the exaggeration — the label reflects the new value and no error fires.
  await slider.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByText(/Vertical exaggeration ×9/i)).toBeVisible();
  await page.waitForTimeout(300);

  // The map canvas is still present and nothing threw during the 3D render.
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  expect(errors, `unexpected errors: ${errors.join('\n')}`).toEqual([]);

  // Switch back to 2D — the 3D controls tear down, the depth legend returns.
  await page.getByRole('combobox').filter({ hasText: '3D lake bed' }).click();
  await page.getByRole('option', { name: /2D map/i }).click();
  await expect(slider).toBeHidden();
  await expect(page.getByText(/depth:/i)).toBeVisible();
});
