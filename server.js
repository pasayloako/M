const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Your secret API key - stored only on the server
const BIBLE_API_KEY = 'selovasx2024';
const BIBLE_API_URL = 'https://pasayloakomego.onrender.com/api/bibleai';

// Allowed origins - ONLY your deployed URLs can access this backend
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://biblaaigpt.vercel.app',
    // Add your Render/Vercel deployed URL here after deployment
    // Example: 'https://your-app.onrender.com',
    // Example: 'https://your-app.vercel.app'
];

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS configuration - strict origin checking
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin) {
            return callback(null, true);
        }

        // Check if the origin is allowed
        if (ALLOWED_ORIGINS.indexOf(origin) !== -1 || 
            origin.includes('localhost') || // Allow localhost for development
            origin.includes('onrender.com') || // Allow any Render subdomain
            origin.includes('vercel.app')) { // Allow any Vercel subdomain
            callback(null, true);
        } else {
            console.log(`Blocked by CORS: ${origin}`);
            callback(null, false); // Silently reject instead of error
        }
    },
    methods: ['GET', 'POST'],
    credentials: false
}));

// Rate limiting simple implementation
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 20; // Max 20 requests per minute

function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
    }
    
    const timestamps = requestCounts.get(ip);
    // Remove timestamps outside the window
    const recentTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
    
    if (recentTimestamps.length >= MAX_REQUESTS) {
        return res.status(429).json({ 
            error: 'Too many requests. Please try again later.',
            retryAfter: Math.ceil((recentTimestamps[0] + RATE_LIMIT_WINDOW - now) / 1000)
        });
    }
    
    recentTimestamps.push(now);
    requestCounts.set(ip, recentTimestamps);
    next();
}

// Apply rate limiting to API routes
app.use('/api', rateLimiter);

// Referrer check middleware to prevent direct API access
function checkReferrer(req, res, next) {
    const referer = req.get('Referer');
    const origin = req.get('Origin');
    const host = req.get('Host');
    
    // Allow if request comes from same host
    if (origin && host) {
        const originHost = new URL(origin).host;
        if (originHost === host || originHost.includes('localhost')) {
            return next();
        }
    }
    
    // Allow if referer matches host
    if (referer && host) {
        const refererHost = new URL(referer).host;
        if (refererHost === host || refererHost.includes('localhost')) {
            return next();
        }
    }
    
    // For development/testing
    if (host && host.includes('localhost')) {
        return next();
    }
    
    // If it's a same-origin request (no referer/origin but same host)
    if (!referer && !origin && req.accepts('html')) {
        return next();
    }
    
    console.log(`Blocked request - Host: ${host}, Referer: ${referer}, Origin: ${origin}`);
    return res.status(403).json({ error: 'Access denied. This API can only be used from the official website.' });
}

// API endpoint - proxy to Bible AI
app.post('/api/ask', checkReferrer, async (req, res) => {
    try {
        const { prompt } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }
        
        if (prompt.length > 500) {
            return res.status(400).json({ error: 'Prompt too long. Maximum 500 characters.' });
        }
        
        console.log(`Processing request for: ${prompt.substring(0, 50)}...`);
        
        // Build the URL with parameters - API key stays on the server
        const url = `${BIBLE_API_URL}?prompt=${encodeURIComponent(prompt)}&apikey=${BIBLE_API_KEY}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'BibleAIChatbot/1.0'
            }
        });
        
        if (!response.ok) {
            console.error(`API Error: ${response.status} ${response.statusText}`);
            return res.status(response.status).json({ 
                error: 'Failed to get response from Bible AI service' 
            });
        }
        
        const data = await response.json();
        
        // Return the response to the client
        res.json(data);
        
    } catch (error) {
        console.error('Server error:', error.message);
        res.status(500).json({ error: 'Internal server error. Please try again.' });
    }
});

// Security headers middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).send('Page not found');
});

// Start server
app.listen(PORT, () => {
    console.log(`Bible AI Chatbot server running on port ${PORT}`);
    console.log(`API key is secured on the server only.`);
});
