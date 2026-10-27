/**
 * DOM menus: main menu, pause menu and finish screen.
 * Settings persist to localStorage.
 */
export interface MenuCallbacks {
  onStart(): void;
  onResume(): void;
  onRestart(): void;
  onMainMenu(): void;
}

function loadSetting(key: string, fallback: number): number {
  const v = parseFloat(localStorage.getItem(key) ?? '');
  return Number.isFinite(v) ? v : fallback;
}

export class Menu {
  private readonly main: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly finish: HTMLDivElement;
  private readonly controlsPanel: HTMLDivElement;
  private readonly finishTime: HTMLDivElement;
  private readonly finishBest: HTMLDivElement;

  sensitivity = loadSetting('rf_sens', 1);
  reducedMotion = localStorage.getItem('rf_motion') === '1';

  constructor(uiRoot: HTMLElement, private readonly cb: MenuCallbacks) {
    // ---------------- Main menu ----------------
    this.main = this.screen();
    const card = this.card();

    const title = document.createElement('h1');
    title.className = 'title';
    title.innerHTML = 'ROOFTOP<span>FLOW</span>';

    const subtitle = document.createElement('p');
    subtitle.className = 'subtitle';
    subtitle.textContent = 'A first-person rooftop run';

    const start = this.button('START RUN', false);
    start.onclick = () => this.cb.onStart();

    const controls = this.button('CONTROLS', true);
    this.controlsPanel = document.createElement('div');
    this.controlsPanel.className = 'controls-panel hidden';
    this.controlsPanel.innerHTML = `
      <table>
        <tr><td>WASD</td><td>Move</td></tr>
        <tr><td>Mouse</td><td>Look around</td></tr>
        <tr><td>Shift</td><td>Sprint</td></tr>
        <tr><td>Space</td><td>Jump</td></tr>
        <tr><td>Ctrl / C</td><td>Slide</td></tr>
        <tr><td>E</td><td>Vault / interact</td></tr>
        <tr><td>R</td><td>Restart from checkpoint</td></tr>
        <tr><td>Esc</td><td>Pause</td></tr>
      </table>`;
    controls.onclick = () => this.controlsPanel.classList.toggle('hidden');

    const sens = document.createElement('div');
    sens.className = 'setting';
    sens.innerHTML = `<label>Mouse sensitivity</label>`;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0.3';
    slider.max = '2';
    slider.step = '0.05';
    slider.value = String(this.sensitivity);
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = this.sensitivity.toFixed(2);
    slider.oninput = () => {
      this.sensitivity = parseFloat(slider.value);
      val.textContent = this.sensitivity.toFixed(2);
      localStorage.setItem('rf_sens', String(this.sensitivity));
    };
    sens.append(slider, val);

    const motion = document.createElement('div');
    motion.className = 'setting';
    const motionLabel = document.createElement('label');
    motionLabel.textContent = 'Reduce camera motion';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.reducedMotion;
    checkbox.onchange = () => {
      this.reducedMotion = checkbox.checked;
      localStorage.setItem('rf_motion', checkbox.checked ? '1' : '0');
    };
    motion.append(motionLabel, checkbox);

    card.append(title, subtitle, start, controls, this.controlsPanel, sens, motion);
    this.main.appendChild(card);

    // ---------------- Pause menu ----------------
    this.pause = this.screen();
    this.pause.classList.add('hidden');
    const pauseCard = this.card();
    const pauseTitle = document.createElement('h2');
    pauseTitle.textContent = 'PAUSED';
    const resume = this.button('RESUME', false);
    resume.onclick = () => this.cb.onResume();
    const restart = this.button('RESTART FROM CHECKPOINT', true);
    restart.onclick = () => this.cb.onRestart();
    const toMain = this.button('MAIN MENU', true);
    toMain.onclick = () => this.cb.onMainMenu();
    pauseCard.append(pauseTitle, resume, restart, toMain);
    this.pause.appendChild(pauseCard);

    // ---------------- Finish screen ----------------
    this.finish = this.screen();
    this.finish.classList.add('hidden');
    const finishCard = this.card();
    const finishTitle = document.createElement('h2');
    finishTitle.textContent = 'LEVEL COMPLETE';
    this.finishTime = document.createElement('div');
    this.finishTime.className = 'finish-time';
    this.finishBest = document.createElement('div');
    this.finishBest.className = 'finish-best';
    const again = this.button('RUN IT AGAIN', false);
    again.onclick = () => this.cb.onRestart();
    finishCard.append(finishTitle, this.finishTime, this.finishBest, again);
    this.finish.appendChild(finishCard);

    uiRoot.append(this.main, this.pause, this.finish);
  }

  private screen(): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'screen';
    return el;
  }

  private card(): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'card';
    return el;
  }

  private button(label: string, ghost: boolean): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    if (ghost) b.className = 'ghost';
    return b;
  }

  showMain(): void {
    this.hideAll();
    this.main.classList.remove('hidden');
  }

  showPause(): void {
    this.hideAll();
    this.pause.classList.remove('hidden');
  }

  showFinish(time: number, best: number, isNewBest: boolean): void {
    this.hideAll();
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    const cs = Math.floor((time % 1) * 100);
    this.finishTime.textContent =
      `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
    const bm = Math.floor(best / 60);
    const bs = Math.floor(best % 60);
    const bcs = Math.floor((best % 1) * 100);
    this.finishBest.innerHTML = isNewBest
      ? '<span class="new-best">NEW BEST TIME!</span>'
      : `BEST TIME — <b>${bm}:${bs.toString().padStart(2, '0')}.${bcs.toString().padStart(2, '0')}</b>`;
    this.finish.classList.remove('hidden');
  }

  hideAll(): void {
    this.main.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.finish.classList.add('hidden');
  }
}
