const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Раздаем статические файлы (index.html)

// Подключение к PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Инициализация таблиц (выполняется один раз при старте)
async function initializeDatabase() {
    try {
        // Таблица пользователей
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(36) PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(100) NOT NULL,
                token VARCHAR(36) UNIQUE,
                created TIMESTAMP DEFAULT NOW(),
                last_login TIMESTAMP
            )
        `);

        // Таблица прогресса
        await pool.query(`
            CREATE TABLE IF NOT EXISTS progress (
                user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                username VARCHAR(100),
                unlocked_difficulties INTEGER[] DEFAULT ARRAY[1],
                current_difficulty INTEGER DEFAULT 1,
                player_position_x INTEGER DEFAULT 1,
                player_position_y INTEGER DEFAULT 4,
                questions_solved INTEGER DEFAULT 0,
                mistakes INTEGER DEFAULT 0,
                unlocked_demons TEXT[] DEFAULT ARRAY[]::TEXT[],
                last_played TIMESTAMP,
                total_demons_collected INTEGER DEFAULT 0,
                total_questions_solved INTEGER DEFAULT 0,
                total_mistakes INTEGER DEFAULT 0
            )
        `);

        console.log('✅ База данных инициализирована');
    } catch (error) {
        console.error('❌ Ошибка инициализации БД:', error);
    }
}

// ============================================
// API МАРШРУТЫ
// ============================================

// 1. Регистрация / Вход
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Имя и пароль обязательны' });
        }

        // Ищем пользователя
        const userResult = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );

        // Если пользователь существует
        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            
            // Проверяем пароль
            if (user.password === password) {
                // Обновляем токен при каждом входе для безопасности
                const newToken = uuidv4();
                await pool.query(
                    'UPDATE users SET token = $1, last_login = NOW() WHERE id = $2',
                    [newToken, user.id]
                );
                
                return res.json({
                    success: true,
                    message: 'Вход выполнен',
                    token: newToken,
                    username: user.username
                });
            } else {
                return res.status(401).json({ success: false, error: 'Неверный пароль' });
            }
        }

        // Создаём нового пользователя
        const userId = uuidv4();
        const token = uuidv4();
        
        await pool.query(
            'INSERT INTO users (id, username, password, token, created, last_login) VALUES ($1, $2, $3, $4, NOW(), NOW())',
            [userId, username, password, token]
        );

        // Создаём запись прогресса для нового пользователя
        await pool.query(
            `INSERT INTO progress (
                user_id, username, unlocked_difficulties, 
                player_position_x, player_position_y, last_played
            ) VALUES ($1, $2, $3, $4, $5, NOW())`,
            [userId, username, [1], 1, 4]
        );

        res.json({
            success: true,
            message: 'Регистрация успешна',
            token,
            username
        });

    } catch (error) {
        console.error('❌ Ошибка регистрации:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
});

// 2. Сохранение прогресса
app.post('/api/save-progress', async (req, res) => {
    try {
        const { token, progress } = req.body;
        
        if (!token) {
            return res.status(401).json({ success: false, error: 'Требуется токен' });
        }

        // Находим пользователя по токену
        const userResult = await pool.query(
            'SELECT id FROM users WHERE token = $1',
            [token]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Пользователь не найден' });
        }

        const userId = userResult.rows[0].id;

        // Обновляем прогресс (используем COALESCE для защиты от undefined)
        await pool.query(
            `UPDATE progress SET
                unlocked_difficulties = COALESCE($1, unlocked_difficulties),
                current_difficulty = COALESCE($2, current_difficulty),
                player_position_x = COALESCE($3, player_position_x),
                player_position_y = COALESCE($4, player_position_y),
                questions_solved = COALESCE($5, questions_solved),
                mistakes = COALESCE($6, mistakes),
                unlocked_demons = COALESCE($7, unlocked_demons),
                last_played = NOW()
            WHERE user_id = $8`,
            [
                progress.unlockedDifficulties || null,
                progress.currentProgress?.difficulty || null,
                progress.currentProgress?.playerPosition?.x || null,
                progress.currentProgress?.playerPosition?.y || null,
                progress.currentProgress?.questionsSolved || null,
                progress.currentProgress?.mistakes || null,
                progress.currentProgress?.unlockedDemons || null,
                userId
            ]
        );

        // Обновляем общую статистику
        if (progress.statistics) {
            await pool.query(
                `UPDATE progress SET
                    total_demons_collected = COALESCE($1, total_demons_collected),
                    total_questions_solved = COALESCE($2, total_questions_solved),
                    total_mistakes = COALESCE($3, total_mistakes)
                WHERE user_id = $4`,
                [
                    progress.statistics.totalDemonsCollected || null,
                    progress.statistics.totalQuestionsSolved || null,
                    progress.statistics.totalMistakes || null,
                    userId
                ]
            );
        }

        res.json({
            success: true,
            message: 'Прогресс сохранен'
        });

    } catch (error) {
        console.error('❌ Ошибка сохранения:', error);
        res.status(500).json({ success: false, error: 'Ошибка сохранения прогресса' });
    }
});

// 3. Загрузка прогресса
app.get('/api/load-progress', async (req, res) => {
    try {
        const token = req.query.token;
        
        if (!token) {
            return res.status(401).json({ success: false, error: 'Требуется токен' });
        }

        // Находим пользователя по токену
        const userResult = await pool.query(
            'SELECT id, username FROM users WHERE token = $1',
            [token]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Пользователь не найден' });
        }

        const user = userResult.rows[0];
        
        // Загружаем прогресс
        const progressResult = await pool.query(
            'SELECT * FROM progress WHERE user_id = $1',
            [user.id]
        );

        if (progressResult.rows.length === 0) {
            return res.json({ success: true, progress: null });
        }

        const p = progressResult.rows[0];

        // Формируем ответ
        const progressData = {
            unlockedDifficulties: p.unlocked_difficulties || [1],
            currentProgress: {
                difficulty: p.current_difficulty || 1,
                playerPosition: { 
                    x: p.player_position_x || 1, 
                    y: p.player_position_y || 4 
                },
                questionsSolved: p.questions_solved || 0,
                mistakes: p.mistakes || 0,
                unlockedDemons: p.unlocked_demons || [],
                lastPlayed: p.last_played
            },
            statistics: {
                totalDemonsCollected: p.total_demons_collected || 0,
                totalQuestionsSolved: p.total_questions_solved || 0,
                totalMistakes: p.total_mistakes || 0
            }
        };

        res.json({
            success: true,
            progress: progressData,
            username: user.username
        });

    } catch (error) {
        console.error('❌ Ошибка загрузки:', error);
        res.status(500).json({ success: false, error: 'Ошибка загрузки прогресса' });
    }
});

// 4. Разблокировка уровня
app.post('/api/unlock-level', async (req, res) => {
    try {
        const { token, level } = req.body;
        
        if (!token || !level) {
            return res.status(400).json({ success: false, error: 'Требуется токен и уровень' });
        }

        // Находим пользователя
        const userResult = await pool.query(
            'SELECT id FROM users WHERE token = $1',
            [token]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Пользователь не найден' });
        }

        const userId = userResult.rows[0].id;

        // Получаем текущие разблокированные уровни
        const progressResult = await pool.query(
            'SELECT unlocked_difficulties FROM progress WHERE user_id = $1',
            [userId]
        );

        let unlocked = progressResult.rows[0]?.unlocked_difficulties || [1];

        // Добавляем уровень, если его еще нет
        if (!unlocked.includes(level)) {
            unlocked.push(level);
            unlocked.sort((a, b) => a - b);

            await pool.query(
                'UPDATE progress SET unlocked_difficulties = $1 WHERE user_id = $2',
                [unlocked, userId]
            );

            res.json({
                success: true,
                message: `Уровень ${level} разблокирован`,
                unlockedDifficulties: unlocked
            });
        } else {
            res.json({
                success: true,
                message: 'Уровень уже разблокирован',
                unlockedDifficulties: unlocked
            });
        }

    } catch (error) {
        console.error('❌ Ошибка разблокировки:', error);
        res.status(500).json({ success: false, error: 'Ошибка разблокировки уровня' });
    }
});

// 5. Получение рейтинга
app.get('/api/leaderboard', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT username, total_demons_collected, total_questions_solved, 
                    array_length(unlocked_difficulties, 1) as unlocked_levels
             FROM progress 
             WHERE total_demons_collected > 0 OR total_questions_solved > 0
             ORDER BY total_demons_collected DESC, total_questions_solved DESC
             LIMIT 20`
        );

        const leaderboard = result.rows.map(row => ({
            username: row.username,
            demonsCollected: parseInt(row.total_demons_collected) || 0,
            questionsSolved: parseInt(row.total_questions_solved) || 0,
            unlockedLevels: row.unlocked_levels || 1
        }));

        res.json({
            success: true,
            leaderboard
        });

    } catch (error) {
        console.error('❌ Ошибка получения рейтинга:', error);
        res.status(500).json({ success: false, error: 'Ошибка получения рейтинга' });
    }
});

// Проверка здоровья сервера (для Render)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Отдаем index.html для всех остальных маршрутов (SPA режим)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Запуск сервера
async function startServer() {
    await initializeDatabase();
    app.listen(PORT, () => {
        console.log(`✅ Сервер запущен на порту ${PORT}`);
    });
}

startServer();
