// public/js/sounds.js
let audioCtx;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// Ensure audio context is allowed by user interaction
document.addEventListener('click', initAudio, { once: false });
document.addEventListener('touchstart', initAudio, { once: false });

const epicMusic = new Audio('/SonicDrive(SonicXJapaneseversion).mp3');
let epicTimeout = null;

function playEpicSegment(startTime, duration) {
  try {
    if (epicTimeout) clearTimeout(epicTimeout);
    epicMusic.currentTime = startTime;
    epicMusic.volume = 0.6;
    epicMusic.play().catch(e => console.warn('Audio play failed', e));
    
    // Tự động dừng sau duration
    epicTimeout = setTimeout(() => {
      epicMusic.pause();
    }, duration * 1000);
  } catch(e) {
    console.warn(e);
  }
}

const SoundManager = {
  playTone: function(freq, type, duration, vol=0.1) {
    try {
      if (!audioCtx) initAudio();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      
      gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch(e) {
      console.warn('Audio play failed', e);
    }
  },

  playMelody: function(notes, baseType='square') {
    try {
      if (!audioCtx) initAudio();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      
      const _this = this;
      let delay = 0;
      notes.forEach(note => {
        if (note.freq > 0) {
          setTimeout(() => {
            // Chơi nốt chính (square) và nốt phụ (sawtooth) để tạo tiếng kèn
            _this.playTone(note.freq, baseType, note.duration, 0.15);
            _this.playTone(note.freq * 1.005, 'sawtooth', note.duration, 0.1);
          }, delay * 1000);
        }
        delay += note.duration;
      });
    } catch(e) {
      console.warn('Melody play failed', e);
    }
  },

  playCorrect: function() {
    // Triumphant short fanfare (C5 - E5 - G5)
    this.playMelody([
      { freq: 523.25, duration: 0.12 }, 
      { freq: 659.25, duration: 0.12 }, 
      { freq: 783.99, duration: 0.40 }
    ]);
  },

  playWrong: function() {
    this.playTone(200, 'sawtooth', 0.2, 0.2);
    setTimeout(() => this.playTone(150, 'sawtooth', 0.4, 0.2), 150);
  },
  
  playPop: function() {
    this.playTone(800, 'sine', 0.05, 0.1);
  },
  
  playOpen: function() {
    this.playTone(400, 'sine', 0.1, 0.2);
    setTimeout(() => this.playTone(600, 'sine', 0.3, 0.2), 100);
  },

  playWin: function() {
    // Phá Đảo (từ khóa dọc): Phát đoạn hào hùng dài hơn
    // Thay đổi startTime (giây) và duration (giây) cho phù hợp đoạn bạn muốn cắt
    playEpicSegment(12.0, 8.0); // Phát từ giây 12, kéo dài 8 giây
  },
  
  playBuzzer: function() {
    this.playTone(400, 'square', 0.2, 0.2);
    setTimeout(() => this.playTone(400, 'square', 0.4, 0.2), 250);
  }
};
window.SoundManager = SoundManager;
