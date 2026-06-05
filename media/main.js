(function () {
    const vscode = acquireVsCodeApi();

    // Recover or initialize state
    const previousState = vscode.getState() || { hideFiles: false, hideDotDirs: true, excludeRegex: '', collapsedPaths: [], isAllCollapsed: false, savedRegexes: [] };
    
    const hideFilesToggle = document.getElementById('hide-files-toggle');
    const hideDotDirsToggle = document.getElementById('hide-dot-dirs-toggle');
    const excludeRegexInput = document.getElementById('exclude-regex');
    const copyBtn = document.getElementById('copy-btn');
    const collapseAllBtn = document.getElementById('collapse-all-btn');
    const treeContainer = document.getElementById('tree-container');
    const regexErrorIndicator = document.getElementById('regex-error-indicator');
    const regexErrorMsg = document.getElementById('regex-error-msg');
    const saveRegexBtn = document.getElementById('save-regex-btn');
    const savedRegexContainer = document.getElementById('saved-regex-container');
    const contextMenu = document.getElementById('context-menu');

    // Setup initial values from recovered state (default hideDotDirs to true if not specified)
    hideFilesToggle.checked = previousState.hideFiles;
    hideDotDirsToggle.checked = previousState.hideDotDirs !== undefined ? previousState.hideDotDirs : true;
    excludeRegexInput.value = previousState.excludeRegex;
    const collapsedPaths = new Set(previousState.collapsedPaths || []);

    let isAllCollapsed = previousState.isAllCollapsed || false;
    if (isAllCollapsed) {
        collapseAllBtn.textContent = 'Open All';
    }

    const savedRegexes = previousState.savedRegexes || [];

    let currentTreeData = null;
    let contextMenuTargetName = null; // Name of the node that was right-clicked

    // ─── Utility: escape special regex characters in a string ───
    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ─── Utility: append a name to the regex input ───
    function appendToRegex(name, mode) {
        const escaped = escapeRegex(name);
        const current = excludeRegexInput.value.trim();

        if (mode === 'or') {
            if (current === '') {
                excludeRegexInput.value = escaped;
            } else {
                excludeRegexInput.value = current + '|' + escaped;
            }
        } else if (mode === 'and') {
            if (current === '') {
                excludeRegexInput.value = '(?=.*' + escaped + ')';
            } else {
                excludeRegexInput.value = current + '(?=.*' + escaped + ')';
            }
        }

        saveStateAndNotify();
    }

    // ─── Compute combined regex: text box + all saved regexes ───
    function getEffectiveRegex() {
        const parts = [];
        const inputValue = excludeRegexInput.value.trim();
        if (inputValue) {
            parts.push(inputValue);
        }
        savedRegexes.forEach(function (r) {
            if (r) parts.push(r);
        });
        return parts.join('|');
    }

    // Save and sync settings
    function saveStateAndNotify() {
        const state = {
            hideFiles: hideFilesToggle.checked,
            hideDotDirs: hideDotDirsToggle.checked,
            excludeRegex: excludeRegexInput.value,
            collapsedPaths: Array.from(collapsedPaths),
            isAllCollapsed: isAllCollapsed,
            savedRegexes: savedRegexes
        };
        vscode.setState(state);
        
        vscode.postMessage({
            type: 'configChanged',
            config: {
                hideFiles: state.hideFiles,
                hideDotDirs: state.hideDotDirs,
                excludeRegex: getEffectiveRegex()
            }
        });
    }

    // Event listeners for configuration controls
    hideFilesToggle.addEventListener('change', () => {
        saveStateAndNotify();
    });

    hideDotDirsToggle.addEventListener('change', () => {
        saveStateAndNotify();
    });

    let typingTimeout;
    excludeRegexInput.addEventListener('input', () => {
        clearTimeout(typingTimeout);
        // Debounce input updates to prevent thrashing
        typingTimeout = setTimeout(() => {
            saveStateAndNotify();
        }, 300);
    });

    copyBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'copyRequest' });
    });

    collapseAllBtn.addEventListener('click', () => {
        if (!currentTreeData) return;
        
        if (!isAllCollapsed) {
            // Collapse All — add every directory to collapsedPaths
            function collapseRecursively(node) {
                if (node.isDirectory) {
                    collapsedPaths.add(node.relativePath);
                    if (node.children) {
                        node.children.forEach(collapseRecursively);
                    }
                }
            }
            currentTreeData.forEach(collapseRecursively);
            isAllCollapsed = true;
            collapseAllBtn.textContent = 'Open All';
        } else {
            // Open All — clear every collapsed path
            collapsedPaths.clear();
            isAllCollapsed = false;
            collapseAllBtn.textContent = 'Collapse All';
        }
        saveStateAndNotify();
        renderTree(currentTreeData);
    });

    // ─── Context Menu Logic ───

    function showContextMenu(x, y) {
        contextMenu.style.display = 'block';
        contextMenu.style.left = x + 'px';
        contextMenu.style.top = y + 'px';

        // Clamp to viewport so it doesn't overflow
        const rect = contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            contextMenu.style.left = (window.innerWidth - rect.width - 4) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            contextMenu.style.top = (window.innerHeight - rect.height - 4) + 'px';
        }
    }

    function hideContextMenu() {
        contextMenu.style.display = 'none';
        contextMenuTargetName = null;
        // Remove highlight from any previously right-clicked node
        const active = document.querySelector('.tree-node.context-active');
        if (active) active.classList.remove('context-active');
    }

    // Menu item clicks
    contextMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.context-menu-item');
        if (!item || !contextMenuTargetName) return;

        const action = item.dataset.action; // 'or' or 'and'
        appendToRegex(contextMenuTargetName, action);
        hideContextMenu();
    });

    // Dismiss on click outside or Escape
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideContextMenu();
            return;
        }

        // Ctrl+E → Exclude (OR) for the context menu target
        if (e.ctrlKey && e.key === 'e' && contextMenuTargetName) {
            e.preventDefault();
            appendToRegex(contextMenuTargetName, 'or');
            hideContextMenu();
            return;
        }

        // Ctrl+T → Exclude (AND) for the context menu target
        if (e.ctrlKey && e.key === 't' && contextMenuTargetName) {
            e.preventDefault();
            appendToRegex(contextMenuTargetName, 'and');
            hideContextMenu();
            return;
        }
    });

    // ─── Saved Regex Presets ───

    function renderSavedRegexes() {
        savedRegexContainer.innerHTML = '';
        savedRegexes.forEach((regex, index) => {
            const chip = document.createElement('div');
            chip.className = 'regex-chip';
            chip.title = regex;

            const text = document.createElement('span');
            text.className = 'regex-chip-text';
            text.textContent = regex;
            chip.appendChild(text);

            const deleteBtn = document.createElement('span');
            deleteBtn.className = 'regex-chip-delete';
            deleteBtn.textContent = '×';
            deleteBtn.title = 'Remove saved regex';
            chip.appendChild(deleteBtn);

            // Click chip → append regex to input
            chip.addEventListener('click', (e) => {
                if (e.target === deleteBtn) return; // let delete handler fire instead
                const current = excludeRegexInput.value.trim();
                if (current === '') {
                    excludeRegexInput.value = regex;
                } else {
                    excludeRegexInput.value = current + '|' + regex;
                }
                saveStateAndNotify();
            });

            // Click × → remove from saved list
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                savedRegexes.splice(index, 1);
                renderSavedRegexes();
                saveStateAndNotify();
            });

            savedRegexContainer.appendChild(chip);
        });
    }

    saveRegexBtn.addEventListener('click', () => {
        const current = excludeRegexInput.value.trim();
        if (!current) return; // nothing to save

        // Don't save duplicates
        if (savedRegexes.includes(current)) return;

        savedRegexes.push(current);
        renderSavedRegexes();
        saveStateAndNotify();
    });

    // Initial render of saved chips
    renderSavedRegexes();

    // Handle messages from the extension host
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'updateTree':
                currentTreeData = message.tree;
                renderTree(currentTreeData);
                break;
            case 'regexError':
                excludeRegexInput.classList.add('invalid');
                regexErrorIndicator.title = message.message;
                regexErrorMsg.textContent = message.message;
                regexErrorMsg.style.display = 'block';
                break;
            case 'regexValid':
                excludeRegexInput.classList.remove('invalid');
                regexErrorMsg.style.display = 'none';
                break;
            case 'copySuccess':
                showCopyFeedback();
                break;
        }
    });

    function showCopyFeedback() {
        const originalContent = copyBtn.innerHTML;
        copyBtn.classList.remove('btn-primary');
        copyBtn.style.backgroundColor = 'var(--vscode-button-hoverBackground, #0062a3)';
        copyBtn.innerHTML = '<span class="icon">✓</span> Copied!';
        copyBtn.disabled = true;

        setTimeout(() => {
            copyBtn.innerHTML = originalContent;
            copyBtn.style.backgroundColor = '';
            copyBtn.classList.add('btn-primary');
            copyBtn.disabled = false;
        }, 1800);
    }

    // Render tree representation to the DOM
    function renderTree(treeData) {
        treeContainer.innerHTML = '';
        
        if (!treeData || treeData.length === 0) {
            treeContainer.innerHTML = '<div class="loading">No files found or all files filtered out.</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        treeData.forEach(rootNode => {
            renderNode(rootNode, fragment);
        });
        treeContainer.appendChild(fragment);
    }

    function renderNode(node, container) {
        const wrapper = document.createElement('div');
        wrapper.className = 'tree-node-wrapper';

        const row = document.createElement('div');
        row.className = `tree-node ${node.isDirectory ? 'directory' : 'file'}`;
        row.dataset.path = node.relativePath;

        // Apply collapsed style if directory is in our collapsed state set
        const isCollapsed = node.isDirectory && collapsedPaths.has(node.relativePath);
        if (isCollapsed) {
            row.classList.add('collapsed');
        }

        // Toggle arrow icon
        const arrow = document.createElement('span');
        arrow.className = 'arrow';
        if (node.isDirectory && node.children && node.children.length > 0) {
            arrow.innerHTML = '▼';
        } else {
            arrow.classList.add('empty');
        }
        row.appendChild(arrow);

        // File/Folder type icon
        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.innerHTML = node.isDirectory ? '📁' : '📄';
        row.appendChild(icon);

        // File name text
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = node.name;
        row.appendChild(name);

        // Right-click → show custom context menu
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Remove highlight from any previous target
            const prev = document.querySelector('.tree-node.context-active');
            if (prev) prev.classList.remove('context-active');

            row.classList.add('context-active');
            contextMenuTargetName = node.name;
            showContextMenu(e.clientX, e.clientY);
        });

        wrapper.appendChild(row);

        // Children rendering
        if (node.isDirectory && node.children && node.children.length > 0) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-node-children';
            if (isCollapsed) {
                childrenContainer.classList.add('collapsed');
            }

            node.children.forEach(child => {
                renderNode(child, childrenContainer);
            });
            wrapper.appendChild(childrenContainer);

            // Row click event to expand/collapse
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                const currentlyCollapsed = collapsedPaths.has(node.relativePath);
                if (currentlyCollapsed) {
                    collapsedPaths.delete(node.relativePath);
                    row.classList.remove('collapsed');
                    childrenContainer.classList.remove('collapsed');
                } else {
                    collapsedPaths.add(node.relativePath);
                    row.classList.add('collapsed');
                    childrenContainer.classList.add('collapsed');
                }
                // Reset toggle state since tree is no longer fully collapsed/expanded
                isAllCollapsed = false;
                collapseAllBtn.textContent = 'Collapse All';
                saveStateAndNotify();
            });
        }

        container.appendChild(wrapper);
    }

    // Signal host that webview is loaded and ready
    vscode.postMessage({ type: 'ready' });
    saveStateAndNotify(); // Initial config sync
}());
