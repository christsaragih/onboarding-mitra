# Automation Testing — Onboarding Mitra

End-to-end browser automation for [index.html](index.html), driven by Playwright
against real Chromium. The tests click the actual UI — no source-code inspection
stands in for a real interaction.

## Run

```bash
npm install          # installs @playwright/test
npx playwright install chromium
npm test             # full suite
```

Other entry points:

```bash
npm run test:headed              # watch it drive the browser
npm run test:report              # open the HTML report
npx playwright test tests/02-quiz-gate.spec.js   # one file
npx playwright test -g test_boarding_house_is_rejected   # one test
```

## Layout

| File | Covers |
|---|---|
| [tests/helpers.js](tests/helpers.js) | Shared journey helpers, answer key, valid payloads, error collection |
| [tests/01-happy-path.spec.js](tests/01-happy-path.spec.js) | Welcome → rules → quiz → screening → details → review → WhatsApp message |
| [tests/02-quiz-gate.spec.js](tests/02-quiz-gate.spec.js) | The 12/12 quiz gate, failure modal, retake |
| [tests/03-validation.spec.js](tests/03-validation.spec.js) | Required fields on screening and details, recovery after an error |
| [tests/04-business-rules.spec.js](tests/04-business-rules.spec.js) | Income / kos / Tangsel / commitment hard gates, blocked-state recovery |
| [tests/05-navigation.spec.js](tests/05-navigation.spec.js) | Forward and back navigation, refresh, session handling |
| [tests/06-bypass.spec.js](tests/06-bypass.spec.js) | Direct step access, forged and revoked session state, quiz-scoring integrity |
| [tests/07-ui-runtime.spec.js](tests/07-ui-runtime.spec.js) | Checkboxes, radios, selects, accordion, clipboard, console health |
| [tests/08-edge-cases.spec.js](tests/08-edge-cases.spec.js) | Injection payloads, long/unicode input, rapid clicks, format tolerance |
| [tests/09-defects.spec.js](tests/09-defects.spec.js) | Regression tests for the three bugs found and fixed (see below) |
| [tests/10-post-fix-regression.spec.js](tests/10-post-fix-regression.spec.js) | Targeted cover for the fixed code paths |

## Expected result

```text
119 passed
```

Every test asserts behaviour the application itself specifies. If a test fails,
fix the application or justify the behaviour change — do not relax the
assertion.

## Notes on the harness

- Each test runs in a fresh browser context, so `sessionStorage` never leaks
  between tests and every test is independent.
- `openApp()` collects console errors, uncaught exceptions and failed network
  requests; most tests assert all three are empty.
- `openApp()` also makes scrolling instant. The app smooth-scrolls on every step
  change and validation error, which otherwise leaves elements permanently
  "unstable" for Playwright's actionability checks. Only the animation easing is
  affected; no assertion depends on it.
- The quiz answer key in `helpers.js` is written out independently of the
  application, so a regression in the app's own key is detectable
  (`test_quiz_answer_key_matches_rule_content`).

## Bugs found and fixed

- **BUG-001** — `go("rules")` switched sections without calling `renderRule()`.
  "Baca aturan lagi" landed on rule 12 instead of rule 1, and the rule screen
  rendered completely blank when it had not been rendered before. Fixed by
  rendering in `go()` and adding `rereadRules()`.
- **BUG-002** — `quizPass()`'s 900 ms `setTimeout` was never cancelled, so it
  pulled the user to screening even after they deliberately navigated away.
  Fixed by tracking the timer and clearing it in `go()`.
- **BUG-003** — `startRules()` left `consents[]` / `times[]` populated, so after
  a failed quiz all 12 rules returned pre-acknowledged and the consent
  timestamps sent to the admin were stale. Fixed by resetting both arrays.

## Known accepted behaviour (not bugs)

Pinned by tests so that tightening them later is a visible, deliberate change:

- Field validation is presence-only. `phone`, `maps` (declared `type="url"`),
  `ktp` / `postcode` (`inputmode="numeric"`) and `birthDate` accept any
  non-empty value, including a future date of birth. Formats are verified by the
  admin at onboarding.
- Gating is client-side and keyed on a single `sessionStorage.quizPassed` flag.
  Editing that flag in devtools allows the screening stage to be skipped, and
  the generated message then still reports
  `Status syarat pendapatan: TERPENUHI`. Inherent to a static page with no
  backend.

## Legacy

[tests/test_onboarding.py](tests/test_onboarding.py) and
[tests/run.sh](tests/run.sh) are an earlier raw Chrome-DevTools-Protocol script,
superseded by the Playwright suite. It needs `pip install -r requirements-test.txt`
(`websocket-client`) to run at all and is no longer maintained.
