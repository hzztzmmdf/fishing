"use strict";

// 基础常量
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// 背景音乐
const bgm = new Audio("bgm1.mp3");
bgm.loop = true;
bgm.volume = 0.3; // 设置音量为30%

// 图片资源
const Images = {
    background: new Image(),
    ship: new Image(),
    fish: {
        "小鱼": new Image(),
        "大鱼": new Image(),
        "保护鱼类1": new Image(),
        "保护鱼类2": new Image(),
    }
};

// 加载图片
Images.background.src = "img/bg_lake_01.jpg";
Images.ship.src = "img/hero_fishingboat_1.png";
Images.fish["小鱼"].src = "img/hero_fish_01.png";
Images.fish["大鱼"].src = "img/hero_fish_02.png";
Images.fish["保护鱼类1"].src = "img/hero_fish_03.png";
Images.fish["保护鱼类2"].src = "img/hero_fish_04.png";

// 图片加载错误处理
Object.values(Images.fish).forEach(img => {
    img.onerror = () => console.log("鱼类图片加载失败:", img.src);
});
Images.background.onerror = () => console.log("背景图片加载失败:", Images.background.src);
Images.ship.onerror = () => console.log("渔船图片加载失败:", Images.ship.src);

const HUD = {
    currentLevel: document.getElementById("currentLevel"),
    targetScore: document.getElementById("targetScore"),
    currentScore: document.getElementById("currentScore"),
    stamina: document.getElementById("stamina"),
    fishStats: document.getElementById("fishStats"),
    fishCounts: document.getElementById("fishCounts"),
    levelIntro: document.getElementById("levelIntro"),
    introLevel: document.getElementById("introLevel"),
    introTarget: document.getElementById("introTarget"),
    introStamina: document.getElementById("introStamina"),
    fishTypes: document.getElementById("fishTypes"),
    btnStartLevel: document.getElementById("btnStartLevel"),
};

const UI = {
    btnCast: document.getElementById("btnCast"),
    btnReset: document.getElementById("btnReset"),
    endPanel: document.getElementById("endPanel"),
    endText: document.getElementById("endText"),
    levelComplete: document.getElementById("levelComplete"),
    btnNextLevel: document.getElementById("btnNextLevel"),
    btnAgain: document.getElementById("btnAgain"),
};

// 张力槽 UI
const tensionBar = document.createElement("div");
tensionBar.className = "tensionBar";
const tensionFill = document.createElement("div");
tensionFill.className = "tensionFill";
tensionBar.appendChild(tensionFill);
document.body.appendChild(tensionBar);

// 游戏配置
const GAME_CONFIG = {
    seaFloorY: canvas.height - 80,
    seaGrass: [200, 600, 1000],
    bubbleChance: 0.008,
    fishSpawnIntervalMs: 1400,
    protectedFishPenalty: 20,
    timeLimitSec: 9999,
    staminaMax: 9,
};

// 关卡配置
const LEVEL_CONFIG = {
    1: { targetScore: 100, fishTypes: ["小鱼", "大鱼"], staminaMax: 9 },
    2: { targetScore: 150, fishTypes: ["小鱼", "大鱼", "保护鱼类1"], staminaMax: 12 },
    3: { targetScore: 200, fishTypes: ["小鱼", "大鱼", "保护鱼类1", "保护鱼类2"], staminaMax: 15 },
};

// 鱼类定义
const FISH_TYPES = {
    "小鱼": { name: "小鱼", value: 5, speed: [1.2, 2.2], size: 14, isProtected: false },
    "大鱼": { name: "大鱼", value: 20, speed: [0.8, 1.6], size: 20, isProtected: false },
    "保护鱼类1": { name: "保护鱼类1", value: -20, speed: [0.6, 1.2], size: 18, isProtected: true },
    "保护鱼类2": { name: "保护鱼类2", value: -20, speed: [0.7, 1.4], size: 16, isProtected: true },
};

