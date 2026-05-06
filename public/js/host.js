const socket = io();

// DOM
const boardEl = document.getElementById('crossword-board');
const leaderboardEl = document.getElementById('leaderboard');
const qGrid = document.getElementById('question-grid');
const btnOpen = document.getElementById('btn-open');
const btnReveal = document.getElementById('btn-reveal');
const btnNext = document.getElementById('btn-next');
const btnReset = document.getElementById('btn-reset');
const hintBox = document.getElementById('host-hint-box');
const hintNumber = document.getElementById('host-hint-number');
const hintText = document.getElementById('host-hint-text');
const hintName = document.getElementById('host-hint-name');
const hintStatus = document.getElementById('host-hint-status');

const hostVerticalModal = document.getElementById('host-vertical-modal');
const hostVerticalMsg = document.getElementById('host-vertical-msg');
const btnVerticalReveal = document.getElementById('btn-vertical-reveal');

// Generic Alert Modal
const hostAlertModal = document.getElementById('host-alert-modal');
const hostAlertBox = document.getElementById('host-alert-box');
const hostAlertTitle = document.getElementById('host-alert-title');
const hostAlertMsg = document.getElementById('host-alert-msg');
const btnCloseAlert = document.getElementById('btn-close-alert');

btnCloseAlert.addEventListener('click', () => {
   hostAlertModal.style.display = 'none';
});

function showHostAlert(title, msg, isWin) {
   hostAlertTitle.innerHTML = title;
   hostAlertMsg.innerHTML = msg;
   if(isWin) {
      hostAlertBox.className = "result-box glass-panel win";
      btnCloseAlert.className = "btn-primary";
   } else {
      hostAlertBox.className = "result-box glass-panel lose";
      btnCloseAlert.className = "btn-danger";
   }
   hostAlertModal.style.display = 'flex';
}

let cwLayout = [];
let rvWords = {};
let currentSelectedQuestion = 0;

function updateQuestionSelection(idx) {
   currentSelectedQuestion = idx;
   document.querySelectorAll('.question-circle').forEach(c => {
       c.classList.remove('active');
       if (parseInt(c.dataset.index) === idx) {
           c.classList.add('active');
       }
   });

   // Highlight dòng tương ứng trên bảng crossword
   document.querySelectorAll('.crossword-row').forEach(r => r.classList.remove('active'));
   const selectedRow = document.getElementById(`row-${idx}`);
   if (selectedRow) {
       selectedRow.classList.add('active');
   }
}

function renderBoard(layout, revealed) {
  boardEl.innerHTML = "";
  qGrid.innerHTML = "";
  
  const maxCells = Math.max(...layout.map(r => r.offset + r.length));
  
  layout.forEach((row, index) => {
    const circle = document.createElement('div');
    circle.className = 'question-circle';
    circle.dataset.index = row.index;
    circle.textContent = row.index + 1;
    if (revealed[row.index]) {
       circle.classList.add('opened');
    }
    circle.addEventListener('click', () => {
       if (!rvWords[row.index]) {
           updateQuestionSelection(row.index);
       }
    });
    qGrid.appendChild(circle);

    const rowEl = document.createElement('div');
    rowEl.className = 'crossword-row';
    rowEl.id = `row-${row.index}`;
    
    // Add row number
    const rowNum = document.createElement('div');
    rowNum.className = 'row-number';
    rowNum.textContent = row.index + 1;
    rowEl.appendChild(rowNum);

    // Check if revealed
    if (revealed[row.index]) {
      rowEl.classList.add('opened');
    }

    // pre-padding
    for (let i = 0; i < row.offset; i++) {
        const padding = document.createElement('div');
        padding.className = 'crossword-cell padding-cell';
        rowEl.appendChild(padding);
    }

    for (let i = 0; i < row.length; i++) {
      const cell = document.createElement('div');
      cell.className = 'crossword-cell';
      if (i === row.verticalIndex) {
        cell.classList.add('vertical-highlight');
      }
      cell.id = `cell-${row.index}-${i}`;
      rowEl.appendChild(cell);
    }
    
    // post-padding
    const trailing = maxCells - (row.offset + row.length);
    for (let i = 0; i < trailing; i++) {
        const padding = document.createElement('div');
        padding.className = 'crossword-cell padding-cell';
        rowEl.appendChild(padding);
    }
    
    boardEl.appendChild(rowEl);
  });
}

