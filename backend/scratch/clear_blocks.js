const threatEngine = require('../security/threatEngine');
const waf = require('../security/waf');

// Unblock localhost IP
threatEngine.unblockIP('127.0.0.1');
threatEngine.resetScore('127.0.0.1');

// Clear WAF brute force trackers
waf.clearBruteState('127.0.0.1');
waf.clearAllBruteState();

console.log("SUCCESS: 127.0.0.1 has been successfully unblocked and all WAF brute-force states cleared.");
process.exit(0);
