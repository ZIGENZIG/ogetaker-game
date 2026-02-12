const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ВАЖНО: Раздаем статические файлы из текущей папки
app.use(express.static(__dirname));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Пути к файлам данных
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');

// Инициализация файлов данных
async function initializeDataFiles() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        try {
            await fs.access(USERS_FILE);
        } catch {
            await fs.writeFile(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
        }
        
        try {
            await fs.access(PROGRESS_FILE);
        } catch {
            await fs.writeFile(PROGRESS_FILE, JSON.stringify({ progresses: {} }, null, 2));
        }
        
        console.log('✅ Файлы данных инициализированы');
    } catch (error) {
        console.error('❌ Ошибка инициализации данных:', error);
    }
}

// 1. Регистрация/вход пользователя
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Имя пользователя и пароль обязательны' });
        }
        
        const usersData = JSON.parse(await fs.readFile(USERS_FILE, 'utf8'));
        
        // Проверяем, существует ли пользователь
        const existingUser = usersData.users.find(u => u.username === username);
        
        if (existingUser) {
            // Если пользователь существует, проверяем пароль
            if (existingUser.password === password) {
                const token = uuidv4();
                
                // Обновляем токен
                existingUser.token = token;
                existingUser.lastLogin = new Date().toISOString();
                
                await fs.writeFile(USERS_FILE, JSON.stringify(usersData, null, 2));
                
                return res.json({
                    success: true,
                    message: 'Вход выполнен успешно',
                    token,
                    username
                });
            } else {
                return res.status(401).json({ error: 'Неверный пароль' });
            }
        }
        
        // Создаем нового пользователя
        const token = uuidv4();
        const newUser = {
            id: uuidv4(),
            username,
            password,
            token,
            created: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        };
        
        usersData.users.push(newUser);
        await fs.writeFile(USERS_FILE, JSON.stringify(usersData, null, 2));
        
        // Создаем начальный прогресс для пользователя
        const progressData = JSON.parse(await fs.readFile(PROGRESS_FILE, 'utf8'));
        progressData.progresses[newUser.id] = {
            userId: newUser.id,
            username,
            unlockedDifficulties: [1],
            currentProgress: {
                difficulty: 1,
                playerPosition: { x: 1, y: 4 },
                demonsFound: 0,
                questionsSolved: 0,
                mistakes: 0,
                unlockedDemons: [],
                collectedItems: [],
                lastPlayed: new Date().toISOString()
            },
            statistics: {
                totalDemonsCollected: 0,
                totalQuestionsSolved: 0,
                totalMistakes: 0
            }
        };
        
        await fs.writeFile(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
        
        res.json({
            success: true,
            message: 'Пользователь зарегистрирован',
            token,
            username
        });
        
    } catch (error) {
        console.error('❌ Ошибка регистрации:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// 2. Сохранение прогресса
app.post('/api/save-progress', async (req, res) => {
    try {
        const { token, progress } = req.body;
        
        if (!token) {
            return res.status(401).json({ error: 'Требуется токен' });
        }
        
        // Находим пользователя по токену
        const usersData = JSON.parse(await fs.readFile(USERS_FILE, 'utf8'));
        const user = usersData.users.find(u => u.token === token);
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        // Сохраняем прогресс
        const progressData = JSON.parse(await fs.readFile(PROGRESS_FILE, 'utf8'));
        
        if (!progressData.progresses[user.id]) {
            progressData.progresses[user.id] = {
                userId: user.id,
                username: user.username
            };
        }
        
        // Обновляем прогресс
        progressData.progresses[user.id] = {
            ...progressData.progresses[user.id],
            ...progress,
            lastUpdated: new Date().toISOString()
        };

        await fs.writeFile(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
        
        // ОБНОВЛЕНИЕ СТАТИСТИКИ - отдельно и правильно!
        if (progress.statistics) {
            if (!progressData.progresses[user.id].statistics) {
                progressData.progresses[user.id].statistics = {
                    totalDemonsCollected: 0,
                    totalQuestionsSolved: 0,
                    totalMistakes: 0
                };
            }
            
            // СУММИРУЕМ, а не заменяем
            progressData.progresses[user.id].statistics.totalDemonsCollected += 
                progress.statistics.totalDemonsCollected || 0;
                
            progressData.progresses[user.id].statistics.totalQuestionsSolved += 
                progress.statistics.totalQuestionsSolved || 0;
                
            progressData.progresses[user.id].statistics.totalMistakes += 
                progress.statistics.totalMistakes || 0;
            
            // Сохраняем обновленную статистику
            await fs.writeFile(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
            console.log(`📊 Статистика обновлена для ${user.username}: +${progress.statistics.totalDemonsCollected || 0} демонесс`);
        }
        
        res.json({
            success: true,
            message: 'Прогресс сохранен',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Ошибка сохранения:', error);
        res.status(500).json({ error: 'Ошибка сохранения прогресса' });
    }
});

// 3. Загрузка прогресса
app.get('/api/load-progress', async (req, res) => {
    try {
        const token = req.query.token;
        
        if (!token) {
            return res.status(401).json({ error: 'Требуется токен' });
        }
        
        // Находим пользователя по токену
        const usersData = JSON.parse(await fs.readFile(USERS_FILE, 'utf8'));
        const user = usersData.users.find(u => u.token === token);
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        // Загружаем прогресс
        const progressData = JSON.parse(await fs.readFile(PROGRESS_FILE, 'utf8'));
        const userProgress = progressData.progresses[user.id];
        
        if (!userProgress) {
            return res.json({
                success: true,
                progress: null,
                message: 'Прогресс не найден, будет создан новый'
            });
        }
        
        // Убеждаемся, что статистика есть
        if (!userProgress.statistics) {
            userProgress.statistics = {
                totalDemonsCollected: 0,
                totalQuestionsSolved: 0,
                totalMistakes: 0
            };
        }
        
        res.json({
            success: true,
            progress: userProgress,
            username: user.username
        });
        
    } catch (error) {
        console.error('❌ Ошибка загрузки:', error);
        res.status(500).json({ error: 'Ошибка загрузки прогресса' });
    }
});

// 4. Обновление разблокированных уровней
app.post('/api/unlock-level', async (req, res) => {
    try {
        const { token, level } = req.body;
        
        if (!token || !level) {
            return res.status(400).json({ error: 'Требуется токен и номер уровня' });
        }
        
        // Находим пользователя
        const usersData = JSON.parse(await fs.readFile(USERS_FILE, 'utf8'));
        const user = usersData.users.find(u => u.token === token);
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        // Обновляем прогресс
        const progressData = JSON.parse(await fs.readFile(PROGRESS_FILE, 'utf8'));
        
        if (!progressData.progresses[user.id]) {
            return res.status(404).json({ error: 'Прогресс пользователя не найден' });
        }
        
        const userProgress = progressData.progresses[user.id];
        
        // Добавляем уровень в разблокированные, если его там еще нет
        if (!userProgress.unlockedDifficulties.includes(level)) {
            userProgress.unlockedDifficulties.push(level);
            userProgress.unlockedDifficulties.sort((a, b) => a - b);
            
            await fs.writeFile(PROGRESS_FILE, JSON.stringify(progressData, null, 2));
            
            res.json({
                success: true,
                message: `Уровень ${level} разблокирован`,
                unlockedDifficulties: userProgress.unlockedDifficulties
            });
        } else {
            res.json({
                success: true,
                message: 'Уровень уже разблокирован',
                unlockedDifficulties: userProgress.unlockedDifficulties
            });
        }
        
    } catch (error) {
        console.error('❌ Ошибка разблокировки:', error);
        res.status(500).json({ error: 'Ошибка разблокировки уровня' });
    }
});

// 5. Получение статистики
app.get('/api/stats', async (req, res) => {
    try {
        const token = req.query.token;
        
        if (!token) {
            return res.status(401).json({ error: 'Требуется токен' });
        }
        
        const usersData = JSON.parse(await fs.readFile(USERS_FILE, 'utf8'));
        const user = usersData.users.find(u => u.token === token);
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        const progressData = JSON.parse(await fs.readFile(PROGRESS_FILE, 'utf8'));
        const userProgress = progressData.progresses[user.id];
        
        if (!userProgress) {
            return res.json({
                success: true,
                stats: {
                    totalDemonsCollected: 0,
                    totalQuestionsSolved: 0,
                    totalMistakes: 0
                }
            });
        }
        
        // Убеждаемся, что статистика есть
        if (!userProgress.statistics) {
            userProgress.statistics = {
                totalDemonsCollected: 0,
                totalQuestionsSolved: 0,
                totalMistakes: 0
            };
        }
        
        res.json({
            success: true,
            stats: userProgress.statistics,
            progress: userProgress.currentProgress || {}
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения статистики:', error);
        res.status(500).json({ error: 'Ошибка получения статистики' });
    }
});

// 6. Получение рейтинга игроков - ИСПРАВЛЕНО!
app.get('/api/leaderboard', async (req, res) => {
    try {
        const progressData = JSON.parse(await fs.readFile(PROGRESS_FILE, 'utf8'));
        const usersData = JSON.parse(await fs.readFile(USERS_FILE, 'utf8'));
        
        const leaderboard = [];
        
        // Собираем данные для рейтинга
        for (const userId in progressData.progresses) {
            const progress = progressData.progresses[userId];
            const user = usersData.users.find(u => u.id === userId);
            
            if (user && progress) {
                // Убеждаемся, что статистика существует
                if (!progress.statistics) {
                    progress.statistics = {
                        totalDemonsCollected: 0,
                        totalQuestionsSolved: 0,
                        totalMistakes: 0
                    };
                }
                
                leaderboard.push({
                    username: user.username,
                    demonsCollected: progress.statistics.totalDemonsCollected || 0,
                    questionsSolved: progress.statistics.totalQuestionsSolved || 0,
                    unlockedLevels: progress.unlockedDifficulties ? progress.unlockedDifficulties.length : 1,
                    lastPlayed: progress.lastUpdated || progress.currentProgress?.lastPlayed
                });
            }
        }
        
        // Сортируем по количеству собранных демонесс
        leaderboard.sort((a, b) => b.demonsCollected - a.demonsCollected);
        
        console.log(`📊 Отправляем рейтинг: ${leaderboard.length} игроков`);
        console.log(`👑 Топ-1: ${leaderboard[0]?.username} с ${leaderboard[0]?.demonsCollected} демонесс`);
        
        res.json({
            success: true,
            leaderboard: leaderboard.slice(0, 20) // Топ 20
        });
        
    } catch (error) {
        console.error('❌ Ошибка получения рейтинга:', error);
        res.status(500).json({ error: 'Ошибка получения рейтинга' });
    }
});

// Если запрошен несуществующий маршрут - отдаем index.html (для SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Запуск сервера
async function startServer() {
    await initializeDataFiles();
    
    app.listen(PORT, () => {
        console.log(`✅ Сервер запущен на порту ${PORT}`);
        console.log(`🌐 Откройте: http://localhost:${PORT}`);
        console.log(`📁 API доступно по: http://localhost:${PORT}/api/...`);
    });
}

startServer().catch(console.error);
