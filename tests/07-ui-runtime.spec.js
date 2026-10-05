const { test, expect } = require('@playwright/test');
const H = require('./helpers');

test.describe('UI interaction — rule consent box', () => {
  test('test_clicking_consent_box_background_toggles_checkbox', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);

    const box = page.locator('#ruleAgree');
    const next = page.locator('#ruleNext');
    await expect(box).not.toBeChecked();
    await expect(next).toBeDisabled();

    // Click the wrapper (not the input itself) -> onclick="toggleRuleConsent()".
    await page.click('#rules .form-check-box .choice-label');
    await expect(box).toBeChecked();
    await expect(next).toBeEnabled();

    await page.click('#rules .form-check-box .choice-label');
    await expect(box).not.toBeChecked();
    await expect(next).toBeDisabled();
    H.expectNoRuntimeErrors(errors);
  });

  test('test_clicking_checkbox_directly_toggles_once_only', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);

    const box = page.locator('#ruleAgree');
    // The input stops propagation so the wrapper handler must not double-fire.
    await box.click();
    await expect(box).toBeChecked();
    await expect(page.locator('#ruleNext')).toBeEnabled();

    await box.click();
    await expect(box).not.toBeChecked();
    await expect(page.locator('#ruleNext')).toBeDisabled();
    H.expectNoRuntimeErrors(errors);
  });

  test('test_next_button_stays_disabled_until_consent_given', async ({ page }) => {
    await H.openApp(page);
    await H.startRules(page);

    await expect(page.locator('#ruleNext')).toBeDisabled();
    // Clicking a disabled button must not advance the flow.
    await page.locator('#ruleNext').click({ force: true }).catch(() => {});
    await expect(page.locator('#ruleCounter')).toHaveText('Aturan 1 dari 12');
  });

  test('test_unchecking_consent_disables_next_again', async ({ page }) => {
    await H.openApp(page);
    await H.startRules(page);
    await page.locator('#ruleAgree').click();
    await page.click('#ruleNext');
    await expect(page.locator('#ruleCounter')).toHaveText('Aturan 2 dari 12');

    await page.locator('#ruleAgree').click(); // consent on rule 2
    await expect(page.locator('#ruleNext')).toBeEnabled();
    await page.locator('#ruleAgree').click(); // revoke
    await expect(page.locator('#ruleNext')).toBeDisabled();
  });
});

test.describe('UI interaction — quiz radios', () => {
  test('test_only_one_option_per_question_can_be_selected', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    await page.click('input[name="quiz_0"][value="0"]');
    await expect(page.locator('input[name="quiz_0"][value="0"]')).toBeChecked();

    await page.click('input[name="quiz_0"][value="3"]');
    await expect(page.locator('input[name="quiz_0"][value="3"]')).toBeChecked();
    await expect(page.locator('input[name="quiz_0"][value="0"]')).not.toBeChecked();
    expect(await page.locator('input[name="quiz_0"]:checked').count()).toBe(1);
    H.expectNoRuntimeErrors(errors);
  });

  test('test_changing_a_wrong_answer_to_the_right_one_passes', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    const wrong = [...H.ANSWER_KEY];
    wrong[5] = (wrong[5] + 1) % 4;
    await H.answerQuiz(page, wrong);
    // Correct it before submitting.
    await page.click(`input[name="quiz_5"][value="${H.ANSWER_KEY[5]}"]`);
    await H.submitQuiz(page);

    await H.expectStep(page, 'screening');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_clicking_option_label_selects_the_radio', async ({ page }) => {
    await H.openApp(page);
    await H.startRules(page);
    await H.acknowledgeAllRules(page);

    // Each option is wrapped in a <label>, so the text is a valid click target.
    await page.locator('#quizQuestions fieldset').first().locator('.choice-label').nth(2).click();
    await expect(page.locator('input[name="quiz_0"][value="2"]')).toBeChecked();
  });
});

