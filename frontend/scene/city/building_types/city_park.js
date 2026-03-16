/**
 * CityPark — Ambient idle building. No signal required.
 *
 * Visual behaviour:
 *  - People appear on benches and wander paths when overall load is low.
 *  - Trees sway gently. Fountain animates in the centre.
 *  - As load increases (optional gauge signal) the park gradually empties —
 *    benches are vacated and the fountain slows.
 *  - Alert state: red overlay + people flee.
 *
 * portType: 'gauge'  (optional — park works fine with no signal at all)
 */
export class CityPark {
  static portType = 'gauge';
  static styles   = ['central_square', 'riverside_garden', 'pocket_park'];
  static label    = 'City Park';

  constructor(app, plot, style = 'central_square') {
    this.app   = app;
    this.plot  = plot;
    this.style = style;

    this.container    = new PIXI.Container();
    this.fountain     = null;
    this.fountainRing = null;
    this.trees        = [];
    this.people       = [];
    this.alertOverlay = new PIXI.Graphics();
    this.disconnectIcon = null;

    this.state  = 'idle';
    this.value  = 0;    // load gauge — higher = fewer people, quieter park
    this._tick  = 0;
  }

  init() {
    const palettes = {
      central_square:   { grass: 0x3a7a3a, path: 0xc8b07a, bench: 0x8a6a3a, tree: 0x2a6a2a, flower: 0xff88aa },
      riverside_garden: { grass: 0x2a6a4a, path: 0xb0a870, bench: 0x6a5030, tree: 0x1a5a3a, flower: 0x88aaff },
      pocket_park:      { grass: 0x4a7a2a, path: 0xd0b888, bench: 0x9a7a4a, tree: 0x3a6a1a, flower: 0xffdd44 },
    };
    const p = palettes[this.style] ?? palettes.central_square;

    // ── Ground / grass ───────────────────────────────────────────────────────
    const grass = new PIXI.Graphics();
    grass.beginFill(p.grass, 0.85);
    grass.drawRoundedRect(-72, -80, 144, 80, 6);
    grass.endFill();
    // Low fence
    grass.lineStyle(3, 0x886644, 0.8);
    grass.drawRoundedRect(-72, -80, 144, 80, 6);

    // ── Paths ────────────────────────────────────────────────────────────────
    const path = new PIXI.Graphics();
    path.beginFill(p.path, 0.6);
    // Cross-path
    path.drawRect(-8, -80, 16, 80);
    path.drawRect(-72, -44, 144, 14);
    path.endFill();

    // ── Fountain (centre) ────────────────────────────────────────────────────
    const fontBase = new PIXI.Graphics();
    fontBase.beginFill(0x9999aa, 0.9);
    fontBase.drawCircle(0, -44, 16);
    fontBase.endFill();
    fontBase.beginFill(0x6688cc, 0.55);
    fontBase.drawCircle(0, -44, 13);
    fontBase.endFill();

    this.fountain = new PIXI.Graphics();
    this.fountainRing = new PIXI.Graphics();
    this._drawFountain(1.0);

    // ── Benches ──────────────────────────────────────────────────────────────
    const benchPositions = [
      { x: -50, y: -62 }, { x: 50, y: -62 },
      { x: -50, y: -22 }, { x: 50, y: -22 },
    ];
    const benches = new PIXI.Graphics();
    benchPositions.forEach(({ x, y }) => {
      benches.beginFill(p.bench);
      benches.drawRect(x - 12, y, 24, 6);  // seat
      benches.drawRect(x - 12, y - 6, 24, 4); // back
      benches.drawRect(x - 11, y, 4, 8);   // leg L
      benches.drawRect(x + 7,  y, 4, 8);   // leg R
      benches.endFill();
    });

    // ── Trees ────────────────────────────────────────────────────────────────
    const treePositions = [
      { x: -58, y: -70 }, { x: 58, y: -70 },
      { x: -58, y: -14 }, { x: 58, y: -14 },
    ];
    this.trees = [];
    treePositions.forEach(({ x, y }) => {
      const tree = new PIXI.Graphics();
      // Trunk
      tree.beginFill(0x6a4a2a);
      tree.drawRect(-3, -8, 6, 8);
      tree.endFill();
      // Canopy (3 circles for layered look)
      tree.beginFill(p.tree, 0.9);
      tree.drawCircle(0, -20, 13);
      tree.endFill();
      tree.beginFill(p.tree, 0.8);
      tree.drawCircle(-5, -15, 9);
      tree.drawCircle(5, -15, 9);
      tree.endFill();
      // Highlight
      tree.beginFill(0xffffff, 0.1);
      tree.drawCircle(-3, -23, 5);
      tree.endFill();
      tree.x = x; tree.y = y;
      this.trees.push(tree);
    });

    // ── Flower beds ───────────────────────────────────────────────────────────
    const flowers = new PIXI.Graphics();
    [{ x: -35, y: -70 }, { x: 35, y: -70 }, { x: -35, y: -22 }, { x: 35, y: -22 }].forEach(({ x, y }) => {
      flowers.beginFill(p.flower, 0.8);
      flowers.drawCircle(x,     y,     3);
      flowers.drawCircle(x + 5, y - 3, 3);
      flowers.drawCircle(x - 4, y - 3, 3);
      flowers.endFill();
      flowers.beginFill(0x228822, 0.7);
      flowers.drawRect(x - 7, y + 2, 18, 4);
      flowers.endFill();
    });

    // ── Park visitors (dots representing people on benches) ───────────────────
    this.people = [];
    const personPositions = [
      { x: -50, y: -68 }, { x: -44, y: -68 },
      {  x: 44, y: -68 }, {  x: 50, y: -68 },
      { x: -50, y: -28 }, { x: -44, y: -28 },
      {  x: 44, y: -28 }, {  x: 50, y: -28 },
    ];
    this.peopleContainer = new PIXI.Container();
    personPositions.forEach(({ x, y }) => {
      const person = new PIXI.Graphics();
      person.beginFill(0xffddbb);
      person.drawCircle(0, 0, 4);   // head
      person.endFill();
      person.beginFill(0x4488cc);
      person.drawRoundedRect(-4, 3, 8, 8, 2);  // body
      person.endFill();
      person.x = x; person.y = y;
      this.people.push(person);
      this.peopleContainer.addChild(person);
    });

    // ── Alert overlay ─────────────────────────────────────────────────────────
    this.alertOverlay.beginFill(0xff3c3c, 0.5);
    this.alertOverlay.drawRoundedRect(-72, -80, 144, 80, 6);
    this.alertOverlay.endFill();
    this.alertOverlay.visible = false;

    // ── Disconnect icon ───────────────────────────────────────────────────────
    this.disconnectIcon = new PIXI.Text('⚡', {
      fill: 0xffdf6a, fontSize: 20, fontWeight: 'bold',
    });
    this.disconnectIcon.anchor.set(0.5);
    this.disconnectIcon.position.set(0, -95);
    this.disconnectIcon.visible = false;

    this.container.addChild(
      grass, path, fontBase, this.fountainRing, this.fountain,
      benches, flowers,
      ...this.trees,
      this.peopleContainer,
      this.alertOverlay, this.disconnectIcon,
    );
    this.container.position.set(this.plot.x, this.plot.y);
  }

