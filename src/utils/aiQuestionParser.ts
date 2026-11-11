import { Question, QuestionCategory } from '../types';

/**
 * STRICT ALLOWED SUBJECTS & DIFFICULTIES FOR QUIZKART QUESTION IMPORT
 */
export const ALLOWED_SUBJECTS = [
  'Reasoning',
  'Hindi',
  'English',
  'Mathematics',
  'General Knowledge',
  'General Science'
] as const;

export type AllowedSubject = typeof ALLOWED_SUBJECTS[number];

export const ALLOWED_DIFFICULTIES = [
  'Easy',
  'Medium',
  'Hard',
  'Expert'
] as const;

export type AllowedDifficulty = typeof ALLOWED_DIFFICULTIES[number];

export const VALID_SUBJECTS: QuestionCategory[] = ['Maths', 'Reasoning', 'Science', 'GK', 'English'];

export interface QuestionFieldError {
  field: string;
  message: string;
}

export interface ParsedBulkQuestion {
  id: number | string;
  stem: string;
  question: string;
  options: [string, string, string, string];
  correctKey: 'A' | 'B' | 'C' | 'D';
  correctIndex: number; // 0, 1, 2, 3
  explanation: string;
  category: string;
  subject: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  isValid: boolean;
  validationErrors: QuestionFieldError[];
  validationError?: string;
  rawSource?: string;
}

export interface BulkValidationReport {
  success: boolean;
  malformedJsonError?: string;
  totalParsed: number;
  validCount: number;
  invalidCount: number;
  questions: ParsedBulkQuestion[];
}

/**
 * Normalizes any category string into strictly one of:
 * ["Maths", "Reasoning", "Science", "GK", "English"]
 */
/**
 * Normalizes any category string into strictly one of:
 * ["Maths", "Reasoning", "Science", "GK", "English"]
 */
