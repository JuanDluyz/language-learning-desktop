import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { expect, test } from '@playwright/test';

const projectRoot = process.cwd();
const modelName = 'Meta-Llama-3.1-8B-Instruct-IQ2_M.gguf';

test.describe('carga del modelo local de 8B', () => {
  test.skip(
    process.env.LANGUAGE_APP_RUN_REAL_MODEL !== '1'
      || !fsSync.existsSync(path.join(projectRoot, 'models', modelName)),
    'Opt-in test: requires LANGUAGE_APP_RUN_REAL_MODEL=1 and the local 8B GGUF.'
  );

  test.setTimeout(15 * 60 * 1000);

  let app;
  let page;
  let dataDirectory;

  test.beforeEach(async () => {
    dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'language-app-model-e2e-'));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    env.LANGUAGE_APP_E2E_DATA_DIR = dataDirectory;
    env.LANGUAGE_APP_E2E_SKIP_MODEL_WARMUP = '1';

    app = await electron.launch({
      args: [projectRoot],
      cwd: projectRoot,
      env,
      timeout: 60_000
    });
    page = await app.firstWindow();
  });

  test.afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    if (dataDirectory) {
      await fs.rm(dataDirectory, { recursive: true, force: true });
      dataDirectory = undefined;
    }
  });

  test('loads the installed Meta-Llama 3.1 8B model through settings', async () => {
    await page.getByTitle('Configuración').click();
    await page.getByRole('button', { name: 'Modelo IA' }).click();

    const modelSelect = page.locator('.SettingCard')
      .filter({ hasText: 'Modelo IA Cargado en Memoria' })
      .locator('select');
    await expect(modelSelect.locator(`option[value="${modelName}"]`))
      .not.toContainText('[Incompatible]');
    await modelSelect.selectOption(modelName);
    await page.getByRole('button', { name: 'Guardar Ajustes' }).click();

    await expect(page.getByRole('button', { name: 'Guardado' })).toBeVisible({
      timeout: 14 * 60 * 1000
    });
    await expect(page.locator('.lbl_model_error')).toHaveCount(0);
    await expect(modelSelect.locator(`option[value="${modelName}"]`))
      .toContainText('[Activo]');
  });
});
