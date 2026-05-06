const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf-8');

// Add /api/sample
const appUseRegex = /app\.use\(express\.json\(\)\);/g;
if(!content.includes("app.get('/api/sample'")) {
  content = content.replace(appUseRegex, `app.use(express.json());

app.get('/api/sample', (req, res) => {
  const filePath = path.join(__dirname, 'data', 'technology_transfer.json');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'sample_game.json');
  } else {
    // If not exists, return the default structure
    res.json({
      "id": "new_game",
      "name": "Game Mới",
      "verticalAnswerValue": "TUKHOA",
      "verticalAnswerHint": "Gợi ý từ khóa dọc...",
      "words": [
        { "answer": "DAPAN1", "question": "Câu hỏi 1...", "offset": 0, "verticalIndex": 0 }
      ]
    });
  }
});
`);
}

// Add admin_upload_game handler
const uploadHandlerRegex = /socket\.on\('admin_reset_game', \(\) => \{/;
if(!content.includes("socket.on('admin_upload_game'")) {
  content = content.replace(uploadHandlerRegex, `socket.on('admin_upload_game', (gameData) => {
    try {
      const dataDir = path.join(__dirname, 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
      }
      // Basic sanitization of ID
      const safeId = gameData.id.replace(/[^a-zA-Z0-9_-]/g, '');
      if(!safeId) return;
      gameData.id = safeId;
      
      const filePath = path.join(dataDir, safeId + '.json');
      fs.writeFileSync(filePath, JSON.stringify(gameData, null, 2));
      
      games[safeId] = gameData;
      currentGameId = safeId;
      
      // Reset state
      state.players = {};
      state.revealedWords = {};
      state.activeQuestion = null;
      state.leaderboard = [];
      state.currentAnswers = {};
      state.verticalBuzzer = { locked: false, bySocketId: null, playerName: null, timeoutId: null, answerSubmitted: null };
      updateLeaderboard();
      
      addLog(\`📤 Host đã tải lên và chuyển sang trò chơi mới: \${gameData.name}\`);
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
    } catch (e) {
      console.error("Error uploading game:", e);
    }
  });

  socket.on('admin_reset_game', () => {`);
}

fs.writeFileSync('server.js', content);
console.log("Updated server.js");
