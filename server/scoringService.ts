/**
 * QuizKart Server-Authoritative Scoring Engine
 * 
 * Strict Fixed-Precision Integer Centipoint Scoring Rules:
 * - Each Correct Answer = +100 centipoints (+1.00 score)
 * - Each Wrong Answer = -33 centipoints (-0.33 score)
 * - Unanswered = 0 centipoints
 * - rawCentipoints = (correctCount * 100) - (wrongCount * 33)
 * - finalCentipoints = Math.max(0, rawCentipoints) (Non-negative bound)
 * - finalScore = Number((finalCentipoints / 100).toFixed(2))
 * 
 * Mandated Integer Accuracy Formula:
 * - accuracyPercent = attemptedCount === 0 
 *     ? 0 
 *     : Math.floor((correctCount * 100 + Math.floor(attemptedCount / 2)) / attemptedCount)
 */

export interface AuthoritativeQuestion {
  id: number | string;
  correctIndex: number;
  stem?: string;
  question?: string;
}

export interface ScoreEvaluationInput {
  totalQuestions: number;
  answers: Record<string | number, number>; // questionId -> selectedIndex
  authoritativeQuestions?: AuthoritativeQuestion[];
  // If questions are already provided as an answer key map: questionId -> correctIndex
  answerKey?: Record<string | number, number>;
}

export interface ScoreEvaluationResult {
  totalQuestions: number;
  attemptedCount: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  rawCentipoints: number;
  finalCentipoints: number;
  finalScore: number;
  accuracy: number; // percentage integer 0-100
  questionEvaluations: {
    questionId: string | number;
    selectedIndex: number | null;
    correctIndex: number;
    isCorrect: boolean;
    isAttempted: boolean;
    centipoints: number;
  }[];
}

/**
 * Deterministic integer accuracy formula approved by QuizKart specification
 */
export function calculateAccuracyPercent(correctCount: number, attemptedCount: number): number {
  if (attemptedCount <= 0) return 0;
  return Math.floor(
    (correctCount * 100 + Math.floor(attemptedCount / 2)) / attemptedCount
  );
}

/**
 * Pure fixed-precision scoring function.
 * Evaluates submitted answers against authoritative question answer keys.
 */
export function evaluateQuizSubmission(input: ScoreEvaluationInput): ScoreEvaluationResult {
  const { totalQuestions, answers, authoritativeQuestions, answerKey } = input;

  // Build answer key lookup
  const keyMap = new Map<string | number, number>();
  if (answerKey) {
    for (const [k, v] of Object.entries(answerKey)) {
      keyMap.set(k, Number(v));
      // Also index by numeric or string variant for reliable lookup
      const numKey = Number(k);
      if (!isNaN(numKey)) keyMap.set(numKey, Number(v));
    }
  } else if (authoritativeQuestions) {
    for (const q of authoritativeQuestions) {
      keyMap.set(q.id, q.correctIndex);
      const numKey = Number(q.id);
      if (!isNaN(numKey)) keyMap.set(numKey, q.correctIndex);
    }
  }

  let correctCount = 0;
  let wrongCount = 0;
  let attemptedCount = 0;

  const questionEvaluations: ScoreEvaluationResult['questionEvaluations'] = [];

  // If questions list is provided, iterate over each known question
  if (authoritativeQuestions && authoritativeQuestions.length > 0) {
    for (const q of authoritativeQuestions) {
      const qId = q.id;
      const selected = answers[qId] ?? answers[String(qId)] ?? answers[Number(qId)];
      const hasAnswer = selected !== undefined && selected !== null && selected >= 0;
      const correctIdx = q.correctIndex;

      if (hasAnswer) {
        attemptedCount++;
        const isCorrect = Number(selected) === correctIdx;
        if (isCorrect) {
          correctCount++;
          questionEvaluations.push({
            questionId: qId,
            selectedIndex: Number(selected),
            correctIndex: correctIdx,
            isCorrect: true,
            isAttempted: true,
            centipoints: 100
          });
        } else {
          wrongCount++;
          questionEvaluations.push({
            questionId: qId,
            selectedIndex: Number(selected),
            correctIndex: correctIdx,
            isCorrect: false,
            isAttempted: true,
            centipoints: -33
          });
        }
      } else {
        questionEvaluations.push({
          questionId: qId,
          selectedIndex: null,
          correctIndex: correctIdx,
          isCorrect: false,
          isAttempted: false,
          centipoints: 0
        });
      }
    }
  } else {
    // Evaluate based on answerKey
    for (const [qKey, selectedVal] of Object.entries(answers)) {
      const correctIdx = keyMap.get(qKey) ?? keyMap.get(Number(qKey));
      if (correctIdx !== undefined) {
        attemptedCount++;
        const isCorrect = Number(selectedVal) === correctIdx;
        if (isCorrect) {
          correctCount++;
          questionEvaluations.push({
            questionId: qKey,
            selectedIndex: Number(selectedVal),
            correctIndex: correctIdx,
            isCorrect: true,
            isAttempted: true,
            centipoints: 100
          });
        } else {
          wrongCount++;
          questionEvaluations.push({
            questionId: qKey,
            selectedIndex: Number(selectedVal),
            correctIndex: correctIdx,
            isCorrect: false,
            isAttempted: true,
            centipoints: -33
          });
        }
      }
    }
  }

  const effectiveTotal = Math.max(totalQuestions, attemptedCount, questionEvaluations.length);
  const unansweredCount = Math.max(0, effectiveTotal - attemptedCount);

  // Centipoint calculations
  const rawCentipoints = (correctCount * 100) - (wrongCount * 33);
  const finalCentipoints = Math.max(0, rawCentipoints);
  const finalScore = Number((finalCentipoints / 100).toFixed(2));
  const accuracy = calculateAccuracyPercent(correctCount, attemptedCount);

  return {
    totalQuestions: effectiveTotal,
    attemptedCount,
    correctCount,
    wrongCount,
    unansweredCount,
    rawCentipoints,
    finalCentipoints,
    finalScore,
    accuracy,
    questionEvaluations
  };
}