function updateLeaderboard(players) {
  leaderboardEl.innerHTML = "";
  players.slice(0, 10).forEach((p, idx) => {
    const li = document.createElement('li');
    li.className = 'leaderboard-item';
    li.innerHTML = `
      <span class="rank">#${idx + 1}</span>
      <span class="name">${p.name}</span>
      <span class="total">${p.score}</span>
    `;
    leaderboardEl.appendChild(li);
  });
}

function openWord(index, wordText) {
  const rowEl = document.getElementById(`row-${index}`);
  if (!rowEl) return;
  rowEl.classList.add('opened');
  
  // Fill text
  for (let i = 0; i < wordText.length; i++) {
    const cell = document.getElementById(`cell-${index}-${i}`);
    if (cell) {
      setTimeout(() => {
        cell.textContent = wordText[i];
      }, i * 150); // cascading flip effect
    }
  }
}

// Socket events
let selectorInit = false;
socket.on('init_state', (state) => {
  cwLayout = state.crosswordLayout;
  rvWords = state.revealedWords;
  
  const gameSelector = document.getElementById('game-selector');
  if (gameSelector && state.games) {
    gameSelector.innerHTML = '';
    state.games.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      gameSelector.appendChild(opt);
    });
    gameSelector.value = state.currentGameId;

    if (!selectorInit) {
      gameSelector.addEventListener('change', (e) => {
        if (confirm("Chuyển trò chơi sẽ làm mới lại bàn cờ và xóa điểm số hiện tại. Tiếp tục?")) {
          socket.emit('admin_select_game', e.target.value);
        } else {
          e.target.value = state.currentGameId;
        }
      });
      selectorInit = true;
    }
  }

  renderBoard(cwLayout, rvWords);
  updateLeaderboard(state.leaderboard);
  
  const logsContainer = document.getElementById('logs-container');
  if (state.gameLogs && logsContainer) {
    logsContainer.innerHTML = '';
    state.gameLogs.forEach(log => {
      const p = document.createElement('div');
      p.textContent = log;
      p.style.marginBottom = '8px';
      p.style.borderBottom = '1px dashed rgba(255,255,255,0.2)';
      p.style.paddingBottom = '8px';
      logsContainer.appendChild(p);
    });
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }
  
  // Set initial selected question
  if (state.activeQuestion !== null) {
      updateQuestionSelection(state.activeQuestion);
  } else {
      updateQuestionSelection(0);
  }
  
  // Backfill revealed words if we lost state connection but reconnected
  // Not getting the word text here unless we ask server, but let's assume Host doesn't refresh mid-game.
  if (state.activeQuestion !== null) {
    document.getElementById(`row-${state.activeQuestion}`).classList.add('active');
    const wordLen = cwLayout[state.activeQuestion].length;
    hintNumber.textContent = `Câu ${state.activeQuestion + 1}`;
    const hintLength = document.getElementById('host-hint-length');
    if (hintLength) hintLength.textContent = `${wordLen} chữ cái`;
    
    const textLen = state.questionText.length;
    hintText.style.fontSize = textLen < 60 ? '2.2rem' : (textLen < 100 ? '1.7rem' : '1.4rem');
    hintText.textContent = state.questionText;
    
    hintBox.style.display = 'flex';
  } else {
    hintBox.style.display = 'none';
  }

  // Ẩn QR code nếu game đã bắt đầu (có câu hỏi đang mở hoặc đã có từ được lật)
  if (state.activeQuestion !== null || Object.keys(state.revealedWords).length > 0) {
      const qrContainer = document.getElementById('qr-container');
      if (qrContainer) qrContainer.style.display = 'none';
  }
});

