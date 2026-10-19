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
export function normalizeCategory(catStr?: string, contextText?: string): QuestionCategory {
  if (catStr) {
    const clean = catStr.trim().toLowerCase();
    if (clean === 'maths' || clean === 'math' || clean === 'mathematics' || clean.includes('arithmetic') || clean.includes('algebra') || clean.includes('quant')) {
      return 'Maths';
    }
    if (clean === 'reasoning' || clean.includes('logic') || clean.includes('aptitude') || clean.includes('analogy') || clean.includes('puzzle') || clean.includes('syllogism')) {
      return 'Reasoning';
    }
    if (clean === 'science' || clean === 'general science' || clean.includes('physics') || clean.includes('chemistry') || clean.includes('biology') || clean.includes('tech') || clean.includes('space') || clean.includes('astronomy')) {
      return 'Science';
    }
    if (clean === 'english' || clean.includes('grammar') || clean.includes('vocab') || clean.includes('verbal') || clean.includes('synonym') || clean.includes('comprehension')) {
      return 'English';
    }
    if (clean === 'gk' || clean === 'general knowledge' || clean.includes('history') || clean.includes('heritage') || clean.includes('geography') || clean.includes('polity') || clean.includes('current affairs')) {
      return 'GK';
    }
    if (clean === 'hindi' || clean.includes('hindi') || clean.includes('vyakaran')) {
      return 'English'; // Map Hindi language questions to verbal bucket for balance if needed
    }
  }

  // Fallback: heuristic scan of question text & context
  if (contextText) {
    const text = contextText.toLowerCase();
    if (/\b(solve|equation|ratio|percentage|perimeter|area|triangle|prime number|hcf|lcm|algebra|profit|loss|simple interest|compound interest|speed|distance)\b/i.test(text)) {
      return 'Maths';
    }
    if (/\b(series|pattern|odd one out|coding-decoding|blood relation|direction|seating|syllogism|analogy|venn|statement and conclusion)\b/i.test(text)) {
      return 'Reasoning';
    }
    if (/\b(cell|element|periodic table|gravity|velocity|friction|dna|atom|electron|proton|neutron|photosynthesis|acid|base|planet|solar system|isro|nasa)\b/i.test(text)) {
      return 'Science';
    }
    if (/\b(synonym|antonym|spelling|passive voice|indirect speech|idiom|phrase|adjective|preposition|fill in the blank|sentence correction|grammatical)\b/i.test(text)) {
      return 'English';
    }
  }

  return 'GK';
}

/**
 * Maps any subject name to one of the 6 allowed QuizKart subjects:
 * ["Reasoning", "Hindi", "English", "Mathematics", "General Knowledge", "General Science"]
 */