// 游戏状态
const State = {
    currentLevel: 1,
    score: 0,
    startTime: performance.now(),
    lastSpawn: 0,
    fishes: [],
    bubbles: [],
    line: {
        x: 200, // 船体位置
        y: 380, // 海面线位置
        len: 0,
        hookY: 380, // 初始钩子位置在海面线
        isCasting: false,
        isReeling: false,
        tension: 0, // 0-100
        hooked: null, // 引用 fish
    },
    over: false,
    win: false,
    stamina: GAME_CONFIG.staminaMax,
    fishCaught: {}, // 记录钓到的鱼类数量
};
// 更新关卡显示
function updateLevelDisplay() {
    const config = LEVEL_CONFIG[State.currentLevel];
    HUD.currentLevel.textContent = String(State.currentLevel);
    HUD.targetScore.textContent = String(config.targetScore);
    HUD.stamina.textContent = `${State.stamina} / ${config.staminaMax}`;
}

updateLevelDisplay();

// 工具函数
function rand(min, max) { return Math.random() * (max - min) + min; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// 实体：鱼
function spawnFish() {
    const config = LEVEL_CONFIG[State.currentLevel];
    const fishTypeName = config.fishTypes[Math.floor(rand(0, config.fishTypes.length))];
    const t = FISH_TYPES[fishTypeName];
    const dir = Math.random() < 0.5 ? 1 : -1;
    const y = rand(400, GAME_CONFIG.seaFloorY - 40);
    const x = dir === 1 ? -30 : canvas.width + 30;
    const speed = rand(t.speed[0], t.speed[1]) * dir;
    State.fishes.push({
        type: t,
        x, y,
        speed,
        size: t.size,
        hooked: false,
    });
}

// 实体：气泡
function spawnBubble() {
    State.bubbles.push({ x: rand(0, canvas.width), y: GAME_CONFIG.seaFloorY + rand(0, 40), r: rand(2, 4), s: rand(0.4, 0.9) });
}

// 输入
function toggleCast() {
    if (State.over) return;
    // 立即收回功能：如果线在水中，点击直接进入收线
    if (State.line.len > 0 && !State.line.isReeling) {
        State.line.isReeling = true;
        return;
    }
    if (!State.line.isCasting && !State.line.isReeling) {
        if (State.stamina <= 0) return; // 无体力不能抛竿
        State.stamina -= 1;
        HUD.stamina.textContent = String(State.stamina);
        State.line.isCasting = true; // 抛线向下
    } else {
        State.line.isReeling = true; // 收线
    }
}

UI.btnCast.addEventListener("click", toggleCast);
UI.btnReset.addEventListener("click", resetToLevel1);
UI.btnAgain.addEventListener("click", resetToLevel1);
UI.btnNextLevel.addEventListener("click", nextLevel);
window.addEventListener("keydown", (e)=>{ if (e.code === "Space") { e.preventDefault(); toggleCast(); } });

canvas.addEventListener("mousemove", (e)=>{
    // 船体在水面可左右移动；抛竿或收线期间不移动
    if (State.line.isCasting || State.line.isReeling) return;
    const rect = canvas.getBoundingClientRect();
    State.line.x = clamp(e.clientX - rect.left, 40, canvas.width - 40);
});

canvas.addEventListener("mousedown", ()=>{ toggleCast(); });

// 重置
function resetGame() {
    const config = LEVEL_CONFIG[State.currentLevel];
    State.score = 0;
    State.startTime = performance.now();
    State.lastSpawn = 0;
    State.fishes = [];
    State.bubbles = [];
    State.line.len = 0;
    State.line.hookY = 380;
    State.line.isCasting = false;
    State.line.isReeling = false;
    State.line.tension = 0;
    State.line.hooked = null;
    State.over = false;
    State.win = false;
    UI.endPanel.classList.add("hidden");
    UI.levelComplete.classList.add("hidden");
    HUD.currentScore.textContent = "0";
    State.stamina = config.staminaMax;
    State.fishCaught = {}; // 重置鱼类统计
    updateLevelDisplay();
    updateFishStats();
    
    // 重新播放背景音乐
    bgm.currentTime = 0;
    bgm.play().catch(e => console.log("背景音乐播放失败:", e));
}

// 逻辑更新
function update(dt) {
    // 计时与结束
    const elapsed = (performance.now() - State.startTime) / 1000;
    if (!State.over && (elapsed >= GAME_CONFIG.timeLimitSec)) {
        gameOver(State.score >= GAME_CONFIG.targetScore);
    }

    // 生成鱼
    State.lastSpawn += dt;
    if (State.lastSpawn >= GAME_CONFIG.fishSpawnIntervalMs) {
        State.lastSpawn = 0;
        spawnFish();
        if (Math.random() < 0.5) spawnFish();
    }
    if (Math.random() < GAME_CONFIG.bubbleChance && State.bubbles.length < 15) spawnBubble();

    // 气泡上浮
    State.bubbles.forEach(b => { 
        b.y -= b.s; 
        // 气泡超过海面线就消失
        if (b.y < 380) {
            b.y = GAME_CONFIG.seaFloorY + rand(0, 40);
        }
    });

    // 鱼移动
    State.fishes.forEach(f => {
        if (!f.hooked) f.x += f.speed;
    });
    State.fishes = State.fishes.filter(f => f.x > -60 && f.x < canvas.width + 60);

    // 线与钩
    const baseY = 380;
    if (State.line.isCasting && !State.line.isReeling) {
        State.line.len += 240 * dt/1000;
        State.line.hookY = Math.min(baseY + State.line.len, GAME_CONFIG.seaFloorY);
        if (State.line.hookY >= GAME_CONFIG.seaFloorY) {
            State.line.isCasting = false;
        }
    }
    if (State.line.isReeling) {
        const reelSpeed = State.line.hooked ? 180 : 260;
        State.line.len = Math.max(0, State.line.len - reelSpeed * dt/1000);
        State.line.hookY = baseY + State.line.len;
        if (State.line.hookY <= baseY) {
            State.line.isReeling = false;
            State.line.isCasting = false;
            if (State.line.hooked) landFish(State.line.hooked);
            State.line.hooked = null;
            State.line.tension = 0;
            // 体力用尽且未钓到鱼时的结算
            if (State.stamina === 0) checkWinByStaminaEnd();
        }
    }

    // 碰撞检测：钩到鱼
    if (!State.line.hooked) {
        for (let i = 0; i < State.fishes.length; i++) {
            const f = State.fishes[i];
            const dx = Math.abs(f.x - State.line.x);
            const dy = Math.abs(f.y - State.line.hookY);
            if (dx < f.size + 6 && dy < f.size + 6) {
                f.hooked = true;
                State.line.hooked = f;
                State.line.isReeling = true; // 自动收线
                break;
            }
        }
    } else {
        // 被钩的鱼跟随钩位置，并产生张力
        const f = State.line.hooked;
        f.x += (State.line.x - f.x) * 0.1;
        f.y += (State.line.hookY - f.y) * 0.15;
        const pull = Math.abs(f.speed) * 15 + 18;
        if (State.line.isReeling) State.line.tension = clamp(State.line.tension + pull * dt/1000, 0, 100);
        else State.line.tension = clamp(State.line.tension - 20 * dt/1000, 0, 100);
        // 张力过高断线
        if (State.line.tension >= 100) {
            // 断线惩罚
            State.score = Math.max(0, State.score - 10);
            HUD.currentScore.textContent = String(State.score);
            State.line.hooked = null;
            State.line.isReeling = false;
            State.line.tension = 0;
        }
    }
}

function landFish(f) {
    // 到岸边，获得收益（按鱼型）
    const delta = f.type.value;
    State.score = Math.max(0, State.score + delta);
    HUD.currentScore.textContent = String(State.score);
    
    // 记录钓到的鱼类
    const fishName = f.type.name;
    if (!State.fishCaught[fishName]) {
        State.fishCaught[fishName] = 0;
    }
    State.fishCaught[fishName]++;
    console.log("钓到鱼类:", fishName, "当前统计:", State.fishCaught);
    updateFishStats();
    
    // 移除鱼
    const idx = State.fishes.indexOf(f);
    if (idx >= 0) State.fishes.splice(idx, 1);
    // 胜负：体力耗尽后结算
    if (State.stamina === 0 && !State.line.isCasting && !State.line.isReeling) checkWinByStaminaEnd();
}

function checkWinByStaminaEnd() {
    if (State.over) return;
    const config = LEVEL_CONFIG[State.currentLevel];
    const levelPassed = State.score >= config.targetScore;
    
    if (levelPassed) {
        if (State.currentLevel >= 3) {
            // 通过第3关，完全胜利
            gameOver(true, true);
        } else {
            // 通过当前关卡，进入下一关
            showLevelComplete();
        }
    } else {
        // 失败，回到第1关
        gameOver(false, false);
        // 延迟重置到第1关，让用户看到失败信息
        setTimeout(() => {
            resetToLevel1();
        }, 2000);
    }
}

function gameOver(win, isFinalWin = false) {
    State.over = true;
    State.win = win;
    if (isFinalWin) {
        UI.endText.textContent = "完全胜利！通过所有关卡！🎉 你是真正的钓鱼大师！";
    } else if (win) {
        UI.endText.textContent = "胜利！达成目标收益 🎣 干得漂亮！继续加油！";
    } else {
        UI.endText.textContent = "失败！未达成目标收益 😔 没关系，失败是成功之母，再来一次吧！";
    }
    UI.endPanel.classList.remove("hidden");
}

function showLevelComplete() {
    State.over = true;
    UI.endText.textContent = `关卡${State.currentLevel}完成！`;
    UI.levelComplete.classList.remove("hidden");
    UI.endPanel.classList.remove("hidden");
}

function nextLevel() {
    State.currentLevel++;
    resetGame();
    UI.levelComplete.classList.add("hidden");
}

function resetToLevel1() {
    // 失败时回到第1关
    State.currentLevel = 1;
    resetGame();
}

// 渲染
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景图片
    if (Images.background.complete) {
        ctx.drawImage(Images.background, 0, 0, canvas.width, canvas.height);
    } else {
        // 备用背景色
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0.4, "#0c203a");
        gradient.addColorStop(0.6, "#08304f");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 海面与船
    ctx.save();
    ctx.strokeStyle = "#a9c6ff";
    ctx.lineWidth = 2;
    // 海面虚线
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(20, 380);
    ctx.lineTo(canvas.width - 20, 380);
    ctx.stroke();
    ctx.setLineDash([]);

    // 船（跟随 State.line.x）
    const shipX = clamp(State.line.x - 35, 60, canvas.width - 120);
    if (Images.ship.complete) {
        ctx.drawImage(Images.ship, shipX, 330, 80, 50);
    } else {
        // 备用船体绘制
        ctx.fillStyle = "#e6e6e6";
        ctx.fillRect(shipX, 330, 70, 16);
        ctx.beginPath();
        ctx.moveTo(shipX - 10, 346); ctx.lineTo(shipX + 5, 370); ctx.lineTo(shipX + 65, 370); ctx.lineTo(shipX + 80, 346); ctx.closePath();
        ctx.fillStyle = "#b7b7b7"; ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.fillRect(shipX + 40, 318, 12, 12);
    }
    ctx.restore();

    // 海草
    ctx.strokeStyle = "#3aa66b"; ctx.lineWidth = 3;
    GAME_CONFIG.seaGrass.forEach(x=>{
        ctx.beginPath();
        ctx.moveTo(x, GAME_CONFIG.seaFloorY);
        ctx.quadraticCurveTo(x-10, GAME_CONFIG.seaFloorY-30, x, GAME_CONFIG.seaFloorY-60);
        ctx.stroke();
    });

    // 气泡
    ctx.fillStyle = "rgba(255,255,255,.55)";
    State.bubbles.forEach(b=>{ ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill(); });

    // 海底
    ctx.fillStyle = "#133a5a";
    ctx.fillRect(0, GAME_CONFIG.seaFloorY, canvas.width, canvas.height - GAME_CONFIG.seaFloorY);

    // 鱼
    State.fishes.forEach(f => drawFish(f));

    // 线与钩（从海面线开始）
    ctx.strokeStyle = "#eaeaea"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(State.line.x, 380);
    ctx.lineTo(State.line.x, State.line.hookY);
    ctx.stroke();
    ctx.fillStyle = "#ffd36e";
    ctx.beginPath();
    ctx.arc(State.line.x, State.line.hookY, 5, 0, Math.PI*2); ctx.fill();

    // 张力槽
    tensionFill.style.width = `${State.line.tension * 3.3}px`;
}

