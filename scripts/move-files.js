const fs = require('fs');
const path = require('path');

const root = process.cwd();
const src = path.join(root, 'IMG-20260428-WA0160.jpg');
const destDir = path.join(root, 'public');
const dest = path.join(destDir, 'IMG-20260428-WA0160.jpg');

(async () => {
  try {
    if (!fs.existsSync(src)) {
      console.log('Source image not found at', src);
      process.exit(0);
    }
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.renameSync(src, dest);
    console.log('Moved image to', dest);
  } catch (err) {
    console.error('Failed to move image:', err);
    process.exit(1);
  }
})();
