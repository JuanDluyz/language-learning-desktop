/**
 * file-importer.js
 * Utility to parse uploaded/dragged files (.json, .csv, .txt) and extract group and phrases.
 */

export function parseGroupFile(fileContent, fileName = 'Imported Group') {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const baseName = fileName.replace(/\.[^/.]+$/, '');

  if (ext === 'json') {
    return parseJsonFile(fileContent, baseName);
  } else if (ext === 'csv') {
    return parseCsvFile(fileContent, baseName);
  } else {
    // Default fallback to text lines (.txt or unclassified)
    return parseTxtFile(fileContent, baseName);
  }
}

function parseJsonFile(content, defaultName) {
  try {
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      return {
        groupName: defaultName,
        phrases: data.map(item => normalizePhraseItem(item)).filter(Boolean)
      };
    } else if (data && typeof data === 'object') {
      const groupName = data.groupName || data.name || defaultName;
      const rawPhrases = data.phrases || data.items || [];
      return {
        groupName,
        phrases: Array.isArray(rawPhrases) ? rawPhrases.map(item => normalizePhraseItem(item)).filter(Boolean) : []
      };
    }
  } catch (err) {
    throw new Error('Formato JSON no válido: ' + err.message);
  }
  return { groupName: defaultName, phrases: [] };
}

function parseCsvFile(content, defaultName) {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { groupName: defaultName, phrases: [] };

  // Detect delimiter (comma or semicolon)
  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));

  // Check if first line is a header
  const hasHeader = headers.some(h => ['text', 'phrase', 'original_text', 'nivel', 'level', 'tipo', 'type'].includes(h));
  const startIdx = hasHeader ? 1 : 0;

  const textColIdx = hasHeader ? headers.findIndex(h => ['text', 'phrase', 'original_text', 'frase', 'oracion'].includes(h)) : 0;
  const levelColIdx = hasHeader ? headers.findIndex(h => ['level', 'cefr_level', 'nivel'].includes(h)) : -1;
  const typeColIdx = hasHeader ? headers.findIndex(h => ['type', 'exercise_type', 'tipo'].includes(h)) : -1;

  const phrases = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
    const text = cols[textColIdx >= 0 ? textColIdx : 0] || '';
    if (!text) continue;

    const level = levelColIdx >= 0 && cols[levelColIdx] ? cols[levelColIdx] : 'B1';
    const exercise_type = typeColIdx >= 0 && cols[typeColIdx] ? cols[typeColIdx] : 'dictation';

    phrases.push({
      original_text: text,
      cefr_level: level,
      exercise_type
    });
  }

  return { groupName: defaultName, phrases };
}

function parseTxtFile(content, defaultName) {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const phrases = lines.map(line => {
    // Remove leading numbering like "1. ", "1) "
    const cleaned = line.replace(/^\d+[\.\)]\s*/, '').trim();
    return cleaned ? { original_text: cleaned, cefr_level: 'B1', exercise_type: 'dictation' } : null;
  }).filter(Boolean);

  return { groupName: defaultName, phrases };
}

function normalizePhraseItem(item) {
  if (typeof item === 'string') {
    return { original_text: item.trim(), cefr_level: 'B1', exercise_type: 'dictation' };
  }
  if (!item || typeof item !== 'object') return null;

  const text = (item.original_text || item.text || item.phrase || item.frase || '').trim();
  if (!text) return null;

  return {
    original_text: text,
    cefr_level: item.cefr_level || item.level || item.nivel || 'B1',
    topic: item.topic || item.tema || 'General',
    exercise_type: item.exercise_type || item.type || item.tipo || 'dictation',
    exercise_metadata: item.exercise_metadata || item.metadata || null
  };
}