function drawFish(f) {
    const fishImg = Images.fish[f.type.name];
    const bodyW = f.size * 2, bodyH = f.size;
    
    ctx.save();
    ctx.translate(f.x, f.y);
    if (f.speed < 0) ctx.scale(-1, 1);
    
    if (fishImg && fishImg.complete) {
        // 使用鱼类图片
        ctx.drawImage(fishImg, -bodyW*0.6, -bodyH*0.6, bodyW*1.2, bodyH*1.2);
    } else {
        // 备用绘制：按鱼类型着色
        if (f.type.isProtected) {
            ctx.fillStyle = "#8fd3f4";
        } else if (f.type.value >= 20) {
            ctx.fillStyle = "#ffd166";
        } else {
            ctx.fillStyle = "#ff8fab";
        }
        ctx.beginPath();
        ctx.ellipse(0, 0, bodyW*0.6, bodyH*0.6, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(bodyW*0.6, 0); ctx.lineTo(bodyW*0.6+10, -6); ctx.lineTo(bodyW*0.6+10, 6); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(-bodyW*0.2, -bodyH*0.12, 2, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
}

let last = performance.now();
function loop() {
    try {
        const now = performance.now();
        const dt = now - last; last = now;
        update(dt);
        draw();
        requestAnimationFrame(loop);
    } catch (error) {
        console.error("游戏循环错误:", error);
        // 绘制错误信息
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.font = "20px Arial";
        ctx.fillText("游戏运行错误: " + error.message, 50, 50);
    }
}

// 更新鱼类统计显示
function updateFishStats() {
    const fishCounts = HUD.fishCounts;
    fishCounts.innerHTML = "";
    
    const hasFish = Object.keys(State.fishCaught).length > 0;
    console.log("鱼类统计更新:", State.fishCaught, "有鱼:", hasFish);
    
    if (!hasFish) {
        HUD.fishStats.classList.add("hidden");
        return;
    }
    
    HUD.fishStats.classList.remove("hidden");
    
    Object.entries(State.fishCaught).forEach(([fishName, count]) => {
        const div = document.createElement("div");
        div.className = "fish-count";
        div.innerHTML = `
            <span class="fish-name">${fishName}</span>
            <span class="fish-count-num">${count}</span>
        `;
        fishCounts.appendChild(div);
    });
}

// 显示关卡介绍
function showLevelIntro() {
    const config = LEVEL_CONFIG[State.currentLevel];
    HUD.introLevel.textContent = State.currentLevel;
    HUD.introTarget.textContent = config.targetScore;
    HUD.introStamina.textContent = config.staminaMax;
    
    // 显示当前关卡的鱼类信息
    const fishTypesDiv = HUD.fishTypes;
    fishTypesDiv.innerHTML = "";
    
    config.fishTypes.forEach(fishTypeName => {
        const fishType = FISH_TYPES[fishTypeName];
        const div = document.createElement("div");
        div.className = "fish-type";
        div.innerHTML = `
            <div class="fish-name">${fishType.name}</div>
            <div class="fish-reward">收益: ${fishType.value > 0 ? '+' : ''}${fishType.value} 元</div>
        `;
        fishTypesDiv.appendChild(div);
    });
    
    HUD.levelIntro.classList.remove("hidden");
}

// 开始关卡
function startLevel() {
    HUD.levelIntro.classList.add("hidden");
    resetGame();
}

// 游戏初始化
console.log("游戏开始初始化...");
console.log("Canvas尺寸:", canvas.width, "x", canvas.height);
console.log("Canvas元素:", canvas);
console.log("Context:", ctx);

// 开始播放背景音乐
bgm.play().catch(e => console.log("背景音乐播放失败:", e));

// 事件监听器
HUD.btnStartLevel.addEventListener("click", startLevel);

// 开始游戏循环
requestAnimationFrame(loop);

// 显示关卡介绍
showLevelIntro();



