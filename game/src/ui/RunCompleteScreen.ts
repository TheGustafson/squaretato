import { COLORS } from '../constants';
import { CharacterRegistry } from '../characters/CharacterRegistry';
import type { GameCanvas, MetaData } from '../types';
import type { GameState } from '../systems/GameState';
import { drawPanel, drawPrimaryButton, drawSecondaryButton, drawTitle } from './drawHelpers';

interface GoldParticle {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  vx: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rot: number;
  rotSpeed: number;
}

interface Sparkle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface RCButton {
  id: 'newRun' | 'changeCharacter' | 'mainMenu';
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  primary?: boolean;
}

export interface RunCompleteStats {
  wavesCleared: number;
  totalKills: number;
  moneyEarned: number;
  damageDealt: number;
  playtimeSeconds: number;
  ppEarned: number;
  bossName: string;
}

export class RunCompleteScreen {
  canvas: GameCanvas;
  gameState: GameState;

  characterName: string;
  characterId: string;
  meta: MetaData | null;
  newlyUnlocked: string[];
  stats: RunCompleteStats;

  particles: GoldParticle[];
  particlePool: GoldParticle[];
  particleTimer: number;
  sparkles: Sparkle[];
  sparklePool: Sparkle[];
  sparkleTimer: number;
  revealTime: number;
  lastFrameTime: number;

  hoveredButton: string | null;
  handleMouseMove: (e: MouseEvent) => void;
  handleClick: (e: MouseEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;

  onNewRun: () => void;
  onChangeCharacter: () => void;
  onMainMenu: () => void;

  constructor(canvas: GameCanvas, gameState: GameState) {
    this.canvas = canvas;
    this.gameState = gameState;
    this.characterName = '';
    this.characterId = '';
    this.meta = null;
    this.newlyUnlocked = [];
    this.stats = {
      wavesCleared: 30,
      totalKills: 0,
      moneyEarned: 0,
      damageDealt: 0,
      playtimeSeconds: 0,
      ppEarned: 0,
      bossName: 'The Hollow King',
    };
    this.particles = [];
    this.particlePool = [];
    this.particleTimer = 0;
    this.sparkles = [];
    this.sparklePool = [];
    this.sparkleTimer = 0;
    this.revealTime = 0;
    this.lastFrameTime = 0;
    this.hoveredButton = null;

    this.onNewRun = (): void => {};
    this.onChangeCharacter = (): void => {};
    this.onMainMenu = (): void => {};

    this.handleMouseMove = (e: MouseEvent): void => this.onMouseMove(e);
    this.handleClick = (e: MouseEvent): void => this.onClick(e);
    this.handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') { e.preventDefault(); this.onNewRun(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.onMainMenu(); }
    };
  }