export function normalizeCategory(catStr?: string, contextText?: string): QuestionCategory {
  if (catStr) {
    const clean = catStr.trim().toLowerCase().replace(/[\*\_\`\[\]]/g, '');
    if (
      clean === 'maths' || clean === 'math' || clean === 'mathematics' ||
      clean.includes('arithmetic') || clean.includes('algebra') || clean.includes('quant') ||
      clean.includes('geometry') || clean.includes('trigonometry') || clean.includes('calculus') ||
      clean.includes('गणित') || clean.includes('अंकगणित') || clean.includes('बीजगणित') || clean.includes('रेखागणित')
    ) {
      return 'Maths';
    }
    if (
      clean === 'reasoning' || clean.includes('logic') || clean.includes('aptitude') ||
      clean.includes('analogy') || clean.includes('puzzle') || clean.includes('syllogism') ||
      clean.includes('mental') || clean.includes('तर्कशक्ति') || clean.includes('रीजनिंग') ||
      clean.includes('तर्क') || clean.includes('बुद्धिमत्ता')
    ) {
      return 'Reasoning';
    }
    if (
      clean === 'science' || clean === 'general science' || clean.includes('physics') ||
      clean.includes('chemistry') || clean.includes('biology') || clean.includes('tech') ||
      clean.includes('space') || clean.includes('astronomy') || clean.includes('विज्ञान') ||
      clean.includes('भौतिक') || clean.includes('रसायन') || clean.includes('जीवविज्ञान')
    ) {
      return 'Science';
    }
    if (
      clean === 'english' || clean.includes('grammar') || clean.includes('vocab') ||
      clean.includes('verbal') || clean.includes('synonym') || clean.includes('comprehension') ||
      clean.includes('अंग्रेजी') || clean.includes('hindi') || clean.includes('हिंदी') ||
      clean.includes('हिन्दी') || clean.includes('vyakaran') || clean.includes('व्याकरण')
    ) {
      return 'English';
    }
    if (
      clean === 'gk' || clean === 'general knowledge' || clean === 'general awareness' ||
      clean.includes('history') || clean.includes('heritage') || clean.includes('geography') ||
      clean.includes('polity') || clean.includes('current affairs') || clean.includes('सामान्य ज्ञान') ||
      clean.includes('सामान्य अध्ययन') || clean.includes('इतिहास') || clean.includes('भूगोल') ||
      clean.includes('संविधान') || clean.includes('अर्थशास्त्र')
    ) {
      return 'GK';
    }
  }

  // Fallback: heuristic scan of question text & context (supports Hindi & English)
  if (contextText) {
    const text = contextText.toLowerCase();

    // 1. Mathematics patterns & keywords (Hindi and English)
    if (
      /%|प्रतिशत|प्रतिशतता|का\s+\d+%\s+कितना|संख्या|अनुपात|समानुपात|औसत|ब्याज|चक्रवृद्धि|साधारण\s*ब्याज|लाभ|हानि|क्रय\s*मूल्य|विक्रय\s*मूल्य|क्षेत्रफल|परिमाप|आयतन|दूरी|चाल|गति|समय|कार्य|वर्गमूल|घनमूल|भिन्न|दशमलव|समीकरण|अभाज्य|गुणनखंड|गुणनफल|योगफल|\b\d+\s*का\s*\d+\s*%|\b\d+\s*%\s*का|\b\d+\s*%\s*कितना|\b(solve|equation|ratio|percentage|perimeter|area|triangle|prime number|hcf|lcm|algebra|profit|loss|simple interest|compound interest|speed|distance|sum of|product of|divided by|multiplied by|fraction|decimal)\b/i.test(text)
    ) {
      return 'Maths';
    }

    // 2. Reasoning patterns & keywords (Hindi and English)
    if (
      /शृंखला|श्रृंखला|विषम|संबंध|दिशा|कोडिंग|डिकोडिंग|पहेली|बैठक\s*व्यवस्था|कथन|निष्कर्ष|रक्त\s*संबंध|सादृश्यता|दर्पण\s*प्रतिबिंब|जल\s*प्रतिबिंब|\b(series|pattern|odd one out|coding-decoding|blood relation|direction|seating|syllogism|analogy|venn|statement and conclusion|logical order|mirror image|water image)\b/i.test(text)
    ) {
      return 'Reasoning';
    }

    // 3. Science patterns & keywords (Hindi and English)
    if (
      /प्रकाश\s*संश्लेषण|परमाणु|अणु|तत्व|आवर्त\s*सारणी|गुरुत्वाकर्षण|वेग|त्वरण|बल|ऊर्जा|विद्युत|तरंग|कोशिका|डीएनए|आरएनए|अम्ल|क्षार|लवण|धातु|अधातु|ग्रह|सौरमंडल|उपग्रह|विटामिन|\b(cell|element|periodic table|gravity|velocity|friction|dna|atom|electron|proton|neutron|photosynthesis|acid|base|planet|solar system|isro|nasa|vitamin|hormone|chemical|physics|biology)\b/i.test(text)
    ) {
      return 'Science';
    }

    // 4. English / Hindi Verbal patterns & keywords
    if (
      /पर्यायवाची|विलोम|मुहावरे|संधि|समास|अनेकार्थी|शुद्ध\s*वर्तनी|\b(synonym|antonym|spelling|passive voice|indirect speech|idiom|phrase|adjective|preposition|fill in the blank|sentence correction|grammatical|noun|pronoun|verb|adverb|conjunction|tense)\b/i.test(text)
    ) {
      return 'English';
    }
  }

  return 'GK';
}

/**
 * Maps any subject name to one of the 6 allowed QuizKart subjects:
 * ["Reasoning", "Hindi", "English", "Mathematics", "General Knowledge", "General Science"]
 */
export function toAllowedSubject(catStr?: string, contextText?: string): typeof ALLOWED_SUBJECTS[number] {
  if (catStr) {
    const clean = catStr.trim().toLowerCase();
    if (clean === 'hindi' || clean.includes('hindi') || clean.includes('हिंदी') || clean.includes('व्याकरण')) {
      return 'Hindi';
    }
  }
  const norm = normalizeCategory(catStr, contextText);
  if (norm === 'Maths') return 'Mathematics';
  if (norm === 'Reasoning') return 'Reasoning';
  if (norm === 'Science') return 'General Science';
  if (norm === 'English') return 'English';
  return 'General Knowledge';
}

/**
 * Normalizes difficulty into strictly "Easy" | "Medium" | "Hard" | "Expert"
 */
export function normalizeDifficulty(diffStr?: string, defaultDiff: 'Easy' | 'Medium' | 'Hard' | 'Expert' = 'Medium'): 'Easy' | 'Medium' | 'Hard' | 'Expert' {
  if (!diffStr) return defaultDiff;
  const d = diffStr.trim().toLowerCase();
  if (d === 'easy') return 'Easy';
  if (d === 'hard') return 'Hard';
  if (d === 'expert') return 'Expert';
  return 'Medium';
}

/**
 * Helper to normalize option keys: 'A' | 'B' | 'C' | 'D'
 * Supports English letters, numbers (1-4), and Hindi script option markers.
 */
export function normalizeOptionLetter(raw?: string): 'A' | 'B' | 'C' | 'D' | null {
  if (!raw) return null;
  const l = raw.trim().toUpperCase();
  if (l === 'A' || l === '1' || l === 'क' || l === 'अ') return 'A';
  if (l === 'B' || l === '2' || l === 'ख' || l === 'ब') return 'B';
  if (l === 'C' || l === '3' || l === 'ग' || l === 'स') return 'C';
  if (l === 'D' || l === '4' || l === 'घ' || l === 'द') return 'D';
  return null;
}

/**
 * Strips trailing metadata tags (Ans, Subject, Difficulty, Explanation)
 * that may be attached to the end of an option line.
 */
export function cleanTrailingMetadata(rawText: string): {
  cleanText: string;
  trailingAnswer?: string;
  trailingSubject?: string;
  trailingDifficulty?: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  trailingExplanation?: string;
} {
  let text = rawText.trim();
  let trailingAnswer: string | undefined;
  let trailingSubject: string | undefined;
  let trailingDifficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert' | undefined;
  let trailingExplanation: string | undefined;

  // Extract Explanation (typically at the tail end)
  const expMatch = text.match(/(?:[\s,;|]+|^)(?:Explanation|Solution|Exp|Reason|Rationale|व्याख्या|स्पष्टीकरण|हल)\s*[:=\-]\s*(.*)$/i);
  if (expMatch && expMatch.index !== undefined) {
    trailingExplanation = expMatch[1].trim();
    text = text.substring(0, expMatch.index).trim();
  }

  // Extract Difficulty
  const diffMatch = text.match(/(?:[\s,;|]+|^)(?:Difficulty|Level|कठिनाई|स्तर)\s*[:=\-]\s*([A-Za-z\u0900-\u097F]+)/i);
  if (diffMatch && diffMatch.index !== undefined) {
    trailingDifficulty = normalizeDifficulty(diffMatch[1].trim());
    text = text.substring(0, diffMatch.index).trim();
  }

  // Extract Subject
  const subMatch = text.match(/(?:[\s,;|]+|^)(?:Subject|Category|Topic|Sub|विषय|कैटेगरी|टॉपिक)\s*[:=\-]\s*([A-Za-z\u0900-\u097F\s]+)/i);
  if (subMatch && subMatch.index !== undefined) {
    trailingSubject = subMatch[1].trim();
    text = text.substring(0, subMatch.index).trim();
  }

  // Extract Answer
  const ansMatch = text.match(/(?:[\s,;|]+|^)(?:Correct\s*)?(?:Ans(?:wer)?|Correct\s*Option|उत्तर|सही\s*उत्तर|Key)(?:\s*Key)?\s*[:=\-]?\s*(?:Option\s*)?\(?([A-D1-4a-d\u0915-\u0918\u0905-\u0908])\)?(?:[\.\:\)\-\s]*(.*))?$/i);
  if (ansMatch && ansMatch.index !== undefined) {
    trailingAnswer = ansMatch[1].trim();
    text = text.substring(0, ansMatch.index).trim();
  }

  return { cleanText: text.trim(), trailingAnswer, trailingSubject, trailingDifficulty, trailingExplanation };
}

/**
 * Validates a single question item against QuizKart rules.
 * Forgiving for minor schema variations in imported JSON or objects.
 */
export function validateQuestionItem(item: any, questionIndex: number, idOffset: number): ParsedBulkQuestion {
  const errors: QuestionFieldError[] = [];
  const qNum = questionIndex + 1;

  if (!item || typeof item !== 'object') {
    return {
      id: idOffset + questionIndex,
      stem: '',
      question: '',
      options: ['', '', '', ''],
      correctKey: 'A',
      correctIndex: 0,
      explanation: '',
      category: 'GK',
      subject: 'GK',
      difficulty: 'Medium',
      isValid: false,
      validationErrors: [{ field: 'root', message: `Question #${qNum}: Item is not a valid JSON object.` }],
      validationError: `Question #${qNum}: Item is not a valid JSON object.`,
      rawSource: String(item)
    };
  }

  // 1. QUESTION TEXT
  const rawQuestion = item.question !== undefined ? item.question : item.stem;
  let questionText = '';
  if (rawQuestion === undefined || rawQuestion === null || String(rawQuestion).trim() === '') {
    errors.push({
      field: 'question',
      message: `Question #${qNum}: 'question' text is required and cannot be empty.`
    });
  } else {
    questionText = String(rawQuestion).trim();
  }

  // 2. SUBJECT VALIDATION & AUTO-MAPPING
  const rawSubject = item.subject !== undefined ? item.subject : item.category;
  let normCat: QuestionCategory = 'GK';
  if (rawSubject !== undefined && rawSubject !== null && String(rawSubject).trim() !== '') {
    normCat = normalizeCategory(String(rawSubject).trim(), questionText);
  } else {
    normCat = normalizeCategory(undefined, questionText);
  }
  const canonicalSubject = toAllowedSubject(normCat, questionText);

  // 3. DIFFICULTY VALIDATION
  const rawDifficulty = item.difficulty;
  const canonicalDifficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert' = normalizeDifficulty(
    rawDifficulty ? String(rawDifficulty).trim() : undefined,
    'Medium'
  );

  // 4. OPTIONS VALIDATION (A, B, C, D)
  let optA = '';
  let optB = '';
  let optC = '';
  let optD = '';

  if (item.options && typeof item.options === 'object' && !Array.isArray(item.options)) {
    optA = item.options.A !== undefined ? String(item.options.A).trim() : '';
    optB = item.options.B !== undefined ? String(item.options.B).trim() : '';
    optC = item.options.C !== undefined ? String(item.options.C).trim() : '';
    optD = item.options.D !== undefined ? String(item.options.D).trim() : '';
  } else if (Array.isArray(item.options)) {
    if (item.options.length !== 4) {
      errors.push({
        field: 'options',
        message: `Question #${qNum}: Exactly four options (A, B, C, D) are required (found ${item.options.length}).`
      });
    }
    optA = item.options[0] !== undefined ? String(item.options[0]).trim() : '';
    optB = item.options[1] !== undefined ? String(item.options[1]).trim() : '';
    optC = item.options[2] !== undefined ? String(item.options[2]).trim() : '';
    optD = item.options[3] !== undefined ? String(item.options[3]).trim() : '';
  } else {
    errors.push({
      field: 'options',
      message: `Question #${qNum}: 'options' must be an object with keys "A", "B", "C", and "D".`
    });
  }

  const missingOptions: string[] = [];
  if (!optA) missingOptions.push('Option A');
  if (!optB) missingOptions.push('Option B');
  if (!optC) missingOptions.push('Option C');
  if (!optD) missingOptions.push('Option D');

  if (missingOptions.length > 0) {
    errors.push({
      field: 'options',
      message: `Question #${qNum}: Missing or empty: ${missingOptions.join(', ')}.`
    });
  }

  // 5. CORRECT ANSWER VALIDATION
  let answerKey = '';
  let answerText = '';

  if (item.answer && typeof item.answer === 'object') {
    answerKey = item.answer.key !== undefined ? String(item.answer.key).trim().toUpperCase() : '';
    answerText = item.answer.text !== undefined ? String(item.answer.text).trim() : '';
  } else if (typeof item.answer === 'string') {
    const raw = item.answer.trim();
    const parsedKey = normalizeOptionLetter(raw);
    if (parsedKey) {
      answerKey = parsedKey;
    } else {
      answerText = raw;
    }
  } else if (item.correctKey !== undefined) {
    answerKey = String(item.correctKey).trim().toUpperCase();
    answerText = item.correctText !== undefined ? String(item.correctText).trim() : '';
  } else if (item.correctAnswer !== undefined) {
    const raw = String(item.correctAnswer).trim();
    const parsedKey = normalizeOptionLetter(raw);
    if (parsedKey) {
      answerKey = parsedKey;
    } else {
      answerText = raw;
    }
  }

  // Infer answerText from answerKey if missing
  if (['A', 'B', 'C', 'D'].includes(answerKey) && !answerText) {
    answerText = answerKey === 'A' ? optA : answerKey === 'B' ? optB : answerKey === 'C' ? optC : optD;
  }
  // Infer answerKey from answerText if key missing
  if (!answerKey && answerText) {
    const cleanAns = answerText.toLowerCase().trim();
    if (optA && optA.toLowerCase().trim() === cleanAns) answerKey = 'A';
    else if (optB && optB.toLowerCase().trim() === cleanAns) answerKey = 'B';
    else if (optC && optC.toLowerCase().trim() === cleanAns) answerKey = 'C';
    else if (optD && optD.toLowerCase().trim() === cleanAns) answerKey = 'D';
    else answerKey = 'A';
  }
  if (!['A', 'B', 'C', 'D'].includes(answerKey)) {
    answerKey = 'A';
  }

  // 6. EXPLANATION VALIDATION
  const rawExplanation = item.explanation !== undefined ? item.explanation : item.solution;
  let explanationText = '';
  if (rawExplanation !== undefined && rawExplanation !== null && String(rawExplanation).trim() !== '') {
    explanationText = String(rawExplanation).trim();
  } else {
    explanationText = `Option ${answerKey} is the correct answer.`;
  }

  const isValid = errors.length === 0;
  const correctIdx = answerKey === 'B' ? 1 : answerKey === 'C' ? 2 : answerKey === 'D' ? 3 : 0;

  return {
    id: idOffset + questionIndex,
    stem: questionText,
    question: questionText,
    options: [optA, optB, optC, optD],
    correctKey: (['A', 'B', 'C', 'D'].includes(answerKey) ? answerKey : 'A') as 'A' | 'B' | 'C' | 'D',
    correctIndex: correctIdx,
    explanation: explanationText,
    category: normCat,
    subject: normCat,
    difficulty: canonicalDifficulty,
    isValid,
    validationErrors: errors,
    validationError: errors.length > 0 ? errors.map(e => e.message).join(' • ') : undefined,
    rawSource: JSON.stringify(item)
  };
}

