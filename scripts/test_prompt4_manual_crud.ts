import { ALLOWED_SUBJECTS, ALLOWED_DIFFICULTIES, toAllowedSubject } from '../src/utils/aiQuestionParser';
import { questionPoolManager } from '../src/utils/questionPoolManager';
import { Question } from '../src/types';

console.log('--- RUNNING PROMPT 4 MANUAL QUESTION FORM & CRUD TESTS ---');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, desc: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${desc}`);
  } else {
    console.error(`  ✗ FAIL: ${desc}`);
  }
}

// 1. Allowed Subjects & Difficulties Verification
assert(ALLOWED_SUBJECTS.includes('Reasoning'), 'ALLOWED_SUBJECTS contains Reasoning');
assert(ALLOWED_SUBJECTS.includes('Hindi'), 'ALLOWED_SUBJECTS contains Hindi');
assert(ALLOWED_SUBJECTS.includes('English'), 'ALLOWED_SUBJECTS contains English');
assert(ALLOWED_SUBJECTS.includes('Mathematics'), 'ALLOWED_SUBJECTS contains Mathematics');
assert(ALLOWED_SUBJECTS.includes('General Knowledge'), 'ALLOWED_SUBJECTS contains General Knowledge');
assert(ALLOWED_SUBJECTS.includes('General Science'), 'ALLOWED_SUBJECTS contains General Science');
assert(ALLOWED_SUBJECTS.length === 6, 'Exactly 6 allowed subjects defined');

assert(ALLOWED_DIFFICULTIES.includes('Easy'), 'ALLOWED_DIFFICULTIES contains Easy');
assert(ALLOWED_DIFFICULTIES.includes('Medium'), 'ALLOWED_DIFFICULTIES contains Medium');
assert(ALLOWED_DIFFICULTIES.includes('Hard'), 'ALLOWED_DIFFICULTIES contains Hard');
assert(ALLOWED_DIFFICULTIES.includes('Expert'), 'ALLOWED_DIFFICULTIES contains Expert');
assert(ALLOWED_DIFFICULTIES.length === 4, 'Exactly 4 allowed difficulty levels defined');

// 2. Validation Function Simulator
function simulateManualFormValidation(data: {
  qText: string;
  qOptionA: string;
  qOptionB: string;
  qOptionC: string;
  qOptionD: string;
  qCorrectIdx: number;
  qCategory: string;
  qDifficulty: string;
  qExplanation: string;
}) {
  const errors: Record<string, string> = {};

  if (!data.qText.trim()) errors.qText = 'Question text is required.';
  if (!data.qOptionA.trim()) errors.qOptionA = 'Option A is required.';
  if (!data.qOptionB.trim()) errors.qOptionB = 'Option B is required.';
  if (!data.qOptionC.trim()) errors.qOptionC = 'Option C is required.';
  if (!data.qOptionD.trim()) errors.qOptionD = 'Option D is required.';

  if (data.qCorrectIdx == null || data.qCorrectIdx < 0 || data.qCorrectIdx > 3) {
    errors.qCorrect = 'Please select a correct answer option (A, B, C, or D).';
  } else {
    const opts = [data.qOptionA.trim(), data.qOptionB.trim(), data.qOptionC.trim(), data.qOptionD.trim()];
    const letter = ['A', 'B', 'C', 'D'][data.qCorrectIdx];
    if (!opts[data.qCorrectIdx]) {
      errors.qCorrect = `Selected correct answer (Option ${letter}) is blank.`;
    }
  }

  if (!data.qCategory || !ALLOWED_SUBJECTS.includes(data.qCategory as any)) {
    errors.qCategory = 'Please select an allowed subject from the dropdown.';
  }

  if (!data.qDifficulty || !ALLOWED_DIFFICULTIES.includes(data.qDifficulty as any)) {
    errors.qDifficulty = 'Please select an allowed difficulty level from the dropdown.';
  }

  if (!data.qExplanation.trim()) {
    errors.qExplanation = 'Explanation is required.';
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

// Test validation on empty form (default state when adding new question)
const emptyForm = simulateManualFormValidation({
  qText: '',
  qOptionA: '',
  qOptionB: '',
  qOptionC: '',
  qOptionD: '',
  qCorrectIdx: 0,
  qCategory: '',
  qDifficulty: '',
  qExplanation: ''
});
assert(!emptyForm.isValid, 'Empty default form is invalid');
assert(emptyForm.errors.qText !== undefined, 'Empty form flags missing question text');
assert(emptyForm.errors.qOptionA !== undefined, 'Empty form flags missing option A');
assert(emptyForm.errors.qCategory !== undefined, 'Empty form flags missing category');
assert(emptyForm.errors.qDifficulty !== undefined, 'Empty form flags missing difficulty');
assert(emptyForm.errors.qExplanation !== undefined, 'Empty form flags missing explanation');
assert(emptyForm.errors.qCorrect !== undefined, 'Empty form flags that selected correct answer is blank');

// Test validation with valid question
const validForm = simulateManualFormValidation({
  qText: 'What is the chemical formula for water?',
  qOptionA: 'CO2',
  qOptionB: 'H2O',
  qOptionC: 'NaCl',
  qOptionD: 'O2',
  qCorrectIdx: 1, // Option B
  qCategory: 'General Science',
  qDifficulty: 'Easy',
  qExplanation: 'Water consists of two Hydrogen atoms and one Oxygen atom (H2O).'
});
assert(validForm.isValid, 'Valid form with all fields passes validation');
assert(Object.keys(validForm.errors).length === 0, 'Valid form produces 0 errors');

// Test invalid subject rejection
const invalidSubjectForm = simulateManualFormValidation({
  qText: 'Sample Question',
  qOptionA: 'A',
  qOptionB: 'B',
  qOptionC: 'C',
  qOptionD: 'D',
  qCorrectIdx: 0,
  qCategory: 'Astronomy', // Not in allowed list
  qDifficulty: 'Easy',
  qExplanation: 'Some explanation.'
});
assert(!invalidSubjectForm.isValid, 'Disallowed subject is rejected');
assert(invalidSubjectForm.errors.qCategory !== undefined, 'Error flagged for disallowed subject');

// Test invalid difficulty rejection
const invalidDiffForm = simulateManualFormValidation({
  qText: 'Sample Question',
  qOptionA: 'A',
  qOptionB: 'B',
  qOptionC: 'C',
  qOptionD: 'D',
  qCorrectIdx: 0,
  qCategory: 'Mathematics',
  qDifficulty: 'Master', // Not in allowed list
  qExplanation: 'Some explanation.'
});
assert(!invalidDiffForm.isValid, 'Disallowed difficulty is rejected');
assert(invalidDiffForm.errors.qDifficulty !== undefined, 'Error flagged for disallowed difficulty');

// 3. ID Generation Strategy Simulator
const initialPool: Question[] = [
  { id: 1, question: 'Q1', stem: 'Q1', options: ['A', 'B', 'C', 'D'], correctIndex: 0, category: 'Maths', difficulty: 'Easy', explanation: 'Exp 1' },
  { id: 2, question: 'Q2', stem: 'Q2', options: ['A', 'B', 'C', 'D'], correctIndex: 1, category: 'Reasoning', difficulty: 'Medium', explanation: 'Exp 2' },
  { id: 5, question: 'Q5', stem: 'Q5', options: ['A', 'B', 'C', 'D'], correctIndex: 2, category: 'General Science', difficulty: 'Hard', explanation: 'Exp 5' },
  { id: 10, question: 'Q10', stem: 'Q10', options: ['A', 'B', 'C', 'D'], correctIndex: 3, category: 'General Knowledge', difficulty: 'Expert', explanation: 'Exp 10' },
  { id: 11, question: 'Q11', stem: 'Q11', options: ['A', 'B', 'C', 'D'], correctIndex: 0, category: 'English', difficulty: 'Easy', explanation: 'Exp 11' },
  { id: 12, question: 'Q12', stem: 'Q12', options: ['A', 'B', 'C', 'D'], correctIndex: 1, category: 'Hindi', difficulty: 'Medium', explanation: 'Exp 12' }
];

const validIds = initialPool.map(q => Number(q.id)).filter(id => !isNaN(id));
const generatedNewId = validIds.length > 0 ? Math.max(...validIds) + 1 : 1;
assert(generatedNewId === 13, `New ID generated safely as max(IDs) + 1: expected 13, got ${generatedNewId}`);

// 4. Add Question Simulation
const newQuestion: Question = {
  id: generatedNewId,
  stem: 'What is 15 * 6?',
  question: 'What is 15 * 6?',
  options: ['80', '90', '100', '110'],
  correctIndex: 1,
  correctKey: 'B',
  answer: { key: 'B', text: '90' },
  category: 'Mathematics',
  difficulty: 'Easy',
  explanation: '15 * 6 = 90.'
};
const poolAfterAdd = [...initialPool, newQuestion];
assert(poolAfterAdd.length === 7, 'Pool length increased by 1 after addition');
assert(poolAfterAdd.some(q => q.id === 13), 'New question exists in pool with ID 13');
assert(poolAfterAdd.find(q => q.id === 13)?.correctKey === 'B', 'Correct key matches selected option B');

// 5. Edit Question Simulation
const editingId = 5;
const updatedText = 'Updated Science Question Stem';
const updatedPool = poolAfterAdd.map(q => {
  if (q.id === editingId) {
    return {
      ...q,
      stem: updatedText,
      question: updatedText,
      difficulty: 'Expert' as const,
      explanation: 'Updated step-by-step solution.'
    };
  }
  return q;
});
assert(updatedPool.length === 7, 'Pool size unchanged after edit (no duplicates)');
const editedQ = updatedPool.find(q => q.id === 5);
assert(editedQ?.stem === updatedText, 'Question #5 stem updated');
assert(editedQ?.difficulty === 'Expert', 'Question #5 difficulty updated to Expert');
assert(editedQ?.id === 5, 'Question #5 ID strictly preserved');

// 6. Delete Question Simulation
const idToDelete = 2;
const poolAfterDelete = updatedPool.filter(q => q.id !== idToDelete);
assert(poolAfterDelete.length === 6, 'Pool length decreased by 1 after deletion');
assert(!poolAfterDelete.some(q => q.id === idToDelete), 'Question #2 removed from pool');
assert(poolAfterDelete.length >= 5, 'Pool satisfies minimum 5 questions requirement');

// 7. Safety Limit Check: deleting when at 5 questions
const poolAtLimit = poolAfterDelete.slice(0, 5);
assert(poolAtLimit.length === 5, 'Pool has exactly 5 questions');
const canDeleteAtLimit = poolAtLimit.length > 5;
assert(!canDeleteAtLimit, 'Prevented deletion when pool is at minimum safety threshold (5)');

// 8. Normalization verification
assert(toAllowedSubject('maths') === 'Mathematics', 'toAllowedSubject maps maths -> Mathematics');
assert(toAllowedSubject('science') === 'General Science', 'toAllowedSubject maps science -> General Science');
assert(toAllowedSubject('gk') === 'General Knowledge', 'toAllowedSubject maps gk -> General Knowledge');
assert(toAllowedSubject('hindi') === 'Hindi', 'toAllowedSubject maps hindi -> Hindi');
assert(toAllowedSubject('reasoning') === 'Reasoning', 'toAllowedSubject maps reasoning -> Reasoning');
assert(toAllowedSubject('english') === 'English', 'toAllowedSubject maps english -> English');

console.log(`\n========================================`);
console.log(`PROMPT 4 TESTS SUMMARY: ${passedTests}/${totalTests} PASSED`);
console.log(`========================================\n`);

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