  activate(characterName: string, stats: RunCompleteStats, newlyUnlocked: string[] = []): void {
    this.characterName = characterName;
    this.characterId = this.gameState.selectedCharacter;
    this.meta = this.gameState.getMeta();
    this.stats = stats;
    this.newlyUnlocked = Array.isArray(newlyUnlocked) ? newlyUnlocked.slice() : [];
    // Return any live particles to pools so we don't lose allocations across runs.
    for (const p of this.particles) { p.active = false; this.particlePool.push(p); }
    this.particles.length = 0;
    for (const s of this.sparkles) { s.active = false; this.sparklePool.push(s); }
    this.sparkles.length = 0;
    this.particleTimer = 0;
    this.sparkleTimer = 0;
    this.revealTime = 0;
    this.lastFrameTime = performance.now();
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('click', this.handleClick);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  deactivate(): void {
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('click', this.handleClick);
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  getButtons(): RCButton[] {
    const cx = this.canvas.logicalWidth / 2;
    const y = this.canvas.logicalHeight - 90;
    const w = 220;
    const h = 52;
    const gap = 18;
    const totalW = w * 3 + gap * 2;
    const startX = cx - totalW / 2;
    return [
      { id: 'newRun', label: 'NEW RUN', x: startX, y, w, h, primary: true },
      { id: 'changeCharacter', label: 'CHANGE CHARACTER', x: startX + w + gap, y, w, h },
      { id: 'mainMenu', label: 'MAIN MENU', x: startX + (w + gap) * 2, y, w, h },
    ];
  }

  private getMousePosition(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.logicalWidth / rect.width;
    const scaleY = this.canvas.logicalHeight / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  private onMouseMove(e: MouseEvent): void {
    const pos = this.getMousePosition(e);
    this.hoveredButton = null;
    for (const btn of this.getButtons()) {
      if (pos.x >= btn.x && pos.x <= btn.x + btn.w && pos.y >= btn.y && pos.y <= btn.y + btn.h) {
        this.hoveredButton = btn.id;
        break;
      }
    }
  }

  private onClick(_e: MouseEvent): void {
    if (this.hoveredButton === 'newRun') this.onNewRun();
    else if (this.hoveredButton === 'changeCharacter') this.onChangeCharacter();
    else if (this.hoveredButton === 'mainMenu') this.onMainMenu();
  }

  private drawPortrait(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, characterId: string, alpha: number): void {
    const character = CharacterRegistry.get(characterId);
    const color = character ? character.getColor() : '#888';
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    ctx.fillStyle = color;
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);
    ctx.globalAlpha = prev;
  }

  private formatTime(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }

  private acquireParticle(): GoldParticle {
    const p = this.particlePool.pop();
    if (p) return p;
    return {
      active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0,
      size: 0, color: '#FFD700', rot: 0, rotSpeed: 0,
    };
  }

  private acquireSparkle(): Sparkle {
    const s = this.sparklePool.pop();
    if (s) return s;
    return { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, color: '#FFD700' };
  }

  private updateParticles(dt: number): void {
    // Slow gold confetti rising from below; pool + swap-and-pop.
    this.particleTimer -= dt;
    while (this.particleTimer <= 0) {
      this.particleTimer += 0.045;
      if (this.particles.length < 160) {
        const p = this.acquireParticle();
        p.active = true;
        p.x = Math.random() * this.canvas.logicalWidth;
        p.y = this.canvas.logicalHeight + 10;
        p.vx = (Math.random() - 0.5) * 18;
        p.vy = -22 - Math.random() * 36; // slow upward drift
        p.maxLife = 5.0 + Math.random() * 1.5;
        p.life = p.maxLife;
        p.size = 3 + Math.random() * 3;
        const roll = Math.random();
        p.color = roll < 0.5 ? '#FFD700' : (roll < 0.8 ? '#FFF1A8' : '#E8B923');
        p.rot = Math.random() * Math.PI * 2;
        p.rotSpeed = (Math.random() - 0.5) * 3;
        this.particles.push(p);
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx += Math.sin(this.revealTime * 2 + p.rot) * 6 * dt; // gentle sway
      p.rot += p.rotSpeed * dt;
      p.life -= dt;
      if (p.life <= 0 || p.y < -20) {
        p.active = false;
        const last = this.particles.length - 1;
        this.particles[i] = this.particles[last];
        this.particles.pop();
        this.particlePool.push(p);
      }
    }
  }

  private updateSparkles(dt: number, emit: boolean, emitPoints: { x: number; y: number }[]): void {
    if (emit && emitPoints.length > 0) {
      this.sparkleTimer -= dt;
      while (this.sparkleTimer <= 0) {
        this.sparkleTimer += 0.04;
        if (this.sparkles.length < 100) {
          const pt = emitPoints[Math.floor(Math.random() * emitPoints.length)];
          const s = this.acquireSparkle();
          s.active = true;
          const angle = Math.random() * Math.PI * 2;
          const speed = 30 + Math.random() * 90;
          s.x = pt.x + (Math.random() - 0.5) * 30;
          s.y = pt.y + (Math.random() - 0.5) * 30;
          s.vx = Math.cos(angle) * speed;
          s.vy = Math.sin(angle) * speed - 20;
          s.maxLife = 0.9 + Math.random() * 0.6;
          s.life = s.maxLife;
          s.size = 2 + Math.random() * 2.5;
          s.color = Math.random() > 0.5 ? '#FFD700' : '#FFFFFF';
          this.sparkles.push(s);
        }
      }
    }
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 50 * dt;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        const last = this.sparkles.length - 1;
        this.sparkles[i] = this.sparkles[last];
        this.sparkles.pop();
        this.sparklePool.push(s);
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    this.revealTime += dt;
    this.updateParticles(dt);

    const W = this.canvas.logicalWidth;
    const H = this.canvas.logicalHeight;
    const cx = W / 2;

    // Dark gold-tinted background
    ctx.fillStyle = '#0c0a06';
    ctx.fillRect(0, 0, W, H);

    // Particle layer (behind content)
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      // Rotated confetti rectangle; cheap transform around center.
      const cosR = Math.cos(p.rot);
      const sinR = Math.sin(p.rot);
      const hs = p.size / 2;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.transform(cosR, sinR, -sinR, cosR, 0, 0);
      ctx.fillRect(-hs, -hs * 0.5, p.size, p.size * 0.5);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // Title (trophy treatment: shimmering gold with glow).
    drawTitle(ctx, 'RUN COMPLETE', cx, H * 0.12, {
      size: 54, align: 'center', shimmer: true, glow: true, color: COLORS.ACCENT_GOLD,
    });

    ctx.fillStyle = '#CCAA44';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`${this.characterName || 'You'} defeated ${this.stats.bossName}`, cx, H * 0.17);

    // Stats panel — larger, grouped into Performance / Economy / Meta sections.
    const panelW = 560;
    const panelH = 280;
    const panelX = cx - panelW / 2;
    const panelY = H * 0.21;

    drawPanel(ctx, panelX, panelY, panelW, panelH, { accent: 'gold', borderColor: '#FFD700' });

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('RUN STATISTICS', cx, panelY + 32);

    type StatGroup = { title: string; rows: [string, string][] };
    const groups: StatGroup[] = [
      {
        title: 'Performance',
        rows: [
          ['Waves Cleared', `${this.stats.wavesCleared}`],
          ['Total Kills', this.stats.totalKills.toLocaleString()],
          ['Damage Dealt', `${Math.round(this.stats.damageDealt).toLocaleString()}`],
        ],
      },
      {
        title: 'Economy',
        rows: [
          ['Money Earned', `$${this.stats.moneyEarned.toLocaleString()}`],
          ['Prestige Points', `+${this.stats.ppEarned}`],
        ],
      },
      {
        title: 'Time',
        rows: [
          ['Playtime', this.formatTime(this.stats.playtimeSeconds)],
        ],
      },
    ];

    const colX1 = panelX + 36;
    const colX2 = panelX + panelW - 36;
    let ry = panelY + 64;
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(group.title.toUpperCase(), colX1, ry);
      // Divider line under section header
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(colX1, ry + 5);
      ctx.lineTo(colX2, ry + 5);
      ctx.stroke();
      ry += 22;

      ctx.font = '16px monospace';
      for (const row of group.rows) {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#BB9933';
        ctx.fillText(row[0], colX1, ry);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#FFEE99';
        ctx.fillText(row[1], colX2, ry);
        ry += 22;
      }
      ry += 6;
    }

    // Newly unlocked characters — animated scale-in + sparkles.
    const emitPoints: { x: number; y: number }[] = [];
    if (this.newlyUnlocked.length > 0) {
      const unlockBaseY = panelY + panelH + 36;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#66FF66';
      ctx.font = 'bold 22px monospace';
      const bannerLabel = this.newlyUnlocked.length === 1
        ? '>>> NEW CHARACTER UNLOCKED <<<'
        : '>>> NEW CHARACTERS UNLOCKED <<<';
      ctx.fillText(bannerLabel, cx, unlockBaseY);

      // deltaTime-driven scale-in (0 -> 1 over 0.8s), smoothstep eased.
      const t = Math.min(1, this.revealTime / 0.8);
      const eased = t * t * (3 - 2 * t);
      const targetSize = 84;
      const ps = targetSize * eased;
      const spacing = 130;
      const totalWidth = this.newlyUnlocked.length * spacing;
      let sx = cx - totalWidth / 2 + spacing / 2;
      const portraitY = unlockBaseY + 64;
      for (let i = 0; i < this.newlyUnlocked.length; i++) {
        const id = this.newlyUnlocked[i];
        const char = CharacterRegistry.get(id);
        const name = char ? char.getName() : id;
        if (ps > 2) this.drawPortrait(ctx, sx, portraitY, ps, id, 1);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(name, sx, portraitY + targetSize / 2 + 22);
        emitPoints.push({ x: sx, y: portraitY });
        sx += spacing;
      }
    }

    // Update + draw sparkles (only emit once portrait has mostly grown).
    this.updateSparkles(dt, this.newlyUnlocked.length > 0 && this.revealTime > 0.5, emitPoints);
    for (const s of this.sparkles) {
      ctx.globalAlpha = Math.max(0, s.life / s.maxLife);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }
    ctx.globalAlpha = 1;

    // "Thanks for playing" line above the buttons.
    ctx.textAlign = 'center';
    ctx.fillStyle = '#DDCC77';
    ctx.font = 'italic bold 16px monospace';
    ctx.fillText('Thanks for playing — see you on the next run.', cx, H - 118);

    // Buttons
    for (const btn of this.getButtons()) {
      const hovered = this.hoveredButton === btn.id;
      if (btn.primary) {
        drawPrimaryButton(ctx, btn.x, btn.y, btn.w, btn.h, btn.label, {
          hovered, fontSize: 22,
        });
      } else {
        drawSecondaryButton(ctx, btn.x, btn.y, btn.w, btn.h, btn.label, {
          hovered, fontSize: 18,
        });
      }
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.fillText('[ENTER] New Run     [ESC] Main Menu', cx, H - 18);
  }
}
