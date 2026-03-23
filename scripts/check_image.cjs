const fs = require('fs');
const path = require('path');

// Simple PNG dimension reader
function getPngDimensions(filePath) {
    const buffer = fs.readFileSync(filePath);
    if (buffer.toString('utf8', 1, 4) !== 'PNG') {
        throw new Error('Not a PNG file');
    }
    const width = buffer.readInt32BE(16);
    const height = buffer.readInt32BE(20);
    return { width, height };
}

try {
    const faviconPath = path.join(process.cwd(), 'public', 'Favicon.png');
    const dimensions = getPngDimensions(faviconPath);
    console.log(`Favicon dimensions: ${dimensions.width}x${dimensions.height}`);
} catch (err) {
    console.error('Error reading favicon:', err.message);
}
