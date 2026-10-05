const { test, expect } = require('@playwright/test');
const H = require('./helpers');

test.describe('Happy path', () => {
  test('test_welcome_screen_loads_with_zero_progress', async ({ page }) => {
    const errors = await H.openApp(page);
    await expect(page.locator('#progressLabel')).toHaveText('Selamat datang');
    await expect(page.locator('#progressPercent')).toHaveText('');
    await expect(page.locator('#welcome h1')).toContainText('baca aturan penting');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_all_12_rules_can_be_acknowledged', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);

    for (let i = 0; i < H.RULE_COUNT; i++) {
      await expect(page.locator('#ruleCounter')).toHaveText(`Aturan ${i + 1} dari ${H.RULE_COUNT}`);
      await expect(page.locator('#ruleNumber')).toHaveText(`ATURAN ${String(i + 1).padStart(2, '0')}`);
      await expect(page.locator('#ruleTitle')).not.toBeEmpty();
      await expect(page.locator('#ruleText')).not.toBeEmpty();
      await page.locator('#ruleAgree').click();
      await expect(page.locator('#ruleConsentTime')).toHaveText('');
      await page.click('#ruleNext');
    }
    await H.expectStep(page, 'quiz');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_successful_quiz_unlocks_registration', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);
    await H.answerQuiz(page, H.ANSWER_KEY);
    await H.submitQuiz(page);

    await expect(page.locator('#quizResult')).toContainText('Quiz lulus — 12/12');
    expect(await page.evaluate(() => sessionStorage.getItem('quizPassed'))).toBe('true');
    await H.expectStep(page, 'screening');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_full_journey_welcome_to_whatsapp_message', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);

    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);
    await H.expectStep(page, 'details');

    await H.fillDetails(page, H.validDetails());
    await H.submitDetails(page);
    await H.expectStep(page, 'review');

    const summary = await page.locator('#summary').textContent();
    expect(summary).toContain('STATUS AWAL: PRIORITAS — RUMAH SENDIRI');
    expect(summary).toContain('Nama: Budi Santoso');
    expect(summary).toContain('No. KTP: 3674010101900001');
    expect(summary).toContain('FINAL CONSENT: SEMUA DISETUJUI');

    await page.click('#review button.btn-primary');
    await H.expectStep(page, 'done');

    const wa = await page.locator('#waMessage').inputValue();
    expect(wa).toContain('Mohon dilakukan review calon mitra.');
    const href = await page.locator('#waLink').getAttribute('href');
    expect(href).toContain('https://wa.me/6287720847415?text=');
    expect(decodeURIComponent(href.split('text=')[1])).toContain('Nama: Budi Santoso');

    H.expectNoRuntimeErrors(errors);
  });

  test('test_progress_indicator_advances_through_steps', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await expect(page.locator('#progressLabel')).toHaveText('Langkah 1 dari 5');
    await expect(page.locator('#progressPercent')).toHaveText('20%');

    await H.acknowledgeAllRules(page);
    await expect(page.locator('#progressLabel')).toHaveText('Langkah 2 dari 5');
    await expect(page.locator('#progressPercent')).toHaveText('40%');

    await H.answerQuiz(page, H.ANSWER_KEY);
    await H.submitQuiz(page);
    await H.expectStep(page, 'screening');
    await expect(page.locator('#progressLabel')).toHaveText('Langkah 3 dari 5');
    await expect(page.locator('#progressPercent')).toHaveText('60%');

    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);
    await expect(page.locator('#progressLabel')).toHaveText('Langkah 4 dari 5');

    await H.fillDetails(page, H.validDetails());
    await H.submitDetails(page);
    await expect(page.locator('#progressLabel')).toHaveText('Langkah 5 dari 5');
    await expect(page.locator('#progressPercent')).toHaveText('100%');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_rule_consent_timestamp_recorded_after_advancing', async ({ page }) => {
    await H.openApp(page);
    await H.startRules(page);
    await page.locator('#ruleAgree').click();
    await page.click('#ruleNext');
    // Go back to rule 1: the consent timestamp must now be shown.
    await page.click('#rules button.btn-light');
    await expect(page.locator('#ruleCounter')).toHaveText('Aturan 1 dari 12');
    await expect(page.locator('#ruleConsentTime')).toContainText('Disetujui pada');
    await expect(page.locator('#ruleAgree')).toBeChecked();
  });
});
