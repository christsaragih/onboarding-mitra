const { test, expect } = require('@playwright/test');
const H = require('./helpers');

/**
 * These tests assert the behaviour the application promises, not the behaviour it
 * currently has. They are expected to FAIL until the corresponding bug is fixed.
 * Do not weaken them to make the suite green.
 */

test.describe('BUG-001 — go("rules") never re-renders the rule screen', () => {
  test('test_read_rules_again_returns_to_the_first_rule', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);
    await H.expectStep(page, 'quiz');

    // "Baca aturan lagi" = "read the rules again" -> it should start from rule 1.
    await page.click('#quiz button.btn-light');
    await H.expectStep(page, 'rules');
    await expect(page.locator('#ruleCounter')).toHaveText('Aturan 1 dari 12');
    await expect(page.locator('#ruleNumber')).toHaveText('ATURAN 01');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_rules_screen_is_never_shown_blank', async ({ page }) => {
    const errors = await H.openApp(page);

    // Reaching the quiz through the gate redirect means the rules were never
    // rendered; opening the rules screen from there must still show a rule.
    await page.evaluate(() => go('screening'));
    await H.expectStep(page, 'quiz');
    await page.click('#quiz button.btn-light');
    await H.expectStep(page, 'rules');

    await expect(page.locator('#ruleNumber')).not.toBeEmpty();
    await expect(page.locator('#ruleTitle')).not.toBeEmpty();
    await expect(page.locator('#ruleText')).not.toBeEmpty();
    await expect(page.locator('#ruleCounter')).toHaveText('Aturan 1 dari 12');
    H.expectNoRuntimeErrors(errors);
  });
});

test.describe('BUG-002 — pending quizPass timer overrides later navigation', () => {
  test('test_leaving_the_quiz_during_the_pass_delay_is_respected', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);
    await H.answerQuiz(page, H.ANSWER_KEY);
    await H.submitQuiz(page);

    // quizPass() schedules go('screening') 900ms later. Navigating away in the
    // meantime is a deliberate user action and must not be undone by the timer.
    await page.click('#quiz button.btn-light'); // "Baca aturan lagi"
    expect(await H.currentStep(page)).toBe('rules');

    await page.waitForTimeout(1600);
    expect(await H.currentStep(page), 'stale timer must not yank the user away').toBe('rules');
    H.expectNoRuntimeErrors(errors);
  });
});

test.describe('BUG-003 — failed quiz does not force rules to be re-acknowledged', () => {
  async function failQuizAndRestart(page) {
    await H.startRules(page);
    await H.acknowledgeAllRules(page);
    const wrong = [...H.ANSWER_KEY];
    wrong[0] = (wrong[0] + 1) % 4;
    await H.answerQuiz(page, wrong);
    await H.submitQuiz(page);
    await expect(page.locator('#quizFailureModal')).toHaveClass(/show/);
    await page.click('#quizFailureOk');
    await H.expectStep(page, 'welcome');
    await H.startRules(page);
  }

  test('test_consent_is_cleared_after_a_failed_quiz', async ({ page }) => {
    const errors = await H.openApp(page);
    await failQuizAndRestart(page);

    // The failure popup requires reading all 12 rules again, so the consent
    // checkbox must start blank and the Next button must start disabled.
    await expect(page.locator('#ruleCounter')).toHaveText('Aturan 1 dari 12');
    await expect(page.locator('#ruleAgree')).not.toBeChecked();
    await expect(page.locator('#ruleNext')).toBeDisabled();
    await expect(page.locator('#ruleConsentTime')).toHaveText('');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_rules_cannot_be_clicked_through_without_re_consenting', async ({ page }) => {
    await H.openApp(page);
    await failQuizAndRestart(page);

    // Click Next repeatedly without touching any checkbox: the flow must stall
    // on rule 1 instead of walking all the way back to the quiz.
    let advanced = 0;
    for (let i = 0; i < 12; i++) {
      if (await page.locator('#ruleNext').isEnabled()) {
        await page.click('#ruleNext');
        advanced++;
      }
    }
    expect(advanced, 'no rule should advance without a fresh consent click').toBe(0);
    expect(await H.currentStep(page)).toBe('rules');
  });

  test('test_consent_timestamps_are_refreshed_on_a_second_reading', async ({ page }) => {
    test.setTimeout(120000);
    await H.openApp(page);

    // First pass: capture the timestamp recorded for rule 1.
    await H.startRules(page);
    await page.locator('#ruleAgree').click();
    await page.click('#ruleNext');
    const firstTimes = await page.evaluate(() => [...times]);

    // Fail the quiz, then read the rules again.
    for (let i = 1; i < 12; i++) {
      await page.locator('#ruleAgree').click();
      await page.click('#ruleNext');
    }
    const wrong = [...H.ANSWER_KEY];
    wrong[0] = (wrong[0] + 1) % 4;
    await H.answerQuiz(page, wrong);
    await H.submitQuiz(page);
    await page.click('#quizFailureOk');
    await H.startRules(page);

    // The audit trail sent to the admin must not still show the first reading.
    const afterRestart = await page.evaluate(() => [...times]);
    expect(afterRestart[0], 'stale consent timestamp survives a failed quiz').not.toBe(firstTimes[0]);
  });
});