  _drawFountain(intensity) {
    this.fountain.clear();
    if (intensity < 0.05) return;
    // Central spout
    this.fountain.beginFill(0x88ccff, intensity * 0.8);
    this.fountain.drawCircle(0, -44, 4);
    this.fountain.endFill();
    // Water arc dots
    const count = Math.round(6 * intensity);
    this.fountain.beginFill(0xaaddff, intensity * 0.65);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + performance.now() / 800;
      const r = 8 + Math.sin(performance.now() / 500 + i) * 2;
      this.fountain.drawCircle(Math.cos(angle) * r, -44 + Math.sin(angle) * r * 0.5 - 6, 2.5);
    }
    this.fountain.endFill();

    // Ripple ring
    this.fountainRing.clear();
    const ringR = 11 + 2 * Math.sin(performance.now() / 300);
    this.fountainRing.lineStyle(1.5, 0x88ccff, intensity * 0.35);
    this.fountainRing.drawCircle(0, -44, ringR);
  }

  onSignal(signal) {
    // Higher CPU/load → park empties (value near 1 = very busy, park is quiet)
    this.value = Math.max(0, Math.min(Number(signal?.value ?? 0), 1));
  }

  update() {
    const t = performance.now() / 1000;
    this._tick++;

    // ── Fountain scales down under high load ──────────────────────────────────
    const fountainIntensity = this.state === 'disconnected' ? 0 : Math.max(0, 1 - this.value);
    this._drawFountain(fountainIntensity);

    // ── Tree sway ─────────────────────────────────────────────────────────────
    this.trees.forEach((tree, i) => {
      tree.rotation = Math.sin(t * 0.8 + i * 1.3) * 0.04;
    });

    // ── People visibility fades with load ─────────────────────────────────────
    const visibleCount = this.state === 'disconnected'
      ? 0
      : Math.round(this.people.length * (1 - this.value * 0.85));
    this.people.forEach((p, i) => {
      p.visible = i < visibleCount;
      // Gentle bobbing on visible people
      if (p.visible) p.y += Math.sin(t * 1.2 + i) * 0.004;
    });

    // ── Alert overlay ──────────────────────────────────────────────────────────
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.2);
    this.alertOverlay.alpha   = 0.12 + pulse * 0.5;
    this.alertOverlay.visible = this.state === 'alert';

    this.disconnectIcon.visible = this.state === 'disconnected';
  }

  setAnimationState(state) { this.state = state; }
  destroy() { this.container.destroy({ children: true }); }
}