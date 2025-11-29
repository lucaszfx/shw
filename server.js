const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Configure Multer for uploads
const upload = multer({ dest: 'uploads_temp/' });

// Ensure directories exist
const GAMES_DIR = path.join(__dirname, 'games');
if (!fs.existsSync(GAMES_DIR)) fs.mkdirSync(GAMES_DIR);

// Serve static files for the frontend
app.use(express.static('public'));

// Upload Endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const tempPath = req.file.path;
    const gameId = Date.now().toString();
    const gamePath = path.join(GAMES_DIR, gameId);

    try {
        const zip = new AdmZip(tempPath);
        zip.extractAllTo(gamePath, true);
        fs.unlinkSync(tempPath); // Clean up temp file
        res.json({ success: true, gameId: gameId });
    } catch (error) {
        console.error('Extraction error:', error);
        res.status(500).json({ error: 'Failed to extract ZIP' });
    }
});

// List Games
app.get('/games', (req, res) => {
    try {
        const games = fs.readdirSync(GAMES_DIR).map(id => ({
            id,
            url: `/play/${id}/`
        }));
        res.json(games);
    } catch (e) {
        res.json([]);
    }
});

// Serve Game Files with Injection
app.use('/play/:gameId', (req, res, next) => {
    const gameId = req.params.gameId;
    const filePath = req.path === '/' ? 'index.html' : req.path.substring(1);
    const absolutePath = path.join(GAMES_DIR, gameId, filePath);

    // Security check to prevent directory traversal
    if (!absolutePath.startsWith(path.join(GAMES_DIR, gameId))) {
        return res.status(403).send('Forbidden');
    }

    if (path.extname(absolutePath) === '.html') {
        // If it's an HTML file, we inject our scripts
        if (fs.existsSync(absolutePath)) {
            let content = fs.readFileSync(absolutePath, 'utf8');

            // Scripts to inject
            const injection = `
                <script src="/shims/nwjsapi.js"></script>
                <script src="/shims/globals.js"></script>
                <script src="/shims/webgl.js"></script>
                <script src="/translator.js"></script>
                <script>
                  // Auto-init overrides if present
                  // fetch('/shims/overrides.json').then(r => r.json()).then(overrides => {
                  //    console.log("Overrides loaded", overrides);
                  // }).catch(e => console.log("No overrides"));
                </script>
            `;

            // Inject before <head> or <body> or at the start if neither exists
            if (content.includes('<head>')) {
                content = content.replace('<head>', '<head>' + injection);
            } else if (content.includes('<body>')) {
                content = content.replace('<body>', '<body>' + injection);
            } else {
                content = injection + content;
            }

            res.send(content);
        } else {
             // Try to find index.html if requesting root
             if (req.path === '/') {
                 const index = path.join(GAMES_DIR, gameId, 'index.html');
                 if(fs.existsSync(index)) {
                     // Redirect to index.html handling is implicit in recursive call?
                     // No, let's just read index.html
                     let content = fs.readFileSync(index, 'utf8');
                     // ... (Injection logic repeated, simplified for now)
                     const injection = `
                        <script src="/shims/nwjsapi.js"></script>
                        <script src="/shims/globals.js"></script>
                        <script src="/shims/webgl.js"></script>
                        <script src="/translator.js"></script>
                    `;
                    if (content.includes('<head>')) {
                        content = content.replace('<head>', '<head>' + injection);
                    } else {
                        content = injection + content;
                    }
                    res.send(content);
                    return;
                 }
             }
             next();
        }
    } else {
        // Serve static file
        if (fs.existsSync(absolutePath)) {
             res.sendFile(absolutePath);
        } else {
             next();
        }
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
