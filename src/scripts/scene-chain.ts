// The only poller of rpc.maya2c.dev. It fills the page's real numbers (the #nv-* ids the tests
// read) and sends every answer to the scenes as 'm2c:chain'. "live" is earned only by a height
// that moves: a gateway answering with a frozen height is a stalled chain, not a live one.
import type { ChainDetail } from './scene-core';

const RPC = 'https://rpc.maya2c.dev/rpc';
const POLL_MS = 2000;
const RETRY_MS = 30_000; // once the gateway is down, keep asking, just less often
const STALE_MS = 60_000; // no new height for this long: say when the last block came
const MAX_MISSES = 3;
const GAP_WINDOW = 12; // block-time average over the last dozen block gaps
const MS_PER_S = 1000;
const NO_VALUE = '—';

// The readout markup is part of this page; a missing id is a broken page, so fail loudly.
function need(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

export function startChainPoll(): void {
  const heightEl = need('nv-height');
  const btEl = need('nv-bt');
  const stateEl = need('nv-state');
  const view = document.getElementById('netview');

  let misses = 0;
  let last = 0;
  let lastAt = 0;
  let moved = false;
  const gaps: number[] = [];

  const report = (height: number | null, text: string, live: boolean): void => {
    stateEl.textContent = text;
    stateEl.classList.toggle('on', live);
    const bt = btEl.textContent === NO_VALUE ? null : btEl.textContent;
    const detail: ChainDetail = { height, blockTime: bt, state: text, live };
    window.dispatchEvent(new CustomEvent<ChainDetail>('m2c:chain', { detail }));
  };

  async function tick(): Promise<void> {
    try {
      const r = await fetch(RPC, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_chain_info', params: [] }),
      });
      const h = ((await r.json()).result ?? {}).height as number;
      if (typeof h !== 'number') throw new Error('no height');
      const now = Date.now();
      if (last && h > last) {
        gaps.push((now - lastAt) / (h - last));
        if (gaps.length > GAP_WINDOW) gaps.shift();
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        btEl.textContent = (mean / MS_PER_S).toFixed(1) + ' s';
        moved = true;
      }
      if (h !== last) {
        last = h;
        lastAt = now;
      }
      heightEl.textContent = h.toLocaleString('en-US');
      misses = 0;
      view?.classList.remove('is-paused');
      if (now - lastAt >= STALE_MS) {
        const at = new Date(lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        report(h, `no new blocks since ${at}`, false);
      } else {
        report(h, moved ? 'live' : 'waiting for a new block…', moved);
      }
    } catch {
      misses += 1;
      if (misses < MAX_MISSES) {
        report(null, 'connecting…', false);
        return;
      }
      view?.classList.add('is-paused');
      // A failed fetch says nothing about the chain, only that this page cannot reach it.
      report(null, 'Live data unavailable right now', false);
    }
  }

  async function loop(): Promise<void> {
    await tick();
    setTimeout(loop, misses >= MAX_MISSES ? RETRY_MS : POLL_MS);
  }
  void loop();
}
