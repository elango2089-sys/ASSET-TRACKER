const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
// Data file in the root directory
const DATA_FILE = path.join(process.cwd(), 'data.json');

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Initialize data.json if it doesn't exist
// Note: On Vercel, this only happens per cold start and won't persist
if (!fs.existsSync(DATA_FILE)) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify({
            bins: { small: [], big: [] },
            dispatches: [],
            history: []
        }));
    } catch (err) {
        console.error("Failed to initialize data file:", err);
    }
}

// Get state
app.get('/api/state', (req, res) => {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading data:", err);
            // If file missing, return default state
            return res.json({
                bins: { small: [], big: [] },
                dispatches: [],
                history: []
            });
        }
        try {
            res.json(JSON.parse(data));
        } catch (e) {
            res.status(500).send("Error parsing data");
        }
    });
});

// Save state
app.post('/api/state', (req, res) => {
    const newState = req.body;
    fs.writeFile(DATA_FILE, JSON.stringify(newState, null, 2), (err) => {
        if (err) {
            console.error("Error saving data:", err);
            return res.status(500).send("Error saving data (Filesystem is read-only on Vercel)");
        }
        res.send("State saved successfully");
    });
});

// For local development
if (process.env.NODE_ENV !== 'production' && require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}

module.exports = app;