socket.on('update_leaderboard', (players) => {
  updateLeaderboard(players);
});

socket.on('new_question', (data) => {
  if(window.SoundManager) window.SoundManager.playOpen();
  // clear previous active
  document.querySelectorAll('.crossword-row.active').forEach(r => r.classList.remove('active'));
  
  const row = document.getElementById(`row-${data.index}`);
  if (row) {
    row.classList.add('active');
  }
  
  updateQuestionSelection(data.index);
  
  const wordLen = cwLayout[data.index].length;
  hintNumber.textContent = `Câu ${data.index + 1}`;
  const hintLength = document.getElementById('host-hint-length');
  if (hintLength) hintLength.textContent = `${wordLen} chữ cái`;
  
  const textLen = data.text.length;
  hintText.style.fontSize = textLen < 60 ? '2.2rem' : (textLen < 100 ? '1.7rem' : '1.4rem');
  hintText.textContent = data.text;
  
  hintBox.style.display = 'flex';

  // Ẩn QR code khi bắt đầu mở câu hỏi
  const qrContainer = document.getElementById('qr-container');
  if (qrContainer) qrContainer.style.display = 'none';
});

socket.on('word_revealed', (data) => {
  if(window.SoundManager) window.SoundManager.playCorrect();
  rvWords[data.index] = true;
  document.querySelectorAll('.crossword-row.active').forEach(r => r.classList.remove('active'));
  
  const circle = document.querySelector(`.question-circle[data-index="${data.index}"]`);
  if(circle) {
     circle.classList.remove('active');
     circle.classList.add('opened');
  }
  
  hintBox.style.display = 'none';
  openWord(data.index, data.word);
});

socket.on('game_reset', () => {
  window.location.reload();
});

// Vertical Buzzer Admin Sockets
socket.on('host_vertical_submission', (data) => {
   if(window.SoundManager) window.SoundManager.playBuzzer();
   hostVerticalMsg.innerHTML = `Khán giả <strong>${data.playerName}</strong> đã tự tin nộp đáp án Chốt Hạ!`;
   hostVerticalModal.style.display = 'flex';
});

socket.on('vertical_wrong', (data) => {
   if(window.SoundManager) window.SoundManager.playWrong();
   showHostAlert("❌ RẤT TIẾC ❌", `Khán giả <strong>${data.playerName.toUpperCase()}</strong> đã trả lời SAI từ khóa dọc gốc.<br/><br/>Hãy kêu gọi khán giả khác tiếp tục giật chuông!`, false);
});

socket.on('buzzer_unlocked', () => {
   hostVerticalModal.style.display = 'none';
});

socket.on('vertical_winner', (data) => {
   if(window.SoundManager) window.SoundManager.playWin();
   showHostAlert("🎉 BÙM BÙM BÙM 🎉", `CHÚC MỪNG <strong>${data.playerName.toUpperCase()}</strong> ĐÃ XUẤT SẮC TÌM RA TỪ KHÓA <br/><h1 style="color: #00f0ff; margin-top: 10px;">${data.correctWord}</h1>`, true);
   
   hostVerticalModal.style.display = 'none';
   // Highlight properties
   for(let i=0; i<data.correctWord.length; i++) {
        const row = document.getElementById(`row-${i}`);
        if(row) {
             const hlCell = row.querySelector('.vertical-highlight');
             if(hlCell) {
                  hlCell.style.color = '#0f172a';
                  hlCell.textContent = data.correctWord[i];
                  hlCell.style.backgroundColor = '#00f0ff';
                  hlCell.style.borderColor = '#fff';
                  hlCell.style.boxShadow = '0 0 40px #00f0ff';
             }
        }
   }
});

// Admin Events
btnVerticalReveal.addEventListener('click', () => {
    if (window.SoundManager) window.SoundManager.playPop();
    socket.emit('admin_resolve_vertical');
});

