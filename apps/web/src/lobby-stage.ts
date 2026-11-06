/**
 * The entry's choreography (data-stage on #lobby, styles in lobby-entry.css and lobby-hero.css):
 *   intro  the logo arrives in a few seconds of light over the bar (any click or key skips it);
 *   corner the logo settles in the top-left corner and the account card rises in the middle; a click on the logo is the way in
 *          to the game;
 *   game   the card steps aside, the logo comes to the middle and every click is a toast (lobby-hero.ts), counted here;
 *   login  leaving the game: the logo is gone for good (until the page is loaded again) and the account card is back.
 * Automated browsers and reduced motion skip the show, so tests and sensitive people meet the card at once.
 */
export type LobbyStage = 'intro' | 'corner' | 'game' | 'login';

const INTRO_MS = 3900, INTRO_SHORT_MS = 700, ROUND_MS = 1300;
const COUNT_KEY = 'bar.brindes';
// Ranks by total toasts: the entry's little joke, never a number the game uses.
const RANKS: ReadonlyArray<readonly [number, string]> = [[0, 'Cliente novo'], [10, 'Freguês'], [50, 'Cliente fiel'], [150, 'Dono do balcão'], [400, 'Lenda do Highland'], [1000, 'Patrimônio da casa']];

const readCount = () => { try { return Math.max(0, Math.floor(Number(localStorage.getItem(COUNT_KEY)) || 0)); } catch { return 0; } };
const saveCount = (count: number) => { try { localStorage.setItem(COUNT_KEY, String(count)); } catch { /* Private window: the count lives on the page only. */ } };
const rankOf = (count: number) => [...RANKS].reverse().find(([from]) => count >= from)![1];

export function createLobbyStage(root: HTMLElement): void {
  const hero = root.querySelector<HTMLElement>('.lobby-hero'), logo = hero?.querySelector<HTMLElement>('.hero-logo'), figure = hero?.querySelector<HTMLElement>('.hero-stage');
  const countNode = root.querySelector<HTMLElement>('#clicker-count'), rankNode = root.querySelector<HTMLElement>('#clicker-rank'), comboNode = root.querySelector<HTMLElement>('#clicker-combo');
  const exit = root.querySelector<HTMLButtonElement>('[data-clicker-exit]');
  if (!hero || !logo || !figure || !countNode || !rankNode || !comboNode || !exit) return;
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let stage: LobbyStage = 'intro', timer = 0, introAt = 0, count = readCount(), combo = 0, best = 0, lastClick = 0;

  /** Where the logo's centre goes in each stage, as an offset from the middle of the screen and a scale (CSS transitions it). */
  function place(): void {
    const size = logo!.offsetWidth || 1, corner = Math.max(72, Math.min(120, Math.min(innerWidth, innerHeight) * .13)), margin = innerWidth < 600 ? 12 : 20;
    root.style.setProperty('--cs', `${corner}px`);
    const corner_ = stage === 'corner' || stage === 'login';
    hero!.style.setProperty('--tx', `${corner_ ? margin + corner / 2 - innerWidth / 2 : 0}px`);
    hero!.style.setProperty('--ty', `${corner_ ? margin + corner / 2 - innerHeight / 2 : stage === 'game' ? innerHeight * .035 : 0}px`);
    hero!.style.setProperty('--s', String(corner_ ? corner / size : stage === 'game' ? .9 : 1));
  }
  function show(next: LobbyStage): void {
    stage = next;
    root.dataset.stage = next;
    place();
    logo!.setAttribute('role', next === 'game' ? 'button' : next === 'corner' ? 'button' : 'img');
    logo!.setAttribute('aria-label', next === 'corner' ? 'Logo do Highland Bar: clique para brindar' : next === 'game' ? 'Brindar' : 'Logo do Highland Bar');
    logo!.tabIndex = next === 'corner' || next === 'game' ? 0 : -1;
    if (next === 'game') { render(); comboNode!.textContent = ''; exit!.focus({ preventScroll: true }); }
    if (next === 'login') { logo!.tabIndex = -1; logo!.setAttribute('aria-hidden', 'true'); }
  }
  function render(): void { countNode!.textContent = count.toLocaleString('pt-BR'); rankNode!.textContent = rankOf(count); }
  function endIntro(): void { clearTimeout(timer); if (stage === 'intro') show('corner'); }

  // The first click on the logo in the corner opens the game; in the game it is a toast (lobby-hero.ts) and a count.
  hero.addEventListener('click', event => {
    if (!(event.target as Element).closest('.hero-logo')) return;
    if (stage === 'corner') { event.stopPropagation(); show('game'); return; }
    if (stage !== 'game') { event.stopPropagation(); return; }
    const now = performance.now();
    combo = now - lastClick < ROUND_MS ? combo + 1 : 1;
    lastClick = now; best = Math.max(best, combo);
    count++; saveCount(count); render();
    comboNode.textContent = combo >= 3 ? `Rodada ×${combo}  ·  melhor ×${best}` : best >= 3 ? `Melhor rodada ×${best}` : '';
  }, true);
  logo.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && (stage === 'corner' || stage === 'game')) { event.preventDefault(); logo.click(); } });
  const leave = () => { if (stage === 'game') show('login'); };
  exit.addEventListener('click', leave);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && stage === 'game') { event.preventDefault(); leave(); } });
  // Skipping the intro: a click or a key, once it has been running for a moment.
  const skip = () => { if (stage === 'intro' && performance.now() - introAt > 450) endIntro(); };
  root.addEventListener('pointerdown', skip);
  document.addEventListener('keydown', skip);
  addEventListener('resize', place);

  introAt = performance.now();
  if (navigator.webdriver && !new URLSearchParams(location.search).has('intro')) { show('corner'); return; }
  show('intro');
  timer = window.setTimeout(endIntro, still() ? INTRO_SHORT_MS : INTRO_MS);
}
