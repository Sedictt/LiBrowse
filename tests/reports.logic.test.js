const { calculateConfidence, isInCooldown } = require('../services/reports/logic');

describe('Reports QA logic', () => {
  test('calculateConfidence returns 0 with no signals', () => {
    expect(calculateConfidence([], 50)).toBe(0);
  });

  test('calculateConfidence combines signal weights and trust factor', () => {
    const signals = [
      { type: 'keyword_match', weight: 30 },
      { type: 'pattern_match', weight: 20 },
    ];
    const score = calculateConfidence(signals, 50);
    // With defaults: signalScore=50 -> 0.7*50=35; trustFactor=(0.5*0.3*100)=15 -> 0.3*15=4.5; total=39.5
    expect(score).toBeCloseTo(39.5, 5);
  });

  test('calculateConfidence caps at 100', () => {
    const signals = [
      { type: 'keyword_match', weight: 100 },
      { type: 'pattern_match', weight: 100 },
      { type: 'user_history', weight: 100 },
    ];
    const score = calculateConfidence(signals, 100);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('isInCooldown returns true only when cooldown is in the future', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 60_000).toISOString();
    const past = new Date(now.getTime() - 60_000).toISOString();

    expect(isInCooldown({ cooldown_until: null })).toBe(false);
    expect(isInCooldown({ cooldown_until: past })).toBe(false);
    expect(isInCooldown({ cooldown_until: future })).toBe(true);
  });
});
