const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Initialize data.json if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
        bins: { small: [], big: [] },
        dispatches: [],
        history: []
    }));
}

// Get state
app.get('/api/state', (req, res) => {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading data:", err);
            return res.status(500).send("Error reading data");
        }
        res.json(JSON.parse(data));
    });
});

// Save state
app.post('/api/state', (req, res) => {
    const newState = req.body;
    fs.writeFile(DATA_FILE, JSON.stringify(newState, null, 2), (err) => {
        if (err) {
            console.error("Error saving data:", err);
            return res.status(500).send("Error saving data");
        }
        res.send("State saved successfully");
    });
});

// For local development
if (process.env.NODE_ENV !== 'production' && require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log(`Shared access available at http://192.168.2.2:${PORT}`);
    });
}

module.exports = app;
