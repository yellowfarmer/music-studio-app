const audioPlayer = document.getElementById('audioPlayer');
const seekBar = document.getElementById('seekBar');
const volumeBar = document.getElementById('volumeBar');
const playPauseBtn = document.getElementById('playPauseBtn');
const recordBtn = document.getElementById('recordBtn');
const statusText = document.getElementById('statusText');
const noteName = document.getElementById('noteName');
const freqValue = document.getElementById('freqValue');
const gaugeNeedle = document.getElementById('gaugeNeedle');
const songUpload = document.getElementById('songUpload');
const songTitle = document.querySelector('.song-title');

let mediaRecorder;
let audioChunks = [];
let micStream = null;
let audioContext = null;
let analyserNode = null;
let tunerRunning = false;
let recordedBlob = null;
let isRecording = false;

const noteMap = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
];

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function setStatus(message) {
  statusText.textContent = message;
}

function loadAudioFile(file) {
  if (!file || !file.type.startsWith('audio/')) {
    setStatus('فایل صوتی معتبر انتخاب کنید.');
    return;
  }

  const url = URL.createObjectURL(file);
  audioPlayer.src = url;
  audioPlayer.load();
  songTitle.textContent = `رویشا، صدا: ${file.name}`;
  setStatus(`فایل ${file.name} بارگذاری شد و آماده پخش است.`);
  playPauseBtn.textContent = '⏸';
}

songUpload.addEventListener('change', (event) => {
  const [file] = event.target.files;
  loadAudioFile(file);
});

playPauseBtn.addEventListener('click', () => {
  if (!audioPlayer.src) {
    setStatus('ابتدا یک فایل صوتی انتخاب کنید.');
    return;
  }

  if (audioPlayer.paused) {
    audioPlayer.play();
    playPauseBtn.textContent = '⏸';
    setStatus('در حال پخش آهنگ انتخاب‌شده.');
  } else {
    audioPlayer.pause();
    playPauseBtn.textContent = '▶';
    setStatus('پخش متوقف شد.');
  }
});

audioPlayer.addEventListener('timeupdate', () => {
  const duration = audioPlayer.duration || 0;
  const progress = duration ? (audioPlayer.currentTime / duration) * 100 : 0;
  seekBar.value = progress;
  const current = formatTime(audioPlayer.currentTime);
  const total = formatTime(duration);
  document.querySelector('.time-left').textContent = current;
  document.querySelector('.time-right').textContent = total;
});

seekBar.addEventListener('input', () => {
  if (!audioPlayer.duration) return;
  audioPlayer.currentTime = (seekBar.value / 100) * audioPlayer.duration;
});

volumeBar.addEventListener('input', () => {
  audioPlayer.volume = Number(volumeBar.value) / 100;
});

async function startRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus('مرورگر شما از ضبط صدا پشتیبانی نمی‌کند.');
    return;
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(micStream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = () => {
      recordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const recordedUrl = URL.createObjectURL(recordedBlob);
      audioPlayer.src = recordedUrl;
      audioPlayer.load();
      songTitle.textContent = 'رویشا، صدا: ضبط صوت کاربر';
      setStatus('ضبط صدا ذخیره شد و آماده پخش است.');
      playPauseBtn.textContent = '⏸';
      if (micStream) {
        micStream.getTracks().forEach((track) => track.stop());
      }
    };

    mediaRecorder.start();
    isRecording = true;
    recordBtn.style.background = 'rgba(217, 109, 93, 0.12)';
    recordBtn.textContent = '■';
    setStatus('در حال ضبط صدای شما... برای توقف، دوباره روی دکمه فشار دهید.');
  } catch (error) {
    setStatus('دسترسی به میکروفون رد شد. لطفاً اجازه میکروفون را فعال کنید.');
  }
}

function stopRecording() {
  if (!mediaRecorder || !isRecording) return;
  mediaRecorder.stop();
  isRecording = false;
  recordBtn.textContent = '◉';
  recordBtn.style.background = 'rgba(58, 143, 133, 0.06)';
}

recordBtn.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

function frequencyToNote(frequency) {
  if (!Number.isFinite(frequency) || frequency <= 0) return { note: 'A4', cents: 0, frequency };

  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  const noteNumber = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const note = `${noteMap[noteNumber]}${octave}`;
  const reference = 440 * Math.pow(2, (midi - 69) / 12);
  const cents = Math.round(((frequency - reference) / reference) * 100);
  return { note, cents, frequency };
}

function updateTunerDisplay(frequency) {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    noteName.textContent = 'A4';
    freqValue.textContent = '440.0 Hz';
    gaugeNeedle.style.transform = 'translate(-50%, -50%) rotate(0deg)';
    return;
  }

  const { note, cents } = frequencyToNote(frequency);
  noteName.textContent = note;
  freqValue.textContent = `${frequency.toFixed(1)} Hz`;

  const rotation = Math.max(-45, Math.min(45, cents * 0.7));
  gaugeNeedle.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
}

function updateMicPitch() {
  if (!tunerRunning || !analyserNode) return;

  const bufferLength = analyserNode.fftSize;
  const data = new Float32Array(bufferLength);
  analyserNode.getFloatTimeDomainData(data);

  let sum = 0;
  let index = 0;
  let maximum = -Infinity;
  let maxIndex = 0;

  for (let i = 0; i < data.length; i += 1) {
    const value = data[i];
    sum += value * value;
    if (value > maximum) {
      maximum = value;
      maxIndex = i;
    }
  }

  const rms = Math.sqrt(sum / data.length);
  if (rms < 0.05) {
    updateTunerDisplay(0);
    requestAnimationFrame(updateMicPitch);
    return;
  }

  let bestFrequency = 0;
  let bestCorrelation = 0;
  const sampleRate = audioContext.sampleRate;
  const minFrequency = 60;
  const maxFrequency = 1200;

  for (let candidate = 0; candidate < 4096; candidate += 1) {
    const frequency = minFrequency + (candidate / 4096) * (maxFrequency - minFrequency);
    const period = sampleRate / frequency;
    let correlation = 0;
    let offset = 0;

    for (let i = 0; i < data.length; i += 1) {
      const current = data[i];
      const next = data[(i + Math.round(period)) % data.length] || 0;
      correlation += current * next;
      offset += 1;
    }

    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestFrequency = frequency;
    }
  }

  if (bestFrequency > 0) {
    updateTunerDisplay(bestFrequency);
  }

  requestAnimationFrame(updateMicPitch);
}

async function startTuner() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus('مرورگر شما از میکروفون برای تنظیم‌کننده‌ی tuner پشتیبانی نمی‌کند.');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyserNode);

    tunerRunning = true;
    setStatus('تندر در حال فعال‌سازی است. صدای شما در حال بررسی است.');
    updateMicPitch();
  } catch (error) {
    setStatus('دسترسی میکروفون برای tuner رد شد. لطفاً اجازه دهید.');
  }
}

startTuner();

window.addEventListener('beforeunload', () => {
  if (audioContext) audioContext.close();
  if (micStream) micStream.getTracks().forEach((track) => track.stop());
});
