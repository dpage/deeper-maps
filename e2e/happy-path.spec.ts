import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('upload synthetic scan → map renders → toggle layers → tweak threshold', async ({ page }) => {
  await page.goto('/');

  // Wait for the upload-scan button to appear (proves React mounted).
  const uploadButton = page.getByRole('button', { name: /upload scan/i });
  await expect(uploadButton).toBeVisible();

  // Open the dialog.
  await uploadButton.click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Choose the synthetic fixture via the hidden file input.
  const fileInput = page.locator('input[type="file"][aria-label="upload"]');
  await fileInput.setInputFiles(resolve(__dirname, 'fixtures/synthetic.zip'));

  // Trust the dialog's content-hash dup check briefly.
  await page.waitForTimeout(200);

  // Click Save & analyse.
  const saveButton = page.getByRole('button', { name: /save\s*&\s*analyse|save/i });
  await saveButton.click();

  // Wait for the legend to render (means the layerBundle landed).
  await expect(page.getByText(/depth:/i)).toBeVisible({ timeout: 30000 });

  // Toggle weed layer off; legend row should disappear.
  await page.getByLabel('Weed', { exact: true }).click();
  await expect(page.getByText(/^Weed:/i)).toBeHidden();

  // Tweak gold fish-rate slider — open the accordion, then drag.
  await page.getByRole('button', { name: /sweet-spot categories/i }).click();
  const slider = page.getByLabel(/gold fish-rate threshold/i);
  await slider.focus();
  // Press right arrow a few times — each press bumps by `step`.
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');

  // Wait for any progress to clear, indicating recompute finished.
  await expect(page.locator('[role="progressbar"]')).toBeHidden({ timeout: 30000 });

  // Final screenshot for visual reference.
  await expect(page).toHaveScreenshot('happy-path.png', {
    maxDiffPixelRatio: 0.05,
    timeout: 5000,
  });
});
