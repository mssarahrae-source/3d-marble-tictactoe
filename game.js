
const MR = 0.38;

function buildConfig(N) {
    const UNIT   = N === 3 ? 1.5 : 1.4;
    const UNIT_Y = 2.2;
    const PT     = 0.12;
    const PW     = N * UNIT + 0.4;
    const BOUND  = N * UNIT / 2;
    const PCORNER = BOUND + 0.1;
    const ALL_PLAT = [0x7a4010, 0x103078, 0x107840, 0x4a0a6a];
    const ALL_GRID = [0xf0a040, 0x4090f0, 0x40e080, 0xb040e0];
    const ALL_CSS  = ['#f0a040', '#4090f0', '#40e080', '#b040e0'];
    const NAMES  = N === 3 ? ['Bottom', 'Middle', 'Top'] : ['Level 1', 'Level 2', 'Level 3', 'Level 4'];
    const AI_DEPTHS = N === 3 ? { easy:2, medium:4, hard:5 } : { easy:1, medium:2, hard:3 };
    return { N, UNIT, UNIT_Y, PT, PW, BOUND, PCORNER,
             COL_PLAT: ALL_PLAT.slice(0, N),
             COL_GRID: ALL_GRID.slice(0, N),
             COL_CSS:  ALL_CSS.slice(0, N),
             NAMES, AI_DEPTHS };
}

function platCenterY(iy) { return (iy - (game.cfg.N - 1) / 2) * game.cfg.UNIT_Y; }
function platTopY(iy)    { return platCenterY(iy) + game.cfg.PT * 0.5; }
function marbleVisY(iy)  { return platTopY(iy) + MR; }
function cellX(ix) { return (ix - (game.cfg.N - 1) / 2) * game.cfg.UNIT; }
function cellZ(iz) { return (iz - (game.cfg.N - 1) / 2) * game.cfg.UNIT; }

function generateWinLines(N) {
    const lines = [], R = Array.from({length: N}, (_, i) => i);
    for (let y=0;y<N;y++) for (let z=0;z<N;z++) lines.push(R.map(x=>[x,y,z]));
    for (let y=0;y<N;y++) for (let x=0;x<N;x++) lines.push(R.map(z=>[x,y,z]));
    for (let x=0;x<N;x++) for (let z=0;z<N;z++) lines.push(R.map(y=>[x,y,z]));
    for (let y=0;y<N;y++) { lines.push(R.map(i=>[i,y,i])); lines.push(R.map(i=>[N-1-i,y,i])); }
    for (let z=0;z<N;z++) { lines.push(R.map(i=>[i,i,z])); lines.push(R.map(i=>[N-1-i,i,z])); }
    for (let x=0;x<N;x++) { lines.push(R.map(i=>[x,i,i])); lines.push(R.map(i=>[x,N-1-i,i])); }
    lines.push(R.map(i=>[i,i,i]), R.map(i=>[N-1-i,i,i]), R.map(i=>[i,i,N-1-i]), R.map(i=>[N-1-i,i,N-1-i]));
    return lines;
}

const game = {
    scene: null, camera: null, renderer: null, controls: null,
    targets: [], marbles: [], board: null, boardObjects: [],
    currentPlayer: 1, state: 'menu',
    mode: '2p', boardN: 3, colorset: 'redblue', aiLevel: 'medium',
    scores: { p1: 0, p2: 0 }, moves: [],
    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2(),
    audioCtx: null, soundEnabled: true,
    ghostMarble: null,
    fireworks: [], celebration: null, winLine: null,
    layerLabels: [], emptyCellDots: [],
    cfg: null, winLines: [], N: 3
};

function addBoardObj(obj) { game.scene.add(obj); game.boardObjects.push(obj); return obj; }

function clearBoard() {
    game.boardObjects.forEach(o => {
        game.scene.remove(o);
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material.dispose) o.material.dispose();
    });
    game.boardObjects = []; game.targets = []; game.emptyCellDots = [];
    game.layerLabels.forEach(l => l.el.remove()); game.layerLabels = [];
    if (game.ghostMarble) { game.scene.remove(game.ghostMarble); game.ghostMarble = null; }
}

function buildScene(N) {
    clearBoard();
    game.cfg = buildConfig(N); game.N = N;
    game.winLines = generateWinLines(N);
    game.controls.maxDistance = N === 4 ? 28 : 22;
    game.camera.position.set(N === 4 ? 10 : 7, N === 4 ? 11 : 8, N === 4 ? 10 : 7);
    createPhysicalBoard(); createLayerLabels(); buildLegend(); createGhostMarble();
}

