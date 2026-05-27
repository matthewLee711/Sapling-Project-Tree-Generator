(function () {
    const vscode = acquireVsCodeApi();

    // Recover or initialize state
    const previousState = vscode.getState() || { showAll: false, excludeRegex: '', collapsedPaths: [] };
    
    const showAllToggle = document.getElementById('show-all-toggle');
    const excludeRegexInput = document.getElementById('exclude-regex');
    const copyBtn = document.getElementById('copy-btn');
    const collapseAllBtn = document.getElementById('collapse-all-btn');
    const treeContainer = document.getElementById('tree-container');
    const regexErrorIndicator = document.getElementById('regex-error-indicator');
    const regexErrorMsg = document.getElementById('regex-error-msg');

    // Setup initial values from recovered state
    showAllToggle.checked = previousState.showAll;
    excludeRegexInput.value = previousState.excludeRegex;
    const collapsedPaths = new Set(previousState.collapsedPaths || []);

    let currentTreeData = null;

    // Save and sync settings
    function saveStateAndNotify() {
        const state = {
            showAll: showAllToggle.checked,
            excludeRegex: excludeRegexInput.value,
            collapsedPaths: Array.from(collapsedPaths)
        };
        vscode.setState(state);
        
        vscode.postMessage({
            type: 'configChanged',
            config: {
                showAll: state.showAll,
                excludeRegex: state.excludeRegex
            }
        });
    }

    // Event listeners for configuration controls
    showAllToggle.addEventListener('change', () => {
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
        
        // Traverse tree data and add all directories to collapsedPaths
        function collapseRecursively(node) {
            if (node.isDirectory) {
                collapsedPaths.add(node.relativePath);
                if (node.children) {
                    node.children.forEach(collapseRecursively);
                }
            }
        }
        currentTreeData.forEach(collapseRecursively);
        saveStateAndNotify();
        renderTree(currentTreeData);
    });

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
                saveStateAndNotify();
            });
        }

        container.appendChild(wrapper);
    }

    // Signal host that webview is loaded and ready
    vscode.postMessage({ type: 'ready' });
    saveStateAndNotify(); // Initial config sync
}());
