const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'attacks.json');

try {
    if (fs.existsSync(LOG_FILE)) {
        const logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
        console.log(`Total log entries: ${logs.length}`);
        console.log('\n--- LATEST 10 ENTRIES ---');
        console.log(JSON.stringify(logs.slice(-10), null, 2));
    } else {
        console.log('Log file attacks.json does not exist.');
    }
} catch (err) {
    console.error('Error reading log file:', err);
}
