# Security Specification & Threat Model for QuizKart Firestore

## 1. Data Invariants
1. **User Identity & Integrity**: A user document at `/users/{userId}` can only be created or modified by the authenticated user with matching `request.auth.uid == userId` or a verified system admin (`nmlcompany720@gmail.com`).
2. **Wallet Balance Safety**: Unprivileged users cannot arbitrarily elevate their `walletBalance` or grant themselves unearned funds.
3. **Contest & Questions Protection**: Only admins (`isAdmin()`) can create, update, or delete records in `/questions/{questionId}`, `/contests/{contestId}`, and `/settings/{settingId}`. Public read is permitted for active tournament transparency.
4. **Leaderboard & Attempt Authenticity**: Quiz attempt records at `/quiz_attempts/{attemptId}` can only be written by the authenticated user matching `userId == request.auth.uid`.
5. **Path ID Hardening**: All document keys must satisfy `isValidId(id)` (alphanumeric and dashes/underscores, maximum 128 characters) to mitigate ID injection and resource poisoning.
6. **Strict Field Validation**: Any document write must adhere to validated field shapes, types, string length bounds, and non-empty keys.

---

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 (Ghost Field Spoofing on User Profile)**:
   Attempting to write an unauthorized `isAdmin: true` field inside `/users/{userId}`.
   *Expected Result*: Rejected (PERMISSION_DENIED).

2. **Payload 2 (Cross-User Impersonation)**:
   Authenticated user `uid_attacker` writing to `/users/uid_victim`.
   *Expected Result*: Rejected (PERMISSION_DENIED).

3. **Payload 3 (Unauthenticated Read of Private KYC Info)**:
   Unauthenticated request accessing `/users/{userId}`.
   *Expected Result*: Rejected (PERMISSION_DENIED).

4. **Payload 4 (Non-Admin Question Injection)**:
   Standard user submitting a new quiz question to `/questions/q_rogue`.
   *Expected Result*: Rejected (PERMISSION_DENIED).

5. **Payload 5 (Non-Admin Contest Tampering)**:
   Standard user modifying entry fee or prize pool in `/contests/contest_1`.
   *Expected Result*: Rejected (PERMISSION_DENIED).

6. **Payload 6 (Attempt ID Poisoning)**:
   Submitting a quiz attempt with a 2,000-character malicious string ID.
   *Expected Result*: Rejected (PERMISSION_DENIED - `isValidId` failure).

7. **Payload 7 (Forged Quiz Score Submission)**:
   User submitting a score exceeding `totalQuestions` (e.g. score 999/10).
   *Expected Result*: Rejected (PERMISSION_DENIED - score boundary check).

8. **Payload 8 (Attempt User ID Mismatch)**:
   User authenticated as `uid_alice` saving an attempt with `userId: "uid_bob"`.
   *Expected Result*: Rejected (PERMISSION_DENIED).

9. **Payload 9 (Non-Admin System Settings Alteration)**:
   Standard user updating `/settings/today_prize` to alter prize economics.
   *Expected Result*: Rejected (PERMISSION_DENIED).

10. **Payload 10 (Leaderboard Rank Hijack)**:
    Unauthenticated agent deleting or modifying entries in `/leaderboard/{entryId}`.
    *Expected Result*: Rejected (PERMISSION_DENIED).

11. **Payload 11 (Oversized String Buffer Overflow Attempt)**:
    Sending a question text of 100,000 characters to exhaust database quota.
    *Expected Result*: Rejected (PERMISSION_DENIED - `size() <= 500` constraint).

12. **Payload 12 (Negative Wallet Balance or Negative Entry Fee)**:
    Creating a contest with a negative entry fee (e.g., `-500`).
    *Expected Result*: Rejected (PERMISSION_DENIED).