/**
 * Shuffles options (A, B, C, D) and updates the correct answer key & index
 * to prevent all questions from defaulting to option A and to ensure diversity across A, B, C, D.
 */
export function shuffleParsedQuestionOptions(q: ParsedBulkQuestion): ParsedBulkQuestion {
  if (!q.options || q.options.length !== 4) return q;
  const originalCorrectIdx = q.correctIndex >= 0 && q.correctIndex < 4 ? q.correctIndex : 0;
  const originalCorrectText = q.options[originalCorrectIdx];

  const pairs = q.options.map((opt, idx) => ({ opt, isCorrect: idx === originalCorrectIdx }));
  // Shuffle array using Fisher-Yates
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }

  const newOptions: [string, string, string, string] = [pairs[0].opt, pairs[1].opt, pairs[2].opt, pairs[3].opt];
  const newCorrectIdx = pairs.findIndex(p => p.isCorrect);
  const keys: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
  const newCorrectKey = keys[newCorrectIdx] || 'A';

  let newExplanation = q.explanation;
  if (/^Option\s+[A-D]\s+is the correct answer\b/i.test(newExplanation)) {
    newExplanation = `Option ${newCorrectKey} is the correct answer. ${originalCorrectText}`;
  }

  return {
    ...q,
    options: newOptions,
    correctKey: newCorrectKey,
    correctIndex: newCorrectIdx,
    explanation: newExplanation
  };
}