btnReset.addEventListener('click', () => {
  if(confirm("CẢNH BÁO: Xóa toàn bộ điểm số hiện tại, đuổi toàn bộ người chơi và làm lại màn ô chữ từ đầu?")) {
    if (window.SoundManager) window.SoundManager.playPop();
    socket.emit('admin_reset_game');
  }
});

btnNext.addEventListener('click', () => {
  let nextIdx = -1;
  const currentVal = currentSelectedQuestion;
  
  // Find next unrevealed from current+1
  for(let i = currentVal + 1; i < cwLayout.length; i++) {
    if(!rvWords[i]) {
      nextIdx = i;
      break;
    }
  }
  // Wrap around
  if(nextIdx === -1) {
    for(let i = 0; i < currentVal; i++) {
      if(!rvWords[i]) {
        nextIdx = i;
        break;
      }
    }
  }
  
  if(nextIdx !== -1) {
    updateQuestionSelection(nextIdx);
    socket.emit('admin_open_question', nextIdx);
  } else {
    showHostAlert("⚠️ THÔNG BÁO", "Tất cả các câu hỏi đã được mở!", false);
  }
});

btnOpen.addEventListener('click', () => {
  if (window.SoundManager) window.SoundManager.playPop();
  socket.emit('admin_open_question', currentSelectedQuestion);
});

btnReveal.addEventListener('click', () => {
  if (window.SoundManager) window.SoundManager.playPop();
  socket.emit('admin_reveal_word', currentSelectedQuestion);
});

// --- Menu & Logs Logic ---
const btnMenu = document.getElementById('btn-menu');
const menuDropdown = document.getElementById('menu-dropdown');
const btnViewLogs = document.getElementById('btn-view-logs');
const logsModal = document.getElementById('logs-modal');
const btnCloseLogs = document.getElementById('btn-close-logs');
const logsContainer = document.getElementById('logs-container');

if(btnMenu) {
  btnMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.style.display = menuDropdown.style.display === 'flex' ? 'none' : 'flex';
  });
}

document.addEventListener('click', () => {
  if(menuDropdown) menuDropdown.style.display = 'none';
});

if(btnViewLogs) {
  btnViewLogs.addEventListener('click', () => {
    logsModal.style.display = 'flex';
  });
}

if(btnCloseLogs) {
  btnCloseLogs.addEventListener('click', () => {
    logsModal.style.display = 'none';
  });
}

socket.on('new_log', (logStr) => {
  if (!logsContainer) return;
  const p = document.createElement('div');
  p.textContent = logStr;
  p.style.marginBottom = '8px';
  p.style.borderBottom = '1px dashed rgba(255,255,255,0.2)';
  p.style.paddingBottom = '8px';
  logsContainer.appendChild(p);
  logsContainer.scrollTop = logsContainer.scrollHeight;
});

// Download and Upload Game Logic
const btnDownloadSample = document.getElementById('btn-download-sample');
if(btnDownloadSample) {
  btnDownloadSample.addEventListener('click', () => {
    window.location.href = '/api/sample';
  });
}

const btnUploadGame = document.getElementById('btn-upload-game');
const fileUploadGame = document.getElementById('file-upload-game');

if(btnUploadGame && fileUploadGame) {
  btnUploadGame.addEventListener('click', () => {
    fileUploadGame.click();
  });

  fileUploadGame.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const gameData = JSON.parse(evt.target.result);
        if(!gameData.id || !gameData.name || !gameData.words) {
          alert('Cấu trúc file JSON không hợp lệ! Vui lòng kiểm tra lại.');
          return;
        }
        if(confirm(`Bạn có chắc chắn muốn tải lên và chuyển sang trò chơi: ${gameData.name}?`)) {
          socket.emit('admin_upload_game', gameData);
        }
      } catch (err) {
        alert('Lỗi khi đọc file JSON. Vui lòng đảm bảo file đúng định dạng.');
      }
      fileUploadGame.value = ''; // reset
    };
    reader.readAsText(file);
  });
}
