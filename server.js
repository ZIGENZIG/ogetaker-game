const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - ИСПРАВЛЕНО
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json()); // Встроенный парсер вместо body-parser
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Подключение к PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Проверка подключения к БД
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Ошибка подключения к БД:', err.stack);
    } else {
        console.log('✅ Подключено к PostgreSQL');
        release();
    }
});

// Инициализация таблиц
async function initializeDatabase() {
    try {
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

// Добавляем маршрут для проверки API
app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'API работает' });
});

// 1. Регистрация / Вход
app.post('/api/register', async (req, res) => {
    console.log('📝 Получен запрос на /api/register');
    console.log('Body:', req.body);
    
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            console.log('❌ Нет имени или пароля');
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

        // Если пользователь существует - логин
        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            
            // Проверяем пароль
            const validPassword = await bcrypt.compare(password, user.password);
            
            if (validPassword) {
                const newToken = uuidv4();
                await pool.query(
                    'UPDATE users SET token = $1, last_login = NOW() WHERE id = $2',
                    [newToken, user.id]
                );
                
                console.log('✅ Успешный вход:', username);
                return res.json({
                    success: true,
                    message: 'Вход выполнен',
                    token: newToken,
                    username: user.username
                });
            } else {
                console.log('❌ Неверный пароль для:', username);
                return res.status(401).json({ success: false, error: 'Неверный пароль' });
            }
        }

        // Регистрация нового пользователя
        console.log('📝 Регистрация нового пользователя:', username);
        
        // Хешируем пароль
        const hashedPassword = await bcrypt.hash(password, 10);

        // Создаём нового пользователя
        const userId = uuidv4();
        const token = uuidv4();
        
        await pool.query(
            'INSERT INTO users (id, username, password, token, created, last_login) VALUES ($1, $2, $3, $4, NOW(), NOW())',
            [userId, username, hashedPassword, token]
        );

        // Создаём запись прогресса
        await pool.query(
            `INSERT INTO progress (
                user_id, username, unlocked_difficulties, 
                player_position_x, player_position_y, last_played
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, username, [1], 1, 4, new Date()]
        );

        console.log('✅ Регистрация успешна:', username);
        res.json({
            success: true,
            message: 'Регистрация успешна',
            token,
            username
        });

    } catch (error) {
        console.error('❌ Ошибка регистрации:', error);
        
        if (error.code === '23505') {
            return res.status(400).json({ success: false, error: 'Имя пользователя уже занято' });
        }
        
        res.status(500).json({ success: false, error: 'Ошибка сервера: ' + error.message });
    }
});

// ... остальные маршруты остаются без изменений ...

// Проверка здоровья сервера
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Отдаем index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Запуск сервера
async function startServer() {
    try {
        await initializeDatabase();
        app.listen(PORT, () => {
            console.log(`✅ Сервер запущен на порту ${PORT}`);
            console.log(`🌐 Открыть: http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('❌ Ошибка запуска сервера:', error);
        process.exit(1);
    }
}

startServer();

process.on('unhandledRejection', (error) => {
    console.error('❌ Необработанная ошибка:', error);
});
