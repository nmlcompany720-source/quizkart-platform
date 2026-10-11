import { Question } from '../types';

export interface ParsedBulkQuestion {
  id: number;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  category: Question['category'];
  explanation: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  isValid: boolean;
  validationError?: string;
  rawSource?: string;
}

/**
 * Parses raw text copied from ChatGPT, Gemini, or Claude into structured QuizKart questions.
 * Handles formats:
 * - Question Stem
 * - A) Option 1 ... D) Option 4
 * - Answer: Correct Option / Letter
 * - Explanation: Details
 * - Difficulty: Easy / Medium / Hard / Expert (optional, or auto-tagged via 3-3-3-1 cycle)
 */
export function parseAIBulkText(
  rawText: string,
  defaultCategory: Question['category'] = 'General Knowledge',
  defaultDifficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert' = 'Medium'
): ParsedBulkQuestion[] {
  if (!rawText || !rawText.trim()) return [];

  // Normalize line breaks
  let text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  // If questions don't have double line breaks between them, insert line breaks before numbered questions
  // Matches: 1. Question, Q1: Question, Question 1:
  text = text.replace(/([^\n])\n(\s*(?:Question\s*\d+[:\.]?|\d+[\.\)]|Q\d+[:\.]?)\s+)/gi, '$1\n\n$2');

  const blocks = text.split(/\n\s*\n+/).filter(b => b.trim().length > 0);
  const parsedList: ParsedBulkQuestion[] = [];

  blocks.forEach((block, bIdx) => {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;

    let questionStem = '';
    const rawOptions: { letter: string; text: string }[] = [];
    let answerRaw = '';
    let explanation = '';
    let parsedDifficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert' | null = null;

    for (const line of lines) {
      // Check Difficulty line: Difficulty: Easy | Medium | Hard | Expert
      const diffMatch = line.match(/^(?:Difficulty|Tier|Level)[\s\:\-]+(Easy|Medium|Hard|Expert)/i);
      if (diffMatch) {
        const d = diffMatch[1].toLowerCase();
        if (d === 'easy') parsedDifficulty = 'Easy';
        else if (d === 'medium') parsedDifficulty = 'Medium';
        else if (d === 'hard') parsedDifficulty = 'Hard';
        else if (d === 'expert') parsedDifficulty = 'Expert';
        continue;
      }

      // Check option pattern: A) or A. or (A) or [A] or A: or a)
      const optMatch = line.match(/^[\(\[]?([A-Da-d])[\)\]\.\:\-]\s*(.+)$/);
      if (optMatch) {
        rawOptions.push({
          letter: optMatch[1].toUpperCase(),
          text: optMatch[2].trim()
        });
        continue;
      }

      // Check Answer pattern: Answer: or Ans: or Correct: or Correct Answer: or Key:
      const ansMatch = line.match(/^(?:Answer|Ans|Correct\s*Answer|Correct\s*Option|Key)[\s\:\-]+(.+)$/i);
      if (ansMatch) {
        answerRaw = ansMatch[1].trim();
        continue;
      }

      // Check Explanation pattern: Explanation: or Exp: or Reason: or Note:
      const expMatch = line.match(/^(?:Explanation|Explain|Reason|Note)[\s\:\-]+(.+)$/i);
      if (expMatch) {
        explanation = expMatch[1].trim();
        continue;
      }

      // If we haven't seen any options yet, this line is part of the question stem
      if (rawOptions.length === 0) {
        // Strip leading numbers: "1. ", "1) ", "Q1: ", "Question 1: "
        const cleanedStem = line.replace(/^(?:Question\s*\d+[\:\.]?\s*|Q\d+[\:\.]?\s*|\d+[\.\)]\s*)/i, '').trim();
        if (cleanedStem) {
          questionStem = questionStem ? `${questionStem} ${cleanedStem}` : cleanedStem;
        }
      } else if (answerRaw && !explanation) {
        // If line occurs after answer without explicit 'Explanation:' prefix, treat as explanation
        explanation = explanation ? `${explanation} ${line}` : line;
      }
    }

    // Determine 4 distinct options
    const optA = rawOptions.find(o => o.letter === 'A')?.text || rawOptions[0]?.text || '';
    const optB = rawOptions.find(o => o.letter === 'B')?.text || rawOptions[1]?.text || '';
    const optC = rawOptions.find(o => o.letter === 'C')?.text || rawOptions[2]?.text || '';
    const optD = rawOptions.find(o => o.letter === 'D')?.text || rawOptions[3]?.text || '';

    // Determine correctIndex (0 = A, 1 = B, 2 = C, 3 = D)
    let correctIdx = 0;
    if (answerRaw) {
      // 1. Try matching by leading letter (e.g. "B", "B) Option text", "B.", "(B)")
      const letterMatch = answerRaw.match(/^[(\[]?([A-Da-d])[)\]\.\:\-]?/);
      if (letterMatch) {
        const char = letterMatch[1].toUpperCase();
        if (char === 'A') correctIdx = 0;
        else if (char === 'B') correctIdx = 1;
        else if (char === 'C') correctIdx = 2;
        else if (char === 'D') correctIdx = 3;
      } else {
        // 2. Try matching exact or partial option text
        const cleanAns = answerRaw.toLowerCase().trim();
        if (cleanAns && optA && cleanAns === optA.toLowerCase().trim()) correctIdx = 0;
        else if (cleanAns && optB && cleanAns === optB.toLowerCase().trim()) correctIdx = 1;
        else if (cleanAns && optC && cleanAns === optC.toLowerCase().trim()) correctIdx = 2;
        else if (cleanAns && optD && cleanAns === optD.toLowerCase().trim()) correctIdx = 3;
        else if (cleanAns && optA && optA.toLowerCase().includes(cleanAns)) correctIdx = 0;
        else if (cleanAns && optB && optB.toLowerCase().includes(cleanAns)) correctIdx = 1;
        else if (cleanAns && optC && optC.toLowerCase().includes(cleanAns)) correctIdx = 2;
        else if (cleanAns && optD && optD.toLowerCase().includes(cleanAns)) correctIdx = 3;
      }
    }

    // Validation checks
    const hasStem = questionStem.trim().length > 3;
    const hasAllOptions = Boolean(optA && optB && optC && optD);
    const isValid = hasStem && hasAllOptions;

    let validationError = '';
    if (!hasStem) {
      validationError = 'Missing question stem.';
    } else if (!hasAllOptions) {
      validationError = `Found ${rawOptions.length} of 4 required options (A-D).`;
    }

    // Auto-assign 3-3-3-1 skill-based ratio if difficulty not explicitly given
    let finalDifficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert' = parsedDifficulty || defaultDifficulty;
    if (!parsedDifficulty) {
      const pos = bIdx % 10;
      if (pos < 3) finalDifficulty = 'Easy';
      else if (pos < 6) finalDifficulty = 'Medium';
      else if (pos < 9) finalDifficulty = 'Hard';
      else finalDifficulty = 'Expert';
    }

    // If stem has "Tie-Breaker" or "Expert", mark Expert
    if (/expert|tie-breaker/i.test(questionStem)) {
      finalDifficulty = 'Expert';
    }

    parsedList.push({
      id: Date.now() + bIdx,
      question: questionStem || `Question ${bIdx + 1}`,
      options: [optA || 'Option A', optB || 'Option B', optC || 'Option C', optD || 'Option D'],
      correctIndex: correctIdx,
      category: defaultCategory,
      explanation: explanation || 'Fact-checked for QuizKart competitive arena.',
      difficulty: finalDifficulty,
      isValid,
      validationError,
      rawSource: block
    });
  });

  return parsedList;
}

