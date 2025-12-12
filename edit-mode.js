/**
 * Edit Mode Module - Reusable drag/resize/text editing functionality
 * 
 * Usage:
 * 1. Include this script in your HTML: <script src="edit-mode.js"></script>
 * 2. Include the CSS: <link rel="stylesheet" href="edit-mode.css">
 * 3. Add class="editable" and data-id="unique-name" to elements you want editable
 * 4. Call initEditMode() after page loads
 */

(function () {
    let editMode = false;
    let selectedElement = null;
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    let currentScale = 100;
    let elementStates = {};
    let pageId = 'default';
    let addedElementCount = 0;

    // Create edit toggle button
    function createEditToggle() {
        const toggle = document.createElement('div');
        toggle.className = 'edit-toggle';
        toggle.id = 'edit-toggle';
        toggle.innerHTML = '<div class="red-dot"></div>';
        toggle.onclick = toggleEditMode;
        document.body.appendChild(toggle);
    }

    // Create edit controls panel
    function createEditControls() {
        const controls = document.createElement('div');
        controls.className = 'edit-controls hidden';
        controls.id = 'edit-controls';
        controls.innerHTML = `
            <div class="control-label">Edit Mode</div>
            <div class="size-controls">
                <button id="size-decrease">−</button>
                <span id="size-display">100%</span>
                <button id="size-increase">+</button>
            </div>
            <div class="layer-controls">
                <span class="layer-label">Layer:</span>
                <button id="layer-back" title="Send Back">⬇</button>
                <span id="layer-display">0</span>
                <button id="layer-forward" title="Bring Forward">⬆</button>
            </div>
            <div class="control-row align-controls" id="align-controls">
                <label>Align:</label>
                <button id="align-left" class="align-btn" title="Left" data-align="left">⬅</button>
                <button id="align-center" class="align-btn" title="Center" data-align="center">≡</button>
                <button id="align-right" class="align-btn" title="Right" data-align="right">➡</button>
            </div>
            <div class="text-controls hidden" id="text-controls">
                <div class="control-row">
                    <label>Color:</label>
                    <input type="color" id="text-color" value="#ffffff">
                </div>
                <div class="control-row">
                    <label>Font:</label>
                    <select id="font-select">
                        <option value="Michroma">Michroma</option>
                        <option value="Nulshock">Nulshock</option>
                    </select>
                </div>
                <div class="control-row">
                    <button id="bold-btn" class="style-btn" title="Bold">B</button>
                </div>
                <div class="control-row align-controls">
                    <label>Text Align:</label>
                    <button id="text-align-left" class="text-align-btn" title="Left" data-align="left">⬅</button>
                    <button id="text-align-center" class="text-align-btn" title="Center" data-align="center">≡</button>
                    <button id="text-align-right" class="text-align-btn" title="Right" data-align="right">➡</button>
                    <button id="text-align-justify" class="text-align-btn" title="Justify" data-align="justify">☰</button>
                </div>
            </div>
            <div class="add-buttons-row">
                <button class="add-text-btn" id="add-text-btn" title="Add Text">T</button>
                <button class="add-element-btn" id="add-element-btn">+ Add Element</button>
            </div>
            <button class="delete-btn" id="delete-btn">🗑 Delete</button>
            <button class="reset-btn" id="reset-btn">Reset</button>
        `;
        document.body.appendChild(controls);

        // Bind events
        document.getElementById('size-decrease').onclick = () => changeSize(-10);
        document.getElementById('size-increase').onclick = () => changeSize(10);
        document.getElementById('reset-btn').onclick = resetAll;
        document.getElementById('text-color').oninput = (e) => changeTextColor(e.target.value);
        document.getElementById('font-select').onchange = (e) => changeFont(e.target.value);
        document.getElementById('bold-btn').onclick = toggleBold;
        document.getElementById('layer-forward').onclick = () => changeLayer(1);
        document.getElementById('layer-back').onclick = () => changeLayer(-1);
        document.getElementById('add-text-btn').onclick = showAddTextModal;
        document.getElementById('add-element-btn').onclick = showAddElementModal;
        document.getElementById('delete-btn').onclick = deleteSelectedElement;

        // Alignment button handlers (for element positioning)
        document.querySelectorAll('.align-btn').forEach(btn => {
            btn.onclick = () => alignElement(btn.dataset.align);
        });

        // Text alignment button handlers (for text-align property)
        document.querySelectorAll('.text-align-btn').forEach(btn => {
            btn.onclick = () => changeTextAlignment(btn.dataset.align);
        });
    }

    // Create Add Element Modal
    function createAddElementModal() {
        const modal = document.createElement('div');
        modal.className = 'add-element-modal hidden';
        modal.id = 'add-element-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <span>Add Element</span>
                    <button class="modal-close" id="modal-close">×</button>
                </div>
                <div class="modal-body">
                    <div class="element-type-selector">
                        <button class="type-btn active" data-type="image" id="type-image">🖼️ Image</button>
                        <button class="type-btn" data-type="video" id="type-video">🎬 Video</button>
                    </div>
                    <div class="file-input-wrapper">
                        <label>Upload File:</label>
                        <input type="file" id="element-file" accept="image/*,video/*">
                    </div>
                    <div class="url-input-wrapper">
                        <label>Or Enter URL:</label>
                        <input type="text" id="element-url" placeholder="https://...">
                    </div>
                    <button class="add-btn" id="add-btn">Add to Page</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Bind modal events
        document.getElementById('modal-close').onclick = hideAddElementModal;
        document.getElementById('type-image').onclick = () => setElementType('image');
        document.getElementById('type-video').onclick = () => setElementType('video');
        document.getElementById('add-btn').onclick = addElement;

        // Close modal on backdrop click
        modal.onclick = (e) => {
            if (e.target === modal) hideAddElementModal();
        };
    }

    // Create Add Text Modal
    function createAddTextModal() {
        const modal = document.createElement('div');
        modal.className = 'add-text-modal hidden';
        modal.id = 'add-text-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <span>Add Text</span>
                    <button class="modal-close" id="text-modal-close">×</button>
                </div>
                <div class="modal-body">
                    <div class="text-input-wrapper">
                        <label>Enter Text:</label>
                        <textarea id="new-text-content" placeholder="Type your text here..." rows="3"></textarea>
                    </div>
                    <div class="control-row">
                        <label>Font:</label>
                        <select id="new-text-font">
                            <option value="Michroma">Michroma</option>
                            <option value="Nulshock">Nulshock</option>
                        </select>
                    </div>
                    <div class="control-row">
                        <label>Size:</label>
                        <select id="new-text-size">
                            <option value="1rem">Small</option>
                            <option value="1.5rem" selected>Medium</option>
                            <option value="2rem">Large</option>
                            <option value="3rem">X-Large</option>
                        </select>
                    </div>
                    <div class="control-row">
                        <label>Color:</label>
                        <input type="color" id="new-text-color" value="#ffffff">
                    </div>
                    <button class="add-btn" id="add-text-confirm">Add Text</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Bind modal events
        document.getElementById('text-modal-close').onclick = hideAddTextModal;
        document.getElementById('add-text-confirm').onclick = addTextElement;

        // Close modal on backdrop click
        modal.onclick = (e) => {
            if (e.target === modal) hideAddTextModal();
        };
    }

    function showAddTextModal() {
        document.getElementById('add-text-modal').classList.remove('hidden');
        document.getElementById('new-text-content').value = '';
        document.getElementById('new-text-content').focus();
    }

    function hideAddTextModal() {
        document.getElementById('add-text-modal').classList.add('hidden');
    }

    function addTextElement() {
        const text = document.getElementById('new-text-content').value.trim();
        if (!text) {
            alert('Please enter some text');
            return;
        }

        const font = document.getElementById('new-text-font').value;
        const size = document.getElementById('new-text-size').value;
        const color = document.getElementById('new-text-color').value;

        addedElementCount++;
        const elementId = 'text-' + addedElementCount + '-' + Date.now();

        const container = document.querySelector('.content') || document.querySelector('.container') || document.body;

        const element = document.createElement('p');
        element.innerHTML = text.replace(/\n/g, '<br>');
        element.className = 'editable edit-active added-element added-text';
        element.dataset.id = elementId;
        element.style.position = 'absolute';
        element.style.top = '50%';
        element.style.left = '50%';
        element.style.transform = 'translate(-50%, -50%)';
        element.style.zIndex = '50';
        element.style.fontFamily = `'${font}', sans-serif`;
        element.style.fontSize = size;
        element.style.color = color;
        element.style.textAlign = 'center';
        element.style.margin = '0';
        element.style.maxWidth = '80%';

        container.appendChild(element);

        // Initialize element state
        elementStates[elementId] = {
            scale: 100,
            x: 0,
            y: 0,
            text: text,
            font: font,
            color: color,
            fontSize: size,
            type: 'text',
            isAdded: true
        };

        // Make it draggable
        initNewElement(element);

        // Select the new element
        selectElement(element);

        hideAddTextModal();
    }

    let currentElementType = 'image';

    function setElementType(type) {
        currentElementType = type;
        document.querySelectorAll('.type-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('type-' + type).classList.add('active');

        // Update file accept
        const fileInput = document.getElementById('element-file');
        fileInput.accept = type === 'image' ? 'image/*' : 'video/*';
    }

    function showAddElementModal() {
        document.getElementById('add-element-modal').classList.remove('hidden');
        document.getElementById('element-file').value = '';
        document.getElementById('element-url').value = '';
    }

    function hideAddElementModal() {
        document.getElementById('add-element-modal').classList.add('hidden');
    }

    function addElement() {
        const fileInput = document.getElementById('element-file');
        const urlInput = document.getElementById('element-url');
        const file = fileInput.files[0];
        const url = urlInput.value.trim();

        if (!file && !url) {
            alert('Please select a file or enter a URL');
            return;
        }

        addedElementCount++;
        const elementId = 'added-' + addedElementCount + '-' + Date.now();

        if (file) {
            // For file uploads, use the filename as the path (assumes file is in same folder)
            const filePath = file.name;
            const reader = new FileReader();
            reader.onload = (e) => {
                createMediaElement(e.target.result, elementId, filePath);
            };
            reader.readAsDataURL(file);
        } else if (url) {
            // For URLs, use the URL directly as both display and path
            createMediaElement(url, elementId, url);
        }

        hideAddElementModal();
    }

    function createMediaElement(displaySrc, elementId, originalPath) {
        const container = document.querySelector('.content') || document.querySelector('.container') || document.body;

        let element;
        if (currentElementType === 'image') {
            element = document.createElement('img');
            element.src = displaySrc;
            element.alt = 'Added Image';
            element.style.maxWidth = '200px';
            element.style.height = 'auto';
        } else {
            element = document.createElement('video');
            element.src = displaySrc;
            element.controls = true;
            element.style.maxWidth = '250px';
            element.autoplay = false;
            element.muted = true;
        }

        element.className = 'editable edit-active added-element';
        element.dataset.id = elementId;
        element.dataset.originalPath = originalPath; // Store original path in data attribute
        element.style.position = 'absolute';
        element.style.top = '50%';
        element.style.left = '50%';
        element.style.transform = 'translate(-50%, -50%)';
        element.style.zIndex = '50';

        container.appendChild(element);

        // Initialize element state - save original path for export
        elementStates[elementId] = {
            scale: 100,
            x: 0,
            y: 0,
            src: displaySrc,
            originalPath: originalPath, // Save original path
            type: currentElementType,
            isAdded: true
        };

        // Make it draggable
        initNewElement(element);

        // Select the new element
        selectElement(element);
    }

    function initNewElement(el) {
        el.addEventListener('click', (e) => {
            if (editMode) {
                e.stopPropagation();
                selectElement(el);
            }
        });
        el.addEventListener('mousedown', startDrag);
        el.addEventListener('touchstart', startDrag, { passive: false });
    }

    function toggleEditMode() {
        editMode = !editMode;
        const toggle = document.getElementById('edit-toggle');
        const controls = document.getElementById('edit-controls');
        const editables = document.querySelectorAll('.editable');

        if (editMode) {
            toggle.classList.add('active');
            controls.classList.remove('hidden');
            document.body.classList.add('edit-mode-active');
            editables.forEach(el => el.classList.add('edit-active'));
        } else {
            toggle.classList.remove('active');
            controls.classList.add('hidden');
            document.body.classList.remove('edit-mode-active');
            editables.forEach(el => {
                el.classList.remove('edit-active');
                el.classList.remove('selected');
            });
            selectedElement = null;
            hideTextControls();
            hideAddElementModal();
            saveChanges();
            // Auto-save to HTML file when exiting edit mode
            autoSaveToServer();
        }
    }

    function isTextElement(el) {
        // Skip text editing for elements with data-no-text-edit attribute
        if (el.dataset.noTextEdit === 'true') return false;

        const tagName = el.tagName.toLowerCase();
        // Check if it's added text or a text element without images
        if (el.classList.contains('added-text')) return true;

        // Standard text elements
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span'].includes(tagName) &&
            !el.querySelector('img') && el.textContent.trim().length > 0) {
            return true;
        }

        // Also check for section divs that contain text but no media
        if (tagName === 'div' && !el.querySelector('img') && !el.querySelector('video') &&
            el.textContent.trim().length > 0 &&
            (el.classList.contains('section-title') ||
                el.classList.contains('topup-section') ||
                el.classList.contains('scratch-section') ||
                el.classList.contains('header-section') ||
                el.classList.contains('total-section') ||
                el.querySelector('h1, h2, h3, h4, h5, h6, p, span'))) {
            return true;
        }

        return false;
    }

    function deleteSelectedElement() {
        if (!selectedElement) {
            alert('Please select an element first');
            return;
        }

        const id = selectedElement.dataset.id;

        // Remove from DOM
        selectedElement.remove();

        // Remove from state
        if (elementStates[id]) {
            delete elementStates[id];
        }

        selectedElement = null;
        hideTextControls();
        document.getElementById('size-display').textContent = '100%';
        document.getElementById('layer-display').textContent = '0';

        // Save changes
        saveChanges();
    }

    // Auto-save to server when exiting edit mode
    async function autoSaveToServer() {
        // Check if there are any changes to save
        if (Object.keys(elementStates).length === 0) return;

        // Get current page path - extract just the relative path
        let pagePath = window.location.pathname;

        // Handle file:// protocol or full Windows paths
        if (pagePath.includes(':')) {
            // Extract the relative path from full path (e.g., get "page-1/file.html" from full path)
            const match = pagePath.match(/page-1[\/\\].+\.html$/i);
            if (match) {
                pagePath = '/' + match[0].replace(/\\/g, '/');
            }
        }

        console.log('Saving to path:', pagePath);

        try {
            // Try to save via server
            const response = await fetch('http://localhost:3000/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filePath: pagePath,
                    content: generateFullHTML()
                })
            });

            if (response.ok) {
                console.log('✅ Auto-saved to file!');
                // Clear localStorage for added elements after saving
                Object.keys(elementStates).forEach(id => {
                    if (elementStates[id].isAdded) {
                        delete elementStates[id];
                    }
                });
                localStorage.removeItem('editStates_' + pageId);
            }
        } catch (err) {
            // Server not running - changes remain in localStorage
            console.log('Server not running. Changes saved to localStorage.');
        }
    }

    // Generate full HTML of the page with added elements and applied transforms
    function generateFullHTML() {
        // Clone the document
        const clone = document.documentElement.cloneNode(true);

        // Remove edit mode elements
        const editToggle = clone.querySelector('#edit-toggle');
        const editControls = clone.querySelector('#edit-controls');
        const addElementModal = clone.querySelector('#add-element-modal');
        const addTextModal = clone.querySelector('#add-text-modal');
        const exportModal = clone.querySelector('#export-modal');

        if (editToggle) editToggle.remove();
        if (editControls) editControls.remove();
        if (addElementModal) addElementModal.remove();
        if (addTextModal) addTextModal.remove();
        if (exportModal) exportModal.remove();

        // Remove common browser extension injected elements
        clone.querySelectorAll('.audio-output, #volume-booster-visusalizer, [class*="extension"], [id*="extension"]').forEach(el => el.remove());
        clone.querySelectorAll('audio[style*="display: none"]').forEach(el => el.remove());

        // Remove edit-active and selected classes from elements
        clone.querySelectorAll('.edit-active').forEach(el => el.classList.remove('edit-active'));
        clone.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));

        // Apply transforms and styles from elementStates to all editable elements
        clone.querySelectorAll('.editable').forEach(el => {
            const id = el.dataset.id;
            if (elementStates[id]) {
                const state = elementStates[id];

                // Apply transform (position and scale)
                if (state.x !== undefined || state.y !== undefined || state.scale !== undefined) {
                    const x = state.x || 0;
                    const y = state.y || 0;
                    const scale = state.scale || 100;

                    if (el.classList.contains('added-element')) {
                        el.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale / 100})`;
                    } else {
                        el.style.transform = `translate(${x}px, ${y}px) scale(${scale / 100})`;
                    }
                }

                // Apply color
                if (state.color) {
                    el.style.color = state.color;
                }

                // Apply font
                if (state.font) {
                    el.style.fontFamily = `'${state.font}', sans-serif`;
                }

                // Apply bold
                if (state.bold !== undefined) {
                    el.style.fontWeight = state.bold ? 'bold' : 'normal';
                }

                // Apply z-index
                if (state.zIndex !== undefined) {
                    el.style.zIndex = state.zIndex;
                    if (!el.style.position || el.style.position === 'static') {
                        el.style.position = 'relative';
                    }
                }

                // Apply text alignment
                if (state.textAlign) {
                    el.style.textAlign = state.textAlign;
                }
            }
        });

        // For added elements, replace base64 src with original path
        clone.querySelectorAll('.added-element').forEach(el => {
            const id = el.dataset.id;
            if (elementStates[id] && elementStates[id].originalPath) {
                if (el.tagName === 'IMG' || el.tagName === 'VIDEO') {
                    el.src = elementStates[id].originalPath;
                }
            }
            // Remove data-original-path attribute if exists
            el.removeAttribute('data-original-path');
        });

        return '<!DOCTYPE html>\n' + clone.outerHTML;
    }

    // Generate HTML code for added elements
    function generateAddedElementsHTML() {
        let htmlCode = '';

        Object.keys(elementStates).forEach(id => {
            const state = elementStates[id];
            if (state.isAdded) {
                const path = state.originalPath || state.src;

                const x = state.x || 0;
                const y = state.y || 0;
                const scale = state.scale || 100;
                const zIndex = state.zIndex || 50;

                if (state.type === 'text') {
                    const text = state.text || '';
                    const font = state.font || 'Michroma';
                    const color = state.color || '#ffffff';
                    const fontSize = state.fontSize || '1.5rem';
                    htmlCode += `            <p class="editable" data-id="${id}" style="position: absolute; top: 50%; left: 50%; transform: translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale / 100}); z-index: ${zIndex}; font-family: '${font}', sans-serif; font-size: ${fontSize}; color: ${color}; text-align: center; margin: 0;">${text.replace(/\n/g, '<br>')}</p>\n`;
                } else if (state.type === 'image') {
                    htmlCode += `            <img src="${path}" alt="Added Image" class="editable" data-id="${id}" style="max-width: 200px; position: absolute; top: 50%; left: 50%; transform: translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale / 100}); z-index: ${zIndex};">\n`;
                } else if (state.type === 'video') {
                    htmlCode += `            <video src="${path}" controls muted class="editable" data-id="${id}" style="max-width: 250px; position: absolute; top: 50%; left: 50%; transform: translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale / 100}); z-index: ${zIndex};"></video>\n`;
                }
            }
        });

        return htmlCode;
    }

    // Save added elements directly to the HTML file
    async function saveToHTMLFile() {
        const addedHTML = generateAddedElementsHTML();

        if (!addedHTML) {
            alert('No added elements to save');
            return;
        }

        // Check if File System Access API is supported
        if (!('showSaveFilePicker' in window)) {
            // Fallback: show code for manual copy
            showExportModal(addedHTML);
            return;
        }

        try {
            // Get the current HTML content
            const currentHTML = document.documentElement.outerHTML;

            // Find the closing </div> before </body> for the content div
            const contentDiv = document.querySelector('.content');
            if (!contentDiv) {
                alert('Content container not found');
                return;
            }

            // Create marker comment to identify added elements
            const markerStart = '<!-- EDIT-MODE-ADDED-ELEMENTS-START -->';
            const markerEnd = '<!-- EDIT-MODE-ADDED-ELEMENTS-END -->';

            // Check if markers already exist in the document
            let newHTML = currentHTML;

            if (newHTML.includes(markerStart)) {
                // Replace existing added elements section
                const regex = new RegExp(markerStart + '[\\s\\S]*?' + markerEnd, 'g');
                newHTML = newHTML.replace(regex, markerStart + '\n' + addedHTML + '        ' + markerEnd);
            } else {
                // Insert new section before closing content div
                const contentEndPattern = /<\/div>\s*<\/div>\s*<script/i;
                const match = newHTML.match(contentEndPattern);
                if (match) {
                    const insertPosition = newHTML.indexOf(match[0]);
                    const insertContent = `\n${markerStart}\n${addedHTML}        ${markerEnd}\n        `;
                    newHTML = newHTML.slice(0, insertPosition) + insertContent + newHTML.slice(insertPosition);
                }
            }

            // Format the HTML
            newHTML = '<!DOCTYPE html>\n' + newHTML.replace('<!DOCTYPE html>', '');

            // Use File System Access API to save
            const options = {
                suggestedName: window.location.pathname.split('/').pop() || 'page.html',
                types: [{
                    description: 'HTML Files',
                    accept: { 'text/html': ['.html'] }
                }]
            };

            const handle = await window.showSaveFilePicker(options);
            const writable = await handle.createWritable();
            await writable.write(newHTML);
            await writable.close();

            alert('✅ Saved successfully! The added elements are now in the HTML file.');

            // Clear localStorage for added elements after saving
            Object.keys(elementStates).forEach(id => {
                if (elementStates[id].isAdded) {
                    delete elementStates[id];
                }
            });
            saveChanges();

        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Save failed:', err);
                alert('Save failed. Showing code to copy manually.');
                showExportModal(addedHTML);
            }
        }
    }

    function showExportModal(code) {
        const existingModal = document.getElementById('export-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'export-modal';
        modal.className = 'add-element-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <span>Copy HTML Code</span>
                    <button class="modal-close" id="export-modal-close">×</button>
                </div>
                <div class="modal-body">
                    <p style="color: #aaa; font-size: 12px; margin-bottom: 10px;">Copy this code and paste it inside your content div:</p>
                    <textarea id="export-code" readonly style="width: 100%; height: 200px; background: #1a1a2e; color: #0f0; border: 1px solid #333; border-radius: 5px; padding: 10px; font-family: monospace; font-size: 11px; resize: vertical;">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                    <button class="add-btn" id="copy-code-btn" style="margin-top: 10px;">📋 Copy to Clipboard</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('export-modal-close').onclick = () => modal.remove();
        document.getElementById('copy-code-btn').onclick = () => {
            const textarea = document.getElementById('export-code');
            textarea.value = code;
            textarea.select();
            document.execCommand('copy');
            document.getElementById('copy-code-btn').textContent = '✓ Copied!';
            setTimeout(() => {
                document.getElementById('copy-code-btn').textContent = '📋 Copy to Clipboard';
            }, 2000);
        };

        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }

    function showTextControls(el) {
        const textControls = document.getElementById('text-controls');
        textControls.classList.remove('hidden');

        const computedStyle = window.getComputedStyle(el);
        const color = rgbToHex(computedStyle.color);
        const fontFamily = computedStyle.fontFamily;
        const fontWeight = computedStyle.fontWeight;
        const textAlign = computedStyle.textAlign || 'left';

        document.getElementById('text-color').value = color;

        const fontSelect = document.getElementById('font-select');
        if (fontFamily.toLowerCase().includes('nulshock')) {
            fontSelect.value = 'Nulshock';
        } else {
            fontSelect.value = 'Michroma';
        }

        const boldBtn = document.getElementById('bold-btn');
        if (parseInt(fontWeight) >= 700 || fontWeight === 'bold') {
            boldBtn.classList.add('active');
        } else {
            boldBtn.classList.remove('active');
        }

        // Update alignment button states
        document.querySelectorAll('.align-btn').forEach(btn => btn.classList.remove('active'));
        const alignValue = textAlign === 'start' ? 'left' : (textAlign === 'end' ? 'right' : textAlign);
        const activeAlignBtn = document.querySelector(`.align-btn[data-align="${alignValue}"]`);
        if (activeAlignBtn) activeAlignBtn.classList.add('active');
    }

    function hideTextControls() {
        document.getElementById('text-controls').classList.add('hidden');
    }

    function rgbToHex(rgb) {
        if (rgb.startsWith('#')) return rgb;
        const result = rgb.match(/\d+/g);
        if (!result) return '#ffffff';
        const r = parseInt(result[0]).toString(16).padStart(2, '0');
        const g = parseInt(result[1]).toString(16).padStart(2, '0');
        const b = parseInt(result[2]).toString(16).padStart(2, '0');
        return '#' + r + g + b;
    }

    function changeTextColor(color) {
        if (!selectedElement) return;
        selectedElement.style.color = color;

        const id = selectedElement.dataset.id;
        if (!elementStates[id]) {
            elementStates[id] = { scale: 100, x: 0, y: 0 };
        }
        elementStates[id].color = color;
    }

    function changeFont(font) {
        if (!selectedElement) return;
        selectedElement.style.fontFamily = `'${font}', sans-serif`;

        const id = selectedElement.dataset.id;
        if (!elementStates[id]) {
            elementStates[id] = { scale: 100, x: 0, y: 0 };
        }
        elementStates[id].font = font;
    }

    function toggleBold() {
        if (!selectedElement) return;
        const boldBtn = document.getElementById('bold-btn');
        const isBold = boldBtn.classList.contains('active');

        if (isBold) {
            selectedElement.style.setProperty('font-weight', 'normal', 'important');
            boldBtn.classList.remove('active');
        } else {
            selectedElement.style.setProperty('font-weight', 'bold', 'important');
            boldBtn.classList.add('active');
        }

        const id = selectedElement.dataset.id;
        if (!elementStates[id]) {
            elementStates[id] = { scale: 100, x: 0, y: 0 };
        }
        elementStates[id].bold = !isBold;
    }

    function alignElement(align) {
        if (!selectedElement) return;

        const container = document.querySelector('.container');
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const containerWidth = containerRect.width || 1080;
        const containerCenter = containerWidth / 2;

        const elementRect = selectedElement.getBoundingClientRect();
        const elementWidth = elementRect.width;

        const id = selectedElement.dataset.id;
        const state = elementStates[id] || { scale: currentScale, x: 0, y: 0 };

        let newX = state.x || 0;

        if (align === 'left') {
            // Align to left edge with small padding
            newX = -(containerCenter - elementWidth / 2 - 40);
        } else if (align === 'center') {
            // Center horizontally
            newX = 0;
        } else if (align === 'right') {
            // Align to right edge with small padding
            newX = containerCenter - elementWidth / 2 - 40;
        }

        // Apply the new position
        state.x = newX;
        elementStates[id] = state;

        const scale = state.scale / 100 || 1;
        selectedElement.style.transform = `translate(${state.x}px, ${state.y || 0}px) scale(${scale})`;

        // Update button active states
        document.querySelectorAll('.align-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.align-btn[data-align="${align}"]`);
        if (activeBtn) activeBtn.classList.add('active');
    }

    function changeTextAlignment(align) {
        if (!selectedElement) return;

        selectedElement.style.textAlign = align;

        // Update button active states
        document.querySelectorAll('.text-align-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.text-align-btn[data-align="${align}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        const id = selectedElement.dataset.id;
        if (!elementStates[id]) {
            elementStates[id] = { scale: 100, x: 0, y: 0 };
        }
        elementStates[id].textAlign = align;
    }

    function selectElement(el) {
        if (!editMode) return;
        document.querySelectorAll('.editable.selected').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        selectedElement = el;
        const id = el.dataset.id;
        const state = elementStates[id] || { scale: 100, x: 0, y: 0, zIndex: 0 };
        currentScale = state.scale || 100;
        document.getElementById('size-display').textContent = currentScale + '%';

        // Update layer display
        const currentZIndex = state.zIndex || parseInt(window.getComputedStyle(el).zIndex) || 0;
        document.getElementById('layer-display').textContent = isNaN(currentZIndex) ? 0 : currentZIndex;

        if (isTextElement(el)) {
            showTextControls(el);
        } else {
            hideTextControls();
        }
    }

    function changeLayer(delta) {
        if (!selectedElement) return;
        const id = selectedElement.dataset.id;
        if (!elementStates[id]) {
            elementStates[id] = { scale: 100, x: 0, y: 0, zIndex: 0 };
        }

        let currentZIndex = elementStates[id].zIndex || parseInt(window.getComputedStyle(selectedElement).zIndex) || 50;
        if (isNaN(currentZIndex)) currentZIndex = 50;

        // Use step of 10 for more visible changes
        let newZIndex = currentZIndex + (delta * 10);
        newZIndex = Math.max(0, Math.min(1000, newZIndex)); // Clamp between 0 and 1000

        elementStates[id].zIndex = newZIndex;
        selectedElement.style.zIndex = newZIndex;
        selectedElement.style.position = selectedElement.style.position || 'relative';
        document.getElementById('layer-display').textContent = newZIndex;
    }

    function changeSize(delta) {
        if (!selectedElement) return;
        const id = selectedElement.dataset.id;
        if (!elementStates[id]) {
            elementStates[id] = { scale: 100, x: 0, y: 0 };
        }
        let newScale = elementStates[id].scale + delta;
        newScale = Math.max(10, Math.min(500, newScale));
        elementStates[id].scale = newScale;
        currentScale = newScale;
        applyTransform(selectedElement, elementStates[id]);
        document.getElementById('size-display').textContent = newScale + '%';
    }

    function resetAll() {
        // Remove added elements
        document.querySelectorAll('.added-element').forEach(el => el.remove());

        elementStates = {};
        document.querySelectorAll('.editable').forEach(el => {
            el.style.transform = '';
            el.style.color = '';
            el.style.fontFamily = '';
            el.style.fontWeight = '';
        });
        currentScale = 100;
        addedElementCount = 0;
        document.getElementById('size-display').textContent = '100%';
        localStorage.removeItem('editMode_' + pageId);
    }

    function applyTransform(el, state) {
        if (el.classList.contains('added-element')) {
            el.style.transform = `translate(calc(-50% + ${state.x}px), calc(-50% + ${state.y}px)) scale(${state.scale / 100})`;
        } else {
            el.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale / 100})`;
        }
    }

    function applyAllStyles(el, state) {
        if (state.x !== undefined || state.y !== undefined || state.scale !== undefined) {
            applyTransform(el, state);
        }
        if (state.color) {
            el.style.color = state.color;
        }
        if (state.font) {
            el.style.fontFamily = `'${state.font}', sans-serif`;
        }
        if (state.bold !== undefined) {
            el.style.fontWeight = state.bold ? 'bold' : 'normal';
        }
        if (state.zIndex !== undefined) {
            el.style.zIndex = state.zIndex;
            el.style.position = el.style.position || 'relative';
        }
    }

    function startDrag(e) {
        if (!editMode || !selectedElement) return;
        isDragging = true;
        const touch = e.touches ? e.touches[0] : e;
        startX = touch.clientX;
        startY = touch.clientY;
        const id = selectedElement.dataset.id;
        if (!elementStates[id]) {
            elementStates[id] = { scale: 100, x: 0, y: 0 };
        }
        startLeft = elementStates[id].x || 0;
        startTop = elementStates[id].y || 0;
        e.preventDefault();
    }

    function doDrag(e) {
        if (!isDragging || !selectedElement) return;
        const touch = e.touches ? e.touches[0] : e;
        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;
        const id = selectedElement.dataset.id;
        elementStates[id].x = startLeft + dx;
        elementStates[id].y = startTop + dy;
        applyTransform(selectedElement, elementStates[id]);
    }

    function endDrag() {
        isDragging = false;
    }

    function saveChanges() {
        localStorage.setItem('editMode_' + pageId, JSON.stringify(elementStates));
        console.log('Edit mode: Changes saved for ' + pageId);
    }

    function loadChanges() {
        const saved = localStorage.getItem('editMode_' + pageId);
        if (saved) {
            elementStates = JSON.parse(saved);

            // Restore existing elements
            document.querySelectorAll('.editable').forEach(el => {
                const id = el.dataset.id;
                if (elementStates[id]) {
                    applyAllStyles(el, elementStates[id]);
                }
            });

            // Recreate added elements
            Object.keys(elementStates).forEach(id => {
                const state = elementStates[id];
                if (state.isAdded) {
                    addedElementCount++;
                    if (state.type === 'text') {
                        recreateAddedText(id, state);
                    } else if (state.src) {
                        recreateAddedElement(id, state);
                    }
                }
            });

            console.log('Edit mode: Changes loaded for ' + pageId);
        }
    }

    function recreateAddedElement(elementId, state) {
        const container = document.querySelector('.content') || document.querySelector('.container') || document.body;

        let element;
        if (state.type === 'image') {
            element = document.createElement('img');
            element.src = state.src;
            element.alt = 'Added Image';
            element.style.maxWidth = '200px';
        } else {
            element = document.createElement('video');
            element.src = state.src;
            element.controls = true;
            element.style.maxWidth = '250px';
            element.muted = true;
        }

        element.className = 'editable added-element';
        element.dataset.id = elementId;
        element.style.position = 'absolute';
        element.style.top = '50%';
        element.style.left = '50%';
        element.style.zIndex = '50';

        container.appendChild(element);
        applyTransform(element, state);
        if (state.zIndex !== undefined) {
            element.style.zIndex = state.zIndex;
        }
        initNewElement(element);
    }

    function recreateAddedText(elementId, state) {
        const container = document.querySelector('.content') || document.querySelector('.container') || document.body;

        const element = document.createElement('p');
        element.innerHTML = (state.text || '').replace(/\n/g, '<br>');
        element.className = 'editable added-element added-text';
        element.dataset.id = elementId;
        element.style.position = 'absolute';
        element.style.top = '50%';
        element.style.left = '50%';
        element.style.zIndex = '50';
        element.style.fontFamily = `'${state.font || 'Michroma'}', sans-serif`;
        element.style.fontSize = state.fontSize || '1.5rem';
        element.style.color = state.color || '#ffffff';
        element.style.textAlign = 'center';
        element.style.margin = '0';
        element.style.maxWidth = '80%';

        container.appendChild(element);
        applyTransform(element, state);
        if (state.zIndex !== undefined) {
            element.style.zIndex = state.zIndex;
        }
        initNewElement(element);
    }

    function initEditableElements() {
        document.querySelectorAll('.editable').forEach(el => {
            el.addEventListener('click', (e) => {
                if (editMode) {
                    e.stopPropagation();
                    selectElement(el);
                }
            });
            el.addEventListener('mousedown', startDrag);
            el.addEventListener('touchstart', startDrag, { passive: false });
        });

        document.addEventListener('mousemove', doDrag);
        document.addEventListener('touchmove', doDrag, { passive: false });
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchend', endDrag);
    }

    // Main init function
    window.initEditMode = function (options = {}) {
        pageId = options.pageId || window.location.pathname || 'default';
        createEditToggle();
        createEditControls();
        createAddElementModal();
        createAddTextModal();
        initEditableElements();
        loadChanges();
        console.log('Edit mode initialized for: ' + pageId);
    };

    // Expose edit mode state globally
    window.isEditModeActive = function () {
        return editMode;
    };
})();
