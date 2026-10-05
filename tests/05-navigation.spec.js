const { test, expect } = require('@playwright/test');
const H = require('./helpers');

test.describe('Navigation', () => {
  test('test_rules_can_be_navigated_backwards', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);

    // Advance to rule 4.
    for (let i = 0; i < 3; i++) {
      await page.locator('#ruleAgree').click();
      await page.click('#ruleNext');
    }
    await expect(page.locator('#ruleCounter')).toHaveText('Aturan 4 dari 12');

    // Walk back to rule 1.
    for (let i = 3; i > 0; i--) {
      await page.click('#rules button.btn-light');
      await expect(page.locator('#ruleCounter')).toHaveText(`Aturan ${i} dari 12`);
    }
    H.expectNoRuntimeErrors(errors);
  });

  test('test_back_from_first_rule_returns_to_welcome', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await expect(page.locator('#ruleCounter')).toHaveText('Aturan 1 dari 12');

    await page.click('#rules button.btn-light');
    await H.expectStep(page, 'welcome');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_rule_progress_bar_tracks_position', async ({ page }) => {
    await H.openApp(page);
    await H.startRules(page);
    await expect(page.locator('#rulePercent')).toHaveText('8%');

    for (let i = 0; i < 5; i++) {
      await page.locator('#ruleAgree').click();
      await page.click('#ruleNext');
    }
    await expect(page.locator('#ruleCounter')).toHaveText('Aturan 6 dari 12');
    await expect(page.locator('#rulePercent')).toHaveText('50%');
  });

  test('test_quiz_read_rules_again_button_returns_to_rules', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    await page.click('#quiz button.btn-light');
    await H.expectStep(page, 'rules');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_details_back_to_screening_preserves_entered_data', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);
    await H.expectStep(page, 'details');

    await page.click('#details button.btn-light');
    await H.expectStep(page, 'screening');
    await expect(page.locator('#name')).toHaveValue('Budi Santoso');
    await expect(page.locator('#phone')).toHaveValue('08123456789');
    await expect(page.locator('#homeStatus')).toHaveValue('own');
    await expect(page.locator('#isTangselYes')).toBeChecked();
    await expect(page.locator('#incomeYes')).toBeChecked();
    H.expectNoRuntimeErrors(errors);
  });

  test('test_review_edit_returns_to_details_preserving_data', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails());
    await H.submitDetails(page);
    await H.expectStep(page, 'review');

    await page.click('#review button.btn-light');
    await H.expectStep(page, 'details');
    await expect(page.locator('#ktp')).toHaveValue('3674010101900001');
    await expect(page.locator('#address')).toHaveValue('Jl. Melati No. 10, RT 001 RW 002');
    const checked = await page.locator('#details input.final:checked').count();
    expect(checked).toBe(9);

    // And forward again.
    await H.submitDetails(page);
    await H.expectStep(page, 'review');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_edited_details_are_reflected_in_regenerated_summary', async ({ page }) => {
    await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails());
    await H.submitDetails(page);
    await expect(page.locator('#summary')).toContainText('Nama panggilan: Budi');

    await page.click('#review button.btn-light');
    await page.fill('#nickname', 'Budiman');
    await H.submitDetails(page);
    await H.expectStep(page, 'review');
    // Assert on the exact line: toContainText() normalises whitespace, so a plain
    // substring check cannot distinguish "Budi" from "Budiman".
    const summary = await page.locator('#summary').textContent();
    expect(summary).toMatch(/^Nama panggilan: Budiman$/m);
    expect(summary).not.toMatch(/^Nama panggilan: Budi$/m);
  });
});

test.describe('Refresh and session handling', () => {
  test('test_refresh_on_welcome_stays_on_welcome', async ({ page }) => {
    const errors = await H.openApp(page);
    await page.reload();
    await H.expectStep(page, 'welcome');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_refresh_mid_rules_returns_to_welcome', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await page.locator('#ruleAgree').click();
    await page.click('#ruleNext');
    await expect(page.locator('#ruleCounter')).toHaveText('Aturan 2 dari 12');

    await page.reload();
    // No persistence of in-flight rule progress: the user restarts from welcome.
    await H.expectStep(page, 'welcome');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_refresh_after_passing_quiz_returns_to_welcome_but_keeps_pass', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    expect(await page.evaluate(() => sessionStorage.getItem('quizPassed'))).toBe('true');

    await page.reload();
    await H.expectStep(page, 'welcome');
    // The quiz pass lives in sessionStorage so it survives a reload.
    expect(await page.evaluate(() => sessionStorage.getItem('quizPassed'))).toBe('true');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_refresh_mid_details_discards_entered_data', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails());

    await page.reload();
    await H.expectStep(page, 'welcome');
    // Form state is intentionally not persisted anywhere.
    await expect(page.locator('#ktp')).toHaveValue('');
    await expect(page.locator('#name')).toHaveValue('');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_starting_rules_clears_a_previous_quiz_pass', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    expect(await page.evaluate(() => sessionStorage.getItem('quizPassed'))).toBe('true');

    await page.reload();
    await H.startRules(page);
    // startRules() must revoke the previous pass so the quiz gate applies again.
    expect(await page.evaluate(() => sessionStorage.getItem('quizPassed'))).toBeNull();
    H.expectNoRuntimeErrors(errors);
  });

  test('test_app_uses_no_localstorage_so_new_session_starts_clean', async ({ page }) => {
    await H.openApp(page);
    await H.passQuiz(page);
    const local = await page.evaluate(() => Object.keys(localStorage));
    expect(local, 'app should not persist onboarding state to localStorage').toEqual([]);
  });
});
