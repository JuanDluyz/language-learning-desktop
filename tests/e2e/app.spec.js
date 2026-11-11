import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { expect, test } from '@playwright/test';

const projectRoot = process.cwd();
const modelNames = [
  'gemma-3-1B-it-QAT-Q4_0.gguf',
  'Meta-Llama-3.1-8B-Instruct-IQ2_M.gguf'
];

let app;
let page;
let dataDirectory;

test.beforeEach(async () => {
  dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'language-app-e2e-'));
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

test('opens the desktop app and renders the home screen', async () => {
  await expect(page.getByRole('heading', { name: 'AI Listening Practice' })).toBeVisible();
  await expect(page.getByText('Grupos de frases')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Configurar Sesión con IA' })).toBeVisible();
});

test('lists the installed local GGUF models without loading them', async () => {
  test.skip(
    !modelNames.every((name) => fsSync.existsSync(path.join(projectRoot, 'models', name))),
    'Requires the two local GGUF files listed in the benchmark protocol.'
  );
  await page.getByTitle('Configuración').click();
  await page.getByRole('button', { name: 'Modelo IA' }).click();

  const modelSelect = page.locator('.SettingCard')
    .filter({ hasText: 'Modelo IA Cargado en Memoria' })
    .locator('select');

  for (const modelName of modelNames) {
    await expect(modelSelect.locator(`option[value="${modelName}"]`)).toHaveCount(1);
    await expect(modelSelect.locator(`option[value="${modelName}"]`)).toBeEnabled();
    await expect(modelSelect.locator(`option[value="${modelName}"]`)).not.toContainText('[Incompatible]');
  }
});

test('configures Groq and Gemini without sending API requests', async () => {
  await page.getByTitle('Configuración').click();
  await page.getByRole('button', { name: 'Modelo IA' }).click();
  await page.getByRole('button', { name: 'Modo Cloud (BYOK - API Key)' }).click();

  const cloudSelects = page.locator('.settings-cards-list select');
  const providerSelect = cloudSelects.nth(0);
  const modelInput = page.locator('.settings-cards-list input[type="text"]');

  await expect(providerSelect.locator('option[value="groq"]')).toHaveCount(1);
  await expect(providerSelect.locator('option[value="gemini"]')).toHaveCount(1);

  await providerSelect.selectOption('groq');
  await expect(modelInput).toHaveValue('openai/gpt-oss-120b');
  await providerSelect.selectOption('gemini');
  await expect(modelInput).toHaveValue('gemini-1.5-flash');

  const apiKeyInput = page.locator('.settings-cards-list input[type="password"]');
  await expect(apiKeyInput).toHaveCount(1);
  await apiKeyInput.fill('e2e-dummy-key-not-valid');
  await expect(apiKeyInput).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Mostrar' }).click();
  await expect(page.locator('.settings-cards-list input[type="text"]').last())
    .toHaveValue('e2e-dummy-key-not-valid');
  await page.getByRole('button', { name: 'Ocultar' }).click();
  await apiKeyInput.fill('');

  await page.getByRole('button', { name: 'Guardar Ajustes' }).click();
  await expect(page.getByText('Ajustes guardados correctamente')).toBeVisible();

  await page.getByTitle('Cerrar ajustes').click();
  await page.getByTitle('Configuración').click();
  await page.getByRole('button', { name: 'Modelo IA' }).click();
  await expect(page.getByRole('button', { name: 'Modo Cloud (BYOK - API Key)' })).toBeVisible();
  await expect(page.locator('.settings-cards-list select').first()).toHaveValue('gemini');
});
