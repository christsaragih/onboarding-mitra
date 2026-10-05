// Shared helpers that model the onboarding app's real user journey.
const path = require('path');
const { expect } = require('@playwright/test');

const APP_URL = require('url').pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;

const RULE_COUNT = 12;

// Expected answer key, derived independently from the 12 rule texts in index.html.
// Kept explicit (not read from the app) so a regression in the app's answer key is detectable.
const ANSWER_KEY = [1, 2, 1, 1, 1, 2, 0, 0, 1, 1, 1, 1];

/**
 * Opens the app and starts collecting runtime errors.
 * Returns an `errors` object that accumulates console errors and uncaught exceptions.
 */
async function openApp(page) {
  const errors = { console: [], pageErrors: [], failedRequests: [] };

  // The app smooth-scrolls on every step change and validation error. Animated
  // scrolling makes elements permanently "unstable" for Playwright's actionability
  // checks, so make scrolling instant. This changes no application logic -- only
  // the animation easing -- and no assertion depends on scroll animation.
  await page.addInitScript(() => {
    const instant = (o) => (o && typeof o === 'object' ? { ...o, behavior: 'instant' } : o);
    const nativeScrollTo = window.scrollTo.bind(window);
    window.scrollTo = (a, b) =>
      typeof a === 'object' ? nativeScrollTo(instant(a)) : nativeScrollTo(a, b);
    const nativeScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (arg) {
      return nativeScrollIntoView.call(this, typeof arg === 'object' ? instant(arg) : arg);
    };
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.console.push(msg.text());
  });
  page.on('pageerror', (err) => errors.pageErrors.push(String(err)));
  page.on('requestfailed', (req) => {
    // CDN assets (bootstrap/icons) are irrelevant to functional logic but recorded.
    errors.failedRequests.push(`${req.url()} :: ${req.failure()?.errorText}`);
  });

  await page.goto(APP_URL);
  await expect(page.locator('#welcome')).toHaveClass(/active/);
  return errors;
}

/** Returns the id of the currently visible step section. */
async function currentStep(page) {
  return page.evaluate(() => {
    const el = document.querySelector('section.step.active');
    return el ? el.id : null;
  });
}

async function expectStep(page, id) {
  await expect
    .poll(() => currentStep(page), { message: `expected step "${id}"`, timeout: 5000 })
    .toBe(id);
}

/** Clicks "Mulai baca aturan" on the welcome screen. */
async function startRules(page) {
  await page.click('#welcome button.btn-primary');
  await expectStep(page, 'rules');
}

/**
 * Walks through all 12 rules, ticking the consent box and advancing.
 * Ends on the quiz step.
 */
async function acknowledgeAllRules(page) {
  for (let i = 0; i < RULE_COUNT; i++) {
    await expect(page.locator('#ruleCounter')).toHaveText(`Aturan ${i + 1} dari ${RULE_COUNT}`);
    const box = page.locator('#ruleAgree');
    if (!(await box.isChecked())) await box.click();
    await expect(page.locator('#ruleNext')).toBeEnabled();
    await page.click('#ruleNext');
  }
  await expectStep(page, 'quiz');
}

/** Fills the quiz form with the given answer indexes (sparse array allowed). */
async function answerQuiz(page, answers) {
  await expect(page.locator('#quizQuestions fieldset')).toHaveCount(RULE_COUNT);
  for (let i = 0; i < answers.length; i++) {
    if (answers[i] === undefined || answers[i] === null) continue;
    await page.click(`input[name="quiz_${i}"][value="${answers[i]}"]`);
  }
}

async function submitQuiz(page) {
  await page.click('#checkQuizBtn');
}

/** Full happy path up to and including passing the quiz. Ends on screening. */
async function passQuiz(page) {
  await startRules(page);
  await acknowledgeAllRules(page);
  await answerQuiz(page, ANSWER_KEY);
  await submitQuiz(page);
  await expectStep(page, 'screening');
}