test.describe('UI interaction — screening controls', () => {
  test('test_tangsel_radio_labels_drive_hidden_select_and_styling', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);

    await page.click('label[for="isTangselYes"]');
    expect(await page.evaluate(() => document.getElementById('isTangsel').value)).toBe('yes');
    await expect(page.locator('label[for="isTangselYes"]')).toHaveClass(/active-choice/);

    await page.click('label[for="isTangselNo"]');
    expect(await page.evaluate(() => document.getElementById('isTangsel').value)).toBe('no');
    await expect(page.locator('label[for="isTangselNo"]')).toHaveClass(/active-choice/);
    // The previous choice must lose its highlight.
    await expect(page.locator('label[for="isTangselYes"]')).not.toHaveClass(/active-choice/);
    H.expectNoRuntimeErrors(errors);
  });

  test('test_income_radio_labels_drive_hidden_select_and_styling', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);

    await page.click('label[for="incomeYes"]');
    expect(await page.evaluate(() => document.getElementById('income').value)).toBe('yes');
    await expect(page.locator('label[for="incomeYes"]')).toHaveClass(/active-choice/);

    await page.click('label[for="incomeNo"]');
    expect(await page.evaluate(() => document.getElementById('income').value)).toBe('no');
    await expect(page.locator('label[for="incomeYes"]')).not.toHaveClass(/active-choice/);
    H.expectNoRuntimeErrors(errors);
  });

  test('test_every_screening_select_option_is_selectable', async ({ page }) => {
    const errors = await H.openApp(page);
    await H.passQuiz(page);

    const selects = ['homeStatus', 'lotte', 'days', 'experience', 'pay', 'deadline', 'weekly', 'maintenance', 'locationConsent', 'area'];
    for (const id of selects) {
      const values = await page.evaluate(
        (sid) => [...document.getElementById(sid).options].map((o) => o.value).filter((v) => v !== ''),
        id
      );
      expect(values.length, `#${id} should offer options`).toBeGreaterThan(0);
      for (const value of values) {
        await page.selectOption(`#${id}`, value);
        await expect(page.locator(`#${id}`)).toHaveValue(value);
      }
    }
    H.expectNoRuntimeErrors(errors);
  });
});

test.describe('UI interaction — review and done', () => {
  async function reachDone(page) {
    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails());
    await H.submitDetails(page);
    await H.expectStep(page, 'review');
  }

  test('test_review_accordion_can_be_collapsed_and_expanded', async ({ page }) => {
    const errors = await H.openApp(page);
    await reachDone(page);

    const body = page.locator('#reviewSummary');
    // Bootstrap ignores a toggle while the previous one is still transitioning,
    // so each click must wait for the animation to settle first.
    const settled = () =>
      page.waitForFunction(
        () => !document.getElementById('reviewSummary').classList.contains('collapsing')
      );

    await expect(body).toHaveClass(/show/);
    await page.click('#reviewAccordion .accordion-button');
    await settled();
    await expect(body).not.toHaveClass(/show/);

    await page.click('#reviewAccordion .accordion-button');
    await settled();
    await expect(body).toHaveClass(/show/);
    H.expectNoRuntimeErrors(errors);
  });

  test('test_whatsapp_message_is_readonly_and_link_opens_safely', async ({ page }) => {
    const errors = await H.openApp(page);
    await reachDone(page);
    await page.click('#review button.btn-primary');
    await H.expectStep(page, 'done');

    await expect(page.locator('#waMessage')).toHaveAttribute('readonly', '');
    await expect(page.locator('#waLink')).toHaveAttribute('target', '_blank');
    await expect(page.locator('#waLink')).toHaveAttribute('rel', 'noopener');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_copy_message_button_writes_to_clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await H.openApp(page);
    await reachDone(page);
    await page.click('#review button.btn-primary');
    await H.expectStep(page, 'done');

    page.once('dialog', (d) => d.accept());
    await page.click('#done button.btn-light');

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('HASIL ONBOARDING CALON MITRA');
    expect(clip).toContain('Nama: Budi Santoso');
    H.expectNoRuntimeErrors(errors);
  });

  test('test_submitting_review_twice_is_idempotent', async ({ page }) => {
    await H.openApp(page);
    await reachDone(page);

    await page.click('#review button.btn-primary');
    await H.expectStep(page, 'done');
    const first = await page.locator('#waMessage').inputValue();

    // Go back and resubmit; the message must regenerate, not duplicate.
    await page.evaluate(() => go('review'));
    await page.click('#review button.btn-primary');
    const second = await page.locator('#waMessage').inputValue();
    expect(second.match(/HASIL ONBOARDING CALON MITRA/g)).toHaveLength(1);
    expect(second.replace(/Waktu submit:.*/, '')).toBe(first.replace(/Waktu submit:.*/, ''));
  });
});

