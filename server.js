const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingTimeout: 30000,
  pingInterval: 10000,
  connectTimeout: 20000,
  allowEIO3: true,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

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


const rooms = {};

function getRoom(roomId) {
  if (!roomId) roomId = 'default';
  if (!rooms[roomId]) {
    rooms[roomId] = {
      state: {
        players: {}, // socketId -> { name, score }
        revealedWords: {}, // index -> true (which horizontal words are revealed)
        activeQuestion: null, // index of the active question (0-8)
        leaderboard: [],
        currentAnswers: {}, // socketId -> { answer, time }
        verticalBuzzer: {
          locked: false,
          bySocketId: null,
          playerName: null,
          timeoutId: null,
          answerSubmitted: null
        },
        activeQuestionStartTime: 0
      },
      gameLogs: [],
      currentGameId: Object.keys(games)[0] || 'default'
    };
  }
  return rooms[roomId];
}

function addLog(roomId, msg) {
  const room = getRoom(roomId);
  const time = new Date().toLocaleTimeString('vi-VN');
  const logStr = `[${time}] ${msg}`;
  room.gameLogs.push(logStr);
  io.to(roomId).emit('new_log', logStr);
}

function updateLeaderboard(roomId) {
  const room = getRoom(roomId);
  room.state.leaderboard = Object.values(room.state.players).sort((a, b) => b.score - a.score);
  io.to(roomId).emit('update_leaderboard', room.state.leaderboard);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', (data) => {
    const roomId = data.roomId || 'default';
    socket.roomId = roomId;
    socket.join(roomId);

    const room = getRoom(roomId);
    const state = room.state;

    socket.emit('init_state', {
      games: Object.values(games).map(g => ({id: g.id, name: g.name})),
      currentGameId: room.currentGameId,
      activeQuestion: state.activeQuestion,
      questionText: state.activeQuestion !== null ? (games[room.currentGameId] || Object.values(games)[0]).words[state.activeQuestion].question : "",
      revealedWords: state.revealedWords,
      leaderboard: state.leaderboard,
      crosswordLayout: (games[room.currentGameId] || Object.values(games)[0]).words.map((w, i) => ({ length: w.answer.length, index: i, offset: w.offset, verticalIndex: w.verticalIndex })),
      verticalBuzzerLocked: state.verticalBuzzer.locked,
      buzzedPlayer: state.verticalBuzzer.playerName,
      gameLogs: room.gameLogs
    });
  });

  socket.on('join_game', (data) => {
    const roomId = data.roomId || socket.roomId || 'default';
    if (!socket.roomId) {
        socket.roomId = roomId;
        socket.join(roomId);
    }
    
    const room = getRoom(roomId);
    const state = room.state;

    let name = '';
    let playerId = socket.id;

    if (typeof data === 'object') {
       name = data.name.trim();
       playerId = data.playerId;
    } else {
       name = data.trim();
    }

    socket.playerId = playerId;
    socket.join(playerId);

    if (!state.players[playerId]) {
      state.players[playerId] = { name: name, score: 0 };
      addLog(roomId, `👤 Người chơi "${name}" đã tham gia.`);
    } else {
      state.players[playerId].name = name;
    }

    updateLeaderboard(roomId);
    socket.emit('joined', { name: state.players[playerId].name, score: state.players[playerId].score });
  });

  socket.on('submit_answer', (answer) => {
    const roomId = socket.roomId || 'default';
    const room = getRoom(roomId);
    const state = room.state;

    if (state.activeQuestion === null) {
      socket.emit('answer_feedback', { success: false, message: "Chưa có câu hỏi nào được mở." });
      return;
    }
    
    if (state.revealedWords[state.activeQuestion]) {
      socket.emit('answer_feedback', { success: false, message: "Câu hỏi này đã khép lại." });
      return;
    }
    
    state.currentAnswers[socket.playerId] = {
      answer: answer.trim().toUpperCase(),
      time: Date.now()
    };
    const pName = state.players[socket.playerId] ? state.players[socket.playerId].name : "Ẩn danh";
    addLog(roomId, `✍️ ${pName} đã nộp đáp án: "${answer.trim().toUpperCase()}"`);
    
    socket.emit('answer_received', { message: 'Đã lưu đáp án! Cùng nín thở chờ kết quả nhé... 🫣' });
  });
  
  // Vertical Buzzer Logic
  socket.on('buzz_vertical', () => {
    const roomId = socket.roomId || 'default';
    const room = getRoom(roomId);
    const state = room.state;

    if (state.verticalBuzzer.locked) {
      socket.emit('answer_feedback', { success: false, message: "Người khác đã giành quyền!" });
      return;
    }
    
    state.verticalBuzzer.locked = true;
    state.verticalBuzzer.bySocketId = socket.playerId;
    state.verticalBuzzer.playerName = state.players[socket.playerId] ? state.players[socket.playerId].name : "Ẩn danh";
    state.verticalBuzzer.answerSubmitted = null;

    addLog(roomId, `🔔 ${state.verticalBuzzer.playerName} đã bấm chuông giành quyền trả lời từ khóa dọc!`);
    io.to(roomId).emit('buzzer_locked', { playerName: state.verticalBuzzer.playerName });
    socket.emit('buzzer_granted', { timeout: 30, hint: (games[room.currentGameId] || Object.values(games)[0]).verticalAnswerHint });

    state.verticalBuzzer.timeoutId = setTimeout(() => {
      if (state.verticalBuzzer.bySocketId === socket.playerId && !state.verticalBuzzer.answerSubmitted) {
         io.to(roomId).emit('answer_feedback', { success: false, message: `Hết 30 giây! ${state.verticalBuzzer.playerName} chưa kịp trả lời.` });
         state.verticalBuzzer.locked = false;
         state.verticalBuzzer.bySocketId = null;
         state.verticalBuzzer.playerName = null;
         io.to(roomId).emit('buzzer_unlocked');
      }
    }, 30000);
  });

  socket.on('submit_vertical', (answer) => {
     const roomId = socket.roomId || 'default';
     const room = getRoom(roomId);
     const state = room.state;

     if (state.verticalBuzzer.bySocketId !== socket.playerId) return;
     
     if (state.verticalBuzzer.timeoutId) {
        clearTimeout(state.verticalBuzzer.timeoutId);
     }
     
     state.verticalBuzzer.answerSubmitted = answer.trim().toUpperCase();
     addLog(roomId, `🎯 ${state.verticalBuzzer.playerName} chốt hạ từ khóa dọc: "${answer.trim().toUpperCase()}"`);
     socket.emit('answer_received', { message: "Đã nộp bài! Đang chờ Host phán quyết..." });
     
     io.to(roomId).emit('host_vertical_submission', { 
       playerName: state.verticalBuzzer.playerName, 
       answer: state.verticalBuzzer.answerSubmitted 
     });
  });

  socket.on('admin_open_question', (index) => {
    const roomId = socket.roomId || 'default';
    const room = getRoom(roomId);
    const state = room.state;

    state.activeQuestion = index;
    state.currentAnswers = {}; // reset answers for the new question
    state.activeQuestionStartTime = Date.now();
    addLog(roomId, `📖 Host đã mở Câu ${index + 1}`);
    io.to(roomId).emit('new_question', { index, text: (games[room.currentGameId] || Object.values(games)[0]).words[index].question });
  });

  socket.on('admin_reveal_word', (index) => {
    const roomId = socket.roomId || 'default';
    const room = getRoom(roomId);
    const state = room.state;
    const currentGame = games[room.currentGameId] || Object.values(games)[0];

    if (!state.revealedWords[index]) {
      state.revealedWords[index] = true;
      const correctAnswer = currentGame.words[index].answer.toUpperCase();
      let fastestPlayer = null;
      let fastestTime = Infinity;

      if (state.activeQuestion === index) {
        Object.entries(state.currentAnswers).forEach(([playerId, data]) => {
          if (data.answer === correctAnswer) {
            // Correct
            const timeTaken = data.time - state.activeQuestionStartTime;
            if (timeTaken < fastestTime) {
                fastestTime = timeTaken;
                fastestPlayer = state.players[playerId] ? state.players[playerId].name : "Ẩn danh";
            }
            const baseScore = 100;
            const timePenalty = Math.floor((timeTaken / 1000) * 2);
            let earned = baseScore - timePenalty;
            if (earned < 20) earned = 20;

            if (state.players[playerId]) {
              state.players[playerId].score += earned;
            }
            io.to(playerId).emit('question_result', { win: true, earned, score: state.players[playerId].score, message: `Tuyệt Vời! Bạn nộp bài nhanh và được cộng ${earned} điểm! 🎉` });
          } else {
            // Wrong
            io.to(playerId).emit('question_result', { win: false, earned: 0, score: state.players[playerId] ? state.players[playerId].score : 0, message: "Ối giời ơi, sai bét! Chúc bạn may mắn câu sau nhé 🥲" });
          }
        });
      }

      state.activeQuestion = null; // Close question
      state.currentAnswers = {};
      updateLeaderboard(roomId);
      addLog(roomId, `🔓 Host công bố đáp án Câu ${index + 1}: ${correctAnswer} (Nhanh nhất: ${fastestPlayer || 'Không có ai'})`);
      io.to(roomId).emit('word_revealed', { index, word: currentGame.words[index].answer, winner: fastestPlayer || "Quá chậm hoặc Không ai đúng" });
    }
  });

  socket.on('admin_resolve_vertical', () => {
      const roomId = socket.roomId || 'default';
      const room = getRoom(roomId);
      const state = room.state;
      const currentGame = games[room.currentGameId] || Object.values(games)[0];

      const isCorrect = (state.verticalBuzzer.answerSubmitted === currentGame.verticalAnswerValue);
      if (isCorrect) {
          addLog(roomId, `🏆 XUẤT SẮC! ${state.verticalBuzzer.playerName} đã trả lời ĐÚNG từ khóa dọc!`);
          io.to(roomId).emit('vertical_winner', {
             playerName: state.verticalBuzzer.playerName,
             answer: state.verticalBuzzer.answerSubmitted,
             correctWord: currentGame.verticalAnswerValue
          });
      } else {
          addLog(roomId, `❌ Rất tiếc! ${state.verticalBuzzer.playerName} đã trả lời SAI từ khóa dọc.`);
          io.to(roomId).emit('vertical_wrong', { playerName: state.verticalBuzzer.playerName });
          io.to(roomId).emit('answer_feedback', { success: false, message: `Oài! Khán giả ${state.verticalBuzzer.playerName} chốt hạ sai rồi. Chuông giành quyền đã mở lại nhé!` });
          state.verticalBuzzer.locked = false;
          state.verticalBuzzer.bySocketId = null;
          state.verticalBuzzer.playerName = null;
          state.verticalBuzzer.answerSubmitted = null;
          io.to(roomId).emit('buzzer_unlocked');
      }
  });

  socket.on('admin_select_game', (gameId) => {
    const roomId = socket.roomId || 'default';
    const room = getRoom(roomId);

    if (games[gameId]) {
      room.currentGameId = gameId;
      room.state.players = {};
      room.state.revealedWords = {};
      room.state.activeQuestion = null;
      room.state.leaderboard = [];
      room.state.currentAnswers = {};
      room.state.verticalBuzzer = { locked: false, bySocketId: null, playerName: null, timeoutId: null, answerSubmitted: null };
      updateLeaderboard(roomId);
      addLog(roomId, `🔄 Đã chuyển sang trò chơi mới: ${games[gameId].name}`);
      
      const currentGame = games[room.currentGameId];
      io.to(roomId).emit('game_reset', { newLayout: currentGame.words.map((w, i) => ({ length: w.answer.length, index: i, offset: w.offset, verticalIndex: w.verticalIndex })) });
      io.to(roomId).emit('init_state', {
        games: Object.values(games).map(g => ({id: g.id, name: g.name})),
        currentGameId: room.currentGameId,
        activeQuestion: room.state.activeQuestion,
        questionText: "",
        revealedWords: room.state.revealedWords,
        leaderboard: room.state.leaderboard,
        crosswordLayout: currentGame.words.map((w, i) => ({ length: w.answer.length, index: i, offset: w.offset, verticalIndex: w.verticalIndex })),
        verticalBuzzerLocked: room.state.verticalBuzzer.locked,
        buzzedPlayer: room.state.verticalBuzzer.playerName,
        gameLogs: room.gameLogs
      });
    }
  });

  socket.on('admin_upload_game', (gameData) => {
    const roomId = socket.roomId || 'default';
    const room = getRoom(roomId);

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
      room.currentGameId = safeId;
      
      // Reset state
      room.state.players = {};
      room.state.revealedWords = {};
      room.state.activeQuestion = null;
      room.state.leaderboard = [];
      room.state.currentAnswers = {};
      room.state.verticalBuzzer = { locked: false, bySocketId: null, playerName: null, timeoutId: null, answerSubmitted: null };
      updateLeaderboard(roomId);
      
      addLog(roomId, `📤 Host đã tải lên và chuyển sang trò chơi mới: ${gameData.name}`);
      
      const currentGame = games[room.currentGameId];
      io.to(roomId).emit('game_reset', { newLayout: currentGame.words.map((w, i) => ({ length: w.answer.length, index: i, offset: w.offset, verticalIndex: w.verticalIndex })) });
      io.to(roomId).emit('init_state', {
        games: Object.values(games).map(g => ({id: g.id, name: g.name})),
        currentGameId: room.currentGameId,
        activeQuestion: room.state.activeQuestion,
        questionText: "",
        revealedWords: room.state.revealedWords,
        leaderboard: room.state.leaderboard,
        crosswordLayout: currentGame.words.map((w, i) => ({ length: w.answer.length, index: i, offset: w.offset, verticalIndex: w.verticalIndex })),
        verticalBuzzerLocked: room.state.verticalBuzzer.locked,
        buzzedPlayer: room.state.verticalBuzzer.playerName,
        gameLogs: room.gameLogs
      });
    } catch (e) {
      console.error("Error uploading game:", e);
    }
  });

  socket.on('admin_reset_game', () => {
    const roomId = socket.roomId || 'default';
    const room = getRoom(roomId);

    room.state.players = {};
    room.state.revealedWords = {};
    room.state.activeQuestion = null;
    room.state.leaderboard = [];
    room.state.currentAnswers = {};
    room.state.verticalBuzzer = { locked: false, bySocketId: null, playerName: null, timeoutId: null, answerSubmitted: null };
    updateLeaderboard(roomId);
    addLog(roomId, `🔄 Trò chơi đã được reset (Bắt đầu lại từ đầu)`);
    io.to(roomId).emit('game_reset');
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});


const os = require('os');
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIpAddress();
  console.log(`Crossword server listening on http://${ip}:${PORT}`);
});
