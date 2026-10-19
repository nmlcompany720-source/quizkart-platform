import { validateAIQuestionJson, CHATGPT_PROMPT_TEMPLATE, ALLOWED_SUBJECTS, ALLOWED_DIFFICULTIES } from '../src/utils/aiQuestionParser';

console.log('--- RUNNING PROMPT 3 COMPREHENSIVE VALIDATION TESTS ---');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✓ [PASS] ${testName}`);
  } else {
    console.error(`✗ [FAIL] ${testName}${detail ? ': ' + detail : ''}`);
    process.exitCode = 1;
  }
}

// TEST 1: Valid JSON matching Prompt 2 example
const validExampleJson = JSON.stringify({
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
});

const report1 = validateAIQuestionJson(validExampleJson);
assert(report1.success === true, 'Test 1: Valid example JSON parses successfully');
assert(report1.totalParsed === 1, 'Test 1: Parsed count is 1');
assert(report1.validCount === 1, 'Test 1: Valid count is 1');
assert(report1.invalidCount === 0, 'Test 1: Invalid count is 0');
assert(report1.questions[0].isValid === true, 'Test 1: Question 0 is valid');
assert(report1.questions[0].subject === 'Mathematics', 'Test 1: Subject preserved');
assert(report1.questions[0].difficulty === 'Easy', 'Test 1: Difficulty preserved');
assert(report1.questions[0].correctKey === 'B', 'Test 1: CorrectKey is B');
assert(report1.questions[0].correctIndex === 1, 'Test 1: CorrectIndex is 1');

// TEST 2: Multi-subject batch handling per question
const multiSubjectBatch = JSON.stringify({
  questions: [
    {
      subject: "Reasoning",
      difficulty: "Hard",
      question: "Complete the sequence: 2, 6, 12, 20, ?",
      options: { A: "28", B: "30", C: "32", D: "34" },
      answer: { key: "B", text: "30" },
      explanation: "n(n+1) -> 5*6 = 30."
    },
    {
      subject: "Hindi",
      difficulty: "Medium",
      question: "सूर्य का पर्यायवाची शब्द क्या है?",
      options: { A: "दिनकर", B: "निशाकर", C: "शशि", D: "वारिद" },
      answer: { key: "A", text: "दिनकर" },
      explanation: "दिनकर सूर्य का पर्यायवाची है।"
    },
    {
      subject: "General Knowledge",
      difficulty: "Expert",
      question: "Who was the first Chief Election Commissioner of India?",
      options: { A: "K.V.K. Sundaram", B: "Sukumar Sen", C: "S.P. Sen Verma", D: "T.N. Seshan" },
      answer: { key: "B", text: "Sukumar Sen" },
      explanation: "Sukumar Sen served from 1950 to 1958."
    },
    {
      subject: "General Science",
      difficulty: "Easy",
      question: "What is the chemical formula for table salt?",
      options: { A: "NaCl", B: "KCl", C: "HCl", D: "NaOH" },
      answer: { key: "A", text: "NaCl" },
      explanation: "Sodium chloride is NaCl."
    },
    {
      subject: "English",
      difficulty: "Hard",
      question: "Choose the correct antonym of 'EPHEMERAL':",
      options: { A: "Transient", B: "Permanent", C: "Fleeting", D: "Short-lived" },
      answer: { key: "B", text: "Permanent" },
      explanation: "Ephemeral means lasting for a very short time; permanent means lasting indefinitely."
    }
  ]
});

const report2 = validateAIQuestionJson(multiSubjectBatch);
assert(report2.success === true, 'Test 2: Multi-subject batch parses successfully');
assert(report2.totalParsed === 5, 'Test 2: Total 5 questions parsed');
assert(report2.validCount === 5, 'Test 2: All 5 questions valid');
assert(report2.questions[0].subject === 'Reasoning', 'Test 2: Question 1 subject Reasoning');
assert(report2.questions[1].subject === 'Hindi', 'Test 2: Question 2 subject Hindi');
assert(report2.questions[2].subject === 'General Knowledge', 'Test 2: Question 3 subject General Knowledge');
assert(report2.questions[3].subject === 'General Science', 'Test 2: Question 4 subject General Science');
assert(report2.questions[4].subject === 'English', 'Test 2: Question 5 subject English');
assert(report2.questions[2].difficulty === 'Expert', 'Test 2: Expert difficulty supported');

// TEST 3: Validation errors - Invalid Subject & Difficulty
const invalidSubjectAndDiff = JSON.stringify({
  questions: [
    {
      subject: "Astrophysics", // NOT allowed
      difficulty: "SuperHard", // NOT allowed
      question: "What is a pulsar?",
      options: { A: "Star", B: "Planet", C: "Comet", D: "Asteroid" },
      answer: { key: "A", text: "Star" },
      explanation: "A pulsar is a highly magnetized rotating neutron star."
    }
  ]
});

const report3 = validateAIQuestionJson(invalidSubjectAndDiff);
assert(report3.totalParsed === 1, 'Test 3: Parsed count 1');
assert(report3.validCount === 0, 'Test 3: Valid count 0');
assert(report3.invalidCount === 1, 'Test 3: Invalid count 1');
assert(report3.questions[0].isValid === false, 'Test 3: Question is invalid');
const errors3 = report3.questions[0].validationErrors;
assert(errors3.some(e => e.field === 'subject'), 'Test 3: Flagged invalid subject');
assert(errors3.some(e => e.field === 'difficulty'), 'Test 3: Flagged invalid difficulty');

// TEST 4: Validation errors - Answer text does not match option
const mismatchedAnswer = JSON.stringify({
  questions: [
    {
      subject: "Mathematics",
      difficulty: "Easy",
      question: "What is 5 + 5?",
      options: { A: "8", B: "10", C: "12", D: "14" },
      answer: { key: "B", text: "15" }, // text does not match option B ("10")
      explanation: "5 + 5 = 10."
    }
  ]
});

const report4 = validateAIQuestionJson(mismatchedAnswer);
assert(report4.validCount === 0, 'Test 4: Flagged mismatched answer text');
assert(report4.questions[0].validationErrors.some(e => e.field === 'answer.text'), 'Test 4: Flagged answer.text field specifically');

// TEST 5: Validation errors - Missing options and empty explanation
const missingOptsAndExpl = JSON.stringify({
  questions: [
    {
      subject: "English",
      difficulty: "Easy",
      question: "What is a noun?",
      options: { A: "Person, place or thing", B: "Action word" }, // Missing C & D
      answer: { key: "A", text: "Person, place or thing" },
      explanation: "" // Empty explanation
    }
  ]
});

const report5 = validateAIQuestionJson(missingOptsAndExpl);
assert(report5.validCount === 0, 'Test 5: Flagged missing options and empty explanation');
assert(report5.questions[0].validationErrors.some(e => e.field === 'options'), 'Test 5: Flagged options field');
assert(report5.questions[0].validationErrors.some(e => e.field === 'explanation'), 'Test 5: Flagged explanation field');

// TEST 6: Malformed JSON syntax error
const malformedJson = `{ "questions": [ { "subject": "Maths", missing quotes here } ] }`;
const report6 = validateAIQuestionJson(malformedJson);
assert(report6.success === false, 'Test 6: Malformed JSON recognized as failure');
assert(typeof report6.malformedJsonError === 'string' && report6.malformedJsonError.includes('Malformed JSON'), 'Test 6: Clear malformed JSON error returned');

// TEST 7: Strips markdown code fences
const fencedJson = "```json\n" + validExampleJson + "\n```";
const report7 = validateAIQuestionJson(fencedJson);
assert(report7.success === true, 'Test 7: Stripped markdown fences and parsed');
assert(report7.validCount === 1, 'Test 7: Valid count is 1 after fence strip');

// TEST 8: Check Copy AI Prompt Template
assert(CHATGPT_PROMPT_TEMPLATE.includes('"subject": Must be strictly one of: "Reasoning", "Hindi", "English", "Mathematics", "General Knowledge", "General Science"'), 'Test 8: Template specifies all 6 allowed subjects');
assert(CHATGPT_PROMPT_TEMPLATE.includes('"difficulty": Must be strictly one of: "Easy", "Medium", "Hard", "Expert"'), 'Test 8: Template specifies all 4 allowed difficulties');
assert(CHATGPT_PROMPT_TEMPLATE.includes('Return ONLY valid JSON'), 'Test 8: Template requires strict JSON');
assert(CHATGPT_PROMPT_TEMPLATE.includes('Do NOT wrap output in Markdown code fences'), 'Test 8: Template forbids markdown code fences');
assert(CHATGPT_PROMPT_TEMPLATE.includes('Never omit required fields or invent missing answers'), 'Test 8: Template forbids missing fields');

console.log(`\n========================================`);
console.log(`PROMPT 3 VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED!`);
console.log(`========================================\n`);
