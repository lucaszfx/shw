// Translator Engine
(function() {
    console.log("Translator Engine Loaded");

    // State
    const state = {
        active: false,
        mode: 'normal', // 'normal' (browser) or 'ai' (gemini)
        apiKey: '',
        targetLang: 'pt', // Portuguese by default
        model: 'gemini-1.5-flash',
        cache: {},
        queue: [],
        processing: false
    };

    // --- UI Construction ---
    function createUI() {
        const container = document.createElement('div');
        container.id = 'translator-ui';
        container.style.position = 'fixed';
        container.style.top = '10px';
        container.style.right = '10px';
        container.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        container.style.color = 'white';
        container.style.padding = '10px';
        container.style.borderRadius = '5px';
        container.style.zIndex = '99999';
        container.style.fontFamily = 'sans-serif';
        container.style.fontSize = '14px';

        const title = document.createElement('h3');
        title.innerText = 'Game Translator';
        title.style.margin = '0 0 10px 0';
        container.appendChild(title);

        // Mode Toggle
        const modeLabel = document.createElement('label');
        modeLabel.innerText = 'Mode: ';
        const modeSelect = document.createElement('select');
        modeSelect.innerHTML = `
            <option value="normal">Normal (Browser)</option>
            <option value="ai">AI (Gemini)</option>
        `;
        modeSelect.onchange = (e) => {
            state.mode = e.target.value;
            aiControls.style.display = state.mode === 'ai' ? 'block' : 'none';
        };
        modeLabel.appendChild(modeSelect);
        container.appendChild(modeLabel);

        // AI Controls Container
        const aiControls = document.createElement('div');
        aiControls.style.display = 'none';
        aiControls.style.marginTop = '10px';

        // API Key Input
        const keyInput = document.createElement('input');
        keyInput.type = 'password';
        keyInput.placeholder = 'Gemini API Key';
        keyInput.style.display = 'block';
        keyInput.style.width = '100%';
        keyInput.style.marginBottom = '5px';
        keyInput.onchange = (e) => state.apiKey = e.target.value;
        aiControls.appendChild(keyInput);

        // Model Select
        const modelSelect = document.createElement('select');
        modelSelect.style.display = 'block';
        modelSelect.style.width = '100%';
        modelSelect.style.marginBottom = '5px';
        modelSelect.innerHTML = `
            <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
            <option value="gemini-pro">Gemini Pro</option>
        `;
        modelSelect.onchange = (e) => state.model = e.target.value;
        aiControls.appendChild(modelSelect);

        // Target Language
        const langInput = document.createElement('input');
        langInput.type = 'text';
        langInput.placeholder = 'Target Lang (e.g., pt-BR)';
        langInput.value = 'pt-BR';
        langInput.style.display = 'block';
        langInput.style.width = '100%';
        langInput.style.marginBottom = '5px';
        langInput.onchange = (e) => state.targetLang = e.target.value;
        aiControls.appendChild(langInput);

        // Start Button
        const startBtn = document.createElement('button');
        startBtn.innerText = 'Start AI Translation';
        startBtn.style.width = '100%';
        startBtn.onclick = () => {
            if (!state.apiKey) {
                alert('Please enter API Key');
                return;
            }
            state.active = true;
            startBtn.innerText = 'Translating...';
            startBtn.disabled = true;
            console.log("AI Translation Activated");
        };
        aiControls.appendChild(startBtn);

        container.appendChild(aiControls);
        document.body.appendChild(container);
    }

    // --- Hooking Logic ---
    function hookCanvas() {
        const originalFillText = CanvasRenderingContext2D.prototype.fillText;
        const originalStrokeText = CanvasRenderingContext2D.prototype.strokeText;
        const originalMeasureText = CanvasRenderingContext2D.prototype.measureText;

        CanvasRenderingContext2D.prototype.fillText = function(text, x, y, maxWidth) {
            if (state.active && state.mode === 'ai' && typeof text === 'string' && text.trim().length > 0) {
                // Check cache
                if (state.cache[text]) {
                    return originalFillText.call(this, state.cache[text], x, y, maxWidth);
                } else {
                    // Queue for translation
                    queueTranslation(text);
                    // Draw original for now
                    return originalFillText.apply(this, arguments);
                }
            }
            return originalFillText.apply(this, arguments);
        };

        CanvasRenderingContext2D.prototype.strokeText = function(text, x, y, maxWidth) {
             if (state.active && state.mode === 'ai' && typeof text === 'string' && text.trim().length > 0) {
                if (state.cache[text]) {
                    return originalStrokeText.call(this, state.cache[text], x, y, maxWidth);
                } else {
                    queueTranslation(text);
                    return originalStrokeText.apply(this, arguments);
                }
            }
            return originalStrokeText.apply(this, arguments);
        };

        // Optional: Hook measureText to fix wrapping if possible (advanced)
        // CanvasRenderingContext2D.prototype.measureText = function(text) {
        //    if (state.active && state.cache[text]) {
        //        return originalMeasureText.call(this, state.cache[text]);
        //    }
        //    return originalMeasureText.apply(this, arguments);
        // };
    }

    // --- Translation Logic ---
    function queueTranslation(text) {
        if (state.queue.includes(text) || state.cache[text]) return;
        state.queue.push(text);
        processQueue();
    }

    async function processQueue() {
        if (state.processing || state.queue.length === 0) return;
        state.processing = true;

        const batch = state.queue.splice(0, 10); // Process 10 at a time

        try {
            const translations = await callGemini(batch);
            // Update cache
            for (let i = 0; i < batch.length; i++) {
                if (translations[i]) {
                    state.cache[batch[i]] = translations[i];
                }
            }
        } catch (e) {
            console.error("Translation failed", e);
            // Re-queue items? Or ignore to avoid infinite loops?
            // For now, we ignore failed items to prevent stall.
        }

        state.processing = false;
        if (state.queue.length > 0) {
            setTimeout(processQueue, 1000); // Debounce
        }
    }

    async function callGemini(texts) {
        const prompt = `Translate the following game text lines to ${state.targetLang}. Maintain any special codes, variables, or formatting. Return ONLY a JSON array of strings.

        Texts:
        ${JSON.stringify(texts)}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${state.model}:generateContent?key=${state.apiKey}`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            const resultText = data.candidates[0].content.parts[0].text;
            // Attempt to parse JSON
            const jsonMatch = resultText.match(/\[.*\]/s);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            } else {
                console.warn("Could not parse JSON from Gemini response", resultText);
                return texts; // Fallback to original
            }
        } catch (e) {
            console.error("Gemini API Error:", e);
            return texts;
        }
    }

    // --- Initialization ---
    window.addEventListener('load', () => {
        createUI();
        hookCanvas();

        // Hook RPG Maker if present (Window_Base)
        // This is an advanced hook for better RPG Maker compatibility
        if (typeof Window_Base !== 'undefined') {
            console.log("RPG Maker detected, adding specific hooks.");
            const oldDrawText = Window_Base.prototype.drawText;
            Window_Base.prototype.drawText = function(text, x, y, maxWidth, align) {
                 if (state.active && state.mode === 'ai' && typeof text === 'string') {
                     if (state.cache[text]) {
                         text = state.cache[text];
                     } else {
                         queueTranslation(text);
                     }
                 }
                 return oldDrawText.call(this, text, x, y, maxWidth, align);
            };
        }
    });

})();
