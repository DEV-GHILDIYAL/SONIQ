import {
  __resetPoTokenForTests,
  attachPoTokenHost,
  getPoTokenError,
  handlePoTokenMessage,
  mintPoTokens,
  runInWebView,
} from './poToken';

const send = (msg: object) => handlePoTokenMessage(JSON.stringify(msg));

/** Fake WebView host: records injected JS and answers mint calls when asked. */
function fakeHost() {
  const host = { run: jest.fn<void, [string]>(), reload: jest.fn() };
  attachPoTokenHost(host);
  return host;
}

const lastMintId = (run: jest.Mock) => {
  const js = String(run.mock.calls.at(-1)?.[0]);
  return Number(/__soniqMint\((\d+)/.exec(js)?.[1]);
};

beforeEach(() => {
  __resetPoTokenForTests();
  jest.useRealTimers();
});

describe('poToken bridge', () => {
  it('fails fast when the WebView is not mounted', async () => {
    await expect(mintPoTokens(['v'])).rejects.toMatchObject({ stage: 'webview' });
  });

  it('waits for BotGuard, then mints through the page', async () => {
    const host = fakeHost();
    const minting = mintPoTokens(['VISITOR', 'vid']);
    send({ type: 'ready', ttlSec: 3600 });
    await new Promise((r) => setTimeout(r, 0));
    expect(host.run).toHaveBeenCalledWith(expect.stringContaining('["VISITOR","vid"]'));
    send({ type: 'minted', id: lastMintId(host.run), tokens: ['t1', 't2'] });
    await expect(minting).resolves.toEqual(['t1', 't2']);
  });

  it('reports BotGuard setup failures with their stage', async () => {
    fakeHost();
    const minting = mintPoTokens(['v']);
    send({ type: 'init-error', stage: 'vm', message: 'BotGuard VM unavailable' });
    await expect(minting).rejects.toMatchObject({ stage: 'vm' });
    expect(getPoTokenError()?.message).toContain('BotGuard vm');
  });

  it('reloads the page on the next call after a failure', async () => {
    const host = fakeHost();
    send({ type: 'init-error', stage: 'challenge', message: 'HTTP 500' });
    const minting = mintPoTokens(['v']);
    expect(host.reload).toHaveBeenCalledTimes(1);
    send({ type: 'ready', ttlSec: 3600 });
    await new Promise((r) => setTimeout(r, 0));
    send({ type: 'minted', id: lastMintId(host.run), tokens: ['ok'] });
    await expect(minting).resolves.toEqual(['ok']);
  });

  it('passes mint errors through', async () => {
    const host = fakeHost();
    send({ type: 'ready', ttlSec: 3600 });
    const minting = mintPoTokens(['v']);
    await new Promise((r) => setTimeout(r, 0));
    send({ type: 'mint-error', id: lastMintId(host.run), message: 'minter not ready' });
    await expect(minting).rejects.toMatchObject({ stage: 'mint' });
  });

  it('runs code in the WebView once the page has loaded', async () => {
    const host = fakeHost();
    const running = runInWebView('return { n: "x" }');
    send({ type: 'loaded' });
    await new Promise((r) => setTimeout(r, 0));
    const js = String(host.run.mock.calls.at(-1)?.[0]);
    expect(js).toContain('__soniqEval');
    const id = Number(/__soniqEval\((\d+)/.exec(js)?.[1]);
    send({ type: 'eval-result', id, result: { n: 'x' } });
    await expect(running).resolves.toEqual({ n: 'x' });
  });

  it('passes eval errors through', async () => {
    const host = fakeHost();
    send({ type: 'loaded' });
    const running = runInWebView('throw new Error("boom")');
    await new Promise((r) => setTimeout(r, 0));
    const id = Number(/__soniqEval\((\d+)/.exec(String(host.run.mock.calls.at(-1)?.[0]))?.[1]);
    send({ type: 'eval-error', id, message: 'boom' });
    await expect(running).rejects.toMatchObject({ stage: 'eval' });
  });
});