/**
 * Parses plain natural text questions with complete flexibility:
 * - Inline options on a single line: A) 100 B) 500 C) 1,000 D) 10,000
 * - Parentheses or brackets: (A) 100 (B) 500 ... or [A] 100 [B] 500 ...
 * - Dotted options: A. 100 B. 500 ...
 * - Multiline options
 * - Paired options across lines (A & B on line 1, C & D on line 2)
 * - Trailing metadata (Ans, Subject, Difficulty, Explanation) on option lines or dedicated lines
 * - Auto-detects Subject metadata tag and maps strictly to Maths, Reasoning, Science, GK, English
 */
export function parseNaturalTextQuestions(text: string, startingIdOffset = 1): ParsedBulkQuestion[] {
  const clean = text.trim();
  if (!clean) return [];

  const lines = clean.split(/\r?\n/);
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  const isQuestionHeaderLine = (l: string): boolean => {
    const t = l.replace(/^\s*[\*\#\-\>]+\s*/, '').replace(/\*\*/g, '').trim();
    // Match headers like "1. ", "1) ", "Q1: ", "Question 1: ", "प्रश्न 1: ", "प्र. 1: ", "[1] ", "(1) "
    return /^(?:(?:\*{1,3})?\s*(?:Question|प्रश्न|प्र\.|Q\.?)\s*\d*[:.)-]?|(?:\*{1,3})?\s*\d+[\.\)\-:]|[\[\(]\s*\d+\s*[\]\)])\s+[^\s]/i.test(t);
  };

  for (const line of lines) {
    if (isQuestionHeaderLine(line) && currentBlock.length > 0) {
      blocks.push(currentBlock);
      currentBlock = [line];
    } else {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  // Fallback 1: If question header markers didn't split (e.g. only 1 block found or questions unnumbered)
  if (blocks.length <= 1) {
    const doubleNewlineBlocks = clean
      .split(/\n\s*\n+/)
      .map(b => b.split(/\r?\n/).filter(l => l.trim().length > 0))
      .filter(b => b.length > 0);
    if (doubleNewlineBlocks.length > 1) {
      blocks.length = 0;
      blocks.push(...doubleNewlineBlocks);
    }
  }

  // Fallback 2: Check for markdown divider lines (---, ===, ___)
  if (blocks.length <= 1) {
    const dividerBlocks = clean
      .split(/\r?\n\s*[-=_*]{3,}\s*\r?\n/)
      .map(b => b.split(/\r?\n/).filter(l => l.trim().length > 0))
      .filter(b => b.length > 0);
    if (dividerBlocks.length > 1) {
      blocks.length = 0;
      blocks.push(...dividerBlocks);
    }
  }

  const results: ParsedBulkQuestion[] = [];

  // Regex to detect option markers in a line:
  // e.g. "A) ", "(A) ", "[A] ", "A. ", "A: ", "A - ", "a) ", "क) ", "1) "
  // Requires whitespace or line boundary before, and whitespace or end of line after
  const OPTION_MARKER_REGEX = /(?:^|[\s\t,;|(])(?:\(([A-Da-d1-4\u0915-\u0918\u0905-\u0908])\)|\[([A-Da-d1-4\u0915-\u0918\u0905-\u0908])\]|([A-Da-d\u0915-\u0918\u0905-\u0908])[\.\:\)\-]|([1-4])\)|(?<=\s)([A-Da-d])[\.\:\)\-])(?:\s+|$)/g;

  blocks.forEach((blockLines, index) => {
    let fullQuestion = '';
    let optA = '';
    let optB = '';
    let optC = '';
    let optD = '';
    let answerKey: 'A' | 'B' | 'C' | 'D' = 'A';
    let answerText = '';
    let explanationText = '';
    let subjectText = '';
    let difficultyText: 'Easy' | 'Medium' | 'Hard' | 'Expert' = 'Medium';

    const questionLines: string[] = [];
    let parsingExplanation = false;

    for (let i = 0; i < blockLines.length; i++) {
      const origLine = blockLines[i].trim();
      if (!origLine) continue;
      const line = origLine
        .replace(/^\s*[\*\-\•\#\>]+\s*/, '')
        .replace(/\*\*/g, '')
        .replace(/__/g, '')
        .trim();

      // 1. Check Subject / Category line
      const subMatch = line.match(/^(?:[\*\-\•\#\>\d\.\)\(\[]+\s*)?(?:Subject|Category|Topic|Sub|विषय|कैटेगरी|टॉपिक)\s*[:=\-]\s*([^\r\n\]]+)/i);
      if (subMatch) {
        parsingExplanation = false;
        subjectText = subMatch[1].replace(/[\*\_\`\[\]]/g, '').trim();
        continue;
      }

      // 2. Check Difficulty line
      const diffMatch = line.match(/^(?:Difficulty|Level|कठिनाई|स्तर)\s*[:=\-]\s*(.+)$/i);
      if (diffMatch) {
        parsingExplanation = false;
        difficultyText = normalizeDifficulty(diffMatch[1].trim());
        continue;
      }

      // 3. Check Explanation line
      const expMatch = line.match(/^(?:Explanation|Solution|Exp|Reason|Rationale|व्याख्या|स्पष्टीकरण|हल)\s*[:=\-]\s*(.*)$/i);
      if (expMatch) {
        parsingExplanation = true;
        explanationText = expMatch[1].trim();
        continue;
      }

      // If already accumulated in explanation mode, continue capturing
      if (parsingExplanation) {
        explanationText += (explanationText ? ' ' : '') + origLine;
        continue;
      }

      // 4. Check dedicated Answer line (e.g. Ans: A, Answer: B, उत्तर: C, सही उत्तर: D)
      const ansMatch = line.match(/^(?:[\*\-\•\#\>\d\.\)\(\[]+\s*)?(?:Correct\s*)?(?:Ans(?:wer)?|Correct\s*Option|उत्तर|सही\s*उत्तर|Key)(?:\s*Key)?\s*[:=\-]?\s*(?:Option\s*)?\(?([A-D1-4a-d\u0915-\u0918\u0905-\u0908])\)?(?:[\.\:\)\-\s]*(.*))?$/i);
      if (ansMatch) {
        const key = normalizeOptionLetter(ansMatch[1]);
        if (key) answerKey = key;
        if (ansMatch[2] && ansMatch[2].trim()) {
          answerText = ansMatch[2].replace(/[\*\_\`\[\]]/g, '').trim();
        }
        continue;
      }

      // 5. Check text-based Answer line (e.g. Answer: 20 or Answer: Option B)
      const textAnsMatch = line.match(/^(?:[\*\-\•\#\>\d\.\)\(\[]+\s*)?(?:Correct\s*)?(?:Ans(?:wer)?|Correct\s*Option|उत्तर|सही\s*उत्तर)(?:\s*Key)?\s*[:=\-]\s*(.+)$/i);
      if (textAnsMatch) {
        const candidate = textAnsMatch[1].replace(/[\*\_\`\[\]]/g, '').trim();
        const letterMatch = candidate.match(/^\(?([A-D1-4a-d\u0915-\u0918\u0905-\u0908])\)?(?:[\.\:\)\-\s]+(.*))?$/i);
        if (letterMatch) {
          const k = normalizeOptionLetter(letterMatch[1]);
          if (k) answerKey = k;
          if (letterMatch[2]) answerText = letterMatch[2].trim();
        } else {
          answerText = candidate;
        }
        continue;
      }

      // 6. Check Option markers in this line (handles inline options, single options, paired options)
      const matches: { key: 'A' | 'B' | 'C' | 'D'; matchStart: number; contentStart: number }[] = [];
      let m: RegExpExecArray | null;
      OPTION_MARKER_REGEX.lastIndex = 0;
      while ((m = OPTION_MARKER_REGEX.exec(line)) !== null) {
        const rawKey = m[1] || m[2] || m[3] || m[4];
        const normKey = normalizeOptionLetter(rawKey);
        if (normKey) {
          matches.push({
            key: normKey,
            matchStart: m.index,
            contentStart: m.index + m[0].length
          });
        }
      }

      if (matches.length > 0) {
        // If there's text preceding the first option marker and question stem not yet captured,
        // that leading text is the question stem (e.g. "1. 640 का 15% कितना है? A) 100 B) 500 ...")
        if (matches[0].matchStart > 0 && questionLines.length === 0) {
          const preStem = line.substring(0, matches[0].matchStart).trim();
          if (preStem) questionLines.push(preStem);
        }

        // Extract each option's text
        for (let mi = 0; mi < matches.length; mi++) {
          const curr = matches[mi];
          const nextStart = mi < matches.length - 1 ? matches[mi + 1].matchStart : line.length;
          const rawOptText = line.substring(curr.contentStart, nextStart).trim();

          // If last match in this line, clean any trailing tags like Ans: A or Subject: Maths
          const isLastInLine = mi === matches.length - 1;
          const cleaned = isLastInLine ? cleanTrailingMetadata(rawOptText) : { cleanText: rawOptText };

          if (curr.key === 'A') optA = cleaned.cleanText;
          else if (curr.key === 'B') optB = cleaned.cleanText;
          else if (curr.key === 'C') optC = cleaned.cleanText;
          else if (curr.key === 'D') optD = cleaned.cleanText;

          if (cleaned.trailingAnswer) {
            const k = normalizeOptionLetter(cleaned.trailingAnswer);
            if (k) answerKey = k;
          }
          if (cleaned.trailingSubject && !subjectText) subjectText = cleaned.trailingSubject;
          if (cleaned.trailingDifficulty && !difficultyText) difficultyText = cleaned.trailingDifficulty;
          if (cleaned.trailingExplanation && !explanationText) explanationText = cleaned.trailingExplanation;
        }
        continue;
      }

      // If no options matched yet and not in explanation, it's question stem
      if (!optA && !optB && !optC && !optD) {
        questionLines.push(origLine);
      }
    }

    // Assemble question stem and clean leading markers (e.g. "1. ", "Q1: ", "Question 1: ", "प्रश्न 1: ")
    fullQuestion = questionLines.join(' ').trim();
    fullQuestion = fullQuestion.replace(/^\*\*|\*\*$/g, '').trim();
    fullQuestion = fullQuestion.replace(/^(?:(?:\*{1,3})?\s*(?:Question|प्रश्न|प्र\.|Q\.?)\s*\d*[:.)-]?|(?:\*{1,3})?\s*\d+[\.\)\-:]|[\[\(]\s*\d+\s*[\]\)])\s*/i, '').trim();
    fullQuestion = fullQuestion.replace(/^Question\s*:\s*/i, '').trim();
    fullQuestion = fullQuestion.replace(/^प्रश्न\s*:\s*/i, '').trim();

    if (!fullQuestion && blockLines.length > 0) {
      fullQuestion = blockLines[0]
        .replace(/^\*\*|\*\*$/g, '')
        .replace(/^(?:(?:\*{1,3})?\s*(?:Question|प्रश्न|प्र\.|Q\.?)\s*\d*[:.)-]?|(?:\*{1,3})?\s*\d+[\.\)\-:]|[\[\(]\s*\d+\s*[\]\)])\s*/i, '')
        .trim();
    }

    // Secondary scan for inline or bracketed subject tag if missing
    if (!subjectText) {
      for (const bLine of blockLines) {
        const inlineSub = bLine.match(/(?:\[|\()?(?:Subject|Category|Topic|विषय)\s*[:=\-]\s*([A-Za-z\u0900-\u097F\s]+)(?:\]|\))?/i);
        if (inlineSub) {
          subjectText = inlineSub[1].replace(/[\*\_\`\[\]]/g, '').trim();
          break;
        }
      }
    }

    // Lookup answer text from options if missing
    if (!answerText) {
      answerText = answerKey === 'A' ? optA : answerKey === 'B' ? optB : answerKey === 'C' ? optC : optD;
    } else {
      // If answerText matches an option text, refine answerKey
      const cleanAns = answerText.toLowerCase().trim();
      if (optA && optA.toLowerCase().trim() === cleanAns) answerKey = 'A';
      else if (optB && optB.toLowerCase().trim() === cleanAns) answerKey = 'B';
      else if (optC && optC.toLowerCase().trim() === cleanAns) answerKey = 'C';
      else if (optD && optD.toLowerCase().trim() === cleanAns) answerKey = 'D';
    }

    // Clean answer text if it includes redundant prefix
    answerText = (answerText || '').replace(/^[A-Da-d][).:\s-]+/, '').trim();

    // Default explanation if missing
    if (!explanationText) {
      explanationText = `Option ${answerKey} is the correct answer.`;
    }

    // Accurately map normalized Category and allowed Subject
    const normCategory = normalizeCategory(subjectText, fullQuestion);
    const allowedSubject = toAllowedSubject(subjectText || normCategory, fullQuestion);
    const id = startingIdOffset + index;

    // Check errors
    const errors: QuestionFieldError[] = [];
    if (!fullQuestion) errors.push({ field: 'question', message: `Question #${index + 1}: Missing question text.` });
    if (!optA) errors.push({ field: 'options', message: `Question #${index + 1}: Missing Option A.` });
    if (!optB) errors.push({ field: 'options', message: `Question #${index + 1}: Missing Option B.` });
    if (!optC) errors.push({ field: 'options', message: `Question #${index + 1}: Missing Option C.` });
    if (!optD) errors.push({ field: 'options', message: `Question #${index + 1}: Missing Option D.` });

    const correctIdx = answerKey === 'B' ? 1 : answerKey === 'C' ? 2 : answerKey === 'D' ? 3 : 0;

    if (fullQuestion || optA || optB) {
      const parsedItem: ParsedBulkQuestion = {
        id,
        stem: fullQuestion,
        question: fullQuestion,
        options: [optA, optB, optC, optD],
        correctKey: answerKey,
        correctIndex: correctIdx,
        explanation: explanationText,
        category: normCategory,
        subject: normCategory, // Directly mapped to canonical 5 subjects (MATHS, REASONING, SCIENCE, GK, ENGLISH)
        difficulty: difficultyText,
        isValid: errors.length === 0,
        validationErrors: errors,
        validationError: errors.length > 0 ? errors.map(e => e.message).join(' • ') : undefined,
        rawSource: blockLines.join('\n')
      };

      // Strict Option Layout Preservation: Retain exact admin-defined option choices (A, B, C, D)
      // and correct answer key without premature shuffling
      results.push(parsedItem);
    }
  });

  return results;
}

/**
 * Validates AI Question text (supporting plain natural text directly without requiring JSON).
 * No JSON syntax errors or malformed JSON containers are shown to users.
 */
export function validateAIQuestionJson(rawText: string, startingIdOffset = 1): BulkValidationReport {
  if (!rawText || !rawText.trim()) {
    return {
      success: false,
      totalParsed: 0,
      validCount: 0,
      invalidCount: 0,
      questions: []
    };
  }

  const text = rawText.trim();
  let questions: ParsedBulkQuestion[] = [];

  // 1. Try JSON parsing first ONLY if text explicitly starts with JSON markers
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const cleanJson = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsedData = JSON.parse(cleanJson);
      let rawQuestions: any[] = [];
      if (Array.isArray(parsedData)) {
        rawQuestions = parsedData;
      } else if (parsedData && typeof parsedData === 'object' && Array.isArray(parsedData.questions)) {
        rawQuestions = parsedData.questions;
      } else if (parsedData && typeof parsedData === 'object' && parsedData.question) {
        rawQuestions = [parsedData];
      }

      if (rawQuestions.length > 0) {
        questions = rawQuestions.map((item, idx) => {
          const validated = validateQuestionItem(item, idx, startingIdOffset);
          return validated.isValid ? shuffleParsedQuestionOptions(validated) : validated;
        });
      }
    } catch {
      // Gracefully fall through to natural text parser
    }
  }

  // 2. If no questions extracted via JSON, parse directly as plain natural text
  if (questions.length === 0) {
    questions = parseNaturalTextQuestions(text, startingIdOffset);
  }

  const validCount = questions.filter(q => q.isValid).length;
  const invalidCount = questions.length - validCount;

  return {
    success: questions.length > 0,
    totalParsed: questions.length,
    validCount,
    invalidCount,
    questions
  };
}

/**
 * Main parser entry point used across QuizKart.
 */
export function parseAIBulkText(
  rawText: string,
  defaultCategory: QuestionCategory = 'GK',
  defaultDifficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium',
  startingIdOffset = 1
): ParsedBulkQuestion[] {
  const report = validateAIQuestionJson(rawText, startingIdOffset);
  return report.questions;
}

/**
 * Example format for documentation & UI previews.
 * (Not automatically inserted into the Question Library).
 */
export const SAMPLE_AI_BULK_INPUT = JSON.stringify({
  questions: [
    {
      subject: "Mathematics",
      difficulty: "Easy",
      question: "What is 12 + 8?",
      options: {
        A: "18",
        B: "20",
        C: "22",
        D: "24"
      },
      answer: {
        key: "B",
        text: "20"
      },
      explanation: "12 + 8 = 20."
    }
  ]
}, null, 2);

/**
 * Strict AI Question Generation Prompt for ChatGPT / Gemini.
 * Fulfills all Prompt 3 requirements:
 * - Generates requested number of questions
 * - Assigns valid subject and difficulty per question
 * - 4 options A, B, C, D
 * - Correct answer key and matching text
 * - Verified explanation
 * - Avoids intro text & markdown fences
 * - Strictly enforces non-empty fields
 */
export const CHATGPT_PROMPT_TEMPLATE = `Please generate [NUMBER, e.g. 10] competitive multiple choice quiz questions for QuizKart in strict JSON format.

CRITICAL RULES & CONSTRAINTS:
1. Return ONLY valid JSON matching the exact schema below.
2. Do NOT include any introductory greetings, conclusions, notes, or markdown commentary.
3. Do NOT wrap output in Markdown code fences (do not use \`\`\`json or \`\`\`). Return pure raw JSON starting with { and ending with }.
4. Every single question in the "questions" array MUST include all 6 fields:
   - "subject": Must be strictly one of: "Reasoning", "Hindi", "English", "Mathematics", "General Knowledge", "General Science". Assign a valid subject to every question.
   - "difficulty": Must be strictly one of: "Easy", "Medium", "Hard", "Expert". Assign a valid difficulty to every question.
   - "question": Clear, unambiguous, non-empty question text.
   - "options": An object containing exactly four non-empty choices with keys "A", "B", "C", and "D".
   - "answer": An object with "key" ("A", "B", "C", or "D") and "text". The "text" MUST EXACTLY match the text of the selected option letter.
   - "explanation": Step-by-step verified explanation. Never leave empty.
5. Never omit required fields or invent missing answers.

REQUIRED JSON STRUCTURE:
{
  "questions": [
    {
      "subject": "Mathematics",
      "difficulty": "Easy",
      "question": "What is 12 + 8?",
      "options": {
        "A": "18",
        "B": "20",
        "C": "22",
        "D": "24"
      },
      "answer": {
        "key": "B",
        "text": "20"
      },
      "explanation": "12 + 8 = 20."
    }
  ]
}`;
