const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;
const LOCAL_URL = `http://localhost:${PORT}`;

// Cache for upsell_offers from database
let upsellOffersCache = null;

/**
 * Load upsell offers from database into cache
 */
async function loadUpsellOffersCache() {
    try {
        const result = await pool.query('SELECT * FROM upsell_offers ORDER BY topup_rb');
        upsellOffersCache = result.rows;
        console.log('✅ Loaded', upsellOffersCache.length, 'TIZO rates from database');
    } catch (err) {
        console.error('❌ Failed to load upsell offers:', err.message);
    }
}

/**
 * Calculate TIZO for custom topup amounts
 * 
 * 600 Rb is the BASE unit (100% increase = 2× multiplier)
 * Step 1: Use 600 Rb as many times as possible (each = 1200 Tizo)
 * Step 2: For remaining (<600), use table values (greedy, largest first)
 * Step 3: Below 100 Rb → 1:1 ratio
 * 
 * Example: 1790 Rb
 * - 600 × 2 = 1200 Rb → 2400 Tizo
 * - Remaining 590 Rb → 550 Rb (1020 Tizo) + 40 Rb (40 Tizo)
 * - Total = 2400 + 1020 + 40 = 3460 Tizo
 * 
 * @param {number} amountRb - Amount in Rb (e.g., 1790 for 1,790,000 Rp)
 * @returns {number} - TIZO credit amount
 */
function calculateCustomTizo(amountRb) {
    let totalTizo = 0;
    let remaining = amountRb;

    // Step 1: Use 600 Rb as base (100% bonus = 1200 Tizo each)
    const base600Count = Math.floor(remaining / 600);
    if (base600Count > 0) {
        totalTizo += base600Count * 1200;
        remaining = remaining % 600;
    }

    // Step 2: For remaining (<600), use table values (greedy, largest first)
    if (remaining > 0 && upsellOffersCache && upsellOffersCache.length > 0) {
        // Filter offers < 600 and sort descending
        const validOffers = upsellOffersCache
            .filter(o => o.topup_rb < 600)
            .sort((a, b) => b.topup_rb - a.topup_rb);

        for (const offer of validOffers) {
            while (remaining >= offer.topup_rb) {
                totalTizo += offer.tizo_value;
                remaining -= offer.topup_rb;
            }
        }
    }

    // Step 3: Any remaining below 100 Rb → 1:1 ratio
    if (remaining > 0) {
        totalTizo += remaining;
    }

    return totalTizo;
}

