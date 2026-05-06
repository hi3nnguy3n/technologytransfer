const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf-8');

// Replace static data with dynamic game loading
const staticDataRegex = /const verticalAnswerValue = "CHUYENGIAO";[\s\S]*?];/g;
const dynamicData = `
const fs = require('fs');
let games = {};
try {
  const dataDir = path.join(__dirname, 'data');
  if (fs.existsSync(dataDir)) {
    const files = fs.readdirSync(dataDir);
    for (const f of files) {
      if (f.endsWith('.json')) {
        const g = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));
        games[g.id] = g;
      }
    }
  }
} catch (e) {
  console.error("Error loading games:", e);
}

if (Object.keys(games).length === 0) {
  games['default'] = { id: 'default', name: 'Mặc định', verticalAnswerValue: '', verticalAnswerHint: '', words: [] };
}

let currentGameId = Object.keys(games)[0];
function getGame() {
  return games[currentGameId] || Object.values(games)[0];
}
`;
content = content.replace(staticDataRegex, dynamicData);

// Replace variables
content = content.replace(/words\[/g, 'getGame().words[');
content = content.replace(/words\.map/g, 'getGame().words.map');
content = content.replace(/verticalAnswerValue/g, 'getGame().verticalAnswerValue');
content = content.replace(/verticalAnswerHint/g, 'getGame().verticalAnswerHint');

// Add socket handlers to get and select game
const initRegex = /socket\.emit\('init_state', \{/g;
content = content.replace(initRegex, `socket.emit('init_state', {
    games: Object.values(games).map(g => ({id: g.id, name: g.name})),
    currentGameId: currentGameId,`);

const resetRegex = /socket\.on\('admin_reset_game', \(\) => \{/;
content = content.replace(resetRegex, `socket.on('admin_select_game', (gameId) => {
    if (games[gameId]) {
      currentGameId = gameId;
      state.players = {};
      state.revealedWords = {};
      state.activeQuestion = null;
      state.leaderboard = [];
      state.currentAnswers = {};
      state.verticalBuzzer = { locked: false, bySocketId: null, playerName: null, timeoutId: null, answerSubmitted: null };
      updateLeaderboard();
      addLog(\`🔄 Đã chuyển sang trò chơi mới: \${games[gameId].name}\`);
      io.emit('game_reset', { newLayout: getGame().words.map((w, i) => ({ length: w.answer.length, index: i, offset: w.offset, verticalIndex: w.verticalIndex })) });
      io.emit('init_state', {
        games: Object.values(games).map(g => ({id: g.id, name: g.name})),
        currentGameId: currentGameId,
        activeQuestion: state.activeQuestion,
        questionText: "",
        revealedWords: state.revealedWords,
        leaderboard: state.leaderboard,
        crosswordLayout: getGame().words.map((w, i) => ({ length: w.answer.length, index: i, offset: w.offset, verticalIndex: w.verticalIndex })),
        verticalBuzzerLocked: state.verticalBuzzer.locked,
        buzzedPlayer: state.verticalBuzzer.playerName,
        gameLogs: gameLogs
      });
    }
  });

  socket.on('admin_reset_game', () => {`);

// Also fix the const fs = require('fs') duplicate if it exists at top (we just added it, it's fine).

fs.writeFileSync('server.js', content);
console.log("Done");
