const { test, expect } = require('@playwright/test');
const H = require('./helpers');

/**
 * Targeted regression for the three fixes:
 *   - go() renders the rule screen and cancels the pending post-quiz timer
 *   - rereadRules() restarts from rule 1
 *   - startRules() clears consents[] / times[]
 */

test.describe('Post-fix — rule screen rendering', () => {
  test('test_screening_back_button_shows_rule_content', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);

    // The other go('rules') caller: "Kembali" on the screening step.
    await page.click('#screening button.btn-light');
    await H.expectStep(page, 'rules');
    await expect(page.locator('#ruleNumber')).not.toBeEmpty();
    await expect(page.locator('#ruleTitle')).not.toBeEmpty();
    await expect(page.locator('#ruleText')).not.toBeEmpty();
    await expect(page.locator('#ruleCounter')).toContainText('dari 12');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_reread_from_quiz_then_walk_forward_and_pass_again', async ({ page }) => {
    test.setTimeout(120000);
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    // Re-read from rule 1, walk all the way forward, then pass.
    await page.click('#quiz button.btn-light');
    await expect(page.locator('#ruleCounter')).toHaveText('Aturan 1 dari 12');
    await H.acknowledgeAllRules(page);
    await H.answerQuiz(page, H.ANSWER_KEY);
    await H.submitQuiz(page);
    await H.expectStep(page, 'screening');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_reread_keeps_consent_from_the_current_reading', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    // No quiz failure happened, so consent given moments ago still stands.
    await page.click('#quiz button.btn-light');
    await expect(page.locator('#ruleCounter')).toHaveText('Aturan 1 dari 12');
    await expect(page.locator('#ruleAgree')).toBeChecked();
    await expect(page.locator('#ruleConsentTime')).toContainText('Disetujui pada');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_every_rule_renders_its_own_content_on_reread', async ({ page }) => {
    test.setTimeout(120000);
    await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);
    await page.click('#quiz button.btn-light');

    const seen = [];
    for (let i = 0; i < 12; i++) {
      await expect(page.locator('#ruleCounter')).toHaveText(`Aturan ${i + 1} dari 12`);
      await expect(page.locator('#ruleNumber')).toHaveText(`ATURAN ${String(i + 1).padStart(2, '0')}`);
      seen.push(await page.locator('#ruleTitle').textContent());
      await page.click('#ruleNext');
    }
    // All 12 titles must be distinct, i.e. the screen really re-rendered each time.
    expect(new Set(seen).size).toBe(12);
  });
});

test.describe('Post-fix — consent reset on restart', () => {
  test('test_restart_from_welcome_after_passing_clears_consent', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);

    await page.reload();
    await H.startRules(page);
    await expect(page.locator('#ruleAgree')).not.toBeChecked();
    await expect(page.locator('#ruleNext')).toBeDisabled();
    await expect(page.locator('#ruleConsentTime')).toHaveText('');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_summary_consent_trail_is_complete_after_failure_and_reread', async ({ page }) => {
    test.setTimeout(180000);
    const errors = await H.openApp(page);

    // Fail once.
    await H.startRules(page);
    await H.acknowledgeAllRules(page);
    const wrong = [...H.ANSWER_KEY];
    wrong[7] = (wrong[7] + 1) % 4;
    await H.answerQuiz(page, wrong);
    await H.submitQuiz(page);
    await page.click('#quizFailureOk');

    // Full clean run afterwards.
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails());
    await H.submitDetails(page);
    await H.expectStep(page, 'review');

    // Every one of the 12 consent lines must carry a real timestamp, not "-".
    const summary = await page.locator('#summary').textContent();
    expect(summary).toContain('CONSENT ATURAN');
    expect(summary).not.toMatch(/: DISETUJUI — -$/m);
    const stamped = summary.match(/DISETUJUI — \d/g) || [];
    expect(stamped).toHaveLength(12);
    H.expectNoRuntimeErrors(errors);
  });

  test('test_consent_cleared_on_restart_does_not_break_a_full_second_journey', async ({ page }) => {
    test.setTimeout(180000);
    const errors = await H.openApp(page);

    await H.passQuiz(page);
    await page.reload();

    // Second complete journey from scratch in the same session.
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails());
    await H.submitDetails(page);
    await page.click('#review button.btn-primary');
    await H.expectStep(page, 'done');

    const wa = await page.locator('#waMessage').inputValue();
    expect(wa).toContain('Nama: Budi Santoso');
    expect(wa).toContain('FINAL CONSENT: SEMUA DISETUJUI');
    H.expectNoRuntimeErrors(errors);
  });
});

test.describe('Post-fix — post-quiz timer cancellation', () => {
  test('test_double_submitting_a_passing_quiz_settles_on_screening', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);
    await H.answerQuiz(page, H.ANSWER_KEY);

    await page.locator('#checkQuizBtn').dblclick();
    await H.expectStep(page, 'screening');
    await page.waitForTimeout(1200);
    // No stray timer may bounce the user around afterwards.
    expect(await H.currentStep(page)).toBe('screening');
    expect(await page.evaluate(() => sessionStorage.getItem('quizPassed'))).toBe('true');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_timer_does_not_fire_after_navigating_to_welcome', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);
    await H.answerQuiz(page, H.ANSWER_KEY);
    await H.submitQuiz(page);

    await page.evaluate(() => go('welcome'));
    expect(await H.currentStep(page)).toBe('welcome');
    await page.waitForTimeout(1500);
    expect(await H.currentStep(page), 'stale timer must stay cancelled').toBe('welcome');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_normal_pass_still_auto_advances_to_screening', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);
    await H.answerQuiz(page, H.ANSWER_KEY);
    await H.submitQuiz(page);

    // The success card shows first, then the redirect happens on its own.
    await expect(page.locator('#quizResult')).toContainText('Quiz lulus — 12/12');
    await H.expectStep(page, 'screening');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_failed_quiz_schedules_no_redirect', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);
    const wrong = [...H.ANSWER_KEY];
    wrong[3] = (wrong[3] + 1) % 4;
    await H.answerQuiz(page, wrong);
    await H.submitQuiz(page);

    await expect(page.locator('#quizFailureModal')).toHaveClass(/show/);
    await page.waitForTimeout(1500);
    // Failing must never auto-advance.
    expect(await H.currentStep(page)).toBe('quiz');
    await expect(page.locator('#quizFailureModal')).toHaveClass(/show/);
    H.expectNoRuntimeErrors(errors);
  });
});