export const SAMPLE_AI_BULK_INPUT = `1. Which Indian city is famously known as the 'Silicon Valley of India'?
A) Hyderabad
B) Bengaluru
C) Pune
D) Chennai
Answer: B) Bengaluru
Explanation: Bengaluru is India's leading information technology exporter and tech capital.

2. What is the standard national currency of Japan?
A) Yuan
B) Won
C) Yen
D) Ringgit
Answer: C) Yen
Explanation: The Yen is the official currency of Japan, introduced in 1871.

3. Which layer of the Earth's atmosphere contains the Ozone Layer?
A) Troposphere
B) Stratosphere
C) Mesosphere
D) Thermosphere
Answer: B) Stratosphere
Explanation: The ozone layer is located in the lower portion of the stratosphere.

4. Who wrote the national song of India 'Vande Mataram'?
A) Rabindranath Tagore
B) Bankim Chandra Chattopadhyay
C) Sarojini Naidu
D) Sri Aurobindo
Answer: B) Bankim Chandra Chattopadhyay
Explanation: Written by Bankim Chandra in his 1882 novel Anandamath.

5. What is the chemical symbol for Gold on the Periodic Table?
A) Ag
B) Au
C) Fe
D) Cu
Answer: B) Au
Explanation: The symbol Au is derived from the Latin word 'Aurum', meaning shining dawn.

6. Which planet in our solar system has the highest number of confirmed moons?
A) Jupiter
B) Saturn
C) Uranus
D) Neptune
Answer: B) Saturn
Explanation: Saturn has 146 recognized natural satellites as verified by the IAU.

7. In which year was the Reserve Bank of India (RBI) established?
A) 1935
B) 1947
C) 1950
D) 1929
Answer: A) 1935
Explanation: The RBI was established on April 1, 1935, under the Reserve Bank of India Act.

8. Which Indian state has the longest mainland coastline?
A) Maharashtra
B) Tamil Nadu
C) Gujarat
D) Andhra Pradesh
Answer: C) Gujarat
Explanation: Gujarat possesses a mainland coastline of approximately 1,600 kilometers.

9. What is the fundamental unit of heredity in all living organisms?
A) Chromosome
B) Gene
C) Ribosome
D) Mitochondria
Answer: B) Gene
Explanation: Genes carry the information determining biological traits.

10. Which is the highest civilian award in the Republic of India?
A) Padma Vibhushan
B) Bharat Ratna
C) Param Vir Chakra
D) Padma Bhushan
Answer: B) Bharat Ratna
Explanation: The Bharat Ratna was instituted in 1954 for exceptional service.`;

export const CHATGPT_PROMPT_TEMPLATE = `Please generate 10 competitive multiple choice quiz questions for QuizKart in this exact format:

1. [Question Text]
A) [Choice 1]
B) [Choice 2]
C) [Choice 3]
D) [Choice 4]
Answer: [Correct Option Letter and Text, e.g. B) Option Text]
Explanation: [Fact check reference details]

Ensure all questions are factual, have 4 distinct choices, and cover General Knowledge, Science, or Indian Heritage.`;
