function reviewChar(expected, recognized, detail) {
  const candidates = Array.isArray(detail?.candidates) ? detail.candidates : [];
  const top = candidates[0] || null;
  const expectedCandidate = candidates.find((c) => c.char === expected) || null;
  const exact = recognized === expected;
  const topProb = top?.probability ?? 0;
  const expectedProb = expectedCandidate?.probability ?? 0;
  const closeEnough =
    !!expectedCandidate &&
    (expectedProb >= topProb * 0.45 || topProb - expectedProb <= 0.25);

  return {
    expected,
    recognized,
    exact,
    inCandidates: !!expectedCandidate,
    closeEnough,
    candidates,
    modelInputPreview: detail?.modelInputPreview || null,
    expectedProbability: expectedProb,
    topProbability: topProb,
  };
}

export function buildDictationRecognitionResult(word, recognition) {
  const expected = String(word?.word || '');
  const pinyin = word?.pinyin || '';
  const recognized = String(recognition?.text || '');
  const expectedChars = Array.from(expected);
  const recognizedChars = Array.from(recognized);
  const details = Array.isArray(recognition?.chars) ? recognition.chars : [];

  const charReviews = expectedChars.map((ch, i) =>
    reviewChar(ch, recognizedChars[i] || '', details[i])
  );
  const exact = recognized === expected;
  const uncertain =
    !exact &&
    expectedChars.length > 0 &&
    recognizedChars.length === expectedChars.length &&
    charReviews.every((r) => r.exact || r.inCandidates || r.closeEnough);

  return {
    word: expected,
    pinyin,
    input: recognized,
    correct: exact,
    reviewState: exact ? 'correct' : uncertain ? 'uncertain' : 'wrong',
    mistakeType: exact ? null : uncertain ? 'recognition_uncertain' : 'unknown',
    recognition,
    charReviews,
  };
}