export function toAllowedSubject(catStr?: string): typeof ALLOWED_SUBJECTS[number] {
  if (!catStr) return 'General Knowledge';
  const clean = catStr.trim().toLowerCase();
  if (clean === 'hindi' || clean.includes('hindi') || clean.includes('vyakaran')) {
    return 'Hindi';
  }
  if (clean === 'maths' || clean === 'math' || clean === 'mathematics' || clean.includes('arithmetic') || clean.includes('algebra') || clean.includes('quant')) {
    return 'Mathematics';
  }
  if (clean === 'reasoning' || clean.includes('logic') || clean.includes('aptitude') || clean.includes('analogy') || clean.includes('puzzle') || clean.includes('syllogism')) {
    return 'Reasoning';
  }
  if (clean === 'science' || clean === 'general science' || clean.includes('physics') || clean.includes('chemistry') || clean.includes('biology') || clean.includes('tech')) {
    return 'General Science';
  }
  if (clean === 'english' || clean.includes('grammar') || clean.includes('vocab') || clean.includes('verbal') || clean.includes('synonym')) {
    return 'English';
  }
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
 * Validates a single question item against all Prompt 3 requirements:
 * 1. Subject: Must be Reasoning, Hindi, English, Mathematics, General Knowledge, or General Science.
 * 2. Difficulty: Must be Easy, Medium, Hard, or Expert.
 * 3. Question text: Non-empty.
 * 4. Exactly four options: A, B, C, D (non-empty).
 * 5. Correct answer: key ('A', 'B', 'C', 'D') and matching text.
 * 6. Explanation: Non-empty.
 * 
 * NOTE: Does NOT silently change answers, subjects, difficulty levels, or explanations.
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
      category: '',
      subject: '',
      difficulty: 'Medium',
      isValid: false,
      validationErrors: [{ field: 'root', message: `Question #${qNum}: Item is not a valid JSON object.` }],
      validationError: `Question #${qNum}: Item is not a valid JSON object.`,
      rawSource: String(item)
    };
  }

  // 1. SUBJECT VALIDATION
  const rawSubject = item.subject !== undefined ? item.subject : item.category;
  let subjectStr = '';
  let canonicalSubject = '';

  if (rawSubject === undefined || rawSubject === null || String(rawSubject).trim() === '') {
    errors.push({
      field: 'subject',
      message: `Question #${qNum}: 'subject' is required. Must be one of: ${ALLOWED_SUBJECTS.join(', ')}.`
    });
  } else {
    subjectStr = String(rawSubject).trim();
    const matched = ALLOWED_SUBJECTS.find(s => s.toLowerCase() === subjectStr.toLowerCase());
    if (!matched) {
      errors.push({
        field: 'subject',
        message: `Question #${qNum}: Invalid subject "${subjectStr}". Allowed subjects: ${ALLOWED_SUBJECTS.join(', ')}.`
      });
    } else {
      canonicalSubject = matched;
    }
  }

  // 2. DIFFICULTY VALIDATION
  const rawDifficulty = item.difficulty;
  let diffStr = '';
  let canonicalDifficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert' = 'Medium';

  if (rawDifficulty === undefined || rawDifficulty === null || String(rawDifficulty).trim() === '') {
    errors.push({
      field: 'difficulty',
      message: `Question #${qNum}: 'difficulty' is required. Must be one of: ${ALLOWED_DIFFICULTIES.join(', ')}.`
    });
  } else {
    diffStr = String(rawDifficulty).trim();
    const matchedDiff = ALLOWED_DIFFICULTIES.find(d => d.toLowerCase() === diffStr.toLowerCase());
    if (!matchedDiff) {
      errors.push({
        field: 'difficulty',
        message: `Question #${qNum}: Invalid difficulty "${diffStr}". Allowed difficulties: ${ALLOWED_DIFFICULTIES.join(', ')}.`
      });
    } else {
      canonicalDifficulty = matchedDiff;
    }
  }

  // 3. QUESTION TEXT
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

  // 4. OPTIONS VALIDATION (Exactly four options A, B, C, D)
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

  // 5. CORRECT ANSWER VALIDATION (Letter and matching text)
  let answerKey = '';
  let answerText = '';

  if (item.answer && typeof item.answer === 'object') {
    answerKey = item.answer.key !== undefined ? String(item.answer.key).trim().toUpperCase() : '';
    answerText = item.answer.text !== undefined ? String(item.answer.text).trim() : '';
  } else if (item.correctKey !== undefined) {
    answerKey = String(item.correctKey).trim().toUpperCase();
    answerText = item.correctText !== undefined ? String(item.correctText).trim() : '';
  } else {
    errors.push({
      field: 'answer',
      message: `Question #${qNum}: 'answer' must be an object with "key" and "text" fields.`
    });
  }

  if (!['A', 'B', 'C', 'D'].includes(answerKey)) {
    errors.push({
      field: 'answer.key',
      message: `Question #${qNum}: Answer key must be 'A', 'B', 'C', or 'D' (received: "${answerKey || 'empty'}").`
    });
  }

  if (!answerText) {
    errors.push({
      field: 'answer.text',
      message: `Question #${qNum}: Answer text is required and cannot be empty.`
    });
  }

  // Validate answer text matches selected option
  if (['A', 'B', 'C', 'D'].includes(answerKey) && answerText) {
    const selectedOptionText = answerKey === 'A' ? optA : answerKey === 'B' ? optB : answerKey === 'C' ? optC : optD;
    if (selectedOptionText && selectedOptionText.toLowerCase() !== answerText.toLowerCase()) {
      errors.push({
        field: 'answer.text',
        message: `Question #${qNum}: Answer text ("${answerText}") does not match selected Option ${answerKey} ("${selectedOptionText}").`
      });
    }
  }

  // 6. EXPLANATION VALIDATION
  const rawExplanation = item.explanation !== undefined ? item.explanation : item.solution;
  let explanationText = '';
  if (rawExplanation === undefined || rawExplanation === null || String(rawExplanation).trim() === '') {
    errors.push({
      field: 'explanation',
      message: `Question #${qNum}: 'explanation' is required and cannot be empty.`
    });
  } else {
    explanationText = String(rawExplanation).trim();
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
    category: canonicalSubject || subjectStr || 'General Knowledge',
    subject: canonicalSubject || subjectStr || 'General Knowledge',
    difficulty: canonicalDifficulty,
    isValid,
    validationErrors: errors,
    validationError: errors.length > 0 ? errors.map(e => e.message).join(' • ') : undefined,
    rawSource: JSON.stringify(item)
  };
}

