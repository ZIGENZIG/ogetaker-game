<script>
    // ========================
    // КОНФИГУРАЦИЯ
    // ========================
    const SERVER_URL = window.location.origin;
    
    let userToken = localStorage.getItem('ogetaker_userToken');
    let currentUsername = localStorage.getItem('ogetaker_username');
    let isOnlineMode = false;

    // ========================
    // УРОВНИ КАРТ
    // ========================
    const levelLayouts = {
        1: {
            name: "Прямоугольная карта",
            startPosition: {x: 1, y: 4},
            demonPositions: [
                {x: 3, y: 2},
                {x: 8, y: 2},
                {x: 2, y: 5},
                {x: 7, y: 5}
            ],
            questionPositions: [
                {x: 4, y: 1}, {x: 9, y: 1},
                {x: 1, y: 3}, {x: 6, y: 3},
                {x: 7, y: 4}, {x: 10, y: 4},
                {x: 3, y: 6}, {x: 8, y: 6}
            ],
            exitPositions: [
                {x: 0, y: 4},
                {x: 11, y: 4}
            ],
            isWall: function(x, y) {
                return x === 0 || x === 11 || y === 0 || y === 7;
            }
        },
        2: {
            name: "Змейка",
            startPosition: {x: 1, y: 4},
            demonPositions: [
                {x: 3, y: 2},
                {x: 8, y: 1},
                {x: 2, y: 6},
                {x: 9, y: 5}
            ],
            questionPositions: [
                {x: 1, y: 1}, {x: 10, y: 1},
                {x: 4, y: 3}, {x: 7, y: 3},
                {x: 5, y: 5}, {x: 8, y: 5},
                {x: 2, y: 7}, {x: 9, y: 7}
            ],
            exitPositions: [
                {x: 0, y: 4}
            ],
            isWall: function(x, y) {
                if (y === 0 || y === 7) return true;
                if (x === 0 || x === 11) return true;
                
                if (y % 2 === 0) {
                    if ((x === 5 && y === 1) || 
                        (x === 6 && y === 2) ||
                        (x === 5 && y === 3) ||
                        (x === 6 && y === 4) ||
                        (x === 5 && y === 5) ||
                        (x === 6 && y === 6)) {
                        return false;
                    }
                    return x > 5;
                } else {
                    if ((x === 5 && y === 1) || 
                        (x === 6 && y === 2) ||
                        (x === 5 && y === 3) ||
                        (x === 6 && y === 4) ||
                        (x === 5 && y === 5) ||
                        (x === 6 && y === 6)) {
                        return false;
                    }
                    return x < 6;
                }
            }
        },
        3: {
            name: "Лабиринт",
            startPosition: {x: 1, y: 1},
            demonPositions: [
                {x: 4, y: 1},
                {x: 10, y: 2},
                {x: 2, y: 5},
                {x: 7, y: 6}
            ],
            questionPositions: [
                {x: 6, y: 1}, {x: 3, y: 2},
                {x: 8, y: 3}, {x: 1, y: 4},
                {x: 5, y: 4}, {x: 10, y: 5},
                {x: 4, y: 5}, {x: 7, y: 6}
            ],
            exitPositions: [
                {x: 1, y: 7},
                {x: 10, y: 7}
            ],
            isWall: function(x, y) {
                if (x === 0 || x === 11 || y === 0 || y === 7) return true;
                
                const maze = [
                    "111111111111",
                    "100000001001",
                    "111011101101",
                    "100010100001",
                    "101110111011",
                    "100000100001",
                    "101111101101",
                    "111111111111"
                ];
                
                if (y >= 0 && y < maze.length && x >= 0 && x < maze[y].length) {
                    return maze[y][x] === '1';
                }
                return true;
            }
        }
    };

    // ========================
    // ДЕМОНЕССЫ (ТОЛЬКО ИМЕНА)
    // ========================
    const demons = [
        { name: "Алгоритмика", color: "#ff4757", position: {x: 3, y: 2} },
        { name: "Программура", color: "#3742fa", position: {x: 8, y: 2} },
        { name: "Системология", color: "#2ed573", position: {x: 2, y: 5} },
        { name: "Теория", color: "#ffa502", position: {x: 7, y: 5} }
    ];

    // ========================
    // СОСТОЯНИЕ ИГРЫ
    // ========================
    let gameState = {
        playerPosition: {x: 1, y: 4},
        demonsFound: 0,
        questionsSolved: 0,
        mistakes: 0,
        currentDemon: null,
        unlockedDemons: [],
        musicEnabled: true,
        isMoving: false,
        customMusic: null,
        exitsCreated: false,
        difficulty: 1,
        unlockedDifficulties: [1],
        currentLevelLayout: levelLayouts[1],
        isOnline: false,
        totalDemonsCollected: 0
    };

    // ========================
    // ЭЛЕМЕНТЫ DOM
    // ========================
    const startScreen = document.getElementById('start-screen');
    const modeSelectionScreen = document.getElementById('mode-selection-screen');
    const gameScreen = document.getElementById('game-screen');
    const questionScreen = document.getElementById('question-screen');
    const howToPlayScreen = document.getElementById('how-to-play-screen');
    const levelGrid = document.getElementById('level-grid');
    const musicControl = document.getElementById('music-control');
    const musicFileInput = document.getElementById('music-file');
    const musicFileName = document.getElementById('music-file-name');
    const currentDifficultyDisplay = document.getElementById('current-difficulty');
    const loginModal = document.getElementById('login-modal');
    const userInfoDisplay = document.getElementById('user-info');
    const usernameDisplay = document.getElementById('username-display');
    const logoutButton = document.getElementById('logout-button');
    const playOfflineButton = document.getElementById('play-offline');
    const leaderboardButton = document.getElementById('leaderboard-button');
    const leaderboardScreen = document.getElementById('leaderboard-screen');
    const leaderboardList = document.getElementById('leaderboard-list');
    const closeLeaderboardButton = document.getElementById('close-leaderboard');
    const closeHowToPlayButton = document.getElementById('close-how-to-play');
    const currentPlayerDisplay = document.getElementById('current-player');
    const totalDemonsDisplay = document.getElementById('total-demons-count');

    // Кнопки
    const startButton = document.getElementById('start-button');
    const howToPlayButton = document.getElementById('how-to-play-button');
    const difficulty1Button = document.getElementById('difficulty-1');
    const difficulty2Button = document.getElementById('difficulty-2');
    const difficulty3Button = document.getElementById('difficulty-3');
    const backToMainButton = document.getElementById('back-to-main');
    const loginButton = document.getElementById('login-button');
    const loginUsernameInput = document.getElementById('login-username');
    const loginPasswordInput = document.getElementById('login-password');

    // Аудио элементы
    const backgroundMusic = document.getElementById('background-music');
    const moveSound = document.getElementById('move-sound');
    const questionSound = document.getElementById('question-sound');
    const correctSound = document.getElementById('correct-sound');
    const wrongSound = document.getElementById('wrong-sound');

    // Статистика
    const stats = {
        solved: document.getElementById('solved-count'),
        mistakes: document.getElementById('mistakes-count'),
        demons: document.getElementById('demons-count')
    };

    // ========================
    // ФУНКЦИЯ ДЛЯ ПРИНУДИТЕЛЬНОГО ФОКУСА
    // ========================
    setInterval(() => {
        if (gameScreen.style.display === 'block') {
            window.focus();
            document.body.focus();
        }
    }, 1000);

    // ========================
    // СИСТЕМА АВТОРИЗАЦИИ
    // ========================
    function showLoginModal() {
        loginModal.style.display = 'flex';
    }

    function hideLoginModal() {
        loginModal.style.display = 'none';
    }

    async function handleLogin() {
        const username = loginUsernameInput.value.trim();
        const password = loginPasswordInput.value.trim();
        
        if (!username || !password) {
            showNotification('Введите имя пользователя и пароль!', 2000);
            return;
        }
        
        try {
            const response = await fetch(`${SERVER_URL}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                userToken = data.token;
                currentUsername = data.username;
                isOnlineMode = true;
                
                localStorage.setItem('ogetaker_userToken', userToken);
                localStorage.setItem('ogetaker_username', currentUsername);
                
                usernameDisplay.textContent = currentUsername;
                currentPlayerDisplay.textContent = currentUsername;
                userInfoDisplay.style.display = 'block';
                
                await loadServerProgress();
                
                hideLoginModal();
                showNotification(`✅ Добро пожаловать, ${currentUsername}!`, 2000);
            } else {
                showNotification(data.error || 'Ошибка входа', 2000);
            }
        } catch (error) {
            console.error('Ошибка входа:', error);
            showNotification('⚠️ Ошибка соединения с сервером. Играйте оффлайн.', 2000);
        }
    }

    function playOffline() {
        currentUsername = `Гость_${Math.floor(Math.random() * 10000)}`;
        isOnlineMode = false;
        
        usernameDisplay.textContent = currentUsername;
        currentPlayerDisplay.textContent = currentUsername;
        userInfoDisplay.style.display = 'block';
        
        loadLocalProgress();
        
        hideLoginModal();
        showNotification('🎮 Игра в оффлайн режиме. Прогресс сохранится только в браузере.', 2000);
    }

    function logout() {
        if (confirm('Выйти из аккаунта?')) {
            localStorage.removeItem('ogetaker_userToken');
            localStorage.removeItem('ogetaker_username');
            localStorage.removeItem('ogetaker_localProgress');
            
            userToken = null;
            currentUsername = null;
            isOnlineMode = false;
            gameState.totalDemonsCollected = 0;
            
            userInfoDisplay.style.display = 'none';
            gameState.unlockedDifficulties = [1];
            updateDifficultyButtons();
            
            showNotification('✅ Вы вышли из аккаунта', 2000);
        }
    }

    // ========================
    // СИСТЕМА СОХРАНЕНИЯ
    // ========================
    async function loadServerProgress() {
        if (!userToken) return;
        
        try {
            const response = await fetch(`${SERVER_URL}/api/load-progress?token=${userToken}`);
            const data = await response.json();
            
            if (data.success && data.progress) {
                if (data.progress.unlockedDifficulties) {
                    gameState.unlockedDifficulties = data.progress.unlockedDifficulties;
                    updateDifficultyButtons();
                }
                
                if (data.progress.statistics && data.progress.statistics.totalDemonsCollected) {
                    gameState.totalDemonsCollected = data.progress.statistics.totalDemonsCollected;
                    if (totalDemonsDisplay) totalDemonsDisplay.textContent = gameState.totalDemonsCollected;
                }
                
                console.log('✅ Прогресс загружен с сервера');
            }
        } catch (error) {
            console.error('❌ Ошибка загрузки прогресса:', error);
        }
    }

    function loadLocalProgress() {
        const saved = localStorage.getItem('ogetaker_localProgress');
        if (saved) {
            try {
                const progress = JSON.parse(saved);
                if (progress.unlockedDifficulties) {
                    gameState.unlockedDifficulties = progress.unlockedDifficulties;
                    updateDifficultyButtons();
                }
                if (progress.statistics && progress.statistics.totalDemonsCollected) {
                    gameState.totalDemonsCollected = progress.statistics.totalDemonsCollected;
                    if (totalDemonsDisplay) totalDemonsDisplay.textContent = gameState.totalDemonsCollected;
                }
            } catch (e) {
                console.error('Ошибка загрузки локального прогресса:', e);
            }
        }
    }

    async function saveProgress() {
        const progressData = {
            unlockedDifficulties: gameState.unlockedDifficulties,
            currentProgress: {
                difficulty: gameState.difficulty,
                playerPosition: gameState.playerPosition,
                demonsFound: gameState.demonsFound,
                questionsSolved: gameState.questionsSolved,
                mistakes: gameState.mistakes,
                unlockedDemons: gameState.unlockedDemons,
                lastPlayed: new Date().toISOString()
            },
            statistics: {
                totalDemonsCollected: gameState.totalDemonsCollected || 0,
                totalQuestionsSolved: gameState.questionsSolved || 0,
                totalMistakes: gameState.mistakes || 0
            }
        };
        
        if (isOnlineMode && userToken) {
            await saveServerProgress(progressData);
        } else {
            saveLocalProgress(progressData);
        }
    }

    async function saveServerProgress(progressData) {
        try {
            const dataToSend = {
                token: userToken,
                progress: {
                    unlockedDifficulties: progressData.unlockedDifficulties,
                    currentProgress: progressData.currentProgress,
                    statistics: {
                        totalDemonsCollected: gameState.totalDemonsCollected || 0,
                        totalQuestionsSolved: gameState.questionsSolved || 0,
                        totalMistakes: gameState.mistakes || 0
                    }
                }
            };
            
            const response = await fetch(`${SERVER_URL}/api/save-progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSend)
            });
            
            const data = await response.json();
            if (data.success) {
                console.log('✅ Прогресс и статистика сохранены на сервере');
            }
        } catch (error) {
            console.error('❌ Ошибка сохранения прогресса:', error);
        }
    }

    function saveLocalProgress(progressData) {
        try {
            localStorage.setItem('ogetaker_localProgress', JSON.stringify(progressData));
            console.log('✅ Прогресс сохранен локально');
        } catch (error) {
            console.error('❌ Ошибка локального сохранения:', error);
        }
    }

    async function unlockLevelOnServer(level) {
        if (!isOnlineMode || !userToken) return;
        
        try {
            const response = await fetch(`${SERVER_URL}/api/unlock-level`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: userToken, level })
            });
            
            const data = await response.json();
            if (data.success) {
                console.log(`✅ Уровень ${level} разблокирован на сервере`);
            }
        } catch (error) {
            console.error('❌ Ошибка разблокировки:', error);
        }
    }

    // ========================
    // РЕЙТИНГ
    // ========================
    async function showLeaderboard() {
        try {
            const response = await fetch(`${SERVER_URL}/api/leaderboard`);
            const data = await response.json();
            
            if (data.success) {
                leaderboardList.innerHTML = '';
                
                if (data.leaderboard.length === 0) {
                    leaderboardList.innerHTML = '<p style="text-align: center; color: #aaa;">Рейтинг пуст</p>';
                } else {
                    data.leaderboard.forEach((player, index) => {
                        const playerElement = document.createElement('div');
                        playerElement.className = 'leaderboard-item';
                        
                        let medal = '';
                        let medalColor = '';
                        
                        if (index === 0) {
                            medal = '👑';
                            medalColor = '#FFD700';
                        } else if (index === 1) {
                            medal = '🥈';
                            medalColor = '#C0C0C0';
                        } else if (index === 2) {
                            medal = '🥉';
                            medalColor = '#CD7F32';
                        } else {
                            medal = `${index + 1}.`;
                        }
                        
                        playerElement.innerHTML = `
                            <div style="display: flex; align-items: center; gap: 15px; width: 100%;">
                                <span class="leaderboard-rank" style="color: ${medalColor};">${medal}</span>
                                <div class="leaderboard-player">
                                    <strong style="font-size: 1.1rem;">${player.username}</strong>
                                </div>
                                <div class="leaderboard-stats">
                                    <span style="color: #ff4757;">👿 ${player.demonsCollected}</span>
                                    <span style="color: #aaa;">📚 ${player.questionsSolved}</span>
                                    <span style="color: #2ed573;">🏰 ${player.unlockedLevels}</span>
                                </div>
                            </div>
                        `;
                        
                        leaderboardList.appendChild(playerElement);
                    });
                }
                
                leaderboardScreen.style.display = 'flex';
            }
        } catch (error) {
            console.error('Ошибка загрузки рейтинга:', error);
            leaderboardList.innerHTML = '<p style="text-align: center; color: #ff4757;">❌ Ошибка загрузки рейтинга</p>';
            leaderboardScreen.style.display = 'flex';
        }
    }

    // ========================
    // ФУНКЦИИ ИГРЫ
    // ========================
    
    function movePlayer(dx, dy) {
        console.log('Попытка движения:', dx, dy);
        
        if (gameState.isMoving) {
            console.log('Движение заблокировано');
            return;
        }
        
        const newX = gameState.playerPosition.x + dx;
        const newY = gameState.playerPosition.y + dy;
        
        console.log('Новая позиция:', newX, newY);
        
        if (newX >= 0 && newX < 12 && newY >= 0 && newY < 8) {
            const targetCell = document.querySelector(`.cell[data-x="${newX}"][data-y="${newY}"]`);
            
            if (targetCell && !targetCell.classList.contains('wall')) {
                gameState.isMoving = true;
                
                const player = document.getElementById('player');
                if (player) {
                    player.classList.add('walking');
                }
                
                gameState.playerPosition = {x: newX, y: newY};
                updatePlayerPosition();
                
                if (moveSound) {
                    moveSound.play().catch(e => console.log('Звук движения не работает'));
                }
                
                if (player) {
                    const playerRect = player.getBoundingClientRect();
                    createParticles(playerRect.left + 15, playerRect.top + 65, '#ff4757', 3);
                }
                
                setTimeout(() => {
                    if (player) {
                        player.classList.remove('walking');
                    }
                    gameState.isMoving = false;
                    checkCollisions();
                    console.log('Движение разблокировано');
                }, 400);
            } else {
                console.log('Стена или нет ячейки');
            }
        } else if (gameState.exitsCreated) {
            console.log('Проверка выхода');
            const layout = gameState.currentLevelLayout;
            const isOnExit = layout.exitPositions.some(exit => 
                exit.x === gameState.playerPosition.x && exit.y === gameState.playerPosition.y
            );
            
            if (isOnExit) {
                handleExit();
            }
        }
    }

    function updateDifficultyButtons() {
        if (gameState.unlockedDifficulties.includes(2)) {
            difficulty2Button.classList.remove('locked');
            difficulty2Button.style.cursor = 'pointer';
            difficulty2Button.style.background = 'linear-gradient(145deg, #ffa502, #ff9500)';
            difficulty2Button.style.color = '#fff';
            
            const lockIcon = difficulty2Button.querySelector('.lock-icon');
            if (lockIcon) lockIcon.style.display = 'none';
            
            const label2 = difficulty2Button.querySelector('.difficulty-label');
            if (label2) label2.textContent = 'Карта "Змейка"';
        }
        
        if (gameState.unlockedDifficulties.includes(3)) {
            difficulty3Button.classList.remove('locked');
            difficulty3Button.style.cursor = 'pointer';
            difficulty3Button.style.background = 'linear-gradient(145deg, #ff4757, #ff3742)';
            difficulty3Button.style.color = '#fff';
            
            const lockIcon = difficulty3Button.querySelector('.lock-icon');
            if (lockIcon) lockIcon.style.display = 'none';
            
            const label3 = difficulty3Button.querySelector('.difficulty-label');
            if (label3) label3.textContent = 'Карта "Лабиринт"';
        }
    }

    function completeLevel() {
        const currentDifficulty = gameState.difficulty;
        
        if (currentDifficulty === 1 && !gameState.unlockedDifficulties.includes(2)) {
            gameState.unlockedDifficulties.push(2);
            updateDifficultyButtons();
            showNotification('🎉 Уровень 2 "Змейка" разблокирован!', 3000);
            
            if (isOnlineMode) unlockLevelOnServer(2);
        }
        
        if (currentDifficulty === 2 && !gameState.unlockedDifficulties.includes(3)) {
            gameState.unlockedDifficulties.push(3);
            updateDifficultyButtons();
            showNotification('🎉 Уровень 3 "Лабиринт" разблокирован!', 3000);
            
            if (isOnlineMode) unlockLevelOnServer(3);
        }
        
        saveProgress();
    }

    function startGame() {
        modeSelectionScreen.style.display = 'none';
        gameScreen.style.display = 'block';
        
        currentDifficultyDisplay.textContent = gameState.difficulty;
        
        if (gameState.musicEnabled) {
            backgroundMusic.volume = 0.3;
            backgroundMusic.play().catch(e => console.log('Автовоспроизведение заблокировано'));
        }
        
        initLevel();
    }

    function showNotification(message, duration = 2000) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 500);
        }, duration);
    }

    function createParticles(x, y, color, count = 5) {
        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = x + 'px';
            particle.style.top = y + 'px';
            particle.style.width = '4px';
            particle.style.height = '4px';
            particle.style.background = color;
            particle.style.borderRadius = '50%';
            particle.style.position = 'absolute';
            particle.style.pointerEvents = 'none';
            particle.style.zIndex = '2';
            
            document.getElementById('game-screen').appendChild(particle);
            
            const angle = Math.random() * Math.PI * 2;
            const distance = 20 + Math.random() * 30;
            
            const animation = particle.animate([
                { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0)`, opacity: 0 }
            ], {
                duration: 800 + Math.random() * 400,
                easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
            });
            
            animation.onfinish = () => particle.remove();
        }
    }

    function initLevel() {
        levelGrid.innerHTML = '';
        
        const layout = gameState.currentLevelLayout;
        gameState.playerPosition = {...layout.startPosition};
        
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 12; x++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.x = x;
                cell.dataset.y = y;
                
                if (layout.isWall(x, y)) {
                    cell.classList.add('wall');
                } else {
                    cell.classList.add('path');
                }
                
                levelGrid.appendChild(cell);
            }
        }
        
        createPlayer();
        demons.forEach(demon => createDemon(demon));
        createQuestions();
        
        gameState.exitsCreated = false;
        gameState.unlockedDemons = [];
        gameState.questionsSolved = 0;
        gameState.mistakes = 0;
        
        stats.solved.textContent = '0';
        stats.mistakes.textContent = '0';
        stats.demons.textContent = '0';
        
        if (totalDemonsDisplay) totalDemonsDisplay.textContent = gameState.totalDemonsCollected || 0;
    }

    function createQuestions() {
        const layout = gameState.currentLevelLayout;
        
        layout.questionPositions.forEach(pos => {
            const cell = document.querySelector(`.cell[data-x="${pos.x}"][data-y="${pos.y}"]`);
            if (cell && !cell.classList.contains('wall')) {
                cell.classList.add('question', 'pulse');
            }
        });
    }

    function createExits() {
        if (gameState.exitsCreated) return;
        
        const layout = gameState.currentLevelLayout;
        
        layout.exitPositions.forEach(exitPos => {
            const exitCell = document.querySelector(`.cell[data-x="${exitPos.x}"][data-y="${exitPos.y}"]`);
            if (exitCell) {
                exitCell.classList.remove('wall');
                exitCell.classList.add('exit');
                exitCell.innerHTML = '🚪';
            }
        });
        
        gameState.exitsCreated = true;
        showNotification('Выходы открыты! Иди к выходам для завершения уровня!', 3000);
    }

    function createPlayer() {
        const oldPlayer = document.getElementById('player');
        if (oldPlayer) oldPlayer.remove();
        
        const player = document.createElement('div');
        player.className = 'player';
        player.id = 'player';
        document.querySelector('.level-container').appendChild(player);
        updatePlayerPosition();
    }

    function createDemon(demon) {
        const oldDemon = document.querySelector(`.demon[data-name="${demon.name}"]`);
        if (oldDemon) oldDemon.remove();
        
        const demonElement = document.createElement('div');
        demonElement.className = `demon ${demon.name} floating`;
        demonElement.dataset.name = demon.name;
        document.querySelector('.level-container').appendChild(demonElement);
        updateDemonPosition(demon);
    }

    function updatePlayerPosition() {
        const player = document.getElementById('player');
        const cell = document.querySelector(`.cell[data-x="${gameState.playerPosition.x}"][data-y="${gameState.playerPosition.y}"]`);
        
        if (cell && player) {
            const rect = cell.getBoundingClientRect();
            const containerRect = document.querySelector('.level-container').getBoundingClientRect();
            
            player.style.left = (rect.left - containerRect.left + rect.width / 2 - 25) + 'px';
            player.style.top = (rect.top - containerRect.top + rect.height / 2 - 35) + 'px';
            
            player.style.transform = 'scale(1.2)';
            player.style.opacity = '1';
            player.style.transition = 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        }
    }

    function updateDemonPosition(demon) {
        const demonElement = document.querySelector(`.demon[data-name="${demon.name}"]`);
        const cell = document.querySelector(`.cell[data-x="${demon.position.x}"][data-y="${demon.position.y}"]`);
        
        if (cell && demonElement) {
            const rect = cell.getBoundingClientRect();
            const containerRect = document.querySelector('.level-container').getBoundingClientRect();
            
            demonElement.style.left = (rect.left - containerRect.left + rect.width / 2 - 27.5) + 'px';
            demonElement.style.top = (rect.top - containerRect.top + rect.height / 2 - 40) + 'px';
        }
    }

    function showDemonQuestion(demon) {
        gameState.currentDemon = demon;
        
        // ВРЕМЕННЫЙ ВОПРОС (заглушка)
        const questionData = {
            text: "Что такое алгоритм?",
            answers: ["Последовательность действий", "Язык программирования", "Математическая формула", "Тип данных"],
            correct: 0
        };
        
        const portrait = document.querySelector('.demon-portrait');
        portrait.style.background = `linear-gradient(145deg, ${demon.color}, ${demon.color}99)`;
        
        document.getElementById('current-question').textContent = questionData.text;
        
        const answersContainer = document.getElementById('answers-container');
        answersContainer.innerHTML = '';
        
        questionData.answers.forEach((answer, index) => {
            const answerElement = document.createElement('div');
            answerElement.className = 'answer-option';
            answerElement.textContent = answer;
            answerElement.onclick = () => checkDemonAnswer(index);
            answersContainer.appendChild(answerElement);
        });
        
        questionSound.play();
        questionScreen.style.display = 'flex';
    }

    function checkDemonAnswer(selectedIndex) {
        const isCorrect = selectedIndex === 0; // Правильный ответ всегда первый
        
        if (isCorrect) {
            correctSound.play();
            gameState.questionsSolved++;
            gameState.unlockedDemons.push(gameState.currentDemon.name);
            stats.solved.textContent = gameState.questionsSolved;
            stats.demons.textContent = new Set(gameState.unlockedDemons).size;
            
            gameState.totalDemonsCollected++;
            if (totalDemonsDisplay) totalDemonsDisplay.textContent = gameState.totalDemonsCollected;
            
            const portrait = document.querySelector('.demon-portrait');
            const rect = portrait.getBoundingClientRect();
            createParticles(rect.left + rect.width/2, rect.top + rect.height/2, gameState.currentDemon.color, 15);
            
            const demonElement = document.querySelector(`.demon[data-name="${gameState.currentDemon.name}"]`);
            if (demonElement) {
                demonElement.style.opacity = '0';
                setTimeout(() => demonElement.remove(), 500);
            }
            
            if (gameState.unlockedDemons.length >= 4) {
                createExits();
            }
            
            saveProgress();
        } else {
            wrongSound.play();
            gameState.mistakes++;
            stats.mistakes.textContent = gameState.mistakes;
        }
        
        questionScreen.style.display = 'none';
    }

    function handleExit() {
        showNotification(`🎉 Поздравляем! Вы прошли ${gameState.difficulty} уровень!`, 3000);
        
        completeLevel();
        
        const player = document.getElementById('player');
        player.style.transition = 'all 1.5s ease-out';
        player.style.transform = 'scale(0.5) rotate(360deg)';
        player.style.opacity = '0';
        
        const playerRect = player.getBoundingClientRect();
        createParticles(playerRect.left + 25, playerRect.top + 35, '#2ed573', 30);
        
        setTimeout(() => {
            gameScreen.style.display = 'none';
            modeSelectionScreen.style.display = 'flex';
            
            player.style.transition = '';
            player.style.transform = '';
            player.style.opacity = '1';
            
            resetGameState();
        }, 3000);
    }

    function resetGameState() {
        gameState.playerPosition = {x: 1, y: 4};
        gameState.demonsFound = 0;
        gameState.questionsSolved = 0;
        gameState.mistakes = 0;
        gameState.currentDemon = null;
        gameState.unlockedDemons = [];
        gameState.exitsCreated = false;
        
        stats.solved.textContent = '0';
        stats.mistakes.textContent = '0';
        stats.demons.textContent = '0';
        
        if (totalDemonsDisplay) totalDemonsDisplay.textContent = gameState.totalDemonsCollected || 0;
    }

    function checkCollisions() {
        const currentCell = document.querySelector(`.cell[data-x="${gameState.playerPosition.x}"][data-y="${gameState.playerPosition.y}"]`);
        
        demons.forEach(demon => {
            if (demon.position.x === gameState.playerPosition.x && 
                demon.position.y === gameState.playerPosition.y &&
                !gameState.unlockedDemons.includes(demon.name)) {
                showDemonQuestion(demon);
            }
        });
        
        if (currentCell && currentCell.classList.contains('question')) {
            showAdditionalQuestion();
            currentCell.classList.remove('question', 'pulse');
        }
    }

    function showAdditionalQuestion() {
        const randomQuestion = {
            question: "Что такое HTML?",
            answers: ["Язык программирования", "Язык разметки", "База данных", "Протокол"],
            correct: 1
        };
        
        document.querySelector('.demon-portrait').style.background = 'linear-gradient(145deg, #ffa502, #ff9500)';
        document.getElementById('current-question').textContent = randomQuestion.question;
        
        const answersContainer = document.getElementById('answers-container');
        answersContainer.innerHTML = '';
        
        randomQuestion.answers.forEach((answer, index) => {
            const answerElement = document.createElement('div');
            answerElement.className = 'answer-option';
            answerElement.textContent = answer;
            answerElement.onclick = () => checkAdditionalAnswer(randomQuestion, index);
            answersContainer.appendChild(answerElement);
        });
        
        questionSound.play();
        questionScreen.style.display = 'flex';
    }

    function checkAdditionalAnswer(question, selectedIndex) {
        const isCorrect = selectedIndex === question.correct;
        
        if (isCorrect) {
            correctSound.play();
            gameState.questionsSolved++;
            stats.solved.textContent = gameState.questionsSolved;
            
            const portrait = document.querySelector('.demon-portrait');
            const rect = portrait.getBoundingClientRect();
            createParticles(rect.left + rect.width/2, rect.top + rect.height/2, '#ffa502', 10);
            
            if (gameState.unlockedDemons.length >= 4 && gameState.questionsSolved >= 8) {
                createExits();
            }
            
            saveProgress();
        } else {
            wrongSound.play();
            gameState.mistakes++;
            stats.mistakes.textContent = gameState.mistakes;
        }
        
        questionScreen.style.display = 'none';
    }

    function toggleMusic() {
        gameState.musicEnabled = !gameState.musicEnabled;
        
        if (gameState.musicEnabled) {
            if (gameState.customMusic) {
                backgroundMusic.src = gameState.customMusic;
            }
            backgroundMusic.play();
            musicControl.textContent = '🎵';
            musicControl.style.borderColor = '#ff4757';
            showNotification('🔊 Музыка включена');
        } else {
            backgroundMusic.pause();
            musicControl.textContent = '🔇';
            musicControl.style.borderColor = '#666';
            showNotification('🔇 Музыка выключена');
        }
    }

    // ========================
    // ИНИЦИАЛИЗАЦИЯ И СОБЫТИЯ
    // ========================
    function setupEventListeners() {
        loginButton.addEventListener('click', handleLogin);
        playOfflineButton.addEventListener('click', playOffline);
        logoutButton.addEventListener('click', logout);
        leaderboardButton.addEventListener('click', showLeaderboard);
        closeLeaderboardButton.addEventListener('click', () => {
            leaderboardScreen.style.display = 'none';
        });
        
        // Как играть
        howToPlayButton.addEventListener('click', () => {
            howToPlayScreen.style.display = 'flex';
        });
        
        closeHowToPlayButton.addEventListener('click', () => {
            howToPlayScreen.style.display = 'none';
        });

        loginUsernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
        loginPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });

        startButton.addEventListener('click', () => {
            startScreen.style.display = 'none';
            modeSelectionScreen.style.display = 'flex';
        });

        difficulty1Button.addEventListener('click', () => {
            gameState.difficulty = 1;
            gameState.currentLevelLayout = levelLayouts[1];
            startGame();
        });

        difficulty2Button.addEventListener('click', () => {
            if (gameState.unlockedDifficulties.includes(2)) {
                gameState.difficulty = 2;
                gameState.currentLevelLayout = levelLayouts[2];
                startGame();
            } else {
                showNotification('❌ Сначала пройдите 1 уровень сложности!', 2000);
            }
        });

        difficulty3Button.addEventListener('click', () => {
            if (gameState.unlockedDifficulties.includes(3)) {
                gameState.difficulty = 3;
                gameState.currentLevelLayout = levelLayouts[3];
                startGame();
            } else {
                showNotification('❌ Сначала пройдите 2 уровень сложности!', 2000);
            }
        });

        backToMainButton.addEventListener('click', () => {
            modeSelectionScreen.style.display = 'none';
            startScreen.style.display = 'flex';
        });

        musicFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            
            if (file) {
                if (!file.type.startsWith('audio/')) {
                    alert('Пожалуйста, выберите аудио файл!');
                    return;
                }
                
                const fileURL = URL.createObjectURL(file);
                gameState.customMusic = fileURL;
                musicFileName.textContent = file.name;
                
                if (gameState.musicEnabled) {
                    backgroundMusic.src = fileURL;
                    backgroundMusic.play().catch(e => console.log('Автовоспроизведение заблокировано'));
                }
                
                showNotification('🎵 Музыка успешно загружена!');
            }
        });

        musicControl.addEventListener('click', toggleMusic);

        // ПРОСТОЙ ОБРАБОТЧИК - ТОЛЬКО WASD
        document.addEventListener('keydown', function(e) {
            console.log('Клавиша нажата:', e.key);
            
            // Игнорируем если вводим текст в поле
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // Проверяем, открыты ли другие экраны
            if (questionScreen.style.display === 'flex') return;
            if (leaderboardScreen.style.display === 'flex') return;
            if (howToPlayScreen.style.display === 'flex') return;

            // Только если игровой экран открыт
            if (gameScreen.style.display === 'block') {
                // Отключаем скролл страницы для WASD
                if (e.key === 'w' || e.key === 'W' || e.key === 'a' || e.key === 'A' || e.key === 's' || e.key === 'S' || e.key === 'd' || e.key === 'D') {
                    e.preventDefault();
                    e.stopPropagation();
                }

                // Движение ТОЛЬКО по WASD
                if (e.key === 'w' || e.key === 'W') {
                    movePlayer(0, -1);
                } else if (e.key === 's' || e.key === 'S') {
                    movePlayer(0, 1);
                } else if (e.key === 'a' || e.key === 'A') {
                    movePlayer(-1, 0);
                } else if (e.key === 'd' || e.key === 'D') {
                    movePlayer(1, 0);
                }
            }

            // Escape для выхода в меню
            if (e.key === 'Escape') {
                if (gameScreen.style.display === 'block') {
                    gameScreen.style.display = 'none';
                    modeSelectionScreen.style.display = 'flex';
                }
            }
        }, true); // Важно: capturing phase

        document.addEventListener('contextmenu', e => e.preventDefault());
    }

    // Запуск при загрузке страницы
    window.addEventListener('DOMContentLoaded', () => {
        console.log('Игра загружается...');
        
        userToken = localStorage.getItem('ogetaker_userToken');
        currentUsername = localStorage.getItem('ogetaker_username');
        
        if (userToken && currentUsername) {
            isOnlineMode = true;
            usernameDisplay.textContent = currentUsername;
            currentPlayerDisplay.textContent = currentUsername;
            userInfoDisplay.style.display = 'block';
            loadServerProgress();
        } else {
            setTimeout(() => {
                showLoginModal();
            }, 1000);
        }
        
        setupEventListeners();
        
        window.addEventListener('beforeunload', saveProgress);
        setInterval(saveProgress, 30000);
        
        console.log('Игра загружена!');
    });
</script>
