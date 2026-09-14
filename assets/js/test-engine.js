'use strict';
window.AKIZ_TEST_ENGINE = (() => {
  const validQuestions = (questions) => Array.isArray(questions) && questions.length === 15 &&
    new Set(questions.map((q) => q.id)).size === 15 && questions.every((q) =>
      typeof q.id === 'string' && q.id && typeof q.text === 'string' && q.text &&
      Array.isArray(q.answers) && q.answers.length === 4 &&
      new Set(q.answers.map((a) => a.id)).size === 4 &&
      q.answers.every((a) => typeof a.id === 'string' && a.id && typeof a.text === 'string' && a.text) &&
      q.answers.some((a) => a.id === q.correctAnswerId));
  function score(questions, answers) {
    if (!validQuestions(questions)) throw new Error('Final 15-question answer key is required.');
    return questions.reduce((total, q) => {
      if (!q.answers.some((a) => a.id === answers[q.id])) throw new Error('Unanswered question.');
      return total + Number(answers[q.id] === q.correctAnswerId);
    }, 0);
  }
  function result(totalScore, config) {
    if (!Number.isInteger(totalScore) || totalScore < 0 || totalScore > 15) return null;
    const level = config.results.find((item) => totalScore >= item.min && totalScore <= item.max);
    const card = config.scoreCards.find((item) => item.score === totalScore);
    if (!level || !card) return null;
    return { ...level, description: card.description ?? level.description, image: card.image, angle: totalScore * 24, test_score: totalScore,
      test_level: level.title, result_id: card.id, recommended_group: level.recommendedGroup };
  }
  function readState() {
    try { return JSON.parse(sessionStorage.getItem('akiz_test_state') || 'null'); }
    catch { return null; }
  }
  return { validQuestions, score, result, readState };
})();