function initScene() {
    document.getElementById('loadingMsg').style.display = 'none';
    document.getElementById('menu').style.display = 'block';
    const cc = document.getElementById('canvas-container');
    game.scene = new THREE.Scene();
    game.scene.background = new THREE.Color(0x060610);
    game.scene.fog = new THREE.FogExp2(0x060610, 0.032);
    game.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
    game.camera.position.set(7, 8, 7);
    game.renderer = new THREE.WebGLRenderer({ antialias: true });
    game.renderer.setPixelRatio(window.devicePixelRatio);
    game.renderer.setSize(window.innerWidth, window.innerHeight);
    game.renderer.shadowMap.enabled = true;
    game.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    game.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    game.renderer.toneMappingExposure = 1.1;
    cc.appendChild(game.renderer.domElement);
    game.controls = new OrbitControls(game.camera, game.renderer.domElement);
    game.controls.enableDamping = true; game.controls.dampingFactor = 0.06;
    game.controls.maxDistance = 22; game.controls.minDistance = 3;
    game.controls.target.set(0, 0, 0);
    game.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    game.scene.add(new THREE.AmbientLight(0x304060, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(6, 10, 6); sun.castShadow = true;
    sun.shadow.mapSize.width = 1024; sun.shadow.mapSize.height = 1024;
    game.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x4466aa, 0.5);
    fill.position.set(-5, -3, -5); game.scene.add(fill);
    game.cfg = buildConfig(3); game.N = 3; game.winLines = generateWinLines(3);
    createPhysicalBoard(); createLayerLabels(); buildLegend();
    createGhostMarble(); initAudio();
    loadGameState(); setupEventListeners();
    setupHowToPlay(); setupTouchHints();
    animate();
    console.log('Scene initialized OK v1.3');
}

function createPhysicalBoard() {
    const cfg = game.cfg, N = cfg.N;
    const pillarH = cfg.UNIT_Y * (N - 1) + cfg.PT + 1.0;
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x99aabb, metalness: 0.65, roughness: 0.35 });
    const footMat   = new THREE.MeshStandardMaterial({ color: 0x778899, metalness: 0.5, roughness: 0.5 });
    const pillarGeo = new THREE.CylinderGeometry(0.07, 0.09, pillarH, 10);
    const footGeo   = new THREE.CylinderGeometry(0.16, 0.2, 0.1, 10);
    for (const px of [-cfg.PCORNER, cfg.PCORNER]) {
        for (const pz of [-cfg.PCORNER, cfg.PCORNER]) {
            const p = new THREE.Mesh(pillarGeo, pillarMat.clone());
            p.position.set(px, 0, pz); p.castShadow = true; addBoardObj(p);
            const f = new THREE.Mesh(footGeo, footMat.clone());
            f.position.set(px, platCenterY(0) - cfg.PT * 0.5 - 0.35, pz); addBoardObj(f);
        }
    }
    const tgtMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    for (let iy = 0; iy < N; iy++) {
        const cy = platCenterY(iy), topY = platTopY(iy), gCol = cfg.COL_GRID[iy];
        const platMat = new THREE.MeshStandardMaterial({ color: cfg.COL_PLAT[iy], transparent: true, opacity: 0.82, metalness: 0.05, roughness: 0.3 });
        const plat = new THREE.Mesh(new THREE.BoxGeometry(cfg.PW, cfg.PT, cfg.PW), platMat);
        plat.position.set(0, cy, 0); plat.receiveShadow = true; addBoardObj(plat);
        const rimMat = new THREE.MeshStandardMaterial({ color: gCol, transparent: true, opacity: 0.5 });
        const rim = new THREE.Mesh(new THREE.BoxGeometry(cfg.PW + 0.04, cfg.PT * 0.3, cfg.PW + 0.04), rimMat);
        rim.position.set(0, cy + cfg.PT * 0.35, 0); addBoardObj(rim);
        const gY = topY + 0.004;
        const gridMat = new THREE.LineBasicMaterial({ color: gCol, transparent: true, opacity: 0.9 });
        for (let i = 0; i <= N; i++) {
            const v = (i - N / 2) * cfg.UNIT;
            const g1 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-cfg.BOUND, gY, v), new THREE.Vector3(cfg.BOUND, gY, v)]);
            const g2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(v, gY, -cfg.BOUND), new THREE.Vector3(v, gY, cfg.BOUND)]);
            addBoardObj(new THREE.Line(g1, gridMat.clone()));
            addBoardObj(new THREE.Line(g2, gridMat.clone()));
        }
        const ringMat = new THREE.MeshBasicMaterial({ color: gCol, transparent: true, opacity: 0.65 });
        for (let ix = 0; ix < N; ix++) {
            for (let iz = 0; iz < N; iz++) {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.028, 7, 20), ringMat.clone());
                ring.rotation.x = Math.PI / 2;
                ring.position.set(cellX(ix), gY + 0.006, cellZ(iz)); addBoardObj(ring);
                const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8),
                    new THREE.MeshBasicMaterial({ color: gCol, transparent: true, opacity: 0.45 }));
                dot.position.set(cellX(ix), marbleVisY(iy), cellZ(iz));
                dot.userData.pos = { x: ix, y: iy, z: iz };
                addBoardObj(dot); game.emptyCellDots.push(dot);
                const tgt = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.06, 12), tgtMat.clone());
                tgt.position.set(cellX(ix), topY + 0.04, cellZ(iz));
                tgt.userData.pos = { x: ix, y: iy, z: iz };
                addBoardObj(tgt); game.targets.push(tgt);
            }
        }
        const pl = new THREE.PointLight(gCol, 0.25, 8);
        pl.position.set(0, topY + 0.8, 0); addBoardObj(pl);
    }
}