// PostgreSQL connection pool - connects directly to cloud database
const pool = new Pool({
    host: process.env.DB_HOST || '13.214.169.79',
    port: process.env.DB_PORT || 5433,
    database: process.env.DB_NAME || 'TimeZone',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'tizo123',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.json': 'application/json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Disable caching for API requests
    if (req.url.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // API: Health check - test database connection
    if (req.method === 'GET' && req.url === '/api/health') {
        pool.query('SELECT NOW() as time, current_database() as database')
            .then(result => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    status: 'connected',
                    database: result.rows[0].database,
                    serverTime: result.rows[0].time,
                    message: '✅ Database connection successful!'
                }));
            })
            .catch(err => {
                console.error('Database connection error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    status: 'disconnected',
                    error: err.message,
                    message: '❌ Database connection failed!'
                }));
            });
        return;
    }

    // API: Get layout config based on card type count
    if (req.method === 'GET' && req.url.startsWith('/api/layout-config')) {
        const urlParams = new URL(req.url, LOCAL_URL);
        const cardType = urlParams.searchParams.get('cardType');

        if (!cardType) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'cardType parameter is required' }));
            return;
        }

        // Map frontend card names to database card_type values
        const cardTypeMap = {
            'red': 'Red',
            'blue': 'Blue',
            'gold': 'Gold',
            'silver': 'Platinum',
            'platinum': 'Platinum',
            'new_user': 'New User'
        };

        const dbCardType = cardTypeMap[cardType.toLowerCase()] || cardType;

        // Count only active offers within valid date range
        const countQuery = `SELECT COUNT(*) as count FROM offers 
            WHERE card_type = $1 
            AND is_active = true 
            AND (start_date IS NULL OR start_date <= CURRENT_DATE) 
            AND (end_date IS NULL OR end_date >= CURRENT_DATE)`;

        pool.query(countQuery, [dbCardType])
            .then(result => {
                const count = parseInt(result.rows[0].count);
                let layout;

                if (count <= 3) {
                    layout = 3;
                } else if (count === 4) {
                    layout = 4;
                } else {
                    layout = 5;
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    layout: layout,
                    count: count,
                    cardType: dbCardType,
                    message: `Found ${count} ${dbCardType} cards, using layout ${layout}`
                }));
            })
            .catch(err => {
                console.error('Database error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // API: Get scratch card offers by card type
    // Category = "Scratch Card", card_type = "New User" or other card types
    if (req.method === 'GET' && req.url.startsWith('/api/scratch-card')) {
        const urlParams = new URL(req.url, LOCAL_URL);
        const cardType = urlParams.searchParams.get('cardType');

        const cardTypeMap = {
            'red': 'Red',
            'blue': 'Blue',
            'gold': 'Gold',
            'silver': 'Platinum',
            'platinum': 'Platinum',
            'new_user': 'New User'
        };

        const dbCardType = cardType ? (cardTypeMap[cardType.toLowerCase()] || cardType) : null;

        let query = "SELECT * FROM offers WHERE category = 'Scratch Card'";
        let params = [];

        if (dbCardType) {
            query += ' AND card_type = $1';
            params.push(dbCardType);
        }

        query += ' ORDER BY cost DESC LIMIT 1';

        pool.query(query, params)
            .then(result => {
                if (result.rows.length > 0) {
                    const offer = result.rows[0];
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        offer: {
                            id: offer.id,
                            cost: parseFloat(offer.cost),
                            tizo_credit: parseFloat(offer.tizo_credit),
                            card_type: offer.card_type,
                            category: offer.category,
                            free_games: offer.free_games || null,
                            gift: offer.gift || null,
                            gift_details: offer.gift_details || null
                        },
                        message: `Scratch card offer for ${dbCardType || 'default'}`
                    }));
                } else {
                    // Return default values if no scratch card offer found
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        offer: {
                            id: null,
                            cost: 100000,
                            tizo_credit: 200,
                            card_type: dbCardType || 'default',
                            category: 'Scratch Card',
                            free_games: null,
                            gift: null,
                            gift_details: null
                        },
                        isDefault: true,
                        message: 'Using default scratch card values (100 RIBU → 200 TIZO)'
                    }));
                }
            })
            .catch(err => {
                console.error('Database error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // API: Get card info from card_offers table
    if (req.method === 'GET' && req.url.startsWith('/api/card-info')) {
        const urlParams = new URL(req.url, LOCAL_URL);
        const cardId = urlParams.searchParams.get('cardId');

        let query = 'SELECT * FROM card_offers WHERE is_active = true';
        let params = [];

        if (cardId) {
            query += ' AND id = $1';
            params.push(cardId.toLowerCase());
        }

        query += ' ORDER BY id';

        pool.query(query, params)
            .then(result => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                if (cardId && result.rows.length > 0) {
                    // Single card requested
                    res.end(JSON.stringify({
                        success: true,
                        card: result.rows[0]
                    }));
                } else {
                    // All cards or no match
                    res.end(JSON.stringify({
                        success: true,
                        cards: result.rows,
                        count: result.rows.length
                    }));
                }
            })
            .catch(err => {
                console.error('Database error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // API: Get offers by card type OR category (for OOH/OOD screensaver) OR by ID
    if (req.method === 'GET' && req.url.startsWith('/api/offers')) {
        const urlParams = new URL(req.url, LOCAL_URL);
        const cardType = urlParams.searchParams.get('cardType');
        const category = urlParams.searchParams.get('category');
        const offerId = urlParams.searchParams.get('offerId');

        const cardTypeMap = {
            'red': 'Red',
            'blue': 'Blue',
            'gold': 'Gold',
            'silver': 'Platinum',
            'platinum': 'Platinum',
            'new_user': 'New User'
        };

        // Category map for OOH/OOD (case-insensitive)
        const categoryMap = {
            'ooh': 'OOH',
            'ood': 'OOD',
            'voucher': 'Voucher',
            'scratch card': 'Scratch Card'
        };

        // Build query with filters for is_active and date range
        let query = `SELECT * FROM offers WHERE is_active = true 
            AND (start_date IS NULL OR start_date <= CURRENT_DATE) 
            AND (end_date IS NULL OR end_date >= CURRENT_DATE)`;
        let params = [];
        let paramIndex = 1;

        // Filter by offer ID if provided (for fetching specific offer with icons)
        if (offerId) {
            query = `SELECT * FROM offers WHERE id = $${paramIndex}`;
            params.push(offerId);
            paramIndex++;
        }

        // Filter by category if provided (for OOH/OOD screensaver)
        if (category && !offerId) {
            const dbCategory = categoryMap[category.toLowerCase()] || category;
            query += ` AND category = $${paramIndex}`;
            params.push(dbCategory);
            paramIndex++;
        }

        // Filter by card type if provided
        if (cardType && !offerId) {
            const dbCardType = cardTypeMap[cardType.toLowerCase()] || cardType;
            query += ` AND card_type = $${paramIndex}`;
            params.push(dbCardType);
            paramIndex++;
        }

        if (!offerId) {
            query += ' ORDER BY cost DESC';
        }

        pool.query(query, params)
            .then(result => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    offers: result.rows,
                    count: result.rows.length
                }));
            })
            .catch(err => {
                console.error('Database error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // API: Get all upsell offers (for TIZO rate lookup)
    if (req.method === 'GET' && req.url === '/api/upsell-offers-all') {
        pool.query('SELECT * FROM upsell_offers ORDER BY topup_rb')
            .then(result => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    offers: result.rows,
                    count: result.rows.length
                }));
            })
            .catch(err => {
                console.error('Database error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // API: Get upsell offer by RB value
    if (req.method === 'GET' && req.url.startsWith('/api/upsell-offer')) {
        const urlParams = new URL(req.url, LOCAL_URL);
        const rbValue = urlParams.searchParams.get('rb');

        if (!rbValue) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'rb parameter is required' }));
            return;
        }

        // Find the upsell offer matching the RB value
        pool.query('SELECT * FROM upsell_offers WHERE topup_rb = $1', [parseInt(rbValue)])
            .then(result => {
                if (result.rows.length > 0) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        offer: result.rows[0]
                    }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'No upsell offer found for this RB value' }));
                }
            })
            .catch(err => {
                console.error('Database error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // API: Get next two larger upsell offers from database
    if (req.method === 'GET' && req.url.startsWith('/api/next-upsell-offers')) {
        const urlParams = new URL(req.url, LOCAL_URL);
        const rbValue = urlParams.searchParams.get('rb');

        if (!rbValue) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'rb parameter is required' }));
            return;
        }

        // Find the next two offers with topup_rb greater than the current value
        pool.query('SELECT * FROM upsell_offers WHERE topup_rb > $1 ORDER BY topup_rb ASC LIMIT 2', [parseInt(rbValue)])
            .then(result => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    offers: result.rows,
                    count: result.rows.length,
                    baseRb: parseInt(rbValue)
                }));
            })
            .catch(err => {
                console.error('Database error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // API: Get custom topup upsell offers based on user's custom amount
    // Returns the two upsell box values for the 2nd upsell screen
    if (req.method === 'GET' && req.url.startsWith('/api/custom-topup-upsell')) {
        const urlParams = new URL(req.url, LOCAL_URL);
        const rbValue = urlParams.searchParams.get('rb');

        if (!rbValue) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'rb parameter is required (amount in Rb, e.g., 1790 for 1,790,000 Rp)' }));
            return;
        }

        const amountRb = parseInt(rbValue);

        // Find the upsell offers for this custom topup range
        pool.query(
            'SELECT * FROM custom_topup_upsell WHERE $1 BETWEEN range_min AND range_max LIMIT 1',
            [amountRb]
        )
            .then(result => {
                if (result.rows.length > 0) {
                    const row = result.rows[0];

                    // Calculate TIZO for each upsell box using the tiered formula
                    const tizo1 = calculateCustomTizo(row.upsell_box_1);
                    const tizo2 = calculateCustomTizo(row.upsell_box_2);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        customAmount: amountRb,
                        customTizo: calculateCustomTizo(amountRb),
                        upsellBox1: {
                            rb: row.upsell_box_1,
                            tizo: tizo1
                        },
                        upsellBox2: {
                            rb: row.upsell_box_2,
                            tizo: tizo2
                        },
                        range: {
                            min: row.range_min,
                            max: row.range_max
                        }
                    }));
                } else {
                    // Fallback for amounts outside defined ranges
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        customAmount: amountRb,
                        customTizo: calculateCustomTizo(amountRb),
                        upsellBox1: {
                            rb: Math.ceil(amountRb / 50) * 50,
                            tizo: calculateCustomTizo(Math.ceil(amountRb / 50) * 50)
                        },
                        upsellBox2: {
                            rb: Math.ceil(amountRb / 50) * 50 + 50,
                            tizo: calculateCustomTizo(Math.ceil(amountRb / 50) * 50 + 50)
                        },
                        isFallback: true,
                        message: 'Using calculated fallback values'
                    }));
                }
            })
            .catch(err => {
                console.error('Database error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            });
        return;
    }

    // Handle save request
    if (req.method === 'POST' && req.url === '/save') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { filePath, content } = JSON.parse(body);

                // Remove leading slash if present for proper path joining
                const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
                const fullPath = path.join(BASE_DIR, cleanPath);

                console.log('Attempting to save to:', fullPath);
                console.log('Content length:', content ? content.length : 0);

                // Security check - only allow saving in BASE_DIR
                const normalizedFullPath = path.normalize(fullPath);
                const normalizedBaseDir = path.normalize(BASE_DIR);
                if (!normalizedFullPath.startsWith(normalizedBaseDir)) {
                    console.error('Access denied - path outside BASE_DIR:', normalizedFullPath);
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Access denied' }));
                    return;
                }

                if (!content) {
                    console.error('No content provided');
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No content provided' }));
                    return;
                }

                fs.writeFileSync(fullPath, content, 'utf8');
                console.log('✅ Saved:', fullPath);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                console.error('Save error:', err.message);
                console.error('Stack:', err.stack);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // Serve static files
    // Strip query parameters from URL before looking up file
    console.log('Static request:', req.url);
    let requestUrl = req.url.split('?')[0];
    console.log('requestUrl:', requestUrl);
    if (requestUrl === '/') {
        res.writeHead(302, { 'Location': '/page-1/welcome.html' });
        res.end();
        return;
    }
    let filePath = requestUrl;
    console.log('initial filePath:', filePath);
    filePath = path.join(BASE_DIR, filePath);
    console.log('final filePath:', filePath);
    console.log('BASE_DIR:', BASE_DIR);
    console.log('exists:', fs.existsSync(filePath));

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            console.log('Read error:', err);
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, async () => {
    console.log(`\n🚀 TIZO Server running at ${LOCAL_URL}`);
    console.log(`   (Listening on port ${PORT})`);
    console.log(`\n🗄️  Database: ${process.env.DB_HOST || '13.214.169.79'}:${process.env.DB_PORT || 5433}`);

    // Load TIZO rates from database on startup
    await loadUpsellOffersCache();

    console.log(`\n📂 Open your pages:`);
    console.log(`   ${LOCAL_URL}/page-1/screensaver-ood.html  (Start here - Offer of the Day)`);
    console.log(`   ${LOCAL_URL}/page-1/screensaver.html       (Offer of the Hour)`);
    console.log(`   ${LOCAL_URL}/page-1/welcome.html`);
    console.log(`   ${LOCAL_URL}/page-1/welcome2.html`);
    console.log(`   ${LOCAL_URL}/page-1/welcome-newuser.html`);
    console.log(`   ${LOCAL_URL}/page-1/scratch-card.html`);
    console.log(`   ${LOCAL_URL}/page-1/prize-summary.html`);
    console.log(`   ${LOCAL_URL}/page-1/accept-scratchcard.html`);
    console.log(`   ${LOCAL_URL}/page-1/reject-scratchcard.html`);
    console.log(`   ${LOCAL_URL}/page-1/bill-summary.html`);
    console.log(`   ${LOCAL_URL}/page-1/enjoy.html`);
    console.log(`   ${LOCAL_URL}/page-1/card-selection.html`);
    console.log(`\n💾 Auto-save enabled - changes will be saved directly to files!`);
    console.log(`\nPress Ctrl+C to stop the server.\n`);
});
