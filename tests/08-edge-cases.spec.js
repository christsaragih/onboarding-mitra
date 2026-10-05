const { test, expect } = require('@playwright/test');
const H = require('./helpers');

test.describe('Edge cases — input handling', () => {
  test('test_html_injection_in_fields_is_not_executed', async ({ page }) => {
    const errors = await H.openApp(page);
    let dialogShown = false;
    page.on('dialog', (d) => {
      dialogShown = true;
      d.dismiss();
    });

    const payload = '<img src=x onerror=alert(1)>';
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening({ name: payload, landmark: 'A&B <b>bold</b>' }));
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails());
    await H.submitDetails(page);
    await H.expectStep(page, 'review');

    // The summary is built with textContent, so markup stays inert text.
    const summary = await page.locator('#summary').textContent();
    expect(summary).toContain(payload);
    expect(await page.locator('#summary img').count()).toBe(0);
    expect(await page.locator('#summary b').count()).toBe(0);
    expect(dialogShown).toBe(false);
    H.expectNoRuntimeErrors(errors);
  });

  test('test_injection_payload_is_percent_encoded_in_whatsapp_link', async ({ page }) => {
    await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening({ name: '<img src=x onerror=alert(1)>' }));
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails());
    await H.submitDetails(page);
    await page.click('#review button.btn-primary');
    await H.expectStep(page, 'done');

    const href = await page.locator('#waLink').getAttribute('href');
    expect(href).toContain('%3Cimg');
    expect(href).not.toContain('<img');
  });

  test('test_very_long_values_are_accepted_and_preserved', async ({ page }) => {
    const errors = await H.openApp(page);
    const long = 'X'.repeat(500);

    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening({ name: long }));
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails({ address: long }));
    await H.submitDetails(page);
    await H.expectStep(page, 'review');

    const summary = await page.locator('#summary').textContent();
    expect(summary).toContain(long);
    H.expectNoRuntimeErrors(errors);
  });

  test('test_unicode_and_emoji_values_survive_the_flow', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening({ name: 'Būdi 🚗 Santoso — Ñ' }));
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails());
    await H.submitDetails(page);
    await page.click('#review button.btn-primary');

    const wa = await page.locator('#waMessage').inputValue();
    expect(wa).toContain('Būdi 🚗 Santoso — Ñ');
    const href = await page.locator('#waLink').getAttribute('href');
    expect(decodeURIComponent(href.split('text=')[1])).toContain('Būdi 🚗 Santoso');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_leading_and_trailing_whitespace_is_trimmed_in_summary', async ({ page }) => {
    await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening({ name: '   Budi Santoso   ' }));
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails());
    await H.submitDetails(page);

    const summary = await page.locator('#summary').textContent();
    expect(summary).toMatch(/^Nama: Budi Santoso$/m);
  });
});

test.describe('Edge cases — rapid and repeated interaction', () => {
  test('test_double_clicking_next_does_not_skip_a_rule', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await page.locator('#ruleAgree').click();
    await page.locator('#ruleNext').dblclick();

    // The second click lands on an un-consented rule, so it must be ignored.
    await expect(page.locator('#ruleCounter')).toHaveText('Aturan 2 dari 12');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_pressing_enter_in_the_quiz_does_not_submit_or_reload', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);
    await H.answerQuiz(page, H.ANSWER_KEY);

    const urlBefore = page.url();
    await page.locator('input[name="quiz_0"]:checked').focus();
    await page.keyboard.press('Enter');

    // The quiz <form> has no submit button, so Enter must not navigate away.
    expect(page.url()).toBe(urlBefore);
    await H.expectStep(page, 'quiz');
    expect(await page.locator('#quizQuestions input:checked').count()).toBe(12);
    expect(await page.evaluate(() => sessionStorage.getItem('quizPassed'))).toBeNull();
    H.expectNoRuntimeErrors(errors);
  });

  test('test_resubmitting_quiz_after_a_validation_error_works', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    await H.submitQuiz(page);
    await expect(page.locator('#quizError')).toContainText('Semua 12 soal wajib dijawab');

    await H.answerQuiz(page, H.ANSWER_KEY);
    await H.submitQuiz(page);
    await H.expectStep(page, 'screening');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_blocked_then_corrected_answer_allows_progress_without_requiz', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);

    // Refused commitment -> blocked.
    await H.fillScreening(page, H.validScreening({ area: 'no' }));
    await H.submitScreening(page);
    await H.expectStep(page, 'blocked');

    // Go back via go('screening') -- still allowed because the quiz pass stands.
    await page.evaluate(() => go('screening'));
    await H.expectStep(page, 'screening');
    await page.selectOption('#area', 'yes');
    await H.submitScreening(page);
    await H.expectStep(page, 'details');
    H.expectNoRuntimeErrors(errors);
  });
});

test.describe('Edge cases — input format tolerance (documented behaviour)', () => {
  // The app validates presence only; formats are left to the admin to verify.
  // These tests pin the current contract so a future tightening is a visible change.
  test('test_non_numeric_phone_is_currently_accepted', async ({ page }) => {
    await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening({ phone: 'not-a-phone' }));
    await H.submitScreening(page);
    expect(await H.currentStep(page)).toBe('details');
  });

  test('test_malformed_maps_url_is_currently_accepted', async ({ page }) => {
    await H.openApp(page);
    await H.passQuiz(page);
    // #maps is declared type="url" but is never format-validated.
    await H.fillScreening(page, H.validScreening({ maps: 'definitely not a url' }));
    await H.submitScreening(page);
    expect(await H.currentStep(page)).toBe('details');
  });

  test('test_non_numeric_ktp_and_postcode_are_currently_accepted', async ({ page }) => {
    await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails({ ktp: 'abc', postcode: 'zzzz' }));
    await H.submitDetails(page);
    expect(await H.currentStep(page)).toBe('review');
  });

  test('test_future_birth_date_is_currently_accepted', async ({ page }) => {
    await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails({ birthDate: '2099-12-31' }));
    await H.submitDetails(page);

    expect(await H.currentStep(page)).toBe('review');
    const summary = await page.locator('#summary').textContent();
    expect(summary).toContain('2099-12-31');
  });
});