/**
 * Validates AI Question JSON with comprehensive syntax checking, field validation,
 * error identification, and summary counts.
 */
/**
 * Parses plain natural text questions without requiring JSON brackets or HTML tags.
 */
export function parseNaturalTextQuestions(text: string, startingIdOffset = 1): ParsedBulkQuestion[] {
  const clean = text.trim();
  if (!clean) return [];

  const lines = clean.split(/\r?\n/);
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  const isNewQuestionLine = (l: string): boolean => {
    const t = l.replace(/^\s*[\*\#\-\>]+\s*/, '').replace(/\*\*/g, '').trim();
    return /^(?:Question\s*\d*[:.)-]?|\bQ\d*[:.)-]?|\d+[\.\)\-:])\s+[^\s]/i.test(t);
  };

  for (const line of lines) {
    if (isNewQuestionLine(line) && currentBlock.length > 0) {
      blocks.push(currentBlock);
      currentBlock = [line];
    } else {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  // If no blocks split by question markers, try splitting by double newline
  let finalBlocks = blocks;
  if (finalBlocks.length <= 1) {
    const doubleNewlineBlocks = clean.split(/\n\s*\n+/).map(b => b.split(/\r?\n/).filter(l => l.trim().length > 0));
    if (doubleNewlineBlocks.length > 1) {
      finalBlocks = doubleNewlineBlocks;
    }
  }

  const results: ParsedBulkQuestion[] = [];

  finalBlocks.forEach((blockLines, index) => {
    let questionText = '';
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
    let parsingOptions = false;
    let parsingExplanation = false;

    for (let i = 0; i < blockLines.length; i++) {
      const origLine = blockLines[i].trim();
      if (!origLine) continue;
      const line = origLine.replace(/^\s*[\#\-\>]\s*/, '').replace(/\*\*/g, '').replace(/__/g, '').trim();

      // Check Option lines: e.g. A) ..., A. ..., (A) ...
      const optMatch = line.match(/^\(?([A-D])\)?[\.\:\)\-]\s*(.*)$/i);
      if (optMatch) {
        parsingOptions = true;
        parsingExplanation = false;
        const letter = optMatch[1].toUpperCase();
        const content = optMatch[2].trim();
        if (letter === 'A') optA = content;
        else if (letter === 'B') optB = content;
        else if (letter === 'C') optC = content;
        else if (letter === 'D') optD = content;
        continue;
      }

      // Check inline options: A) ... B) ... C) ... D) ...
      if (/\bA[\.\)]\s*.+\bB[\.\)]\s*.+\bC[\.\)]\s*.+\bD[\.\)]\s*/i.test(line)) {
        parsingOptions = true;
        parsingExplanation = false;
        const aM = line.match(/\bA[\.\)]\s*([^BCD]+?)(?=\bB[\.\)]|$)/i);
        const bM = line.match(/\bB[\.\)]\s*([^CD]+?)(?=\bC[\.\)]|$)/i);
        const cM = line.match(/\bC[\.\)]\s*([^D]+?)(?=\bD[\.\)]|$)/i);
        const dM = line.match(/\bD[\.\)]\s*(.+)$/i);
        if (aM) optA = aM[1].trim();
        if (bM) optB = bM[1].trim();
        if (cM) optC = cM[1].trim();
        if (dM) optD = dM[1].trim();
        continue;
      }

      // Check Answer line: e.g. Answer: B, Ans: B) Paris, Correct Answer: C, Answer Key: B
      const ansMatch = line.match(/^(?:Correct\s*)?Ans(?:wer)?(?:\s*Key)?\s*[:=\-]?\s*(?:Option\s*)?\(?([A-D])\)?(?:[\.\:\)\-\s]*(.*))?$/i);
      if (ansMatch) {
        parsingOptions = false;
        parsingExplanation = false;
        const key = ansMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
        if (['A', 'B', 'C', 'D'].includes(key)) {
          answerKey = key;
        }
        if (ansMatch[2] && ansMatch[2].trim()) {
          answerText = ansMatch[2].trim();
        }
        continue;
      }

      // Check Subject / Category line:
      const subMatch = line.match(/^(?:Subject|Category|Topic)\s*[:=\-]?\s*(.+)$/i);
      if (subMatch) {
        parsingOptions = false;
        parsingExplanation = false;
        subjectText = subMatch[1].trim();
        continue;
      }

      // Check Difficulty line:
      const diffMatch = line.match(/^(?:Difficulty|Level)\s*[:=\-]?\s*(.+)$/i);
      if (diffMatch) {
        parsingOptions = false;
        parsingExplanation = false;
        difficultyText = normalizeDifficulty(diffMatch[1].trim());
        continue;
      }

      // Check Explanation line:
      const expMatch = line.match(/^(?:Explanation|Solution|Exp|Reason|Rationale)\s*[:=\-]?\s*(.*)$/i);
      if (expMatch) {
        parsingOptions = false;
        parsingExplanation = true;
        explanationText = expMatch[1].trim();
        continue;
      }

      // If parsing explanation, accumulate lines
      if (parsingExplanation) {
        explanationText += (explanationText ? ' ' : '') + origLine;
        continue;
      }

      // If options haven't started yet, this line is part of question stem
      if (!parsingOptions) {
        questionLines.push(origLine);
      }
    }

    // Assemble question stem and clean leading markers (e.g. "1. Question: ", "Q1: ", "1. ", "**Question 1:** ")
    let fullQuestion = questionLines.join(' ').trim();
    fullQuestion = fullQuestion.replace(/^\*\*|\*\*$/g, '').trim();
    fullQuestion = fullQuestion.replace(/^(?:Question\s*\d*[:.)-]?|\bQ\d*[:.)-]?|\d+[\.\)\-:])\s*/i, '').trim();
    fullQuestion = fullQuestion.replace(/^Question\s*:\s*/i, '').trim();

    if (!fullQuestion && blockLines.length > 0) {
      fullQuestion = blockLines[0].replace(/^\*\*|\*\*$/g, '').replace(/^(?:Question\s*\d*[:.)-]?|\bQ\d*[:.)-]?|\d+[\.\)\-:])\s*/i, '').trim();
    }

    // Lookup answer text from options if missing
    if (!answerText) {
      answerText = answerKey === 'A' ? optA : answerKey === 'B' ? optB : answerKey === 'C' ? optC : optD;
    }

    // Clean answer text if it includes redundant prefix
    answerText = (answerText || '').replace(/^[A-Da-d][).:\s-]+/, '').trim();

    // Default explanation if missing
    if (!explanationText) {
      explanationText = `Option ${answerKey} is the correct answer.`;
    }

    const normCategory = toAllowedSubject(subjectText || fullQuestion);
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
      results.push({
        id,
        stem: fullQuestion,
        question: fullQuestion,
        options: [optA, optB, optC, optD],
        correctKey: answerKey,
        correctIndex: correctIdx,
        explanation: explanationText,
        category: normCategory,
        subject: normCategory,
        difficulty: difficultyText,
        isValid: errors.length === 0,
        validationErrors: errors,
        validationError: errors.length > 0 ? errors.map(e => e.message).join(' • ') : undefined,
        rawSource: blockLines.join('\n')
      });
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
        questions = rawQuestions.map((item, idx) => validateQuestionItem(item, idx, startingIdOffset));
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