test.describe('Runtime / console health', () => {
  test('test_no_runtime_errors_across_the_entire_journey', async ({ page }) => {
    const errors = await H.openApp(page);

    await H.passQuiz(page);
    await H.fillScreening(page, H.validScreening());
    await H.submitScreening(page);
    await H.fillDetails(page, H.validDetails());
    await H.submitDetails(page);
    await page.click('#review button.btn-primary');
    await H.expectStep(page, 'done');

    expect(errors.pageErrors, 'uncaught exceptions').toEqual([]);
    expect(errors.console, 'console errors').toEqual([]);
    expect(errors.failedRequests, 'failed network requests').toEqual([]);
  });

  test('test_no_runtime_errors_on_every_failure_path', async ({ page }) => {
    const errors = await H.openApp(page);

    // Quiz failure path.
    await H.startRules(page);
    await H.acknowledgeAllRules(page);
    const wrong = [...H.ANSWER_KEY];
    wrong[2] = (wrong[2] + 1) % 4;
    await H.answerQuiz(page, wrong);
    await H.submitQuiz(page);
    await page.click('#quizFailureOk');

    // Validation failure path.
    await H.passQuiz(page);
    await H.submitScreening(page);
    // Blocked path.
    await H.fillScreening(page, H.validScreening({ income: 'no' }));
    await H.submitScreening(page);
    await H.expectStep(page, 'blocked');
    await page.click('#blocked button');

    expect(errors.pageErrors).toEqual([]);
    expect(errors.console).toEqual([]);
  });

  test('test_all_expected_global_functions_are_defined', async ({ page }) => {
    await H.openApp(page);
    const missing = await page.evaluate(() => {
      const names = ['go', 'startRules', 'renderRule', 'toggleRuleConsent', 'ruleNext', 'ruleBack',
        'renderQuiz', 'checkQuiz', 'quizPass', 'quizFail', 'screenNext', 'review', 'submitFinal', 'copyWA'];
      return names.filter((n) => typeof window[n] !== 'function');
    });
    expect(missing, 'inline onclick handlers require these on window').toEqual([]);
  });

  test('test_every_inline_onclick_handler_resolves', async ({ page }) => {
    await H.openApp(page);
    const unresolved = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('[onclick]').forEach((el) => {
        const src = el.getAttribute('onclick');
        const fn = src.match(/^([A-Za-z_$][\w$]*)\s*\(/);
        if (fn && typeof window[fn[1]] !== 'function') bad.push(src);
      });
      return bad;
    });
    expect(unresolved).toEqual([]);
  });

  test('test_all_step_sections_exist_and_exactly_one_is_active', async ({ page }) => {
    await H.openApp(page);
    const state = await page.evaluate(() => {
      const ids = ['welcome', 'rules', 'quiz', 'screening', 'details', 'review', 'done', 'blocked'];
      return {
        missing: ids.filter((i) => !document.getElementById(i)),
        activeCount: document.querySelectorAll('section.step.active').length,
      };
    });
    expect(state.missing).toEqual([]);
    expect(state.activeCount).toBe(1);
  });

  test('test_form_labels_reference_existing_controls', async ({ page }) => {
    await H.openApp(page);
    const dangling = await page.evaluate(() =>
      [...document.querySelectorAll('label[for]')]
        .map((l) => l.getAttribute('for'))
        .filter((id) => !document.getElementById(id))
    );
    expect(dangling, 'label[for] must point at a real control').toEqual([]);
  });
});
