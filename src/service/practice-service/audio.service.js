import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { EDGE_NEURAL_VOICES } from '../../common/tts-voices.constants.js';

export const GTTS_ACCENT_MAP = {
  'en-us': 'com',
  'en-uk': 'co.uk',
  'en-au': 'com.au',
  'en-ca': 'ca',
  'en-in': 'co.in'
};

function splitTextForTts(text, maxLength = 180) {
  if (text.length <= maxLength) return [text];
  const parts = [];
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length <= maxLength) {
      current += sentence;
    } else {
      if (current.trim()) parts.push(current.trim());
      if (sentence.length > maxLength) {
        const words = sentence.split(' ');
        let subCurrent = '';
        for (const word of words) {
          if ((subCurrent + ' ' + word).length <= maxLength) {
            subCurrent += (subCurrent ? ' ' : '') + word;
          } else {
            if (subCurrent.trim()) parts.push(subCurrent.trim());
            subCurrent = word;
          }
        }
        if (subCurrent.trim()) parts.push(subCurrent.trim());
        current = '';
      } else {
        current = sentence;
      }
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.length > 0 ? parts : [text];
}

async function synthesizeWithGoogleTTS(text, audioPath, { slow = false, tld = 'com' } = {}) {
  const chunks = splitTextForTts(text, 180);
  const buffers = [];
  const speed = slow ? '0.3' : '1';

  for (const chunk of chunks) {
    const url = `https://translate.google.${tld}/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=en&client=tw-ob&ttsspeed=${speed}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Servicio de respaldo TTS no disponible (HTTP ${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    buffers.push(Buffer.from(arrayBuffer));
  }

  await fs.writeFile(audioPath, Buffer.concat(buffers));
}

export async function synthesizeSpeech(text, audioDirectory, options = {}) {
  if (!text || !text.trim()) throw new Error('No hay una frase para reproducir.');
  if (!audioDirectory) throw new Error('No se configuro la carpeta de audio.');

  await fs.mkdir(audioDirectory, { recursive: true });
  const filename = `phrase-${randomUUID()}.mp3`;
  const audioPath = path.join(audioDirectory, filename);

  const engine = options.engine || 'edge-tts';
  const slow = options.speed === 'slow';
  let success = false;

  if (engine === 'edge-tts') {
    const voiceName = options.voice || 'en-US-AvaNeural';
    const rate = slow ? '-20%' : 'default';

    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let ttsInstance = null;
      try {
        ttsInstance = new MsEdgeTTS({ connectionTimeoutMs: 10000, synthesisTimeoutMs: 15000 });
        await ttsInstance.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        const { audioStream } = ttsInstance.toStream(text.trim(), { rate });
        const writeStream = createWriteStream(audioPath);
        await pipeline(audioStream, writeStream);
        success = true;
        break;
      } catch (edgeError) {
        if (attempt < maxAttempts && (edgeError.message?.includes('429') || edgeError.message?.includes('timed out'))) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          continue;
        }
        console.warn(`[Audio Service] Error en Edge TTS (intento ${attempt}/${maxAttempts}), recurriendo a cliente nativo de respaldo:`, edgeError.message);
      } finally {
        if (ttsInstance) {
          try {
            ttsInstance.close();
          } catch {}
        }
      }
    }
  }

  // Si fallo Edge TTS o el motor configurado es gtts
  if (!success) {
    const accentKey = (options.accent || 'en-us').toLowerCase();
    const tld = GTTS_ACCENT_MAP[accentKey] || 'com';
    await synthesizeWithGoogleTTS(text.trim(), audioPath, { slow, tld });
  }

  const audio = await fs.readFile(audioPath);
  return {
    filename,
    audioUrl: `data:audio/mpeg;base64,${audio.toString('base64')}`
  };
}

export async function readAudio(audioPath) {
  const audio = await fs.readFile(audioPath);
  return `data:audio/mpeg;base64,${audio.toString('base64')}`;
}

/**
 * Elimina archivos de audio en disco que no correspondan a ninguna frase activa
 * en la base de datos o que hayan quedado huerfanos por sesiones transitorias.
 * @param {string} audioDirectory Directorio absoluto de almacenamiento de audio.
 * @param {Array<string>} activeAudioPaths Rutas relativas o nombres de archivo activos.
 * @param {number} maxAgeMs Tiempo de gracia para archivos temporales recientes (default: 30 minutos).
 */
export async function pruneOrphanAudioFiles(audioDirectory, activeAudioPaths = [], maxAgeMs = 30 * 60 * 1000) {
  if (!audioDirectory) return { success: false, deletedCount: 0 };

  try {
    const exists = await fs.access(audioDirectory).then(() => true).catch(() => false);
    if (!exists) return { success: true, deletedCount: 0 };

    const files = await fs.readdir(audioDirectory);
    const activeFilenames = new Set(
      activeAudioPaths
        .filter(Boolean)
        .map((p) => path.basename(p))
    );

    const now = Date.now();
    let deletedCount = 0;

    for (const file of files) {
      if (!file.startsWith('phrase-') || !file.endsWith('.mp3')) continue;

      if (!activeFilenames.has(file)) {
        const filePath = path.join(audioDirectory, file);
        try {
          const stats = await fs.stat(filePath);
          if (now - stats.mtimeMs > maxAgeMs) {
            await fs.unlink(filePath);
            deletedCount++;
          }
        } catch {}
      }
    }

    return { success: true, deletedCount };
  } catch (error) {
    console.warn('[Audio Service] No se pudo ejecutar la poda de audios huerfanos:', error.message);
    return { success: false, error: error.message };
  }
}

