const { test, expect } = require('@playwright/test');
const H = require('./helpers');

test.describe('Quiz gate (business rule: must score 12/12)', () => {
  test('test_quiz_renders_exactly_12_questions_with_4_options', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    await expect(page.locator('#quizQuestions fieldset')).toHaveCount(12);
    for (let i = 0; i < 12; i++) {
      await expect(page.locator(`input[name="quiz_${i}"]`)).toHaveCount(4);
      await expect(page.locator('#quizQuestions legend').nth(i)).toContainText(`${i + 1}.`);
    }
    H.expectNoRuntimeErrors(errors);
  });

  test('test_quiz_cannot_be_submitted_with_no_answers', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);
    await H.submitQuiz(page);

    await expect(page.locator('#quizError')).toContainText('Semua 12 soal wajib dijawab');
    await expect(page.locator('#quizError')).toContainText('soal 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12');
    await H.expectStep(page, 'quiz');
    expect(await page.evaluate(() => sessionStorage.getItem('quizPassed'))).toBeNull();
    H.expectNoRuntimeErrors(errors);
  });

  test('test_quiz_cannot_be_submitted_with_partial_answers', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    // Answer all but questions 5 and 12.
    const partial = [...H.ANSWER_KEY];
    partial[4] = null;
    partial[11] = null;
    await H.answerQuiz(page, partial);
    await H.submitQuiz(page);

    await expect(page.locator('#quizError')).toContainText('Belum dijawab: soal 5, 12.');
    await H.expectStep(page, 'quiz');
    expect(await page.evaluate(() => sessionStorage.getItem('quizPassed'))).toBeNull();
    H.expectNoRuntimeErrors(errors);
  });

  test('test_one_wrong_answer_shows_failure_modal', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    const answers = [...H.ANSWER_KEY];
    answers[0] = answers[0] === 0 ? 1 : 0; // exactly one wrong
    await H.answerQuiz(page, answers);
    await H.submitQuiz(page);

    await expect(page.locator('#quizFailureModal')).toHaveClass(/show/);
    await expect(page.locator('#quizFailureTitle')).toHaveText('Quiz Tidak Lulus');
    await expect(page.locator('#quizFailureMessage')).toContainText('11/12');
    await expect(page.locator('#quizFailureMessage')).toContainText('membaca ulang seluruh 12 aturan');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_failed_quiz_does_not_unlock_registration', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    const answers = [...H.ANSWER_KEY];
    answers[3] = (answers[3] + 1) % 4;
    await H.answerQuiz(page, answers);
    await H.submitQuiz(page);

    await expect(page.locator('#quizFailureModal')).toHaveClass(/show/);
    expect(await page.evaluate(() => sessionStorage.getItem('quizPassed'))).toBeNull();
    // The underlying step must still be the quiz, never screening.
    expect(await H.currentStep(page)).toBe('quiz');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_failed_quiz_clears_submitted_answers', async ({ page }) => {
    await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    const answers = [...H.ANSWER_KEY];
    answers[6] = (answers[6] + 1) % 4;
    await H.answerQuiz(page, answers);
    await H.submitQuiz(page);

    await expect(page.locator('#quizFailureModal')).toHaveClass(/show/);
    const checked = await page.locator('#quizQuestions input[type="radio"]:checked').count();
    expect(checked, 'failed attempt answers must be cleared').toBe(0);
  });

  test('test_failure_modal_button_returns_user_to_welcome', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    const answers = [...H.ANSWER_KEY];
    answers[9] = (answers[9] + 1) % 4;
    await H.answerQuiz(page, answers);
    await H.submitQuiz(page);

    await expect(page.locator('#quizFailureModal')).toHaveClass(/show/);
    await page.click('#quizFailureOk');

    await expect(page.locator('#quizFailureModal')).not.toHaveClass(/show/);
    await H.expectStep(page, 'welcome');
    // Page scrolling must be restored after the blocking modal closes.
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    expect(await page.evaluate(() => sessionStorage.getItem('quizPassed'))).toBeNull();
    H.expectNoRuntimeErrors(errors);
  });

  test('test_failure_modal_cannot_be_dismissed_by_backdrop_or_escape', async ({ page }) => {
    await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    const answers = [...H.ANSWER_KEY];
    answers[1] = (answers[1] + 1) % 4;
    await H.answerQuiz(page, answers);
    await H.submitQuiz(page);
    await expect(page.locator('#quizFailureModal')).toHaveClass(/show/);

    await page.keyboard.press('Escape');
    await expect(page.locator('#quizFailureModal')).toHaveClass(/show/);

    await page.mouse.click(5, 5); // backdrop
    await expect(page.locator('#quizFailureModal')).toHaveClass(/show/);
    expect(await page.evaluate(() => sessionStorage.getItem('quizPassed'))).toBeNull();
  });

  test('test_quiz_can_be_retaken_and_passed_after_failure', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    const answers = [...H.ANSWER_KEY];
    answers[11] = (answers[11] + 1) % 4;
    await H.answerQuiz(page, answers);
    await H.submitQuiz(page);
    await expect(page.locator('#quizFailureModal')).toHaveClass(/show/);
    await page.click('#quizFailureOk');
    await H.expectStep(page, 'welcome');

    // Second attempt, all correct.
    await H.startRules(page);
    await H.acknowledgeAllRules(page);
    await H.answerQuiz(page, H.ANSWER_KEY);
    await H.submitQuiz(page);
    await H.expectStep(page, 'screening');
    expect(await page.evaluate(() => sessionStorage.getItem('quizPassed'))).toBe('true');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_all_wrong_answers_reports_score_zero', async ({ page }) => {
    await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    const wrong = H.ANSWER_KEY.map((a) => (a + 1) % 4);
    await H.answerQuiz(page, wrong);
    await H.submitQuiz(page);

    await expect(page.locator('#quizFailureModal')).toHaveClass(/show/);
    await expect(page.locator('#quizFailureMessage')).toContainText('0/12');
  });

  test('test_quiz_answer_key_matches_rule_content', async ({ page }) => {
    await H.openApp(page);
    // The app's answer key must stay consistent with the 12 rule texts.
    const appAnswers = await page.evaluate(() => quizQuestions.map((q) => q.answer));
    expect(appAnswers).toEqual(H.ANSWER_KEY);

    const correctOptionTexts = await page.evaluate(() =>
      quizQuestions.map((q) => q.options[q.answer])
    );
    expect(correctOptionTexts[0]).toBe('Rp160.000');
    expect(correctOptionTexts[1]).toBe('22.00 WIB');
    expect(correctOptionTexts[4]).toBe('1 kali');
    expect(correctOptionTexts[5]).toBe('5.000 km');
    expect(correctOptionTexts[8]).toContain('Jabodetabek');
  });
});
