
const UNIT   = 1.5;
const UNIT_Y = 2.2;
const PT     = 0.12;
const PW     = 4.9;
const MR     = 0.38;
const BOUND  = 2.25;
const PCORNER = 2.35;
const GRID_LINES = [-2.25, -0.75, 0.75, 2.25];

const platCenterY = iy => (iy - 1) * UNIT_Y;
const platTopY    = iy => platCenterY(iy) + PT * 0.5;
const marbleVisY  = iy => platTopY(iy) + MR;

const LAYER_COL_PLAT = [0x7a4010, 0x103078, 0x107840];
const LAYER_COL_GRID = [0xf0a040, 0x4090f0, 0x40e080];
const LAYER_COL_CSS  = ['#f0a040', '#4090f0', '#40e080'];
const LAYER_NAMES    = ['Bottom', 'Middle', 'Top'];

const game = {
    scene: null, camera: null, renderer: null, controls: null,
    targets: [], marbles: [], board: null,
    currentPlayer: 1, state: 'menu',
    mode: '2p', colorset: 'redblue', aiLevel: 'medium',
    scores: { p1: 0, p2: 0 }, moves: [],
    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2(),
    audioCtx: null, soundEnabled: true,
    ghostMarble: null,
    layerLabels: [],
    emptyCellDots: []
};

function initScene() {
    document.getElementById('loadingMsg').style.display = 'none';
    document.getElementById('menu').style.display = 'block';

    const cc = document.getElementById('canvas-container');
    game.scene = new THREE.Scene();
    game.scene.background = new THREE.Color(0x060610);
    game.scene.fog = new THREE.FogExp2(0x060610, 0.032);

    game.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
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
    game.controls.enableDamping = true;
    game.controls.dampingFactor = 0.06;
    game.controls.maxDistance = 18;
    game.controls.minDistance = 3;
    game.controls.target.set(0, 0, 0);

    game.scene.add(new THREE.AmbientLight(0x304060, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(6, 10, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    game.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x4466aa, 0.5);
    fill.position.set(-5, -3, -5);
    game.scene.add(fill);
    for (let iy = 0; iy < 3; iy++) {
        const pl = new THREE.PointLight(LAYER_COL_GRID[iy], 0.25, 6);
        pl.position.set(0, platTopY(iy) + 0.8, 0);
        game.scene.add(pl);
    }

    createPhysicalBoard();
    createLayerLabels();
    createGhostMarble();
    initAudio();
    loadGameState();
    setupEventListeners();
    animate();
    console.log('Scene initialized OK');
}

function createPhysicalBoard() {
    const pillarH = UNIT_Y * 2 + PT + 1.0;
    const pillarGeo = new THREE.CylinderGeometry(0.07, 0.09, pillarH, 10);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x99aabb, metalness: 0.65, roughness: 0.35 });
    const footGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.1, 10);
    const footMat = new THREE.MeshStandardMaterial({ color: 0x778899, metalness: 0.5, roughness: 0.5 });
    for (const px of [-PCORNER, PCORNER]) {
        for (const pz of [-PCORNER, PCORNER]) {
            const p = new THREE.Mesh(pillarGeo, pillarMat);
            p.position.set(px, 0, pz);
            p.castShadow = true;
            game.scene.add(p);
            const f = new THREE.Mesh(footGeo, footMat);
            f.position.set(px, platCenterY(0) - PT * 0.5 - 0.35, pz);
            game.scene.add(f);
        }
    }

    const tgtMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

    for (let iy = 0; iy < 3; iy++) {
        const cy   = platCenterY(iy);
        const topY = platTopY(iy);
        const gCol = LAYER_COL_GRID[iy];

        const platMat = new THREE.MeshStandardMaterial({
            color: LAYER_COL_PLAT[iy], transparent: true, opacity: 0.82,
            metalness: 0.05, roughness: 0.3
        });
        const plat = new THREE.Mesh(new THREE.BoxGeometry(PW, PT, PW), platMat);
        plat.position.set(0, cy, 0);
        plat.receiveShadow = true;
        game.scene.add(plat);

        const rimMat = new THREE.MeshStandardMaterial({ color: gCol, transparent: true, opacity: 0.5, metalness: 0.1, roughness: 0.4 });
        const rim = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.04, PT * 0.3, PW + 0.04), rimMat);
        rim.position.set(0, cy + PT * 0.35, 0);
        game.scene.add(rim);

        const gY = topY + 0.004;
        const gridMat = new THREE.LineBasicMaterial({ color: gCol, transparent: true, opacity: 0.9 });
        for (const xv of GRID_LINES) {
            const geo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(xv, gY, -BOUND), new THREE.Vector3(xv, gY, BOUND)
            ]);
            game.scene.add(new THREE.Line(geo, gridMat));
        }
        for (const zv of GRID_LINES) {
            const geo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-BOUND, gY, zv), new THREE.Vector3(BOUND, gY, zv)
            ]);
            game.scene.add(new THREE.Line(geo, gridMat));
        }

        const ringMat = new THREE.MeshBasicMaterial({ color: gCol, transparent: true, opacity: 0.65 });
        for (let ix = 0; ix < 3; ix++) {
            for (let iz = 0; iz < 3; iz++) {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 7, 20), ringMat);
                ring.rotation.x = Math.PI / 2;
                ring.position.set((ix - 1) * UNIT, gY + 0.006, (iz - 1) * UNIT);
                game.scene.add(ring);

                const dot = new THREE.Mesh(
                    new THREE.SphereGeometry(0.07, 8, 8),
                    new THREE.MeshBasicMaterial({ color: gCol, transparent: true, opacity: 0.45 })
                );
                dot.position.set((ix - 1) * UNIT, marbleVisY(iy), (iz - 1) * UNIT);
                dot.userData.pos = { x: ix, y: iy, z: iz };
                game.scene.add(dot);
                game.emptyCellDots.push(dot);

                const t = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.06, 12), tgtMat);
                t.position.set((ix - 1) * UNIT, topY + 0.04, (iz - 1) * UNIT);
                t.userData.pos = { x: ix, y: iy, z: iz };
                game.scene.add(t);
                game.targets.push(t);
            }
        }
    }
}

