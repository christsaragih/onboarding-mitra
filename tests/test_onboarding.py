#!/usr/bin/env python3
import json, os, subprocess, tempfile, time, urllib.request, urllib.parse
from pathlib import Path
import websocket

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / 'index.html'
CDP_PORT = 9223

class Browser:
    def __init__(self):
        self.tmp = tempfile.mkdtemp(prefix='onboarding-chrome-')
        self.chrome = subprocess.Popen([
            'chromium', '--headless=new', '--no-sandbox', '--disable-gpu',
            '--disable-dev-shm-usage', '--disable-background-networking', '--remote-allow-origins=*', '--no-proxy-server', '--proxy-server=direct://', '--proxy-bypass-list=*',
            f'--remote-debugging-port={CDP_PORT}', f'--user-data-dir={self.tmp}',
            'about:blank'
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.ws = None
        self.i = 0
        for _ in range(50):
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{CDP_PORT}/json', timeout=1) as r:
                    targets = json.load(r)
                page = next(t for t in targets if t.get('type') == 'page')
                self.ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=10, http_proxy_host=None, http_proxy_port=None)
                break
            except Exception:
                time.sleep(.1)
        if not self.ws:
            self.stop(); raise RuntimeError('Could not connect to Chromium CDP')
        self.call('Runtime.enable')
        self.call('Page.enable')
        self.navigate("about:blank")
        html_text = HTML.read_text(encoding="utf-8")
        import re
        head = re.search(r"<head>(.*?)</head>", html_text, re.S|re.I).group(1)
        body = re.search(r"<body>(.*?)</body>", html_text, re.S|re.I).group(1)
        scripts = re.findall(r"<script(?:\s[^>]*)?>(.*?)</script>", html_text, re.S|re.I)
        main_js = scripts[0]
        # about:blank has an opaque origin, so provide a deterministic in-memory sessionStorage shim.
        self.eval("void Object.defineProperty(window,'sessionStorage',{value:{_:{},getItem(k){return this._[k]??null},setItem(k,v){this._[k]=String(v)},removeItem(k){delete this._[k]},clear(){this._={}}}})")
        dom = "<head>" + head + "</head><body>" + body + "</body>"
        self.eval("document.documentElement.innerHTML=" + json.dumps(dom))
        self.eval("eval(" + json.dumps(main_js) + ")")
        for _ in range(30):
            try:
                state=self.eval('document.readyState')
                if state in ('interactive','complete') and self.eval("!!document.getElementById('welcome')"):
                    break
            except Exception:
                pass
            self.wait(0.2)

    def call(self, method, params=None):
        self.i += 1
        ident = self.i
        self.ws.send(json.dumps({'id': ident, 'method': method, 'params': params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == ident:
                if 'error' in msg:
                    raise RuntimeError(msg['error'])
                return msg.get('result', {})

    def navigate(self, url):
        self.call('Page.navigate', {'url': url})

    def wait(self, seconds=0.2):
        time.sleep(seconds)

    def eval(self, expression):
        result = self.call('Runtime.evaluate', {
            'expression': expression,
            'returnByValue': True,
            'awaitPromise': True,
        })
        if 'exceptionDetails' in result:
            raise RuntimeError(result['exceptionDetails'])
        return result.get('result', {}).get('value')

    def stop(self):
        try:
            if self.ws: self.ws.close()
        except Exception: pass
        try: self.chrome.terminate(); self.chrome.wait(timeout=3)
        except Exception:
            try: self.chrome.kill()
            except Exception: pass


def run():
    browser = Browser()
    passed = []
    try:
        def check(name, condition, detail=''):
            if not condition:
                raise AssertionError(f'{name}: {detail}')
            passed.append(name)
            print(f'PASS  {name}')

        check('welcome shown', browser.eval("document.getElementById('welcome').classList.contains('active')"))
        check('quiz gate initially locked', browser.eval("sessionStorage.getItem('quizPassed') !== 'true'"))

        # Enter rules and complete all 12 required acknowledgements.
        browser.eval("startRules()")
        for _ in range(12):
            browser.eval("document.getElementById('ruleAgree').checked=true; document.getElementById('ruleAgree').dispatchEvent(new Event('change')); document.getElementById('ruleNext').click()")
            browser.wait(0.05)
        check('quiz reached after all 12 rules', browser.eval("document.getElementById('quiz').classList.contains('active')"))
        check('quiz renders 12 fieldsets', browser.eval("document.querySelectorAll('#quizQuestions fieldset').length === 12"))


        # Empty submission must be blocked.
        browser.eval("checkQuiz(event)")
        check('empty quiz blocked', browser.eval("document.getElementById('quizError').textContent.includes('Semua 12 soal wajib dijawab')"))

        # Answer all correctly, then intentionally make exactly one answer wrong.
        browser.eval("[1,2,1,1,1,2,0,0,1,1,1,1].forEach((a,i)=>document.querySelector('input[name=\"quiz_'+i+'\"][value=\"'+a+'\"]').click()); document.querySelector('input[name=\"quiz_0\"][value=\"0\"]').click(); checkQuiz(null)")
        browser.wait(0.2)
        check('one wrong answer produces failure popup', browser.eval("document.getElementById('quizFailureModal').classList.contains('show')"))
        check('failed quiz does not unlock registration', browser.eval("sessionStorage.getItem('quizPassed') !== 'true' && !document.getElementById('screening').classList.contains('active')"))
        check('failure popup explains retake requirement', browser.eval("document.getElementById('quizFailureMessage').textContent.includes('membaca ulang seluruh 12 aturan') && document.getElementById('quizFailureMessage').textContent.includes('12/12')"))

        # Popup button must return to the beginning.
        browser.eval("document.getElementById('quizFailureOk').click()")
        browser.wait(0.1)
        check('failure popup closes', browser.eval("!document.getElementById('quizFailureModal').classList.contains('show')"))
        check('failed quiz returns to welcome', browser.eval("document.getElementById('welcome').classList.contains('active')"))

        # Re-read all rules, then pass 12/12.
        browser.eval("startRules()")
        for _ in range(12):
            browser.eval("document.getElementById('ruleAgree').checked=true; document.getElementById('ruleAgree').dispatchEvent(new Event('change')); document.getElementById('ruleNext').click()")
            browser.wait(0.03)
        browser.eval("[1,2,1,1,1,2,0,0,1,1,1,1].forEach((a,i)=>document.querySelector('input[name=\"quiz_'+i+'\"][value=\"'+a+'\"]').click()); checkQuiz(event)")
        browser.wait(1.1)
        check('12/12 passes quiz', browser.eval("sessionStorage.getItem('quizPassed') === 'true'"))
        check('12/12 unlocks personal data', browser.eval("document.getElementById('screening').classList.contains('active')"))
        check('pass result is displayed', browser.eval("document.getElementById('quizResult').textContent.includes('12/12')"))

        # Direct navigation to a gated step after pass is allowed.
        browser.eval("go('details')")
        check('details accessible after pass', browser.eval("document.getElementById('details').classList.contains('active')"))

        # Remove pass and verify direct bypass is blocked.
        browser.eval("sessionStorage.removeItem('quizPassed'); go('details')")
        check('direct details bypass blocked', browser.eval("document.getElementById('quiz').classList.contains('active')"))

        print(f'\nALL TESTS PASSED: {len(passed)}')
        return 0
    finally:
        browser.stop()

if __name__ == '__main__':
    raise SystemExit(run())
