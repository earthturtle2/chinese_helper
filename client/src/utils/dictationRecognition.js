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

function getCharOptions(review) {
  const options = (review.candidates || [])
    .filter((c) => c.char)
    .slice(0, 5)
    .map((c) => ({
      char: c.char,
      probability: Math.max(c.probability || 0, 1e-8),
    }));

  if (review.recognized && !options.some((c) => c.char === review.recognized)) {
    options.push({ char: review.recognized, probability: 1e-8 });
  }
  if (review.expected && !options.some((c) => c.char === review.expected)) {
    // Keep the target word reachable for word-level scoring, but with a tiny prior
    // so the lexicon cannot override a genuinely unrelated handwriting result.
    options.push({ char: review.expected, probability: 1e-4 });
  }

  return options.length > 0 ? options : [{ char: review.recognized || '', probability: 1e-8 }];
}

function inferWordWithLexicon(expected, recognized, charReviews, lexiconWords = []) {
  if (!expected || charReviews.length === 0 || charReviews.length > 6) return null;

  const lexicon = new Set([...lexiconWords, expected].filter(Boolean));
  let beam = [{ word: '', logProb: 0 }];
  const beamLimit = 80;

  for (const review of charReviews) {
    const options = getCharOptions(review);
    const next = [];
    for (const item of beam) {
      for (const option of options) {
        next.push({
          word: `${item.word}${option.char}`,
          logProb: item.logProb + Math.log(option.probability),
        });
      }
    }
    next.sort((a, b) => b.logProb - a.logProb);
    beam = next.slice(0, beamLimit);
  }

  const scored = beam.map((item) => {
    const lexiconHit = lexicon.has(item.word);
    const expectedHit = item.word === expected;
    const score = item.logProb + (lexiconHit ? 3 : 0) + (expectedHit ? 4 : 0);
    return { ...item, score, lexiconHit, expectedHit };
  }).sort((a, b) => b.score - a.score);

  const recognizedItem = scored.find((item) => item.word === recognized) || null;
  const best = scored[0] || null;
  if (!best) return null;

  return {
    suggestedWord: best.word,
    shouldSuggestExpected: best.word === expected && recognized !== expected,
    recognizedScore: recognizedItem?.score ?? null,
    candidates: scored.slice(0, 6),
  };
}

export function buildDictationRecognitionResult(word, recognition, lexiconWords = []) {
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
  const lexiconInference = inferWordWithLexicon(expected, recognized, charReviews, lexiconWords);
  const uncertain =
    !exact &&
    expectedChars.length > 0 &&
    recognizedChars.length === expectedChars.length &&
    charReviews.every((r) => r.exact || r.inCandidates || r.closeEnough);
  const lexiconMatch = !exact && !!lexiconInference?.shouldSuggestExpected;
  const reviewState = exact ? 'correct' : lexiconMatch ? 'lexicon' : uncertain ? 'uncertain' : 'wrong';

  return {
    word: expected,
    pinyin,
    input: recognized,
    correct: exact,
    reviewState,
    mistakeType: exact ? null : reviewState === 'wrong' ? 'unknown' : 'recognition_uncertain',
    recognition,
    charReviews,
    lexiconSuggestion: lexiconInference?.shouldSuggestExpected ? expected : '',
    wordCandidates: lexiconInference?.candidates || [],
  };
}