function createLayerLabels() {
    game.layerLabels.forEach(l => l.el.remove()); game.layerLabels = [];
    const cfg = game.cfg;
    for (let yi = 0; yi < cfg.N; yi++) {
        const el = document.createElement('div');
        el.className = 'layer-label';
        el.style.color = cfg.COL_CSS[yi]; el.style.borderColor = cfg.COL_CSS[yi];
        el.textContent = cfg.NAMES[yi] + ' Level'; el.style.display = 'none';
        document.body.appendChild(el);
        game.layerLabels.push({ el, worldY: platCenterY(yi) });
    }
}

function buildLegend() {
    const leg = document.getElementById('legend');
    leg.innerHTML = '';
    const cfg = game.cfg;
    for (let i = 0; i < cfg.N; i++) {
        const d = document.createElement('div');
        d.style.color = cfg.COL_CSS[i]; d.style.borderColor = cfg.COL_CSS[i];
        d.textContent = '\u25a0 ' + cfg.NAMES[i] + ' Level';
        leg.appendChild(d);
    }
}

function updateLayerLabelPositions() {
    game.layerLabels.forEach(label => {
        const wp = new THREE.Vector3(game.cfg.BOUND + 0.4, label.worldY, game.cfg.BOUND + 0.4);
        wp.project(game.camera);
        if (wp.z < 1.0) {
            label.el.style.left = ((wp.x * 0.5 + 0.5) * window.innerWidth) + 'px';
            label.el.style.top  = ((-wp.y * 0.5 + 0.5) * window.innerHeight) + 'px';
            label.el.style.opacity = '1';
        } else { label.el.style.opacity = '0'; }
    });
}

function createGhostMarble() {
    if (game.ghostMarble) game.scene.remove(game.ghostMarble);
    const mat = new THREE.MeshPhongMaterial({
        color: getPlayerColor(game.currentPlayer),
        transparent: true, opacity: 0.38, shininess: 90, depthWrite: false
    });
    game.ghostMarble = new THREE.Mesh(new THREE.SphereGeometry(MR, 24, 24), mat);
    game.ghostMarble.visible = false;
    game.scene.add(game.ghostMarble);
}

function updateGhostColor() {
    if (game.ghostMarble) game.ghostMarble.material.color.setHex(getPlayerColor(game.currentPlayer));
}

function initAudio() {
    try { game.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
}

function playTone(freq, duration) {
    duration = duration || 0.15;
    if (!game.soundEnabled || !game.audioCtx) return;
    try {
        const osc = game.audioCtx.createOscillator();
        const gain = game.audioCtx.createGain();
        osc.connect(gain); gain.connect(game.audioCtx.destination);
        osc.frequency.value = freq; osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, game.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, game.audioCtx.currentTime + duration);
        osc.start(game.audioCtx.currentTime); osc.stop(game.audioCtx.currentTime + duration);
    } catch(e) {}
}

const FW_COLORS = [0xff4444, 0x44aaff, 0xffdd00, 0xff88ff, 0x44ffcc, 0xff8800, 0xffffff, 0xff44aa];

