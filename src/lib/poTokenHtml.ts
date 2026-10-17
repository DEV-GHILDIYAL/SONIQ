/**
 * Page loaded in the hidden PO token WebView (base URL https://www.youtube.com).
 * Runs YouTube's BotGuard VM in a real browser engine and mints PO tokens.
 * Flow ported from LuanRT/BgUtils (MIT) and NewPipe's PoTokenWebView:
 *   Create (challenge) -> load interpreter -> vm.a(program) -> snapshot -> GenerateIT -> minter.
 *
 * Messages to React Native (window.ReactNativeWebView.postMessage, JSON):
 *   { type: 'ready', ttlSec }                 integrity token ready
 *   { type: 'init-error', stage, message }    BotGuard setup failed
 *   { type: 'minted', id, tokens }            reply to window.__soniqMint(id, identifiers)
 *   { type: 'mint-error', id, message }
 */
export const POTOKEN_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head><body>
<script>
(function () {
  var REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
  var API_KEY = 'AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw';
  var BASE = 'https://www.youtube.com/api/jnn/v1/';
  var minter = null;

  function post(msg) {
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  function errMsg(e) {
    return e && e.message ? e.message : String(e);
  }
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error(label + ' timed out')); }, ms);
      }),
    ]);
  }
  function b64ToU8(s) {
    s = s.replace(/[-_.]/g, function (c) { return { '-': '+', '_': '/', '.': '=' }[c]; });
    var bin = atob(s);
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function u8ToB64url(u) {
    var s = '';
    for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s).replace(/\\+/g, '-').replace(/\\//g, '_');
  }
  function rpc(name, payload) {
    return fetch(BASE + name, {
      method: 'POST',
      headers: {
        'content-type': 'application/json+protobuf',
        'x-goog-api-key': API_KEY,
        'x-user-agent': 'grpc-web-javascript/0.1',
      },
      body: JSON.stringify(payload),
    }).then(function (r) {
      if (!r.ok) throw new Error(name + ' returned HTTP ' + r.status);
      return r.json();
    });
  }
  function parseChallenge(raw) {
    var d = [];
    if (raw.length > 1 && typeof raw[1] === 'string') {
      var buf = b64ToU8(raw[1]).map(function (b) { return b + 97; });
      d = JSON.parse(new TextDecoder().decode(buf));
    } else if (raw.length && typeof raw[0] === 'object') {
      d = raw[0];
    }
    function firstString(a) {
      return Array.isArray(a) ? a.find(function (v) { return v && typeof v === 'string'; }) : undefined;
    }
    return { script: firstString(d[1]), url: firstString(d[2]), program: d[4], globalName: d[5] };
  }
  function loadInterpreter(ch) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      if (ch.script) {
        s.textContent = ch.script;
        document.head.appendChild(s);
        resolve();
      } else if (ch.url) {
        s.src = ch.url.indexOf('//') === 0 ? 'https:' + ch.url : ch.url;
        s.onload = function () { resolve(); };
        s.onerror = function () { reject(new Error('interpreter script failed to load')); };
        document.head.appendChild(s);
      } else {
        reject(new Error('challenge has no interpreter'));
      }
    });
  }
  function loadVm(ch) {
    var vm = window[ch.globalName];
    if (!vm || !vm.a) throw new Error('BotGuard VM unavailable');
    var noop = function () {};
    var fns = new Promise(function (resolve) {
      var setup = function (asyncSnapshot) { resolve({ asyncSnapshot: asyncSnapshot }); };
      vm.a(ch.program, setup, true, undefined, noop, [[], []], undefined, false, [noop, noop, noop, noop, noop]);
    });
    return withTimeout(fns, 10000, 'BotGuard setup');
  }

  async function init() {
    var stage = 'challenge';
    try {
      var ch = parseChallenge(await rpc('Create', [REQUEST_KEY]));
      if (!ch.program || !ch.globalName) throw new Error('unexpected challenge format');
      stage = 'interpreter';
      await loadInterpreter(ch);
      stage = 'vm';
      var fns = await loadVm(ch);
      stage = 'snapshot';
      var webPoSignalOutput = [];
      var bgResponse = await withTimeout(
        new Promise(function (resolve) {
          fns.asyncSnapshot(resolve, [undefined, undefined, webPoSignalOutput, undefined]);
        }),
        10000,
        'snapshot',
      );
      stage = 'integrity';
      var it = await rpc('GenerateIT', [REQUEST_KEY, bgResponse]);
      if (!it || typeof it[0] !== 'string') throw new Error('no integrity token in response');
      stage = 'minter';
      var getMinter = webPoSignalOutput[0];
      if (typeof getMinter !== 'function') throw new Error('minter factory missing');
      minter = await getMinter(b64ToU8(it[0]));
      if (typeof minter !== 'function') throw new Error('minter is not a function');
      post({ type: 'ready', ttlSec: typeof it[1] === 'number' ? it[1] : 3600 });
    } catch (e) {
      post({ type: 'init-error', stage: stage, message: errMsg(e) });
    }
  }

  window.__soniqMint = async function (id, identifiers) {
    try {
      if (!minter) throw new Error('minter not ready');
      var tokens = [];
      for (var i = 0; i < identifiers.length; i++) {
        var out = await minter(new TextEncoder().encode(identifiers[i]));
        if (!(out instanceof Uint8Array)) throw new Error('minter returned no bytes');
        tokens.push(u8ToB64url(out));
      }
      post({ type: 'minted', id: id, tokens: tokens });
    } catch (e) {
      post({ type: 'mint-error', id: id, message: errMsg(e) });
    }
  };

  init();
})();
</script>
</body></html>`;