function createLayerLabels() {
    game.layerLabels.forEach(l => l.el.remove());
    game.layerLabels = [];
    for (let yi = 0; yi < 3; yi++) {
        const el = document.createElement('div');
        el.className = 'layer-label';
        el.style.color = LAYER_COL_CSS[yi];
        el.style.borderColor = LAYER_COL_CSS[yi];
        el.textContent = LAYER_NAMES[yi] + ' Level';
        el.style.display = 'none';
        document.body.appendChild(el);
        game.layerLabels.push({ el, worldY: platCenterY(yi) });
    }
}

function updateLayerLabelPositions() {
    game.layerLabels.forEach(label => {
        const wp = new THREE.Vector3(BOUND + 0.4, label.worldY, BOUND + 0.4);
        wp.project(game.camera);
        if (wp.z < 1.0) {
            label.el.style.left = ((wp.x * 0.5 + 0.5) * window.innerWidth) + 'px';
            label.el.style.top  = ((-wp.y * 0.5 + 0.5) * window.innerHeight) + 'px';
            label.el.style.opacity = '1';
        } else {
            label.el.style.opacity = '0';
        }
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

function playTone(freq, duration = 0.15) {
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

function initBoard() {
    game.board = Array.from({length:3}, () => Array.from({length:3}, () => [0,0,0]));
    game.moves = []; game.currentPlayer = 1; game.state = 'playing';
}

function getPlayerColor(player) {
    const sets = { redblue: [0xff3333, 0x3366ff], bw: [0x222222, 0xdddddd] };
    return sets[game.colorset][player - 1];
}

function placeMarble(x, y, z, player) {
    game.board[x][y][z] = player;
    game.moves.push({x, y, z, player});
    playTone(player === 1 ? 523 : 392);
    const dot = game.emptyCellDots.find(d => d.userData.pos.x===x && d.userData.pos.y===y && d.userData.pos.z===z);
    if (dot) dot.visible = false;
    const vY  = marbleVisY(y);
    const col = getPlayerColor(player);
    const mat = new THREE.MeshPhongMaterial({
        color: col, shininess: 200,
        emissive: new THREE.Color(col).multiplyScalar(0.1),
        specular: new THREE.Color(0xffffff)
    });
    const marble = new THREE.Mesh(new THREE.SphereGeometry(MR, 32, 32), mat);
    marble.castShadow = true;
    marble.position.set((x-1)*UNIT, vY + UNIT_Y * 0.45, (z-1)*UNIT);
    marble.scale.set(0.05, 0.05, 0.05);
    game.scene.add(marble);
    game.marbles.push({ mesh: marble, visualY: vY, pos:{x,y,z}, animProgress: 0 });
    game.currentPlayer = 3 - player;
    updateGhostColor();
}

function checkWin(board, player) {
    for (let py=0;py<3;py++) for (let pz=0;pz<3;pz++)
        if (board[0][py][pz]===player&&board[1][py][pz]===player&&board[2][py][pz]===player) return true;
    for (let px=0;px<3;px++) for (let pz=0;pz<3;pz++)
        if (board[px][0][pz]===player&&board[px][1][pz]===player&&board[px][2][pz]===player) return true;
    for (let px=0;px<3;px++) for (let py=0;py<3;py++)
        if (board[px][py][0]===player&&board[px][py][1]===player&&board[px][py][2]===player) return true;
    for (let pz=0;pz<3;pz++) {
        if (board[0][0][pz]===player&&board[1][1][pz]===player&&board[2][2][pz]===player) return true;
        if (board[2][0][pz]===player&&board[1][1][pz]===player&&board[0][2][pz]===player) return true;
    }
    for (let py=0;py<3;py++) {
        if (board[0][py][0]===player&&board[1][py][1]===player&&board[2][py][2]===player) return true;
        if (board[2][py][0]===player&&board[1][py][1]===player&&board[0][py][2]===player) return true;
    }
    for (let px=0;px<3;px++) {
        if (board[px][0][0]===player&&board[px][1][1]===player&&board[px][2][2]===player) return true;
        if (board[px][2][0]===player&&board[px][1][1]===player&&board[px][0][2]===player) return true;
    }
    if (board[0][0][0]===player&&board[1][1][1]===player&&board[2][2][2]===player) return true;
    if (board[0][0][2]===player&&board[1][1][1]===player&&board[2][2][0]===player) return true;
    if (board[0][2][0]===player&&board[1][1][1]===player&&board[2][0][2]===player) return true;
    if (board[0][2][2]===player&&board[1][1][1]===player&&board[2][0][0]===player) return true;
    return false;
}

function isFull(board) {
    for (let x=0;x<3;x++) for (let y=0;y<3;y++) for (let z=0;z<3;z++)
        if (board[x][y][z]===0) return false;
    return true;
}

function checkGameState() {
    if (checkWin(game.board, 1)) {
        game.state = 'win'; game.scores.p1++;
        document.getElementById('gameStatus').innerHTML = '<div style="color:#ffd700;">Player 1 Wins! &#127881;</div>';
        playTone(659, 0.4); updateScores(); saveSettings(); highlightWinner(1); return true;
    }
    if (checkWin(game.board, 2)) {
        game.state = 'win'; game.scores.p2++;
        document.getElementById('gameStatus').innerHTML = '<div style="color:#ffd700;">Player 2 Wins! &#127881;</div>';
        playTone(659, 0.4); updateScores(); saveSettings(); highlightWinner(2); return true;
    }
    if (isFull(game.board)) {
        game.state = 'draw';
        document.getElementById('gameStatus').innerHTML = `<div style="color:#aaa;">It's a Draw! &#129354;</div>`;
        return true;
    }
    updateTurnDisplay();
    if (game.mode === 'ai' && game.currentPlayer === 2 && game.state === 'playing')
        setTimeout(aiTurn, 800 + Math.random() * 400);
    return false;
}

function highlightWinner(player) {
    if (game.ghostMarble) game.ghostMarble.visible = false;
    game.marbles.forEach(m => {
        if (game.board[m.pos.x][m.pos.y][m.pos.z] === player) {
            m.mesh.material.emissiveIntensity = 3;
            m.mesh.material.shininess = 300;
        }
    });
}

function cloneBoard(b) { return b.map(l => l.map(r => [...r])); }

function heuristic(b, aiPlayer) {
    const human = 3 - aiPlayer; let score = 0;
    if (b[1][1][1] === aiPlayer) score += 8; else if (b[1][1][1] === human) score -= 8;
    for (const [x,y,z] of [[0,1,1],[2,1,1],[1,0,1],[1,2,1],[1,1,0],[1,1,2]])
        { if (b[x][y][z]===aiPlayer) score+=4; else if (b[x][y][z]===human) score-=4; }
    for (const [x,y,z] of [[0,0,0],[0,0,2],[0,2,0],[0,2,2],[2,0,0],[2,0,2],[2,2,0],[2,2,2]])
        { if (b[x][y][z]===aiPlayer) score+=3; else if (b[x][y][z]===human) score-=3; }
    return score;
}

function minimax(b, depth, alpha, beta, maximizing, aiPlayer) {
    if (checkWin(b,1)) return -(1000-depth*10);
    if (checkWin(b,2)) return  (1000-depth*10);
    if (isFull(b)) return 0;
    if (depth===0) return heuristic(b, aiPlayer);
    if (maximizing) {
        let maxEval = -Infinity;
        for (let x=0;x<3;x++) for (let y=0;y<3;y++) for (let z=0;z<3;z++) {
            if (b[x][y][z]===0) {
                b[x][y][z] = aiPlayer;
                const ns = minimax(b, depth-1, alpha, beta, false, aiPlayer);
                b[x][y][z] = 0;
                maxEval = Math.max(maxEval, ns); alpha = Math.max(alpha, maxEval);
                if (beta <= alpha) return maxEval;
            }
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (let x=0;x<3;x++) for (let y=0;y<3;y++) for (let z=0;z<3;z++) {
            if (b[x][y][z]===0) {
                b[x][y][z] = 3 - aiPlayer;
                const ns = minimax(b, depth-1, alpha, beta, true, aiPlayer);
                b[x][y][z] = 0;
                minEval = Math.min(minEval, ns); beta = Math.min(beta, minEval);
                if (beta <= alpha) return minEval;
            }
        }
        return minEval;
    }
}

function getBestMove(bc, aiPlayer, depth) {
    let best = -Infinity, move = null;
    for (let x=0;x<3;x++) for (let y=0;y<3;y++) for (let z=0;z<3;z++) {
        if (bc[x][y][z]===0) {
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
    const depths = { easy:2, medium:4, hard:5 };
    let move;
    if (game.aiLevel === 'easy' && Math.random() < 0.5) {
        const e = [];
        for (let x=0;x<3;x++) for (let y=0;y<3;y++) for (let z=0;z<3;z++)
            if (game.board[x][y][z]===0) e.push({x,y,z});
        move = e[Math.floor(Math.random() * e.length)];
    } else {
        move = getBestMove(cloneBoard(game.board), 2, depths[game.aiLevel]);
    }
    if (move) { placeMarble(move.x, move.y, move.z, 2); checkGameState(); }
}

function startNewGame() {
    if (game.audioCtx) game.audioCtx.resume();
    game.mode      = document.getElementById('modeSel').value;
    game.colorset  = document.getElementById('colorSel').value;
    game.aiLevel   = document.getElementById('aiLevelSel').value;
    game.soundEnabled = document.getElementById('soundToggle').checked;
    saveSettings();
    document.getElementById('menu').style.display    = 'none';
    document.getElementById('gameui').style.display  = 'block';
    document.getElementById('legend').style.display  = 'block';
    game.layerLabels.forEach(l => l.el.style.display = 'block');
    resetToNewGame();
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
        game.colorset  = o.colorset  || 'redblue';
        game.aiLevel   = o.aiLevel   || 'medium';
        game.soundEnabled = o.sound  !== false;
    }
    const sc = localStorage.getItem('marbleTttScores');
    if (sc) game.scores = JSON.parse(sc);
    document.getElementById('modeSel').value    = game.mode;
    document.getElementById('colorSel').value   = game.colorset;
    document.getElementById('aiLevelSel').value = game.aiLevel;
    document.getElementById('soundToggle').checked = game.soundEnabled;
    document.getElementById('aiLevelDiv').style.display = game.mode === 'ai' ? 'block' : 'none';
    updateScores();
}

function saveSettings() {
    localStorage.setItem('marbleTttSettings', JSON.stringify(
        { mode: game.mode, colorset: game.colorset, aiLevel: game.aiLevel, sound: game.soundEnabled }
    ));
    localStorage.setItem('marbleTttScores', JSON.stringify(game.scores));
}

function updateTurnDisplay() {
    const p  = game.currentPlayer;
    const cn = (game.colorset === 'redblue') ? (p === 1 ? 'Red' : 'Blue') : (p === 1 ? 'Black' : 'White');
    document.getElementById('turn').textContent = `Player ${p}'s Turn (${cn})`;
}

function updateScores() {
    document.getElementById('score').textContent = `P1: ${game.scores.p1} | P2: ${game.scores.p2}`;
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
            game.ghostMarble.position.set((p.x-1)*UNIT, marbleVisY(p.y), (p.z-1)*UNIT);
            game.ghostMarble.visible = true;
            game.renderer.domElement.style.cursor = 'pointer';
            return;
        }
    }
    game.ghostMarble.visible = false;
    game.renderer.domElement.style.cursor = 'default';
}

function onPointerDown(e) {
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

function setupEventListeners() {
    window.addEventListener('resize', () => {
        game.camera.aspect = window.innerWidth / window.innerHeight;
        game.camera.updateProjectionMatrix();
        game.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    game.renderer.domElement.addEventListener('pointermove',  onMouseMove);
    game.renderer.domElement.addEventListener('pointerdown',  onPointerDown, { passive: false });
    document.getElementById('modeSel').addEventListener('change', e => {
        document.getElementById('aiLevelDiv').style.display = e.target.value === 'ai' ? 'block' : 'none';
    });
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
            marble.mesh.position.y = marble.visualY + (1 - ease) * UNIT_Y * 0.45;
        }
        marble.mesh.rotation.y += 0.007;
        if (game.state === 'win') {
            marble.mesh.material.emissiveIntensity = 2 + Math.sin(t * 0.005) * 1.2;
        }
    });
    if (game.ghostMarble && game.ghostMarble.visible) {
        game.ghostMarble.material.opacity = 0.28 + Math.sin(t * 0.006) * 0.1;
    }
    updateLayerLabelPositions();
    game.renderer.render(game.scene, game.camera);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScene);
} else {
    initScene();
}
