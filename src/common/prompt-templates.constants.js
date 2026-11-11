// src/common/prompt-templates.constants.js

const AUDITORY_SYSTEM_PROMPT = 
    "ROLE: English spoken practice sentence generator for listening comprehension.\n" +
    "RULES:\n" +
    "1. Natural conversational spoken English. Avoid bookish, overly literary language or repetitive syntax.\n" +
    "2. Output strictly the clean sentence, ready to be read aloud by Text-to-Speech (TTS). No quotes, notes, or explanations.";

const AUDITORY_BATCH_SYSTEM_PROMPT = 
    "ROLE: English practice sentence generator for listening comprehension.\n" +
    "RULES:\n" +
    "1. Spoken conversational style with natural rhythm.\n" +
    "2. Vary sentence structures and subjects across all items. Do not repeat sentence templates or rhetorical tag questions.\n" +
    "3. Output strictly a numbered list (1. Sentence, 2. Sentence) with one sentence per line. No notes, quotes, or markdown.";

const LEVEL_GRAMMAR_CONSTRAINTS = {
    A1: "- Grammatical constraints: Use Present Simple or Present Continuous with simple everyday vocabulary.",
    A2: "- Grammatical constraints: Use Past Simple, Future with 'going to', or basic connectors (because, so, but).",
    B1: "- Grammatical constraints: Use Present Perfect, First Conditional, or relative clauses (who, that, which).",
    B2: "- Grammatical constraints: Use past modals (should have, could have), Second Conditional, or connectors (although, despite).",
    C1: "- Grammatical constraints: Use advanced conversational structures (participial clauses, subtle inversion, or cleft sentences)."
};

const EVAL_SYSTEM_PROMPT = 
    "Eres un evaluador conciso de transcripciones de inglés.\n\n" +
    "PAUTAS:\n" +
    "1. Responde 100% en español de forma directa, neutra y objetiva (2 oraciones máximo).\n" +
    "2. Identifica la causa del fallo (auditivo/fonético, ortografía, palabra faltante o gramática).\n" +
    "3. Cita la frase original correcta entre comillas.\n" +
    "4. Texto plano sin asteriscos (* ni **) ni encabezados markdown.";

const EXPLAIN_SYSTEM_PROMPT = 
    "Eres un tutor pedagógico de inglés para estudiantes hispanohablantes.\n\n" +
    "PAUTAS:\n" +
    "1. Explicaciones y comentarios en español conciso (máximo 2 a 3 oraciones).\n" +
    "2. Ejemplos y citas de frases estrictamente en inglés.\n" +
    "3. Ve directo al punto sin fórmulas de cortesía ni rellenos.\n" +
    "4. Texto plano sin asteriscos (* ni **) ni encabezados markdown.";

const DEFINE_WORD_SYSTEM_PROMPT = 
    "Eres un diccionario léxico bilingüe inglés-español para estudiantes.\n\n" +
    "PAUTAS:\n" +
    "1. Comienza directamente con el término, su categoría gramatical entre paréntesis y su traducción principal.\n" +
    "2. Si se proporciona contexto, aclara brevemente su sentido en una oración breve adicional.\n" +
    "3. Máximo 2 oraciones en total. Sin introducciones repetitivas ni fórmulas robóticas.\n" +
    "4. Texto plano sin asteriscos (* ni **) ni encabezados markdown.";

const DEFAULT_PROMPTS = {
    gen_auditory_system: AUDITORY_SYSTEM_PROMPT,
    gen_batch_system: AUDITORY_BATCH_SYSTEM_PROMPT,
    grammar_A1: LEVEL_GRAMMAR_CONSTRAINTS.A1,
    grammar_A2: LEVEL_GRAMMAR_CONSTRAINTS.A2,
    grammar_B1: LEVEL_GRAMMAR_CONSTRAINTS.B1,
    grammar_B2: LEVEL_GRAMMAR_CONSTRAINTS.B2,
    grammar_C1: LEVEL_GRAMMAR_CONSTRAINTS.C1,
    eval_system: EVAL_SYSTEM_PROMPT,
    explain_system: EXPLAIN_SYSTEM_PROMPT,
    define_word_system: DEFINE_WORD_SYSTEM_PROMPT,
    // Aliases retrocompatibles para migraciones y llamadas existentes
    eval_system_es: EVAL_SYSTEM_PROMPT,
    eval_system_en: EVAL_SYSTEM_PROMPT,
    explain_system_es: EXPLAIN_SYSTEM_PROMPT,
    explain_system_en: EXPLAIN_SYSTEM_PROMPT,
    define_word_system_es: DEFINE_WORD_SYSTEM_PROMPT,
    define_word_system_en: DEFINE_WORD_SYSTEM_PROMPT
};

