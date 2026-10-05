const { test, expect } = require('@playwright/test');
const H = require('./helpers');

test.describe('Screening validation', () => {
  test('test_empty_screening_form_is_rejected_with_all_fields_listed', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    await H.submitScreening(page);

    await H.expectStep(page, 'screening');
    const err = page.locator('#screenError');
    await expect(err).toContainText('Masih ada yang belum diisi');
    // All 21 required fields must be reported.
    await expect(err.locator('li')).toHaveCount(21);
    H.expectNoRuntimeErrors(errors);
  });

  test('test_single_missing_required_field_is_reported', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);

    const data = H.validScreening();
    delete data.maps;
    await H.fillScreening(page, data);
    await H.submitScreening(page);

    await H.expectStep(page, 'screening');
    await expect(page.locator('#screenError li')).toHaveCount(1);
    await expect(page.locator('#screenError')).toContainText('Link Google Maps rumah');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_whitespace_only_input_is_treated_as_empty', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);

    await H.fillScreening(page, H.validScreening({ name: '   ', landmark: '\t  ' }));
    await H.submitScreening(page);

    await H.expectStep(page, 'screening');
    await expect(page.locator('#screenError')).toContainText('Nama lengkap');
    await expect(page.locator('#screenError')).toContainText('Patokan rumah');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_missing_tangsel_radio_is_reported', async ({ page }) => {
    await H.openApp(page);
    await H.passQuiz(page);

    const data = H.validScreening();
    delete data.isTangsel;
    await H.fillScreening(page, data);
    await H.submitScreening(page);

    await H.expectStep(page, 'screening');
    await expect(page.locator('#screenError')).toContainText('Domisili Tangerang Selatan');
  });

  test('test_missing_income_radio_is_reported', async ({ page }) => {
    await H.openApp(page);
    await H.passQuiz(page);

    const data = H.validScreening();
    delete data.income;
    await H.fillScreening(page, data);
    await H.submitScreening(page);

    await H.expectStep(page, 'screening');
    await expect(page.locator('#screenError')).toContainText('Syarat pendapatan');
  });

  test('test_screening_can_be_corrected_and_resubmitted_after_error', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);

    const data = H.validScreening();
    delete data.phone;
    await H.fillScreening(page, data);
    await H.submitScreening(page);
    await expect(page.locator('#screenError')).toContainText('Nomor WhatsApp aktif');

    // Recovery: fill the missing field and resubmit.
    await page.fill('#phone', '08123456789');
    await H.submitScreening(page);
    await H.expectStep(page, 'details');
    H.expectNoRuntimeErrors(errors);
  });
});

test.describe('Details validation', () => {
  test('test_empty_details_form_is_rejected', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);
    await H.expectStep(page, 'details');

    await H.submitDetails(page);
    await H.expectStep(page, 'details');
    await expect(page.locator('#detailError')).toContainText('Masih ada data yang belum diisi');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_details_requires_every_final_consent_checkbox', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);

    await H.fillDetails(page, H.validDetails());
    const boxes = page.locator('#details input.final');
    const total = await boxes.count();
    expect(total).toBe(9);

    // Unchecking any single consent must block submission.
    for (const i of [0, 4, total - 1]) {
      await boxes.nth(i).uncheck();
      await H.submitDetails(page);
      await H.expectStep(page, 'details');
      await expect(page.locator('#detailError')).toContainText('persetujuan yang belum dicentang');
      await boxes.nth(i).check();
    }

    await H.submitDetails(page);
    await H.expectStep(page, 'review');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_each_required_detail_field_blocks_submission', async ({ page }) => {
    test.setTimeout(180000); // 19 sub-cases, each re-triggering the app's scroll-to-error
    await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);

    const required = ['ktp', 'nickname', 'birthPlace', 'marital', 'stayDuration', 'address',
      'rt', 'rw', 'postcode', 'landmark2', 'maps2', 'mother', 'motherPhone',
      'emergency', 'emergencyPhone', 'arrears', 'repo', 'ownCar', 'selfUse'];

    await H.fillDetails(page, H.validDetails());

    for (const id of required) {
      const tag = await page.locator(`#${id}`).evaluate((el) => el.tagName);
      if (tag === 'SELECT') await page.selectOption(`#${id}`, '');
      else await page.fill(`#${id}`, '');

      await H.submitDetails(page);
      expect(await H.currentStep(page), `clearing #${id} must block submit`).toBe('details');

      // Restore
      const value = H.validDetails()[id];
      if (tag === 'SELECT') await page.selectOption(`#${id}`, value);
      else await page.fill(`#${id}`, value);
    }

    await H.submitDetails(page);
    await H.expectStep(page, 'review');
  });

  test('test_optional_detail_fields_may_stay_blank_and_render_as_dash', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);

    // homeOwner, homeRelation, family, familyPhone, arrearsNote, repoNote, otherUser are optional.
    await H.fillDetails(page, H.validDetails());
    await H.submitDetails(page);
    await H.expectStep(page, 'review');

    const summary = await page.locator('#summary').textContent();
    expect(summary).toContain('Pemilik rumah: -');
    expect(summary).toContain('Hubungan: -');
    expect(summary).toContain('Pasangan/keluarga: - / -');
    expect(summary).toContain('Catatan tunggakan: -');
    expect(summary).toContain('Jika tidak: -');
    H.expectNoRuntimeErrors(errors);
  });
});
