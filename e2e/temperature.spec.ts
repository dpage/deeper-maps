import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('temperature: toggle present, panel shows min/avg/max °C', async ({ page }) => {
  await page.goto('/');

  // Wait for the upload-scan button to appear (proves React mounted).
  const uploadButton = page.getByRole('button', { name: /upload scan/i });
  await expect(uploadButton).toBeVisible();

  // Open the dialog.
  await uploadButton.click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Choose the temp fixture via the hidden file input.
  const fileInput = page.locator('input[type="file"][aria-label="upload"]');
  await fileInput.setInputFiles(resolve(__dirname, 'fixtures/quest-with-temp.zip'));

  // Allow the dialog's content-hash dup check to settle.
  await page.waitForTimeout(200);

  // Click Save & analyse.
  const saveButton = page.getByRole('button', { name: /save\s*&\s*analyse|save/i });
  await saveButton.click();

  // Wait for the depth legend to appear — confirms layerBundle has landed.
  await expect(page.getByText(/depth:/i)).toBeVisible({ timeout: 30000 });

  // The temperature toggle switch must be visible in the layer controls.
  await expect(page.getByLabel(/Temperature/i)).toBeVisible({ timeout: 30000 });

  // The temperature stat line must show min=12.4 and max=16.7.
  // Middle value (avg) is computed at runtime; allow any two-decimal value.
  await expect(page.getByText(/12\.4 \/ \d+\.\d+ \/ 16\.7 °C/)).toBeVisible({ timeout: 30000 });
});
