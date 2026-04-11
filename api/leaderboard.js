const LEADERBOARD_KEY = 'arcade-glide:leaderboard';
const MIN_TIME_SECONDS = 10;
const TOP_LIMIT = 3;

function getRedisConfig() {
    return {
        url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    };
}

async function redis(command) {
    const { url, token } = getRedisConfig();

    if (!url || !token) {
        const error = new Error('Redis is not configured');
        error.statusCode = 503;
        throw error;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(command),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
        const error = new Error(data.error || 'Redis request failed');
        error.statusCode = response.status || 500;
        throw error;
    }

    return data.result;
}

function send(response, statusCode, body) {
    response.status(statusCode).json(body);
}

function sanitizeName(name) {
    const cleanName = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 16);
    return cleanName || 'Joueur';
}

function sanitizeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function parseEntries(rawEntries) {
    if (!Array.isArray(rawEntries)) return [];

    const entries = [];
    for (let index = 0; index < rawEntries.length; index += 2) {
        try {
            const entry = JSON.parse(rawEntries[index]);
            const milliseconds = sanitizeNumber(rawEntries[index + 1]);
            entries.push({
                name: sanitizeName(entry.name),
                time: Number((milliseconds / 1000).toFixed(1)),
                score: Math.max(0, Math.floor(sanitizeNumber(entry.score))),
                level: Math.max(1, Math.floor(sanitizeNumber(entry.level, 1))),
                createdAt: entry.createdAt || null,
            });
        } catch (error) {
            // Ignore malformed leaderboard rows instead of breaking the game.
        }
    }

    return entries;
}

async function getEntries() {
    const rawEntries = await redis(['ZREVRANGE', LEADERBOARD_KEY, 0, TOP_LIMIT - 1, 'WITHSCORES']);
    return parseEntries(rawEntries);
}

async function addEntry(body) {
    const time = sanitizeNumber(body.time);
    if (time <= MIN_TIME_SECONDS) {
        const error = new Error('Score must be over 10 seconds');
        error.statusCode = 400;
        throw error;
    }

    const entry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: sanitizeName(body.name),
        score: Math.max(0, Math.floor(sanitizeNumber(body.score))),
        level: Math.max(1, Math.floor(sanitizeNumber(body.level, 1))),
        createdAt: new Date().toISOString(),
    };
    const milliseconds = Math.round(time * 1000);

    await redis(['ZADD', LEADERBOARD_KEY, milliseconds, JSON.stringify(entry)]);
    await redis(['ZREMRANGEBYRANK', LEADERBOARD_KEY, 0, -(TOP_LIMIT + 1)]);

    const entries = await getEntries();
    const accepted = entries.some((item) => item.createdAt === entry.createdAt && item.name === entry.name);

    return { accepted, entries };
}

module.exports = async function handler(request, response) {
    response.setHeader('Cache-Control', 'no-store');

    try {
        if (request.method === 'GET') {
            send(response, 200, { entries: await getEntries() });
            return;
        }

        if (request.method === 'POST') {
            send(response, 200, await addEntry(request.body || {}));
            return;
        }

        response.setHeader('Allow', 'GET, POST');
        send(response, 405, { error: 'Method not allowed' });
    } catch (error) {
        send(response, error.statusCode || 500, {
            error: error.message || 'Leaderboard unavailable',
        });
    }
};