/** A complete, valid screening payload that should reach the details step. */
function validScreening(overrides = {}) {
  return {
    name: 'Budi Santoso',
    phone: '08123456789',
    isTangsel: 'yes',
    kelurahan: 'Ciputat',
    kecamatan: 'Ciputat Timur',
    kota: 'Tangerang Selatan',
    homeStatus: 'own',
    lotte: '≤ 5 menit',
    landmark: 'Dekat Lotte Ciputat',
    maps: 'https://maps.google.com/?q=-6.3,106.7',
    income: 'yes',
    hours: '06.00-18.00',
    days: '6',
    experience: '1–3 tahun',
    platform: 'Grab',
    pay: 'yes',
    deadline: 'yes',
    weekly: 'yes',
    maintenance: 'yes',
    locationConsent: 'yes',
    area: 'yes',
    ...overrides,
  };
}

/**
 * Fills the screening form. `isTangsel` and `income` are driven through the
 * visible Bootstrap .btn-check labels, exactly as a real user would.
 */
async function fillScreening(page, data) {
  const textInputs = ['name', 'phone', 'kelurahan', 'kecamatan', 'kota', 'landmark', 'maps', 'hours', 'platform'];
  const selects = ['homeStatus', 'lotte', 'days', 'experience', 'pay', 'deadline', 'weekly', 'maintenance', 'locationConsent', 'area'];

  for (const id of textInputs) {
    if (data[id] !== undefined) await page.fill(`#${id}`, data[id]);
  }
  for (const id of selects) {
    if (data[id] !== undefined) await page.selectOption(`#${id}`, data[id]);
  }
  if (data.isTangsel !== undefined) {
    await page.click(data.isTangsel === 'yes' ? 'label[for="isTangselYes"]' : 'label[for="isTangselNo"]');
  }
  if (data.income !== undefined) {
    await page.click(data.income === 'yes' ? 'label[for="incomeYes"]' : 'label[for="incomeNo"]');
  }
}

async function submitScreening(page) {
  await page.click('#screening button.btn-primary');
}

/** A complete, valid details payload. */
function validDetails(overrides = {}) {
  return {
    ktp: '3674010101900001',
    nickname: 'Budi',
    birthPlace: 'Jakarta',
    birthDate: '1990-01-01',
    marital: 'Menikah',
    stayDuration: '5 tahun',
    address: 'Jl. Melati No. 10, RT 001 RW 002',
    rt: '001',
    rw: '002',
    postcode: '15411',
    landmark2: 'Dekat Lotte Ciputat',
    maps2: 'https://maps.google.com/?q=-6.3,106.7',
    mother: 'Siti Aminah',
    motherPhone: '08123456780',
    emergency: 'Agus',
    emergencyPhone: '08123456781',
    arrears: 'Tidak',
    repo: 'Tidak',
    ownCar: 'Tidak',
    selfUse: 'Ya',
    ...overrides,
  };
}

async function fillDetails(page, data, { checkConsents = true } = {}) {
  const selects = ['marital', 'arrears', 'repo', 'ownCar', 'selfUse'];
  for (const [id, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (selects.includes(id)) await page.selectOption(`#${id}`, value);
    else await page.fill(`#${id}`, value);
  }
  if (checkConsents) {
    const boxes = page.locator('#details input.final');
    const n = await boxes.count();
    for (let i = 0; i < n; i++) await boxes.nth(i).check();
  }
}

async function submitDetails(page) {
  await page.click('#details button.btn-primary');
}

/** Asserts no uncaught exceptions / console errors from the app itself. */
function expectNoRuntimeErrors(errors) {
  expect(errors.pageErrors, 'uncaught exceptions').toEqual([]);
  expect(errors.console, 'console errors').toEqual([]);
}

module.exports = {
  APP_URL,
  RULE_COUNT,
  ANSWER_KEY,
  openApp,
  currentStep,
  expectStep,
  startRules,
  acknowledgeAllRules,
  answerQuiz,
  submitQuiz,
  passQuiz,
  validScreening,
  fillScreening,
  submitScreening,
  validDetails,
  fillDetails,
  submitDetails,
  expectNoRuntimeErrors,
};
