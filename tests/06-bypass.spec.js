const { test, expect } = require('@playwright/test');
const H = require('./helpers');

/**
 * go() gates "screening", "details", "review" and "done" behind
 * sessionStorage.quizPassed === "true". These tests probe that gate.
 */
test.describe('Security / bypass — quiz gate', () => {
  const gated = ['screening', 'details', 'review', 'done'];

  for (const step of gated) {
    test(`test_direct_access_to_${step}_is_blocked_without_quiz_pass`, async ({ page }) => {
      const errors = await H.openApp(page);
      await page.evaluate((s) => go(s), step);

      // The gate must redirect to the quiz, never show the requested step.
      await H.expectStep(page, 'quiz');
      await expect(page.locator('#quizQuestions fieldset')).toHaveCount(12);
      H.expectNoRuntimeErrors(errors);
    });
  }

  test('test_screening_submit_without_quiz_pass_redirects_to_quiz', async ({ page }) => {
    const errors = await H.openApp(page);
    // Reveal screening by brute force, then try to submit it.
    await page.evaluate(() => {
      document.querySelectorAll('section.step').forEach((s) => s.classList.remove('active'));
      document.getElementById('screening').classList.add('active');
    });
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);

    // screenNext() re-checks the gate itself rather than trusting the visible step.
    await H.expectStep(page, 'quiz');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_revoking_quiz_pass_blocks_further_navigation', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);
    await H.expectStep(page, 'details');

    // Simulate the session being tampered with / expiring mid-flow.
    await page.evaluate(() => sessionStorage.removeItem('quizPassed'));
    await page.click('#details button.btn-light'); // "Kembali" -> go('screening')
    await H.expectStep(page, 'quiz');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_revoked_pass_blocks_review_submission', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails());

    await page.evaluate(() => sessionStorage.removeItem('quizPassed'));
    await H.submitDetails(page); // review()
    await H.expectStep(page, 'quiz');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_garbage_quiz_pass_value_is_not_accepted', async ({ page }) => {
    const errors = await H.openApp(page);
    for (const value of ['1', 'yes', 'TRUE', 'true ', '']) {
      await page.evaluate((v) => sessionStorage.setItem('quizPassed', v), value);
      await page.evaluate(() => go('details'));
      expect(await H.currentStep(page), `quizPassed="${value}" must not unlock`).toBe('quiz');
    }
    H.expectNoRuntimeErrors(errors);
  });

  test('test_ungated_steps_remain_reachable', async ({ page }) => {
    const errors = await H.openApp(page);
    // welcome / rules / quiz / blocked are intentionally not gated.
    for (const step of ['rules', 'quiz', 'blocked', 'welcome']) {
      await page.evaluate((s) => go(s), step);
      expect(await H.currentStep(page)).toBe(step);
    }
    H.expectNoRuntimeErrors(errors);
  });
});

test.describe('Security / bypass — skipping the screening stage', () => {
  test('test_forged_quiz_pass_allows_skipping_screening_stage', async ({ page }) => {
    const errors = await H.openApp(page);

    // A forged quiz pass is enough to open the details form directly: there is no
    // separate flag recording that the screening hard gates were ever evaluated.
    await page.evaluate(() => sessionStorage.setItem('quizPassed', 'true'));
    await page.evaluate(() => go('details'));

    const reached = await H.currentStep(page);
    expect(reached, 'documents the single-flag gate design').toBe('details');

    // Screening was never completed, so its answers are empty.
    expect(await page.evaluate(() => document.getElementById('name').value)).toBe('');
    expect(await page.evaluate(() => document.getElementById('income').value)).toBe('');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_review_accepts_details_without_any_screening_answers', async ({ page }) => {
    const errors = await H.openApp(page);
    await page.evaluate(() => sessionStorage.setItem('quizPassed', 'true'));
    await page.evaluate(() => go('details'));
    await H.expectStep(page, 'details');

    await H.fillDetails(page, H.validDetails());
    await H.submitDetails(page);

    // review() validates only the details fields, so it accepts the submission.
    await H.expectStep(page, 'review');
    const summary = await page.locator('#summary').textContent();

    // The screening answers are blank in the generated admin message...
    expect(summary).toMatch(/^Nama: $/m);
    expect(summary).toMatch(/^No\. WA: $/m);
    expect(summary).toMatch(/^Status rumah: $/m);
    // ...yet the income requirement is still reported as satisfied.
    expect(summary).toContain('Status syarat pendapatan: TERPENUHI');
    H.expectNoRuntimeErrors(errors);
  });
});

test.describe('Security / bypass — quiz scoring integrity', () => {
  test('test_quiz_answer_values_outside_range_do_not_score', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    // Tamper with the rendered radio values, then answer everything.
    await page.evaluate(() => {
      document.querySelectorAll('#quizQuestions input[type="radio"]').forEach((el) => {
        el.value = '99';
      });
    });
    for (let i = 0; i < 12; i++) {
      await page.locator(`input[name="quiz_${i}"]`).first().check();
    }
    await H.submitQuiz(page);

    // Out-of-range values must count as wrong, not pass.
    await expect(page.locator('#quizFailureModal')).toHaveClass(/show/);
    await expect(page.locator('#quizFailureMessage')).toContainText('0/12');
    expect(await page.evaluate(() => sessionStorage.getItem('quizPassed'))).toBeNull();
    H.expectNoRuntimeErrors(errors);
  });

  test('test_injecting_extra_quiz_questions_does_not_change_pass_threshold', async ({ page }) => {
    await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    // Remove half the questions from the DOM and answer the rest correctly.
    await page.evaluate(() => {
      const sets = document.querySelectorAll('#quizQuestions fieldset');
      for (let i = 6; i < sets.length; i++) sets[i].remove();
    });
    for (let i = 0; i < 6; i++) {
      await page.click(`input[name="quiz_${i}"][value="${H.ANSWER_KEY[i]}"]`);
    }
    await H.submitQuiz(page);

    // checkQuiz() iterates the source-of-truth array, so the removed questions
    // are still required and reported as unanswered.
    await expect(page.locator('#quizError')).toContainText('Belum dijawab: soal 7, 8, 9, 10, 11, 12.');
    expect(await page.evaluate(() => sessionStorage.getItem('quizPassed'))).toBeNull();
  });
});
