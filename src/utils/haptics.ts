/**
 * Safe Vibration API utility for mobile and touch devices.
 * Provides physical haptic feedback for user interactions and critical game events.
 */

export function isVibrationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'vibrate' in navigator &&
    typeof navigator.vibrate === 'function'
  );
}

export function vibrate(pattern: number | number[]): boolean {
  if (!isVibrationSupported()) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    // Gracefully catch security/permission errors or inactive document states
    return false;
  }
}

/**
 * Haptic feedback triggered when a user selects an answer in the Quiz Arena.
 * Emits a crisp, responsive vibration pulse (40ms).
 */
export function vibrateAnswerSelect(): void {
  vibrate(40);
}

/**
 * Haptic feedback triggered when the 30-second timer alert is activated.
 * Emits an urgent multi-pulse vibration pattern: 150ms on, 80ms off, 200ms on.
 */
export function vibrateTimerAlert(): void {
  vibrate([150, 80, 200]);
}

/**
 * Haptic feedback for critical final countdown ticks.
 */
export function vibrateTimerTick(): void {
  vibrate(25);
}
