const config = {
    width: 480,
    height: 720,
    gravity: 0.34,
    flapStrength: -8.2,
    maxFallSpeed: 12.5,
    maxRiseSpeed: -9.2,
    baseObstacleSpeed: 2.4,
    obstacleWidth: 70,
    obstacleGapStart: 215,
    obstacleGapMin: 142,
    obstacleGapShrink: 0.9,
    spawnInterval: 1450,
    minSpawnInterval: 1000,
    difficultyRate: 0.012,
    shakeDuration: 220,
    shakeIntensity: 8,
    particleEnabled: true,
    soundEnabled: true,
    bestScoreKey: 'arcadeGlideBest',
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const stage = document.querySelector('.canvas-wrapper');

const ui = {
    scoreValue: document.getElementById('scoreValue'),
    bestValue: document.getElementById('bestValue'),
    timeValue: document.getElementById('timeValue'),
    startBest: document.getElementById('startBest'),
    startScreen: document.getElementById('startScreen'),
    gameOverScreen: document.getElementById('gameOverScreen'),
    gameOverScore: document.getElementById('gameOverScore'),
    gameOverBest: document.getElementById('gameOverBest'),
    gameOverTime: document.getElementById('gameOverTime'),
    rankLabel: document.getElementById('rankLabel'),
};

const state = {
    current: 'start',
    score: 0,
    bestScore: 0,
    lastTime: 0,
    spawnTimer: 0,
    spawnInterval: config.spawnInterval,
    obstacleSpeed: config.baseObstacleSpeed,
    obstacleGap: config.obstacleGapStart,
    gameTime: 0,
    elapsedTime: 0,
    gameStartTime: 0,
    shakeTime: 0,
    shakeStrength: 0,
    soundEnabled: config.soundEnabled,
};

const input = {
    isTouch: false,
    action: false,
};

const particles = [];
const obstacles = [];

const AudioCtor = window.AudioContext || window.webkitAudioContext;
const audioContext = AudioCtor ? new AudioCtor() : null;
let audioUnlocked = false;

class Bird {
    constructor() {
        this.x = config.width * 0.28;
        this.y = config.height * 0.42;
        this.radius = 16;
        this.velocity = 0;
        this.rotation = 0;
        this.wing = 0;
        this.bob = 0;
        this.bobDir = 1;
    }

    reset() {
        this.x = config.width * 0.28;
        this.y = config.height * 0.42;
        this.velocity = 0;
        this.rotation = 0;
        this.wing = 0;
        this.bob = 0;
        this.bobDir = 1;
    }

    flap() {
        this.velocity = config.flapStrength;
        if (!audioUnlocked) unlockAudio();
        playSound('flap');
        this.wing = 1;
    }

    update(deltaTime) {
        if (state.current === 'start') {
            this.bob += 0.06 * deltaTime;
            this.y = config.height * 0.42 + Math.sin(this.bob) * 8;
            this.rotation = Math.sin(this.bob * 0.9) * 0.2;
        } else {
            this.velocity += config.gravity;
            this.velocity = clamp(this.velocity, config.maxRiseSpeed, config.maxFallSpeed);
            this.y += this.velocity;
            this.rotation = lerp(this.rotation, this.velocity / 18, 0.08);
        }

        if (this.wing > 0) {
            this.wing = Math.max(0, this.wing - 0.08 * deltaTime);
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        const bodyColor = '#f7f9ff';
        const accent = '#5ba8ff';
        const shadow = 'rgba(20, 36, 72, 0.18)';

        ctx.shadowColor = shadow;
        ctx.shadowBlur = 16;

        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 1.1, this.radius * 0.92, 0, 0, Math.PI * 2);
        ctx.fillStyle = bodyColor;
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(-4, -2, this.radius * 0.36, this.radius * 0.55, 0.35, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.fill();

        const wingOffset = this.wing * 5;
        ctx.beginPath();
        ctx.moveTo(-3, 4);
        ctx.quadraticCurveTo(0, 4 + wingOffset, 16, 2);
        ctx.quadraticCurveTo(20, 0, 6, -5);
        ctx.fillStyle = accent;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(4, -4, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = '#1a304c';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(5, -5, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = '#fbfbff';
        ctx.fill();

        ctx.restore();
        ctx.shadowBlur = 0;
    }

    getBounds() {
        return {
            x: this.x - this.radius * 0.75,
            y: this.y - this.radius * 0.75,
            w: this.radius * 1.5,
            h: this.radius * 1.5,
        };
    }
}

class Obstacle {
    constructor(x, gapSize, speed) {
        this.x = x;
        this.width = config.obstacleWidth;
        this.gapSize = gapSize;
        this.speed = speed;
        this.passed = false;
        this.topHeight = randomRange(96, config.height - config.obstacleGapMin - 140);
        this.bottomY = this.topHeight + this.gapSize;
    }

    update(deltaTime) {
        this.x -= this.speed * deltaTime * 0.06;
    }

    draw() {
        const color = '#2fbf71';
        const shade = '#238c56';
        const highlight = 'rgba(255, 255, 255, 0.34)';

        ctx.fillStyle = color;
        ctx.fillRect(this.x, 0, this.width, this.topHeight);
        ctx.fillRect(this.x, this.bottomY, this.width, config.height - this.bottomY);

        ctx.fillStyle = shade;
        ctx.fillRect(this.x + 12, 0, this.width - 22, this.topHeight);
        ctx.fillRect(this.x + 12, this.bottomY, this.width - 22, config.height - this.bottomY);

        ctx.fillStyle = highlight;
        ctx.fillRect(this.x + 8, 12, this.width - 16, 6);
        ctx.fillRect(this.x + 8, this.bottomY + 12, this.width - 16, 6);

        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(this.x - 6, this.topHeight - 18, this.width + 12, 18);
        ctx.fillRect(this.x - 6, this.bottomY, this.width + 12, 18);
    }

    isInsideView() {
        return this.x + this.width > -20;
    }

    handleScore(birdX) {
        if (!this.passed && birdX > this.x + this.width) {
            this.passed = true;
            return true;
        }
        return false;
    }

    collidesWith(bounds) {
        const collidedTop = rectIntersect(bounds, { x: this.x, y: 0, w: this.width, h: this.topHeight });
        const collidedBottom = rectIntersect(bounds, { x: this.x, y: this.bottomY, w: this.width, h: config.height - this.bottomY });
        return collidedTop || collidedBottom;
    }
}

class Particle {
    constructor(x, y, vx, vy, radius, life) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.radius = radius;
        this.life = life;
        this.alpha = 1;
    }

    update(deltaTime) {
        this.x += this.vx * deltaTime * 0.06;
        this.y += this.vy * deltaTime * 0.06;
        this.vy += 0.12 * deltaTime * 0.06;
        this.life -= 1.5 * deltaTime * 0.06;
        this.alpha = clamp(this.life / 30, 0, 1);
    }

    draw() {
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha * 0.85})`;
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

const bird = new Bird();

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function randomRange(min, max) {
    return min + Math.random() * (max - min);
}

function rectIntersect(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function unlockAudio() {
    if (!audioContext || audioUnlocked) return;
    const source = audioContext.createBufferSource();
    source.buffer = audioContext.createBuffer(1, 1, 22050);
    source.connect(audioContext.destination);
    if (audioContext.state === 'suspended') audioContext.resume();
    source.start(0);
    audioUnlocked = true;
}

function playTone(frequency, duration, type = 'sine', volume = 0.16) {
    if (!audioContext || !state.soundEnabled) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.connect(gain);
    gain.connect(audioContext.destination);
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration / 1000);
    osc.start();
    osc.stop(audioContext.currentTime + duration / 1000 + 0.02);
}

function playSound(event) {
    if (!audioContext || !state.soundEnabled) return;
    switch (event) {
        case 'flap':
            playTone(450, 90, 'triangle', 0.14);
            break;
        case 'score':
            playTone(680, 90, 'sine', 0.18);
            setTimeout(() => playTone(920, 50, 'sine', 0.1), 90);
            break;
        case 'hit':
            playTone(180, 160, 'square', 0.16);
            break;
        case 'start':
            playTone(360, 90, 'triangle', 0.12);
            break;
    }
}

function saveBestScore() {
    const currentBest = parseInt(localStorage.getItem(config.bestScoreKey) || '0', 10);
    if (state.score > currentBest) {
        localStorage.setItem(config.bestScoreKey, String(state.score));
        state.bestScore = state.score;
    }
}

function loadBestScore() {
    state.bestScore = parseInt(localStorage.getItem(config.bestScoreKey) || '0', 10);
}

function resetGame() {
    state.score = 0;
    state.spawnTimer = 0;
    state.spawnInterval = config.spawnInterval;
    state.obstacleSpeed = config.baseObstacleSpeed;
    state.obstacleGap = config.obstacleGapStart;
    state.gameTime = 0;
    state.elapsedTime = 0;
    state.gameStartTime = 0;
    state.shakeTime = 0;
    obstacles.length = 0;
    particles.length = 0;
    bird.reset();
    updateUI();
}

function startGame() {
    if (state.current === 'start') {
        state.current = 'playing';
        state.lastTime = performance.now();
        state.gameStartTime = performance.now();
        playSound('start');
    }
    bird.flap();
    hideOverlay(ui.startScreen);
}

function endGame() {
    state.current = 'gameover';
    state.shakeTime = config.shakeDuration;
    saveBestScore();
    showGameOver();
    playSound('hit');
}

function showOverlay(overlay) {
    overlay.classList.add('active');
}

function hideOverlay(overlay) {
    overlay.classList.remove('active');
}

function showGameOver() {
    ui.gameOverScore.textContent = state.score;
    ui.gameOverBest.textContent = state.bestScore;
    ui.gameOverTime.textContent = `${state.elapsedTime.toFixed(1)}s`;
    ui.rankLabel.textContent = getRankLabel(state.score);
    showOverlay(ui.gameOverScreen);
}

function hideGameOver() {
    hideOverlay(ui.gameOverScreen);
}

function getRankLabel(score) {
    if (score >= 26) return 'Machine';
    if (score >= 16) return 'Expert';
    if (score >= 6) return 'Skilled';
    return 'Beginner';
}

function updateUI() {
    ui.scoreValue.textContent = state.score;
    ui.bestValue.textContent = state.bestScore;
    ui.startBest.textContent = state.bestScore;
    ui.timeValue.textContent = `${state.elapsedTime.toFixed(1)}s`;
}

function handleInput() {
    if (state.current === 'start') {
        startGame();
    } else if (state.current === 'playing') {
        bird.flap();
    } else if (state.current === 'gameover') {
        state.current = 'start';
        resetGame();
        hideGameOver();
        showOverlay(ui.startScreen);
    }
}

window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
        event.preventDefault();
        handleInput();
    }
});

stage.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    handleInput();
});

function spawnObstacle() {
    const gap = Math.max(config.obstacleGapMin, state.obstacleGap);
    obstacles.push(new Obstacle(config.width + 40, gap, state.obstacleSpeed));
}

function updateDifficulty() {
    const difficulty = 1 + state.score * config.difficultyRate;
    state.obstacleSpeed = config.baseObstacleSpeed * clamp(difficulty, 1, 2.8);
    state.obstacleGap = config.obstacleGapStart - state.score * 1.8;
    state.obstacleGap = Math.max(config.obstacleGapMin, state.obstacleGap);
    state.spawnInterval = config.spawnInterval - state.score * 12;
    state.spawnInterval = Math.max(config.minSpawnInterval, state.spawnInterval);
}

function spawnParticles(x, y) {
    if (!config.particleEnabled) return;
    const amount = 6;
    for (let i = 0; i < amount; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = randomRange(1.5, 3.4);
        particles.push(new Particle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed - 1.2, randomRange(1.6, 3.2), randomRange(16, 26)));
    }
}

function update(deltaTime) {
    if (state.current === 'playing') {
        state.gameTime += deltaTime;
        state.elapsedTime = (performance.now() - state.gameStartTime) / 1000;
        state.spawnTimer += deltaTime;

        bird.update(deltaTime);

        obstacles.forEach((obstacle) => obstacle.update(deltaTime));

        for (let i = obstacles.length - 1; i >= 0; i -= 1) {
            const obstacle = obstacles[i];
            if (!obstacle.isInsideView()) {
                obstacles.splice(i, 1);
            }
        }

        if (state.spawnTimer >= state.spawnInterval) {
            spawnObstacle();
            state.spawnTimer = 0;
        }

        updateDifficulty();

        obstacles.forEach((obstacle) => {
            if (obstacle.handleScore(bird.x) && state.current === 'playing') {
                state.score += 1;
                playSound('score');
                spawnParticles(bird.x, bird.y);
                updateUI();
            }
        });

        const birdBounds = bird.getBounds();
        const hitWall = bird.y - bird.radius <= 0 || bird.y + bird.radius >= config.height;
        const hitPipe = obstacles.some((obstacle) => obstacle.collidesWith(birdBounds));

        if (hitWall || hitPipe) {
            endGame();
        }
    } else {
        bird.update(deltaTime);
    }

    particles.forEach((particle, index) => {
        particle.update(deltaTime);
        if (particle.life <= 0 || particle.alpha <= 0) {
            particles.splice(index, 1);
        }
    });

    if (state.shakeTime > 0) {
        state.shakeTime -= deltaTime;
    }
}

function drawBackground() {
    ctx.fillStyle = '#8ed9f2';
    ctx.fillRect(0, 0, config.width, config.height);

    const waveOffset = state.gameTime * 0.018;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    for (let i = 0; i < 4; i += 1) {
        const x = ((i * 150) + (waveOffset * 6)) % (config.width + 180) - 120;
        const y = 80 + i * 92;
        ctx.beginPath();
        ctx.ellipse(x, y, 34, 16, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 28, y + 4, 44, 18, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 62, y, 32, 14, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    for (let i = 0; i < 5; i += 1) {
        const y = 80 + i * 90;
        const amplitude = 10 + i * 3;
        const speed = 0.13 + i * 0.02;
        ctx.beginPath();
        for (let x = 0; x <= config.width; x += 12) {
            const wave = Math.sin((x * 0.03) + waveOffset * speed + i) * amplitude;
            if (x === 0) ctx.moveTo(x, y + wave);
            else ctx.lineTo(x, y + wave);
        }
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.18 + i * 0.04})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
}

function drawGround() {
    const groundHeight = 66;
    const patternOffset = (state.gameTime * 0.08) % 40;
    ctx.fillStyle = '#2fbf71';
    ctx.fillRect(0, config.height - groundHeight, config.width, groundHeight);

    ctx.strokeStyle = 'rgba(17, 48, 71, 0.24)';
    ctx.lineWidth = 1;
    for (let x = -40 + patternOffset; x < config.width + 40; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, config.height - groundHeight + 10);
        ctx.lineTo(x + 16, config.height - 12);
        ctx.stroke();
    }
}

function render() {
    drawBackground();

    if (state.shakeTime > 0) {
        const shake = config.shakeIntensity * (state.shakeTime / config.shakeDuration);
        const dx = randomRange(-shake, shake);
        const dy = randomRange(-shake, shake);
        ctx.save();
        ctx.translate(dx, dy);
        obstacles.forEach((obstacle) => obstacle.draw());
        bird.draw();
        particles.forEach((particle) => particle.draw());
        ctx.restore();
    } else {
        obstacles.forEach((obstacle) => obstacle.draw());
        bird.draw();
        particles.forEach((particle) => particle.draw());
    }

    drawGround();
}

function loop(timestamp) {
    if (!state.lastTime) state.lastTime = timestamp;
    const deltaTime = Math.min(34, timestamp - state.lastTime);
    state.lastTime = timestamp;

    update(deltaTime);

    ctx.clearRect(0, 0, config.width, config.height);
    render();
    updateUI();

    requestAnimationFrame(loop);
}

function init() {
    loadBestScore();
    updateUI();
    showOverlay(ui.startScreen);
    state.lastTime = performance.now();
    requestAnimationFrame(loop);
}

init();
