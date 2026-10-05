const { test, expect } = require('@playwright/test');
const H = require('./helpers');

/**
 * Hard gates implemented in screenNext():
 *  - income === 'no'            -> blocked (checked before anything else)
 *  - homeStatus === 'boarding'  -> blocked
 *  - any of isTangsel/income/pay/deadline/weekly/maintenance/locationConsent/area === 'no' -> blocked
 *  - isTangsel !== 'yes'        -> blocked
 */
test.describe('Business rules — hard gates', () => {
  test('test_income_cannot_be_proven_blocks_registration', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening({ income: 'no' }));
    await H.submitScreening(page);

    await H.expectStep(page, 'blocked');
    await expect(page.locator('#blockedText')).toContainText('Syarat pendapatan belum terpenuhi');
    await expect(page.locator('#blockedText')).toContainText('Rp500.000');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_income_gate_takes_priority_over_missing_fields', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    // Only answer the income question, leave everything else empty.
    await page.click('label[for="incomeNo"]');
    await H.submitScreening(page);

    // The income gate is evaluated first and must win over the "missing fields" error.
    await H.expectStep(page, 'blocked');
    await expect(page.locator('#blockedText')).toContainText('Syarat pendapatan belum terpenuhi');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_boarding_house_is_rejected', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening({ homeStatus: 'boarding' }));
    await H.submitScreening(page);

    await H.expectStep(page, 'blocked');
    await expect(page.locator('#blockedText')).toContainText('Kos');
    await expect(page.locator('#blockedText')).toContainText('belum memenuhi kriteria');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_selecting_boarding_house_shows_inline_warning', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);

    const notice = page.locator('#homeNotice');
    await expect(notice).toHaveClass('info-card');

    await page.selectOption('#homeStatus', 'boarding');
    await expect(notice).toHaveClass('danger-card');
    await expect(notice).toContainText('Kos belum memenuhi syarat pendaftaran');

    // Switching back to an acceptable status must restore the neutral notice.
    await page.selectOption('#homeStatus', 'own');
    await expect(notice).toHaveClass('info-card');
    await expect(notice).toContainText('Rumah sendiri menjadi prioritas');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_living_outside_tangsel_blocks_registration', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening({ isTangsel: 'no' }));
    await H.submitScreening(page);

    await H.expectStep(page, 'blocked');
    await expect(page.locator('#blockedText')).toContainText('domisili Tangerang Selatan');
    H.expectNoRuntimeErrors(errors);
  });

  const commitments = [
    ['pay', 'pembayaran Rp160.000/hari'],
    ['deadline', 'pembayaran maksimal pukul 22.00'],
    ['weekly', 'pemeriksaan kendaraan setiap minggu'],
    ['maintenance', 'jadwal perawatan kendaraan'],
    ['locationConsent', 'berbagi lokasi saat bekerja'],
    ['area', 'aturan area penggunaan'],
  ];

  for (const [field, label] of commitments) {
    test(`test_refusing_${field}_commitment_blocks_registration`, async ({ page }) => {
      const errors = await H.openApp(page);
      await H.passQuiz(page);
      await H.fillScreening(page, H.validScreening({ [field]: 'no' }));
      await H.submitScreening(page);

      await H.expectStep(page, 'blocked');
      await expect(page.locator('#blockedText')).toContainText('Ada syarat utama yang belum sesuai');
      await expect(page.locator('#blockedText')).toContainText(label);
      H.expectNoRuntimeErrors(errors);
    });
  }

  test('test_all_acceptable_home_statuses_reach_details', async ({ page }) => {
    test.setTimeout(180000);
    const errors = await H.openApp(page);
    await H.passQuiz(page);

    for (const status of ['own', 'parent', 'family', 'spouse', 'rent', 'other']) {
      await H.fillScreening(page, H.validScreening({ homeStatus: status }));
      await H.submitScreening(page);
      expect(await H.currentStep(page), `homeStatus=${status} must be allowed`).toBe('details');
      // Return to screening for the next iteration.
      await page.click('#details button.btn-light');
      await H.expectStep(page, 'screening');
    }
    H.expectNoRuntimeErrors(errors);
  });

  test('test_own_house_is_flagged_priority_in_summary', async ({ page }) => {
    await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening({ homeStatus: 'own' }));
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails());
    await H.submitDetails(page);

    await H.expectStep(page, 'review');
    await expect(page.locator('#summary')).toContainText('STATUS AWAL: PRIORITAS — RUMAH SENDIRI');
  });

  test('test_non_own_house_is_flagged_review_in_summary', async ({ page }) => {
    await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening({ homeStatus: 'rent' }));
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails());
    await H.submitDetails(page);

    await H.expectStep(page, 'review');
    await expect(page.locator('#summary')).toContainText(
      'STATUS AWAL: REVIEW — TEMPAT TINGGAL BUKAN RUMAH SENDIRI'
    );
  });
});

test.describe('Business rules — recovery from blocked state', () => {
  test('test_blocked_user_can_return_to_welcome', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening({ income: 'no' }));
    await H.submitScreening(page);
    await H.expectStep(page, 'blocked');

    await page.click('#blocked button');
    await H.expectStep(page, 'welcome');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_blocked_user_can_restart_and_complete_after_fixing_answer', async ({ page }) => {
    test.setTimeout(120000);
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening({ pay: 'no' }));
    await H.submitScreening(page);
    await H.expectStep(page, 'blocked');

    await page.click('#blocked button');
    await H.expectStep(page, 'welcome');
    // Returning to welcome keeps the earned quiz pass in session state; the only
    // way forward from welcome is startRules(), which clears it and re-gates the quiz.
    expect(await page.evaluate(() => sessionStorage.getItem('quizPassed'))).toBe('true');

    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening({ pay: 'yes' }));
    await H.submitScreening(page);
    await H.expectStep(page, 'details');
    H.expectNoRuntimeErrors(errors);
  });
});
