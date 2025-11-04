// Pure logic helpers for reports QA and adjudication

function isInCooldown(trust) {
  if (!trust || !trust.cooldown_until) return false;
  return new Date(trust.cooldown_until) > new Date();
}

function calculateConfidence(signals, trustScore, config = {
  trustScoreWeight: 0.3, // corresponds to CONFIG.TRUST_SCORE_WEIGHT
  combine: { signals: 0.7, trust: 0.3 }
}) {
  if (!Array.isArray(signals) || signals.length === 0) return 0;

  const signalScore = signals.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
  const trustFactor = (Number(trustScore) / 100) * config.trustScoreWeight * 100;
  const finalScore = (signalScore * config.combine.signals) + (trustFactor * config.combine.trust);
  return Math.min(finalScore, 100);
}

module.exports = { calculateConfidence, isInCooldown };