function playFireworkBurst() {
    if (!game.soundEnabled || !game.audioCtx) return;
    try {
        const now = game.audioCtx.currentTime;
        const pitch = 280 + Math.random() * 380;
        const osc = game.audioCtx.createOscillator();
        const g1  = game.audioCtx.createGain();
        osc.connect(g1); g1.connect(game.audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(pitch, now);
        osc.frequency.exponentialRampToValueAtTime(pitch * 4.2, now + 0.30);
        g1.gain.setValueAtTime(0.14, now);
        g1.gain.exponentialRampToValueAtTime(0.01, now + 0.34);
        osc.start(now); osc.stop(now + 0.36);
        const bufLen = Math.floor(game.audioCtx.sampleRate * 0.55);
        const buf = game.audioCtx.createBuffer(1, bufLen, game.audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
        const noise = game.audioCtx.createBufferSource();
        noise.buffer = buf;
        const g2 = game.audioCtx.createGain();
        noise.connect(g2); g2.connect(game.audioCtx.destination);
        g2.gain.setValueAtTime(0, now + 0.27);
        g2.gain.linearRampToValueAtTime(0.40, now + 0.34);
        g2.gain.exponentialRampToValueAtTime(0.01, now + 0.92);
        noise.start(now + 0.27); noise.stop(now + 0.96);
    } catch(e) {}
}

function launchFirework() {
    const col = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
    const bx = (Math.random() - 0.5) * 16;
    const by = 1.0 + Math.random() * 8;
    const bz = -2 - Math.random() * 10;
    const NUM = 90;
    const positions  = new Float32Array(NUM * 3);
    const colors     = new Float32Array(NUM * 3);
    const velocities = [];
    const c = new THREE.Color(col);
    for (let i = 0; i < NUM; i++) {
        positions[i*3] = bx; positions[i*3+1] = by; positions[i*3+2] = bz;
        colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const spd   = 2.0 + Math.random() * 3.8;
        velocities.push({
            vx: Math.sin(phi) * Math.cos(theta) * spd,
            vy: Math.sin(phi) * Math.sin(theta) * spd,
            vz: Math.cos(phi) * spd
        });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, opacity: 1.0, depthTest: false, depthWrite: false, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat); pts.renderOrder = 999;
    game.scene.add(pts); playFireworkBurst();
    game.fireworks.push({ pts, geo, mat, velocities, NUM, life: 1.0 });
}

function updateFireworks(dt) {
    const gravity = -2.4;
    game.fireworks = game.fireworks.filter(fw => {
        fw.life -= dt * 0.62;
        if (fw.life <= 0) { game.scene.remove(fw.pts); fw.geo.dispose(); fw.mat.dispose(); return false; }
        const pos = fw.geo.attributes.position.array;
        for (let i = 0; i < fw.NUM; i++) {
            fw.velocities[i].vy += gravity * dt;
            pos[i*3]   += fw.velocities[i].vx * dt;
            pos[i*3+1] += fw.velocities[i].vy * dt;
            pos[i*3+2] += fw.velocities[i].vz * dt;
        }
        fw.geo.attributes.position.needsUpdate = true;
        fw.mat.opacity = Math.max(0, fw.life);
        return true;
    });
}

function initBoard() {
    const N = game.N;
    game.board = Array.from({length:N}, () => Array.from({length:N}, () => new Array(N).fill(0)));
    game.moves = []; game.currentPlayer = 1; game.state = 'playing';
}

function getB(b, x, y, z) { return b[x][y][z]; }

function checkWin(b, player) {
    for (const line of game.winLines) {
        if (line.every(([x, y, z]) => b[x][y][z] === player)) return true;
    }
    return false;
}

function findWinLine(b, player) {
    for (const line of game.winLines) {
        if (line.every(([x, y, z]) => b[x][y][z] === player))
            return line.map(([x, y, z]) => ({x, y, z}));
    }
    return null;
}

function isFull(b) {
    const N = game.N;
    for (let x=0;x<N;x++) for (let y=0;y<N;y++) for (let z=0;z<N;z++)
        if (b[x][y][z] === 0) return false;
    return true;
}

function cloneBoard(b) { return b.map(l => l.map(r => [...r])); }

function heuristic(b, aiPlayer) {
    const N = game.N, human = 3 - aiPlayer;
    let score = 0;
    const mid = Math.floor(N / 2);
    if (b[mid][mid][mid] === aiPlayer) score += 8;
    else if (b[mid][mid][mid] === human) score -= 8;
    for (const line of game.winLines) {
        let ai = 0, hu = 0;
        for (const [x,y,z] of line) {
            if (b[x][y][z] === aiPlayer) ai++;
            else if (b[x][y][z] === human) hu++;
        }
        if (hu === 0 && ai > 0) score += ai * ai;
        if (ai === 0 && hu > 0) score -= hu * hu;
    }
    return score;
}

function minimax(b, depth, alpha, beta, maximizing, aiPlayer) {
    if (checkWin(b, 1)) return maximizing ? -(1000 - depth * 10) : -(1000 - depth * 10);
    if (checkWin(b, aiPlayer)) return 1000 - depth * 10;
    if (checkWin(b, 3 - aiPlayer)) return -(1000 - depth * 10);
    if (isFull(b)) return 0;
    if (depth === 0) return heuristic(b, aiPlayer);
    const N = game.N;
    if (maximizing) {
        let maxVal = -Infinity;
        outer: for (let x=0;x<N;x++) for (let y=0;y<N;y++) for (let z=0;z<N;z++) {
            if (b[x][y][z] === 0) {
                b[x][y][z] = aiPlayer;
                const s = minimax(b, depth-1, alpha, beta, false, aiPlayer);
                b[x][y][z] = 0;
                if (s > maxVal) maxVal = s;
                if (s > alpha) alpha = s;
                if (beta <= alpha) break outer;
            }
        }
        return maxVal;
    } else {
        let minVal = Infinity;
        outer: for (let x=0;x<N;x++) for (let y=0;y<N;y++) for (let z=0;z<N;z++) {
            if (b[x][y][z] === 0) {
                b[x][y][z] = 3 - aiPlayer;
                const s = minimax(b, depth-1, alpha, beta, true, aiPlayer);
                b[x][y][z] = 0;
                if (s < minVal) minVal = s;
                if (s < beta) beta = s;
                if (beta <= alpha) break outer;
            }
        }
        return minVal;
    }
}

function getBestMove(bc, aiPlayer, depth) {
    let best = -Infinity, move = null;
    const N = game.N;
    for (let x=0;x<N;x++) for (let y=0;y<N;y++) for (let z=0;z<N;z++) {
        if (bc[x][y][z] === 0) {
            bc[x][y][z] = aiPlayer;
            const s = minimax(bc, depth-1, -Infinity, Infinity, false, aiPlayer);
            bc[x][y][z] = 0;
            if (s > best) { best = s; move = {x, y, z}; }
        }
    }
    return move;
}

function aiTurn() {
    if (game.state !== 'playing') return;
    const depths = game.cfg.AI_DEPTHS;
    let move;
    const N = game.N;
    if (game.aiLevel === 'easy' && Math.random() < 0.5) {
        const empties = [];
        for (let x=0;x<N;x++) for (let y=0;y<N;y++) for (let z=0;z<N;z++)
            if (game.board[x][y][z] === 0) empties.push({x,y,z});
        move = empties[Math.floor(Math.random() * empties.length)];
    } else {
        move = getBestMove(cloneBoard(game.board), 2, depths[game.aiLevel]);
    }
    if (move) { placeMarble(move.x, move.y, move.z, 2); checkGameState(); }
}

function getPlayerColor(player) {
    const sets = { redblue:[0xff3333,0x3366ff], bw:[0x222222,0xdddddd], purpleteal:[0x9933ff,0x00ccbb], orangewhite:[0xff6600,0xffffff], greenyellow:[0x33cc33,0xffdd00] };
    return (sets[game.colorset] || sets.redblue)[player - 1];
}

function placeMarble(x, y, z, player) {
    game.board[x][y][z] = player;
    game.moves.push({x, y, z, player});
    playTone(player === 1 ? 523 : 392);
    const dot = game.emptyCellDots.find(d => d.userData.pos.x===x && d.userData.pos.y===y && d.userData.pos.z===z);
    if (dot) dot.visible = false;
    const col = getPlayerColor(player);
    const mat = new THREE.MeshPhongMaterial({
        color: col, shininess: 200,
        emissive: new THREE.Color(col).multiplyScalar(0.1),
        specular: new THREE.Color(0xffffff)
    });
    const marble = new THREE.Mesh(new THREE.SphereGeometry(MR, 32, 32), mat);
    marble.castShadow = true;
    const vY = marbleVisY(y);
    marble.position.set(cellX(x), vY + game.cfg.UNIT_Y * 0.45, cellZ(z));
    marble.scale.set(0.05, 0.05, 0.05);
    game.scene.add(marble);
    game.marbles.push({ mesh: marble, visualY: vY, pos:{x,y,z}, animProgress: 0 });
    game.currentPlayer = 3 - player;
    updateGhostColor();
}

function checkGameState() {
    if (checkWin(game.board, 1)) {
        game.state = 'win'; game.scores.p1++;
        document.getElementById('gameStatus').innerHTML = '<div style="color:#ffd700;">Player 1 Wins! &#127881;</div>';
        updateScores(); saveSettings(); startCelebration(findWinLine(game.board, 1)); return true;
    }
    if (checkWin(game.board, 2)) {
        game.state = 'win'; game.scores.p2++;
        document.getElementById('gameStatus').innerHTML = '<div style="color:#ffd700;">Player 2 Wins! &#127881;</div>';
        updateScores(); saveSettings(); startCelebration(findWinLine(game.board, 2)); return true;
    }
    if (isFull(game.board)) {
        game.state = 'draw';
        document.getElementById('gameStatus').innerHTML = '<div style="color:#aaa;">It\'s a Draw! &#129354;</div>';
        return true;
    }
    updateTurnDisplay();
    if (game.mode === 'ai' && game.currentPlayer === 2 && game.state === 'playing')
        setTimeout(aiTurn, 800 + Math.random() * 400);
    return false;
}

function startCelebration(winLine) {
    game.winLine = winLine;
    const cx = game.camera.position.x, cz = game.camera.position.z;
    game.celebration = {
        active: true, time: 0, lastFirework: -1,
        marbleIdx: 0, marbleTime: 0,
        camAngle: Math.atan2(cx, cz),
        camRadius: Math.sqrt(cx*cx + cz*cz),
        camHeight: game.camera.position.y
    };
    game.controls.enabled = false;
    game.marbles.forEach(m => {
        const isWin = winLine ? winLine.some(p => p.x===m.pos.x && p.y===m.pos.y && p.z===m.pos.z) : false;
        m.mesh.material.emissiveIntensity = isWin ? 1.0 : 0.04;
        m.isWinner = isWin;
    });
    function endOnInput() {
        if (!game.celebration || !game.celebration.active) return;
        window.removeEventListener('pointerdown', endOnInput);
        window.removeEventListener('keydown', endOnInput);
        stopCelebration();
    }
    setTimeout(() => {
        window.addEventListener('pointerdown', endOnInput);
        window.addEventListener('keydown', endOnInput);
    }, 700);
}

function stopCelebration() {
    if (!game.celebration) return;
    game.celebration.active = false;
    game.fireworks.forEach(fw => { game.scene.remove(fw.pts); fw.geo.dispose(); fw.mat.dispose(); });
    game.fireworks = [];
    game.marbles.forEach(m => {
        if (m.isWinner) {
            m.mesh.material.emissive.setHex(m.mesh.material.color.getHex());
            m.mesh.material.emissiveIntensity = 2.2;
        } else {
            m.mesh.material.emissiveIntensity = 0.05;
        }
    });
    game.controls.enabled = true;
    const toPos  = new THREE.Vector3(game.N === 4 ? 10 : 7, game.N === 4 ? 11 : 8, game.N === 4 ? 10 : 7);
    const toLook = new THREE.Vector3(0, 0, 0);
    const fPos   = game.camera.position.clone();
    const fLook  = game.controls.target.clone();
    let tw = 0;
    function tween() {
        if (tw >= 1) { game.camera.position.copy(toPos); game.controls.target.copy(toLook); game.controls.update(); game.state = 'win'; return; }
        tw = Math.min(1, tw + 0.025);
        const e = 1 - Math.pow(1 - tw, 3);
        game.camera.position.lerpVectors(fPos, toPos, e);
        game.controls.target.lerpVectors(fLook, toLook, e);
        game.controls.update(); requestAnimationFrame(tween);
    }
    tween();
}

function startNewGame() {
    if (game.audioCtx) game.audioCtx.resume();
    const newN = parseInt(document.getElementById('boardModeSel').value);
    game.mode      = document.getElementById('modeSel').value;
    game.colorset  = document.getElementById('colorSel').value;
    game.aiLevel   = document.getElementById('aiLevelSel').value;
    game.soundEnabled = document.getElementById('soundToggle').checked;
    game.boardN = newN;
    saveSettings();
    if (newN !== game.N) buildScene(newN);
    document.getElementById('menu').style.display   = 'none';
    if (window.innerWidth < 768) togglePanel('collapse');
    document.getElementById('gameui').style.display = 'block';
    document.getElementById('legend').style.display = 'block';
    game.layerLabels.forEach(l => l.el.style.display = 'block');
    resetToNewGame();
    if (isTouchDevice()) showTouchHints();
}

function performUndo() {
    if (game.moves.length === 0 || game.state !== 'playing') return;
    const last = game.moves.pop();
    game.board[last.x][last.y][last.z] = 0;
    const mi = game.marbles.findIndex(m => m.pos.x===last.x && m.pos.y===last.y && m.pos.z===last.z);
    if (mi !== -1) { game.scene.remove(game.marbles[mi].mesh); game.marbles.splice(mi, 1); }
    const dot = game.emptyCellDots.find(d => d.userData.pos.x===last.x && d.userData.pos.y===last.y && d.userData.pos.z===last.z);
    if (dot) dot.visible = true;
    game.currentPlayer = last.player;
    updateGhostColor();
    document.getElementById('gameStatus').innerHTML = '';
    updateTurnDisplay();
    game.state = 'playing';
}

function resetToNewGame() {
    game.marbles.forEach(m => game.scene.remove(m.mesh));
    game.marbles = [];
    if (game.celebration) {
        game.celebration.active = false;
        game.fireworks.forEach(fw => { game.scene.remove(fw.pts); fw.geo.dispose(); fw.mat.dispose(); });
        game.fireworks = []; game.celebration = null;
    }
    game.controls.enabled = true;
    game.emptyCellDots.forEach(d => d.visible = true);
    initBoard();
    updateGhostColor();
    document.getElementById('gameStatus').innerHTML = '';
    updateTurnDisplay();
}

function showMainMenu() {
    if (game.ghostMarble) game.ghostMarble.visible = false;
    document.getElementById('menu').style.display   = 'block';
    document.getElementById('gameui').style.display = 'none';
    document.getElementById('legend').style.display = 'none';
    game.layerLabels.forEach(l => l.el.style.display = 'none');
}

function loadGameState() {
    const s = localStorage.getItem('marbleTttSettings');
    if (s) {
        const o = JSON.parse(s);
        game.mode      = o.mode      || '2p';
        game.boardN    = o.boardN    || 3;
        game.colorset  = o.colorset  || 'redblue';
        game.aiLevel   = o.aiLevel   || 'medium';
        game.soundEnabled = o.sound  !== false;
    }
    const sc = localStorage.getItem('marbleTttScores');
    if (sc) game.scores = JSON.parse(sc);
    document.getElementById('boardModeSel').value = String(game.boardN || 3);
    document.getElementById('modeSel').value    = game.mode;
    document.getElementById('colorSel').value   = game.colorset;
    document.getElementById('aiLevelSel').value = game.aiLevel;
    document.getElementById('soundToggle').checked = game.soundEnabled;
    document.getElementById('aiLevelDiv').style.display = game.mode === 'ai' ? 'block' : 'none';
    updateScores();
}

function saveSettings() {
    localStorage.setItem('marbleTttSettings', JSON.stringify({
        mode: game.mode, boardN: game.boardN, colorset: game.colorset,
        aiLevel: game.aiLevel, sound: game.soundEnabled
    }));
    localStorage.setItem('marbleTttScores', JSON.stringify(game.scores));
}

function updateTurnDisplay() {
    const p = game.currentPlayer;
    const colorNames = { redblue:['Red','Blue'], bw:['Black','White'], purpleteal:['Purple','Teal'], orangewhite:['Orange','White'], greenyellow:['Green','Yellow'] };
    const names = colorNames[game.colorset] || ['P1','P2'];
    const modeLabel = game.N === 4 ? ' [4x4x4]' : '';
    document.getElementById('turn').textContent = 'Player ' + p + "'s Turn (" + names[p-1] + ')' + modeLabel;
}

function updateScores() {
    document.getElementById('score').textContent = 'P1: ' + game.scores.p1 + ' | P2: ' + game.scores.p2;
}

function getHoveredTarget(e) {
    const rect = game.renderer.domElement.getBoundingClientRect();
    game.mouse.x = ((e.clientX - rect.left) / rect.width)  *  2 - 1;
    game.mouse.y = ((e.clientY - rect.top)  / rect.height) * -2 + 1;
    game.raycaster.setFromCamera(game.mouse, game.camera);
    const hits = game.raycaster.intersectObjects(game.targets);
    return hits.length > 0 ? hits[0].object : null;
}

function onMouseMove(e) {
    if (game.state !== 'playing' || (game.mode === 'ai' && game.currentPlayer === 2)) {
        if (game.ghostMarble) game.ghostMarble.visible = false;
        game.renderer.domElement.style.cursor = 'default';
        return;
    }
    const tgt = getHoveredTarget(e);
    if (tgt) {
        const p = tgt.userData.pos;
        if (game.board[p.x][p.y][p.z] === 0) {
            game.ghostMarble.position.set(cellX(p.x), marbleVisY(p.y), cellZ(p.z));
            game.ghostMarble.visible = true;
            game.renderer.domElement.style.cursor = 'pointer';
            return;
        }
    }
    game.ghostMarble.visible = false;
    game.renderer.domElement.style.cursor = 'default';
}

function onPointerDown(e) {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    if (game.state !== 'playing' || (game.mode === 'ai' && game.currentPlayer === 2)) return;
    const tgt = getHoveredTarget(e);
    if (tgt) {
        const p = tgt.userData.pos;
        if (game.board[p.x][p.y][p.z] === 0) {
            game.ghostMarble.visible = false;
            placeMarble(p.x, p.y, p.z, game.currentPlayer);
            if (!checkGameState()) updateTurnDisplay();
        }
    }
}

function onTouchEnd(e) {
    if (game.state !== 'playing' || (game.mode === 'ai' && game.currentPlayer === 2)) return;
    if (e.changedTouches.length !== 1) return;
    const touch = e.changedTouches[0];
    const rect = game.renderer.domElement.getBoundingClientRect();
    game.mouse.x = ((touch.clientX - rect.left) / rect.width)  *  2 - 1;
    game.mouse.y = ((touch.clientY - rect.top)  / rect.height) * -2 + 1;
    game.raycaster.setFromCamera(game.mouse, game.camera);
    const hits = game.raycaster.intersectObjects(game.targets);
    if (hits.length > 0) {
        const p = hits[0].object.userData.pos;
        if (game.board[p.x][p.y][p.z] === 0) {
            placeMarble(p.x, p.y, p.z, game.currentPlayer);
            if (!checkGameState()) updateTurnDisplay();
        }
    }
}

function togglePanel(forceState) {
    const panel = document.getElementById('gameui');
    const btn   = document.getElementById('togglePanelBtn');
    if (forceState === 'collapse' || (forceState === undefined && !panel.classList.contains('collapsed'))) {
        panel.classList.add('collapsed'); btn.innerHTML = '&#9660;'; btn.title = 'Expand panel';
    } else {
        panel.classList.remove('collapsed'); btn.innerHTML = '&#9650;'; btn.title = 'Collapse panel';
    }
}

function isTouchDevice() {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
}

// ── How To Play overlay ──
function setupHowToPlay() {
    const STEPS = 7;
    const dotsEl = document.getElementById('htp-dots');
    dotsEl.innerHTML = '';
    for (let i = 0; i < STEPS; i++) {
        const d = document.createElement('div');
        d.className = 'htp-dot' + (i === 0 ? ' active' : '');
        d.addEventListener('click', () => htpShow(i));
        dotsEl.appendChild(d);
    }
    htpShow(0);
    document.getElementById('htp-next').onclick  = () => { if (game._htpCur < STEPS-1) htpShow(game._htpCur+1); else htpClose(); };
    document.getElementById('htp-prev').onclick  = () => { if (game._htpCur > 0) htpShow(game._htpCur-1); };
    document.getElementById('htp-close').onclick = htpClose;
    document.getElementById('helpBtn').onclick     = (e) => { e.preventDefault(); htpOpen(); };
    document.getElementById('helpBtnMenu').onclick = (e) => { e.preventDefault(); htpOpen(); };
    game._htpCur = 0;
    const seen = localStorage.getItem('marbleTttHtpSeen');
    if (!seen) setTimeout(htpOpen, 600);
}

function htpShow(n) {
    const STEPS = 7;
    game._htpCur = n;
    document.querySelectorAll('.htp-step').forEach((s, i) => s.classList.toggle('active', i === n));
    document.querySelectorAll('.htp-dot').forEach((d, i) => d.classList.toggle('active', i === n));
    document.getElementById('htp-prev').style.display = n === 0 ? 'none' : '';
    document.getElementById('htp-next').textContent = n === STEPS-1 ? 'Got it! \u2713' : 'Next \u2192';
}

function htpOpen() { document.getElementById('htp-overlay').classList.add('visible'); }
function htpClose() {
    document.getElementById('htp-overlay').classList.remove('visible');
    localStorage.setItem('marbleTttHtpSeen', '1');
}

// ── Touch Hints ──
function setupTouchHints() {
    document.getElementById('touch-dismiss').onclick = () => {
        document.getElementById('touch-hints').classList.remove('visible');
        localStorage.setItem('marbleTttTouchSeen', '1');
    };
}

function showTouchHints() {
    const seen = localStorage.getItem('marbleTttTouchSeen');
    if (seen) return;
    setTimeout(() => document.getElementById('touch-hints').classList.add('visible'), 400);
}

function setupEventListeners() {
    window.addEventListener('resize', () => {
        game.camera.aspect = window.innerWidth / window.innerHeight;
        game.camera.updateProjectionMatrix();
        game.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    game.renderer.domElement.addEventListener('pointermove',  onMouseMove);
    game.renderer.domElement.addEventListener('pointerdown',  onPointerDown, { passive: false });
    game.renderer.domElement.addEventListener('touchend',     onTouchEnd,    { passive: true });
    document.getElementById('modeSel').addEventListener('change', e => {
        document.getElementById('aiLevelDiv').style.display = e.target.value === 'ai' ? 'block' : 'none';
    });
    document.getElementById('togglePanelBtn').addEventListener('click', e => { e.preventDefault(); togglePanel(); });
    document.getElementById('startBtn').addEventListener('click',   e => { e.preventDefault(); startNewGame(); });
    document.getElementById('undoBtn').addEventListener('click',    e => { e.preventDefault(); performUndo(); });
    document.getElementById('newGameBtn').addEventListener('click', e => { e.preventDefault(); resetToNewGame(); });
    document.getElementById('menuBtn').addEventListener('click',    e => { e.preventDefault(); showMainMenu(); });
}

function animate() {
    requestAnimationFrame(animate);
    game.controls.update();
    const t = Date.now();
    game.marbles.forEach(marble => {
        if (marble.animProgress < 1) {
            marble.animProgress = Math.min(1, marble.animProgress + 0.07);
            const ease = 1 - Math.pow(1 - marble.animProgress, 3);
            marble.mesh.scale.setScalar(ease);
            marble.mesh.position.y = marble.visualY + (1 - ease) * game.cfg.UNIT_Y * 0.45;
        }
        marble.mesh.rotation.y += 0.007;
        if (game.state === 'win' && (!game.celebration || !game.celebration.active) && marble.isWinner) {
            marble.mesh.material.emissiveIntensity = 2 + Math.sin(t * 0.003) * 0.6;
        }
    });
    if (game.ghostMarble && game.ghostMarble.visible) {
        game.ghostMarble.material.opacity = 0.28 + Math.sin(t * 0.006) * 0.1;
    }
    if (game.celebration && game.celebration.active) {
        const cel = game.celebration;
        cel.time    += 0.016; cel.camAngle += 0.022;
        const hWobble = Math.sin(cel.time * 0.55) * 2.0;
        game.camera.position.set(
            Math.sin(cel.camAngle) * cel.camRadius,
            cel.camHeight + hWobble,
            Math.cos(cel.camAngle) * cel.camRadius
        );
        game.camera.lookAt(0, 0, 0);
        if (cel.time - cel.lastFirework > 0.60 + Math.random() * 0.55) {
            cel.lastFirework = cel.time;
            if (game.fireworks.length < 10) launchFirework();
        }
        cel.marbleTime += 0.016;
        const marbleCycleSpeed = game.N === 4 ? 0.36 : 0.44;
        if (cel.marbleTime > marbleCycleSpeed) {
            cel.marbleTime = 0;
            cel.marbleIdx = (cel.marbleIdx + 1) % game.N;
        }
        if (game.winLine) {
            game.marbles.forEach(m => {
                if (m.isWinner) {
                    const wi = game.winLine.findIndex(p => p.x===m.pos.x && p.y===m.pos.y && p.z===m.pos.z);
                    m.mesh.material.emissiveIntensity = wi === cel.marbleIdx
                        ? (3.5 + Math.sin(cel.time * 14) * 1.5) : 0.2;
                }
            });
        }
        updateFireworks(0.016);
    }
    updateLayerLabelPositions();
    game.renderer.render(game.scene, game.camera);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScene);
} else {
    initScene();
}
