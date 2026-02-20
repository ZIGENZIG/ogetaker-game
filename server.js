const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt'); // Добавляем для хеширования паролей

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Подключение к PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Инициализация таблиц
async function initializeDatabase() {
    try {
        // Таблица пользователей
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(36) PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
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

        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ success: false, error: 'Имя должно быть от 3 до 20 символов' });
        }

        if (password.length < 4) {
            return res.status(400).json({ success: false, error: 'Пароль должен быть минимум 4 символа' });
        }

        // Ищем пользователя
        const userResult = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );

        // Если пользователь существует
        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            
            // Проверяем пароль с использованием bcrypt
            const validPassword = await bcrypt.compare(password, user.password);
            
            if (validPassword) {
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

        // Проверяем, не занято ли имя (дополнительная проверка)
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Имя пользователя уже занято' });
        }

        // Хешируем пароль
        const hashedPassword = await bcrypt.hash(password, 10);

        // Создаём нового пользователя
        const userId = uuidv4();
        const token = uuidv4();
        
        await pool.query(
            'INSERT INTO users (id, username, password, token, created, last_login) VALUES ($1, $2, $3, $4, NOW(), NOW())',
            [userId, username, hashedPassword, token]
        );

        // Создаём запись прогресса для нового пользователя
        await pool.query(
            `INSERT INTO progress (
                user_id, username, unlocked_difficulties, 
                player_position_x, player_position_y, last_played
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, username, [1], 1, 4, new Date()]
        );

        res.json({
            success: true,
            message: 'Регистрация успешна',
            token,
            username
        });

    } catch (error) {
        console.error('❌ Ошибка регистрации:', error);
        
        // Проверяем на уникальность (если bcrypt не сработал)
        if (error.code === '23505') {
            return res.status(400).json({ success: false, error: 'Имя пользователя уже занято' });
        }
        
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

        if (!progress) {
            return res.status(400).json({ success: false, error: 'Нет данных прогресса' });
        }

        // Находим пользователя по токену
        const userResult = await pool.query(
            'SELECT id, username FROM users WHERE token = $1',
            [token]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Пользователь не найден' });
        }

        const userId = userResult.rows[0].id;
        const username = userResult.rows[0].username;

        // Проверяем существование записи прогресса
        const progressExists = await pool.query(
            'SELECT * FROM progress WHERE user_id = $1',
            [userId]
        );

        if (progressExists.rows.length === 0) {
            // Создаем запись прогресса, если её нет
            await pool.query(
                `INSERT INTO progress (
                    user_id, username, unlocked_difficulties, 
                    player_position_x, player_position_y, last_played
                ) VALUES ($1, $2, $3, $4, $5, $6)`,
                [userId, username, [1], 1, 4, new Date()]
            );
        }

        // Обновляем прогресс
        await pool.query(
            `UPDATE progress SET
                unlocked_difficulties = COALESCE($1::integer[], unlocked_difficulties),
                current_difficulty = COALESCE($2::integer, current_difficulty),
                player_position_x = COALESCE($3::integer, player_position_x),
                player_position_y = COALESCE($4::integer, player_position_y),
                questions_solved = COALESCE($5::integer, questions_solved),
                mistakes = COALESCE($6::integer, mistakes),
                unlocked_demons = COALESCE($7::text[], unlocked_demons),
                last_played = NOW()
            WHERE user_id = $8`,
            [
                progress.unlockedDifficulties || null,
                progress.currentDifficulty || null,
                progress.playerPosition?.x || null,
                progress.playerPosition?.y || null,
                progress.questionsSolved || null,
                progress.mistakes || null,
                progress.unlockedDemons || null,
                userId
            ]
        );

        // Обновляем общую статистику
        if (progress.statistics) {
            await pool.query(
                `UPDATE progress SET
                    total_demons_collected = COALESCE($1::integer, total_demons_collected),
                    total_questions_solved = COALESCE($2::integer, total_questions_solved),
                    total_mistakes = COALESCE($3::integer, total_mistakes)
                WHERE user_id = $4`,
                [
                    progress.statistics.totalDemonsCollected || 0,
                    progress.statistics.totalQuestionsSolved || 0,
                    progress.statistics.totalMistakes || 0,
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

        const userResult = await pool.query(
            'SELECT id, username FROM users WHERE token = $1',
            [token]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Пользователь не найден' });
        }

        const user = userResult.rows[0];
        
        const progressResult = await pool.query(
            'SELECT * FROM progress WHERE user_id = $1',
            [user.id]
        );

        if (progressResult.rows.length === 0) {
            return res.json({ success: true, progress: null });
        }

        const p = progressResult.rows[0];

        const progressData = {
            unlockedDifficulties: p.unlocked_difficulties || [1],
            currentDifficulty: p.current_difficulty || 1,
            playerPosition: { 
                x: p.player_position_x || 1, 
                y: p.player_position_y || 4 
            },
            questionsSolved: p.questions_solved || 0,
            mistakes: p.mistakes || 0,
            unlockedDemons: p.unlocked_demons || [],
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

        if (level < 2 || level > 3) {
            return res.status(400).json({ success: false, error: 'Некорректный уровень' });
        }

        const userResult = await pool.query(
            'SELECT id FROM users WHERE token = $1',
            [token]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Пользователь не найден' });
        }

        const userId = userResult.rows[0].id;

        const progressResult = await pool.query(
            'SELECT unlocked_difficulties FROM progress WHERE user_id = $1',
            [userId]
        );

        let unlocked = progressResult.rows[0]?.unlocked_difficulties || [1];

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
             ORDER BY total_demons_collected DESC, total_questions_solved DESC, unlocked_levels DESC
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

// Проверка здоровья сервера
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Отдаем index.html для всех остальных маршрутов
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Запуск сервера
async function startServer() {
    try {
        await initializeDatabase();
        app.listen(PORT, () => {
            console.log(`✅ Сервер запущен на порту ${PORT}`);
        });
    } catch (error) {
        console.error('❌ Ошибка запуска сервера:', error);
        process.exit(1);
    }
}

startServer();

// Обработка неожиданных ошибок
process.on('unhandledRejection', (error) => {
    console.error('❌ Необработанная ошибка:', error);
});
