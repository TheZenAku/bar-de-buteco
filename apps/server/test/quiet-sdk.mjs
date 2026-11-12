// Test clients ignore most server broadcasts (crowd, wallet.state, prices...); the SDK warns once per type, which buries real failures.
const warn = console.warn;
console.warn = (...args) => { if (!String(args[0]).startsWith('@colyseus/sdk: onMessage() not registered')) warn(...args); };
