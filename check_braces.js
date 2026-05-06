const fs = require('fs');
const code = fs.readFileSync('server.js', 'utf-8');
let open = 0;
const lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    if (line[j] === '{') open++;
    if (line[j] === '}') open--;
  }
  if (open < 0) {
    console.log("Negative at line", i + 1, ":", line);
    break;
  }
}
console.log("Final count:", open);