const PROMPT_GROUPS = [
    { id: 'generation', title_es: 'Generación', title_en: 'Generation' },
    { id: 'evaluation', title_es: 'Evaluación', title_en: 'Evaluation' },
    { id: 'explanation', title_es: 'Explicación / Tutor', title_en: 'Explanation / Tutor' }
];

const PROMPT_METADATA = [
    { key: 'gen_auditory_system', group_id: 'generation', title_es: 'Sistema Fonético Auditivo (TTS)', title_en: 'Auditory Phonetic System (TTS)', vars: [] },
    { key: 'gen_batch_system', group_id: 'generation', title_es: 'Sistema por Lotes (1 a N)', title_en: 'Batch Generation System (1 to N)', vars: [] },
    { key: 'grammar_A1', group_id: 'generation', title_es: 'Reglas Estructurales: Nivel A1', title_en: 'Structural Rules: Level A1', vars: [] },
    { key: 'grammar_A2', group_id: 'generation', title_es: 'Reglas Estructurales: Nivel A2', title_en: 'Structural Rules: Level A2', vars: [] },
    { key: 'grammar_B1', group_id: 'generation', title_es: 'Reglas Estructurales: Nivel B1', title_en: 'Structural Rules: Level B1', vars: [] },
    { key: 'grammar_B2', group_id: 'generation', title_es: 'Reglas Estructurales: Nivel B2', title_en: 'Structural Rules: Level B2', vars: [] },
    { key: 'grammar_C1', group_id: 'generation', title_es: 'Reglas Estructurales: Nivel C1', title_en: 'Structural Rules: Level C1', vars: [] },
    { key: 'eval_system', group_id: 'evaluation', title_es: 'Criterios de Corrección y Evaluación', title_en: 'Correction and Evaluation Criteria', vars: [] },
    { key: 'explain_system', group_id: 'explanation', title_es: 'Tutor de Comprensión y Práctica', title_en: 'Comprehension and Practice Tutor', vars: [] },
    { key: 'define_word_system', group_id: 'explanation', title_es: 'Definición de Vocabulario', title_en: 'Vocabulary Definition', vars: [] },
    // Aliases para compatibilidad con suites de test y configuraciones previas
    { key: 'define_word_system_es', group_id: 'explanation', title_es: 'Definición de Vocabulario (Alias ES)', title_en: 'Vocabulary Definition (Alias ES)', vars: [] },
    { key: 'define_word_system_en', group_id: 'explanation', title_es: 'Definición de Vocabulario (Alias EN)', title_en: 'Vocabulary Definition (Alias EN)', vars: [] }
];

const PROMPT_KEY_ALIASES = {
    eval_system_es: 'eval_system',
    eval_system_en: 'eval_system',
    explain_system_es: 'explain_system',
    explain_system_en: 'explain_system',
    define_word_system_es: 'define_word_system',
    define_word_system_en: 'define_word_system'
};

export function getEffectivePrompt(key, customPrompts = {}) {
    const canonicalKey = PROMPT_KEY_ALIASES[key] || key;
    const lookupKeys = canonicalKey !== key ? [key, canonicalKey] : [key];

    if (Array.isArray(customPrompts)) {
        for (const k of lookupKeys) {
            const item = customPrompts.find(p => p.key === k);
            if (item) {
                if (item.custom_text && item.custom_text.trim()) return item.custom_text.trim();
                if (item.default_text && item.default_text.trim()) return item.default_text.trim();
            }
        }
    } else if (customPrompts && typeof customPrompts === 'object') {
        for (const k of lookupKeys) {
            if (typeof customPrompts[k] === 'string' && customPrompts[k].trim()) {
                return customPrompts[k].trim();
            }
        }
    }
    return DEFAULT_PROMPTS[canonicalKey] || DEFAULT_PROMPTS[key] || '';
}

export { DEFAULT_PROMPTS, PROMPT_GROUPS, PROMPT_METADATA };
