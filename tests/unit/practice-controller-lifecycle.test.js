import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PracticeController } from '../../src/view/practice-session-view/practice-session-view.controller.js';

test('PracticeController aborts async operations when disposed or disconnected', async () => {
  let cleanedUpSessionId = null;
  global.window = {
    electronAPI: {
      cleanupDynamicSession: (id) => {
        cleanedUpSessionId = id;
      },
      startDynamicSession: async () => 'test-dyn-session-123',
      generateAdaptiveSession: async () => {
        // Simular latencia de inferencia
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          phrases: [{ original_text: 'The horse is running fast.', cefr_level: 'B1' }]
        };
      },
      synthesizeSpeech: async () => ({ filename: 'test.mp3', audioUrl: 'blob:test' })
    }
  };

  const mockHost = {
    isConnected: true,
    mode: 'dynamic',
    sessionOptions: { level: 'B1', topic: 'Horses', count: 5 },
    dynamicSessionId: '',
    loading: false,
    sessionNotice: '',
    phrases: [],
    currentIndex: 0,
    currentPhrase: null,
    audioUrl: '',
    transcription: '',
    feedback: '',
    masteredPhraseIds: new Set(),
    sessionCompleted: false,
    autoRevealPhrase: false,
    currentAudioWordIndex: -1,
    lastSelectedWordIndexes: [],
    querySelector: () => null,
    closeContextMenu: () => {},
    dispatchEvent: () => {}
  };

  const controller = new PracticeController(mockHost);

  // Iniciar la sesión dinámica
  const startPromise = controller.startDynamicSession();

  // El usuario navega fuera inmediatamente antes de que el LLM termine
  mockHost.isConnected = false;
  controller.dispose();

  // Esperar a que la promesa del LLM resuelva
  await startPromise;

  // Verificar que el estado del componente NO fue alterado tras el desmonte
  assert.equal(controller._disposed, true);
  assert.equal(mockHost.loading, true); // No debe haberse reactivado a loading = false en el desmonte
  assert.equal(mockHost.audioUrl, ''); // No debe haberse cargado ni reproducido audio
  assert.equal(mockHost.phrases.length, 0); // No debe haberse asignado frases huérfanas
  assert.equal(cleanedUpSessionId, 'test-dyn-session-123'); // Debe haberse limpiado la sesión
});

test('PracticeController isOperationActive accurately reflects component connection and session token', () => {
  const mockHost = { isConnected: true };
  const controller = new PracticeController(mockHost);

  controller._activeSessionId = 5;
  assert.equal(controller.isOperationActive(5), true);
  assert.equal(controller.isOperationActive(4), false);

  mockHost.isConnected = false;
  assert.equal(controller.isOperationActive(5), false);

  mockHost.isConnected = true;
  controller.dispose();
  assert.equal(controller.isOperationActive(5), false);
});

