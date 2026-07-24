// AuraFocus - Main Application Logic

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------
    // 1. Initial State & Configuration
    // -------------------------------------------------------------
    const defaults = {
        work: 25,
        short: 5,
        long: 15,
        theme: 'forest',
        tasks: [],
        stats: { sessions: 0, minutes: 0, tasks: 0 }
    };

    let settings = JSON.parse(localStorage.getItem('aurafocus_settings')) || {
        work: defaults.work,
        short: defaults.short,
        long: defaults.long
    };

    let stats = JSON.parse(localStorage.getItem('aurafocus_stats')) || { ...defaults.stats };
    let tasks = JSON.parse(localStorage.getItem('aurafocus_tasks')) || [];
    let currentTheme = localStorage.getItem('aurafocus_theme') || defaults.theme;

    let timerInterval = null;
    let isRunning = false;
    let currentMode = 'work'; // 'work', 'short', 'long'
    let secondsLeft = settings.work * 60;
    let totalSecondsForMode = settings.work * 60;
    let activeTaskId = null;

    // -------------------------------------------------------------
    // 2. DOM Elements
    // -------------------------------------------------------------
    // Header & Theme
    const body = document.body;
    const themeButtons = document.querySelectorAll('.theme-btn');

    // Timer display & controls
    const timeLeftDisplay = document.getElementById('time-left');
    const timerStatusText = document.getElementById('timer-status-text');
    const timerProgressBar = document.getElementById('timer-progress');
    const startButton = document.getElementById('timer-start');
    const playIcon = document.getElementById('play-icon');
    const resetButton = document.getElementById('timer-reset');
    const skipButton = document.getElementById('timer-skip');
    const modeButtons = document.querySelectorAll('.mode-btn');

    // Tasks
    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const taskList = document.getElementById('task-list');
    const activeTaskDisplay = document.getElementById('active-task-display');

    // Modals & Stats
    const statsToggle = document.getElementById('stats-toggle');
    const settingsToggle = document.getElementById('settings-toggle');
    const statsModal = document.getElementById('stats-modal');
    const settingsModal = document.getElementById('settings-modal');
    const modalCloses = document.querySelectorAll('.modal-close');
    const saveSettingsButton = document.getElementById('save-settings-btn');
    const resetStatsButton = document.getElementById('reset-stats-btn');

    // Settings input fields
    const settingsWorkInput = document.getElementById('settings-work');
    const settingsShortInput = document.getElementById('settings-short');
    const settingsLongInput = document.getElementById('settings-long');

    // Stats values display
    const statSessionsDisplay = document.getElementById('stat-sessions');
    const statMinutesDisplay = document.getElementById('stat-minutes');
    const statTasksDisplay = document.getElementById('stat-tasks');

    // Sound elements
    const soundRows = document.querySelectorAll('.sound-row');

    // Initialize Lucide Icons
    lucide.createIcons();

    // -------------------------------------------------------------
    // 3. Audio & Ambiance Synthesizer (Web Audio API)
    // -------------------------------------------------------------
    let audioCtx = null;
    const activeSynthesizers = {};

    function initAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    // Helper to generate a Pink Noise node (more soothing than white noise)
    function createPinkNoiseNode() {
        const bufferSize = 4 * audioCtx.sampleRate;
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let b0, b1, b2, b3, b4, b5, b6;
        b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
        
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            b6 = white * 0.115926;
            output[i] = pink * 0.11; // scale down
        }

        const noiseNode = audioCtx.createBufferSource();
        noiseNode.buffer = noiseBuffer;
        noiseNode.loop = true;
        return noiseNode;
    }

    // Gentle alert sound synthesis when timer finishes (Bowls/Gong chime)
    function playAlertChime() {
        initAudioContext();
        const now = audioCtx.currentTime;
        
        // Base fundamental gong sound
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(293.66, now); // D4 note
        osc1.frequency.exponentialRampToValueAtTime(220.00, now + 4); // fall to A3

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(440.00, now); // A4 harmonic
        osc2.frequency.exponentialRampToValueAtTime(329.63, now + 3); // fall to E4

        gainNode.gain.setValueAtTime(0.001, now);
        gainNode.gain.linearRampToValueAtTime(0.2, now + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 4.0);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 4.2);
        osc2.stop(now + 4.2);
    }

    // Audio Generators for ambient sounds
    const soundSynthesizers = {
        rain: {
            start: () => {
                const noise = createPinkNoiseNode();
                
                // Bandpass filter to shape the rain frequency spectrum
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.value = 1000;
                filter.Q.value = 0.8;

                // Gentle low-pass for softness
                const lowpass = audioCtx.createBiquadFilter();
                lowpass.type = 'lowpass';
                lowpass.frequency.value = 3500;

                const gain = audioCtx.createGain();
                gain.gain.value = 0.4;

                noise.connect(filter);
                filter.connect(lowpass);
                lowpass.connect(gain);
                gain.connect(audioCtx.destination);
                noise.start();

                return { nodes: [noise, filter, lowpass, gain], gainNode: gain };
            }
        },
        wind: {
            start: () => {
                const noise = createPinkNoiseNode();
                
                // Bandpass filter with shifting frequency to simulate wind gusts
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.value = 400;
                filter.Q.value = 2.0;

                // LFO to modulate the wind speed/gustiness
                const lfo = audioCtx.createOscillator();
                lfo.type = 'sine';
                lfo.frequency.value = 0.08; // very slow wave

                const lfoGain = audioCtx.createGain();
                lfoGain.gain.value = 250; // sweep range +/- 250 Hz

                const gain = audioCtx.createGain();
                gain.gain.value = 0.5;

                lfo.connect(lfoGain);
                lfoGain.connect(filter.frequency);
                noise.connect(filter);
                filter.connect(gain);
                gain.connect(audioCtx.destination);

                lfo.start();
                noise.start();

                return { nodes: [noise, filter, lfo, lfoGain, gain], gainNode: gain };
            }
        },
        waves: {
            start: () => {
                const noise = createPinkNoiseNode();
                
                // Lowpass filter modulated by LFO to simulate rolling ocean waves
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 600;

                const lfo = audioCtx.createOscillator();
                lfo.type = 'sine';
                lfo.frequency.value = 0.06; // Ocean breathing speed (~16 sec cycles)

                const lfoGain = audioCtx.createGain();
                lfoGain.gain.value = 400; // range 200 - 1000 Hz

                const gain = audioCtx.createGain();
                gain.gain.value = 0.3;

                lfo.connect(lfoGain);
                lfoGain.connect(filter.frequency);
                noise.connect(filter);
                filter.connect(gain);
                gain.connect(audioCtx.destination);

                lfo.start();
                noise.start();

                return { nodes: [noise, filter, lfo, lfoGain, gain], gainNode: gain };
            }
        },
        cafe: {
            start: () => {
                // Synthesize cafe room atmosphere using low frequency murmurs + soft pitch pulses
                const noise = createPinkNoiseNode();
                
                const bandpass = audioCtx.createBiquadFilter();
                bandpass.type = 'bandpass';
                bandpass.frequency.value = 250; // human vocal frequencies rumble
                bandpass.Q.value = 1.0;

                const gain = audioCtx.createGain();
                gain.gain.value = 0.6;

                // Add random soft murmurs using a few oscillators at low levels
                const oscs = [];
                const frequencies = [110, 140, 180, 220];
                frequencies.forEach(f => {
                    const osc = audioCtx.createOscillator();
                    osc.type = 'sine';
                    osc.frequency.value = f;
                    
                    // Modulate volume slightly
                    const oscGain = audioCtx.createGain();
                    oscGain.gain.value = 0.01;
                    
                    osc.connect(oscGain);
                    oscGain.connect(gain);
                    osc.start();
                    oscs.push(osc, oscGain);
                });

                noise.connect(bandpass);
                bandpass.connect(gain);
                gain.connect(audioCtx.destination);
                noise.start();

                return { nodes: [noise, bandpass, gain, ...oscs], gainNode: gain };
            }
        }
    };

    function handleSoundToggle(soundKey, volumeSlider, row) {
        initAudioContext();
        
        if (activeSynthesizers[soundKey]) {
            // Stop sound
            activeSynthesizers[soundKey].nodes.forEach(node => {
                try { node.stop(); } catch(e) {}
                try { node.disconnect(); } catch(e) {}
            });
            delete activeSynthesizers[soundKey];
            volumeSlider.disabled = true;
            row.classList.remove('active');
        } else {
            // Start sound
            const synth = soundSynthesizers[soundKey].start();
            // Set initial volume based on slider
            synth.gainNode.gain.value = volumeSlider.value * 0.4; // cap master sound a bit for safety
            activeSynthesizers[soundKey] = synth;
            volumeSlider.disabled = false;
            row.classList.add('active');
        }
    }

    soundRows.forEach(row => {
        const toggleBtn = row.querySelector('.sound-toggle');
        const volumeSlider = row.querySelector('.sound-volume');
        const soundKey = toggleBtn.getAttribute('data-sound');

        toggleBtn.addEventListener('click', () => {
            handleSoundToggle(soundKey, volumeSlider, row);
        });

        volumeSlider.addEventListener('input', (e) => {
            if (activeSynthesizers[soundKey]) {
                // Adjust gain
                activeSynthesizers[soundKey].gainNode.gain.value = e.target.value * 0.4;
            }
        });
    });


    // -------------------------------------------------------------
    // 4. Timer Logic
    // -------------------------------------------------------------
    // Setup Circle Progress Ring
    const radius = timerProgressBar.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    timerProgressBar.style.strokeDasharray = `${circumference} ${circumference}`;
    timerProgressBar.style.strokeDashoffset = circumference;

    function setProgress(percent) {
        const offset = circumference - (percent / 100) * circumference;
        timerProgressBar.style.strokeDashoffset = offset;
    }

    function updateDisplay() {
        const minutes = Math.floor(secondsLeft / 60);
        const seconds = secondsLeft % 60;
        const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        timeLeftDisplay.textContent = formattedTime;
        document.title = `(${formattedTime}) AuraFocus`;

        // Radial progress
        const percent = ((totalSecondsForMode - secondsLeft) / totalSecondsForMode) * 100;
        setProgress(percent);
    }

    function switchMode(mode, forceReset = false) {
        clearInterval(timerInterval);
        isRunning = false;
        currentMode = mode;

        // Toggle button states
        modeButtons.forEach(btn => {
            if (btn.getAttribute('data-mode') === mode) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Set duration
        if (mode === 'work') {
            secondsLeft = settings.work * 60;
            timerStatusText.textContent = "Time to focus";
        } else if (mode === 'short') {
            secondsLeft = settings.short * 60;
            timerStatusText.textContent = "Take a breath";
        } else if (mode === 'long') {
            secondsLeft = settings.long * 60;
            timerStatusText.textContent = "Deep relaxation";
        }

        totalSecondsForMode = secondsLeft;
        updateDisplay();
        playIcon.setAttribute('data-lucide', 'play');
        lucide.createIcons();
    }

    function startTimer() {
        if (isRunning) {
            // Pause
            clearInterval(timerInterval);
            isRunning = false;
            playIcon.setAttribute('data-lucide', 'play');
            lucide.createIcons();
        } else {
            // Start
            initAudioContext();
            isRunning = true;
            playIcon.setAttribute('data-lucide', 'pause');
            lucide.createIcons();

            timerInterval = setInterval(() => {
                if (secondsLeft > 0) {
                    secondsLeft--;
                    updateDisplay();
                } else {
                    handleTimerComplete();
                }
            }, 1000);
        }
    }

    function handleTimerComplete() {
        clearInterval(timerInterval);
        isRunning = false;
        playAlertChime();

        if (currentMode === 'work') {
            // Update stats
            stats.sessions += 1;
            stats.minutes += settings.work;
            saveStats();
            updateStatsUI();

            // Notify user
            if (Notification.permission === 'granted') {
                new Notification('Focus Session Complete!', {
                    body: 'Take a break and rest for a moment.',
                    icon: 'favicon.ico'
                });
            }

            // Auto-switch to break
            switchMode('short');
        } else {
            // Notify user
            if (Notification.permission === 'granted') {
                new Notification('Break is over!', {
                    body: 'Ready to start another focus session?',
                    icon: 'favicon.ico'
                });
            }
            switchMode('work');
        }
    }

    function resetTimer() {
        switchMode(currentMode, true);
    }

    function skipSession() {
        clearInterval(timerInterval);
        isRunning = false;
        
        if (currentMode === 'work') {
            switchMode('short');
        } else if (currentMode === 'short') {
            switchMode('long');
        } else {
            switchMode('work');
        }
    }

    startButton.addEventListener('click', startTimer);
    resetButton.addEventListener('click', resetTimer);
    skipButton.addEventListener('click', skipSession);

    modeButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const mode = e.target.getAttribute('data-mode');
            switchMode(mode);
        });
    });


    // -------------------------------------------------------------
    // 5. Tasks Logic
    // -------------------------------------------------------------
    function renderTasks() {
        taskList.innerHTML = '';
        
        if (tasks.length === 0) {
            taskList.innerHTML = `<li class="card-subtitle" style="text-align: center; margin-top: 1rem;">No tasks yet. Add one below!</li>`;
            return;
        }

        tasks.forEach(task => {
            const li = document.createElement('li');
            li.className = `task-item ${task.completed ? 'completed' : ''} ${task.id === activeTaskId ? 'active' : ''}`;
            li.setAttribute('data-id', task.id);

            li.innerHTML = `
                <div class="task-item-left">
                    <div class="checkbox-custom">
                        <i data-lucide="check"></i>
                    </div>
                    <span class="task-title-text">${escapeHtml(task.title)}</span>
                </div>
                <button class="btn-task-delete" aria-label="Delete task">
                    <i data-lucide="trash-2"></i>
                </button>
            `;

            // Active focus selection
            li.addEventListener('click', (e) => {
                if (e.target.closest('.checkbox-custom')) {
                    toggleTaskCompletion(task.id);
                } else if (e.target.closest('.btn-task-delete')) {
                    deleteTask(task.id);
                } else {
                    selectActiveTask(task.id);
                }
            });

            taskList.appendChild(li);
        });
        
        lucide.createIcons();
    }

    function selectActiveTask(id) {
        const task = tasks.find(t => t.id === id);
        if (task && !task.completed) {
            activeTaskId = id;
            activeTaskDisplay.textContent = task.title;
            activeTaskDisplay.classList.remove('card-subtitle');
        } else {
            activeTaskId = null;
            activeTaskDisplay.textContent = 'No active task selected';
        }
        renderTasks();
    }

    function toggleTaskCompletion(id) {
        const taskIndex = tasks.findIndex(t => t.id === id);
        if (taskIndex > -1) {
            tasks[taskIndex].completed = !tasks[taskIndex].completed;
            
            // If completed, update completed task counts
            if (tasks[taskIndex].completed) {
                stats.tasks += 1;
                saveStats();
                updateStatsUI();
            } else {
                stats.tasks = Math.max(0, stats.tasks - 1);
                saveStats();
                updateStatsUI();
            }

            // If completed active task, remove from active display
            if (id === activeTaskId) {
                selectActiveTask(null);
            }
            
            saveTasks();
            renderTasks();
        }
    }

    function deleteTask(id) {
        tasks = tasks.filter(t => t.id !== id);
        if (id === activeTaskId) {
            selectActiveTask(null);
        }
        saveTasks();
        renderTasks();
    }

    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = taskInput.value.trim();
        if (title) {
            const newTask = {
                id: Date.now().toString(),
                title: title,
                completed: false
            };
            tasks.push(newTask);
            saveTasks();
            renderTasks();
            
            // Auto select active if none
            if (!activeTaskId) {
                selectActiveTask(newTask.id);
            }
            
            taskInput.value = '';
        }
    });

    function saveTasks() {
        localStorage.setItem('aurafocus_tasks', JSON.stringify(tasks));
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }


    // -------------------------------------------------------------
    // 6. Settings, Themes & Modals
    // -------------------------------------------------------------
    // Theme switching
    function applyTheme(theme) {
        body.className = `theme-${theme}`;
        themeButtons.forEach(btn => {
            if (btn.getAttribute('data-theme') === theme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        localStorage.setItem('aurafocus_theme', theme);
    }

    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.getAttribute('data-theme');
            applyTheme(theme);
        });
    });

    // Modals handling
    statsToggle.addEventListener('click', () => {
        updateStatsUI();
        statsModal.classList.add('active');
    });

    settingsToggle.addEventListener('click', () => {
        settingsWorkInput.value = settings.work;
        settingsShortInput.value = settings.short;
        settingsLongInput.value = settings.long;
        settingsModal.classList.add('active');
    });

    modalCloses.forEach(closeBtn => {
        closeBtn.addEventListener('click', () => {
            statsModal.classList.remove('active');
            settingsModal.classList.remove('active');
        });
    });

    // Close on clicking modal background
    window.addEventListener('click', (e) => {
        if (e.target === statsModal) statsModal.classList.remove('active');
        if (e.target === settingsModal) settingsModal.classList.remove('active');
    });

    // Save timer settings
    saveSettingsButton.addEventListener('click', () => {
        const workVal = parseInt(settingsWorkInput.value);
        const shortVal = parseInt(settingsShortInput.value);
        const longVal = parseInt(settingsLongInput.value);

        if (workVal > 0 && shortVal > 0 && longVal > 0) {
            settings.work = workVal;
            settings.short = shortVal;
            settings.long = longVal;
            localStorage.setItem('aurafocus_settings', JSON.stringify(settings));

            settingsModal.classList.remove('active');
            switchMode(currentMode); // Reset with new time
        }
    });

    // Reset statistics
    resetStatsButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all your focus session statistics?')) {
            stats = { sessions: 0, minutes: 0, tasks: 0 };
            saveStats();
            updateStatsUI();
        }
    });

    function saveStats() {
        localStorage.setItem('aurafocus_stats', JSON.stringify(stats));
    }

    function updateStatsUI() {
        statSessionsDisplay.textContent = stats.sessions;
        statMinutesDisplay.textContent = stats.minutes;
        statTasksDisplay.textContent = stats.tasks;
    }


    // -------------------------------------------------------------
    // 7. App Initial Load Calls
    // -------------------------------------------------------------
    applyTheme(currentTheme);
    renderTasks();
    switchMode('work');
    updateStatsUI();

    // Ask for system notification permission gently
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});
