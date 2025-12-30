// Edita - Advanced Text Editor with Error Logging
class Edita {
    constructor() {
        this.editor = document.getElementById('editor');
        this.lineNumbers = document.getElementById('lineNumbers');
        this.tabs = [];
        this.activeTabId = null;
        this.logs = [];
        this.theme = 'dark';
        this.findIndex = 0;
        this.deferredPrompt = null;
        this.isLoadingFiles = false;
        this.saveTabsTimeout = null;
        this.db = null; // IndexedDB for storing file handles
        
        this.initAsync();
    }

    async initAsync() {
        await this.initIndexedDB();
        this.init();
    }

    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open('EditaDB', 1);
                
                request.onerror = () => {
                    console.error('IndexedDB failed to open');
                    resolve(); // Resolve anyway to continue initialization
                };
                
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    console.log('IndexedDB initialized successfully');
                    resolve();
                };
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('fileHandles')) {
                        db.createObjectStore('fileHandles', { keyPath: 'tabId' });
                        console.log('Created fileHandles object store');
                    }
                };
            } catch (error) {
                console.error('IndexedDB initialization failed:', error);
                resolve(); // Resolve anyway to continue initialization
            }
        });
    }

    async saveFileHandleToIndexedDB(tabId, fileHandle) {
        if (!this.db || !fileHandle) return;
        
        try {
            const transaction = this.db.transaction(['fileHandles'], 'readwrite');
            const store = transaction.objectStore('fileHandles');
            await store.put({ tabId, fileHandle });
            console.log(`Saved fileHandle for tab ${tabId} to IndexedDB`);
        } catch (error) {
            console.error('Failed to save fileHandle to IndexedDB:', error);
        }
    }

    async getFileHandleFromIndexedDB(tabId) {
        if (!this.db) return null;
        
        try {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(['fileHandles'], 'readonly');
                const store = transaction.objectStore('fileHandles');
                const request = store.get(tabId);
                
                request.onsuccess = () => {
                    resolve(request.result?.fileHandle || null);
                };
                
                request.onerror = () => {
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('Failed to get fileHandle from IndexedDB:', error);
            return null;
        }
    }

    async clearFileHandleFromIndexedDB(tabId) {
        if (!this.db) return;
        
        try {
            const transaction = this.db.transaction(['fileHandles'], 'readwrite');
            const store = transaction.objectStore('fileHandles');
            await store.delete(tabId);
            console.log(`Cleared fileHandle for tab ${tabId} from IndexedDB`);
        } catch (error) {
            console.error('Failed to clear fileHandle from IndexedDB:', error);
        }
    }

    async init() {
        try {
            console.log('Starting Edita initialization...');
            this.log('INFO', 'Initializing Edita...');
            
            // Event listeners for editor
            this.editor.addEventListener('input', () => this.handleInput());
            this.editor.addEventListener('scroll', () => this.syncScroll());
            this.editor.addEventListener('keydown', (e) => this.handleKeydown(e));
            this.editor.addEventListener('click', () => this.updateStatusBar());
            this.editor.addEventListener('keyup', () => this.updateStatusBar());
            this.editor.addEventListener('mouseup', () => this.handleTextSelection());
            this.editor.addEventListener('select', () => this.handleTextSelection());
            
            // Paste event with explicit binding
            this.editor.addEventListener('paste', (e) => {
                console.log('PASTE EVENT FIRED');
                this.handlePaste(e);
            }, false);
            
            // Menu bar event delegation
            document.querySelectorAll('.menu-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    const action = e.target.dataset.action;
                    this.handleMenuAction(action);
                });
            });

            // Toolbar buttons
            document.getElementById('newBtn').addEventListener('click', () => this.newFile());
            document.getElementById('openBtn').addEventListener('click', () => this.openFileWithPicker());
            document.getElementById('saveBtn').addEventListener('click', () => this.saveFile());
            document.getElementById('findBtn').addEventListener('click', () => this.find());
            document.getElementById('verticalTabsBtn').addEventListener('click', () => this.toggleVerticalTabs());
            document.getElementById('themeBtn').addEventListener('click', () => this.toggleTheme());
            document.getElementById('logsBtn').addEventListener('click', () => this.showLogs());
            
            // File input
            document.getElementById('fileInput').addEventListener('change', (e) => this.openFile(e));
            
            // Language select
            document.getElementById('languageSelect').addEventListener('change', (e) => this.changeLanguage(e.target.value));
            
            // Find/Replace dialog
            document.getElementById('findNextBtn').addEventListener('click', () => this.findNext());
            document.getElementById('findPreviousBtn').addEventListener('click', () => this.findPrevious());
            document.getElementById('replaceOneBtn').addEventListener('click', () => this.replaceOne());
            document.getElementById('replaceAllBtn').addEventListener('click', () => this.replaceAll());
            document.getElementById('countBtn').addEventListener('click', () => this.countOccurrences());
            document.getElementById('searchAllFilesBtn').addEventListener('click', () => this.searchAllFilesNow());
            document.getElementById('closeDialogBtn').addEventListener('click', () => this.closeDialog());
            document.getElementById('findDialogCloseBtn').addEventListener('click', () => this.closeDialog());
            
            // Logs dialog
            document.getElementById('clearLogsBtn').addEventListener('click', () => this.clearLogs());
            document.getElementById('exportLogsBtn').addEventListener('click', () => this.exportLogs());
            document.getElementById('closeLogsBtn').addEventListener('click', () => this.closeLogsDialog());
            
            // Search results panel
            document.getElementById('closeSearchResultsBtn').addEventListener('click', () => this.closeSearchResults());
            this.initSearchResultsResize();
            this.initDialogDrag();
            
            // Tab event delegation
            document.getElementById('tabsContainer').addEventListener('click', (e) => {
                if (e.target.classList.contains('tab-close')) {
                    const tabId = parseInt(e.target.dataset.tabId);
                    this.closeTab(tabId);
                } else if (e.target.closest('.tab')) {
                    const tabId = parseInt(e.target.closest('.tab').dataset.tabId);
                    this.switchTab(tabId);
                }
            });
            
            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                // Close find dialog with Escape key
                if (e.key === 'Escape') {
                    const findDialog = document.getElementById('findDialog');
                    if (findDialog.classList.contains('active')) {
                        this.closeDialog();
                        e.preventDefault();
                        return;
                    }
                }
                
                if (e.ctrlKey || e.metaKey) {
                    switch(e.key.toLowerCase()) {
                        case 's':
                            e.preventDefault();
                            this.saveFile();
                            break;
                        case 'o':
                            e.preventDefault();
                            document.getElementById('fileInput').click();
                            break;
                        case 'n':
                            e.preventDefault();
                            this.newFile();
                            break;
                        case 'f':
                            e.preventDefault();
                            this.find();
                            break;
                        case 'h':
                    if (e.shiftKey && e.key.toLowerCase() === 'f') {
                        e.preventDefault();
                        this.findInFiles();
                    }
                            e.preventDefault();
                            this.replace();
                            break;
                    }
                }
            });

            // Global error handlers
            window.onerror = (message, source, lineno, colno, error) => {
                this.logError('WINDOW ERROR', message, error);
                return false;
            };

            window.addEventListener('unhandledrejection', (event) => {
                this.logError('UNHANDLED PROMISE', event.reason);
            });

            // Unregister service worker to prevent caching issues during development
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(registrations => {
                    for (let registration of registrations) {
                        registration.unregister();
                        console.log('Service worker unregistered for testing');
                    }
                });
            }
            
            // PWA install prompt
            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                this.deferredPrompt = e;
                document.getElementById('installPrompt').style.display = 'block';
                document.getElementById('installBtn').addEventListener('click', () => this.installPWA());
            });

            // Window beforeunload
            window.addEventListener('beforeunload', (e) => {
                const hasUnsaved = this.tabs.some(tab => tab.modified);
                if (hasUnsaved) {
                    e.preventDefault();
                    e.returnValue = '';
                }
            });

            // Drag and drop file support
            document.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'copy';
            });

            document.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Try to get file handles using File System Access API (for drag & drop)
                if (e.dataTransfer.items && 'getAsFileSystemHandle' in DataTransferItem.prototype) {
                    const items = Array.from(e.dataTransfer.items);
                    const handlePromises = items
                        .filter(item => item.kind === 'file')
                        .map(item => item.getAsFileSystemHandle());
                    
                    try {
                        const handles = await Promise.all(handlePromises);
                        await this.openFilesWithHandles(handles);
                        return;
                    } catch (error) {
                        console.log('File System Access API not available for drag & drop, using fallback');
                    }
                }
                
                // Fallback for browsers that don't support getAsFileSystemHandle
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    const syntheticEvent = {
                        target: {
                            files: files,
                            value: ''
                        }
                    };
                    this.openFile(syntheticEvent);
                }
            });

            this.updateLineNumbers();
            this.updateStatusBar();
            this.loadTheme();
            this.loadVerticalTabsPreference();
            this.loadLogsFromStorage();
            await this.loadOpenTabs();
            
            this.log('INFO', 'Edita initialized successfully');
            console.log('Edita initialized successfully');
            this.showToast('Welcome to Edita!', 'success');
        } catch (error) {
            console.error('INIT ERROR:', error);
            this.logError('INIT ERROR', 'Failed to initialize', error);
            alert('Error: Failed to initialize\n\n' + error.message + '\n\nCheck console for details.');
        }
    }

    handleMenuAction(action) {
        const actions = {
            'new': () => this.newFile(),
            'open': () => document.getElementById('fileInput').click(),
            'save': () => this.saveFile(),
            'close': () => this.closeTab(this.activeTabId),
            'undo': () => document.execCommand('undo'),
            'redo': () => document.execCommand('redo'),
            'cut': () => document.execCommand('cut'),
            'copy': () => document.execCommand('copy'),
            'paste': () => document.execCommand('paste'),
            'find': () => this.find(),
            'replace': () => this.replace(),
            'findInFiles': () => this.findInFiles(),
            'theme': () => this.toggleTheme(),
            'verticalTabs': () => this.toggleVerticalTabs(),
            'logs': () => this.showLogs()
        };
        
        if (actions[action]) {
            actions[action]();
        }
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, level, message, data: data ? JSON.stringify(data, null, 2) : null };
        this.logs.push(logEntry);
        console.log(`[${timestamp}] [${level}] ${message}`, data || '');
        this.saveLogsToStorage();
    }

    logError(type, message, error = null) {
        const errorInfo = {
            type,
            message,
            stack: error?.stack || new Error().stack,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
        };
        this.log('ERROR', `${type}: ${message}`, errorInfo);
        this.showToast(`Error: ${message}`, 'error');
    }

    saveLogsToStorage() {
        try {
            localStorage.setItem('edita_logs', JSON.stringify(this.logs.slice(-100)));
        } catch (e) {
            console.error('Failed to save logs', e);
        }
    }

    loadLogsFromStorage() {
        try {
            const stored = localStorage.getItem('edita_logs');
            if (stored) this.logs = JSON.parse(stored);
        } catch (e) {
            console.error('Failed to load logs', e);
        }
    }

    async saveOpenTabs() {
        console.log('saveOpenTabs called, isLoadingFiles:', this.isLoadingFiles);
        // Don't save during file loading to prevent browser crashes
        if (this.isLoadingFiles) {
            console.log('Skipping save - still loading files');
            return;
        }
        
        try {
            // Limit content size to prevent localStorage overflow
            const MAX_CONTENT_SIZE = 50000000; // 50MB per file
            const MAX_TOTAL_SIZE = 50000000; // 50MB total
            
            const tabsToSave = this.tabs.map(tab => {
                let content = tab.content;
                // Truncate very large content
                if (content.length > MAX_CONTENT_SIZE) {
                    content = content.substring(0, MAX_CONTENT_SIZE);
                    console.warn(`Tab ${tab.name} content truncated for storage`);
                }
                
                return {
                    id: tab.id,
                    name: tab.name,
                    content: content,
                    modified: tab.modified,
                    language: tab.language,
                    wasSaved: !!tab.fileHandle // Track if file had a handle
                };
            });
            
            const state = {
                tabs: tabsToSave,
                activeTabId: this.activeTabId
            };
            
            const stateJson = JSON.stringify(state);
            
            // Check total size
            if (stateJson.length > MAX_TOTAL_SIZE) {
                console.warn('Tab state too large to save, skipping auto-save');
                this.log('WARN', 'Tab state exceeds size limit, auto-save skipped');
                return;
            }
            
            localStorage.setItem('edita_open_tabs', stateJson);
            
            // Save file handles to IndexedDB (await all saves)
            const handleSavePromises = this.tabs
                .filter(tab => tab.fileHandle)
                .map(tab => this.saveFileHandleToIndexedDB(tab.id, tab.fileHandle));
            await Promise.all(handleSavePromises);
            
            console.log(`✅ Successfully saved ${tabsToSave.length} open tabs (${(stateJson.length / 1024).toFixed(1)}KB)`);
            console.log('File restore feature active - v1.2 (with IndexedDB)');
            console.log('Verify save:', localStorage.getItem('edita_open_tabs') ? 'SUCCESS' : 'FAILED');
        } catch (e) {
            console.error('Failed to save open tabs', e);
            // If localStorage is full, try to clear old data
            if (e.name === 'QuotaExceededError') {
                console.warn('localStorage quota exceeded, clearing saved tabs');
                localStorage.removeItem('edita_open_tabs');
            }
        }
    }

    async loadOpenTabs() {
        try {
            const stored = localStorage.getItem('edita_open_tabs');
            if (!stored) {
                this.log('INFO', 'No saved tabs found');
                return;
            }
            
            // Check size before attempting to parse
            const storedSize = stored.length;
            const MAX_RESTORE_SIZE = 50 * 1024 * 1024; // 50MB max
            
            if (storedSize > MAX_RESTORE_SIZE) {
                console.warn(`Saved tabs too large (${(storedSize / 1024 / 1024).toFixed(1)}MB), clearing...`);
                localStorage.removeItem('edita_open_tabs');
                this.showToast('Previous session data was too large and has been cleared', 'info');
                return;
            }
            
            const state = JSON.parse(stored);
            
            if (!state.tabs || state.tabs.length === 0) {
                this.log('INFO', 'No tabs to restore');
                return;
            }
            
            // Limit number of tabs to restore
            const MAX_TABS = 20;
            if (state.tabs.length > MAX_TABS) {
                console.warn(`Too many tabs (${state.tabs.length}), restoring only first ${MAX_TABS}`);
                state.tabs = state.tabs.slice(0, MAX_TABS);
            }
            
            // Validate and sanitize tabs
            const validTabs = [];
            for (const tab of state.tabs) {
                if (!tab || typeof tab.id === 'undefined' || !tab.name) {
                    console.warn('Skipping invalid tab:', tab);
                    continue;
                }
                
                // Skip Untitled tabs (user doesn't want them restored)
                if (tab.name === 'Untitled' || /^Untitled-\d+$/.test(tab.name)) {
                    console.log('Skipping Untitled tab:', tab.name);
                    continue;
                }
                
                // Limit content size per tab
                let content = tab.content || '';
                const MAX_CONTENT = 1 * 1024 * 1024; // 1MB per file
                if (content.length > MAX_CONTENT) {
                    console.warn(`Tab ${tab.name} content too large, truncating...`);
                    content = content.substring(0, MAX_CONTENT);
                }
                
                validTabs.push({
                    id: tab.id,
                    name: tab.name,
                    content: content,
                    modified: tab.modified || false,
                    language: tab.language || 'text',
                    fileHandle: null
                });
            }
            
            if (validTabs.length === 0) {
                this.log('INFO', 'No valid tabs to restore');
                return;
            }
            
            // Replace the default untitled tab with saved tabs
            this.tabs = validTabs;
            
            // Restore file handles from IndexedDB
            this.restoreFileHandles();
            
            // Restore active tab
            const savedActiveTab = this.tabs.find(t => t.id === state.activeTabId);
            if (savedActiveTab) {
                this.activeTabId = state.activeTabId;
            } else {
                this.activeTabId = this.tabs[0].id;
            }
            
            // Load the active tab content (disable auto-save during restore)
            this.isLoadingFiles = true;
            const activeTab = this.tabs.find(t => t.id === this.activeTabId);
            if (activeTab) {
                this.editor.value = activeTab.content;
                document.getElementById('languageSelect').value = activeTab.language;
            }
            this.isLoadingFiles = false;
            
            this.renderTabs();
            this.updateLineNumbers();
            this.updateStatusBar();
            
            this.log('INFO', `Restored ${this.tabs.length} tabs`);
            this.showToast(`Restored ${this.tabs.length} file${this.tabs.length > 1 ? 's' : ''}`, 'success');
        } catch (e) {
            console.error('Failed to load open tabs', e);
            this.log('ERROR', 'Failed to load open tabs', e.message);
            
            // Clear corrupted data
            try {
                localStorage.removeItem('edita_open_tabs');
                console.log('Cleared corrupted tab data');
            } catch (clearError) {
                console.error('Failed to clear corrupted data', clearError);
            }
            
            // Keep the default untitled tab on error
            this.showToast('Failed to restore previous session', 'error');
        }
    }

    async restoreFileHandles() {
        for (const tab of this.tabs) {
            try {
                const fileHandle = await this.getFileHandleFromIndexedDB(tab.id);
                if (fileHandle) {
                    // Verify we still have permission
                    const permission = await fileHandle.queryPermission({ mode: 'readwrite' });
                    if (permission === 'granted') {
                        tab.fileHandle = fileHandle;
                        console.log(`Restored fileHandle for tab ${tab.id} (${tab.name})`);
                    } else if (permission === 'prompt') {
                        // Permission needs to be requested again
                        const newPermission = await fileHandle.requestPermission({ mode: 'readwrite' });
                        if (newPermission === 'granted') {
                            tab.fileHandle = fileHandle;
                            console.log(`Re-granted permission and restored fileHandle for tab ${tab.id} (${tab.name})`);
                        } else {
                            console.warn(`Permission denied for tab ${tab.id} (${tab.name})`);
                            await this.clearFileHandleFromIndexedDB(tab.id);
                        }
                    } else {
                        console.warn(`No permission for tab ${tab.id} (${tab.name})`);
                        await this.clearFileHandleFromIndexedDB(tab.id);
                    }
                }
            } catch (error) {
                console.error(`Failed to restore fileHandle for tab ${tab.id}:`, error);
                await this.clearFileHandleFromIndexedDB(tab.id);
            }
        }
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('error-toast');
        toast.textContent = message;
        toast.className = `error-toast show ${type}`;
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    handleInput() {
        try {
            const currentTab = this.tabs.find(t => t.id === this.activeTabId);
            if (currentTab) {
                currentTab.content = this.editor.value;
                currentTab.modified = true;
                this.updateTabTitle();
            }
            this.clearHighlights();
            this.updateLineNumbers();
            this.updateStatusBar();
            
            // Debounced save
            if (this.saveTabsTimeout) {
                clearTimeout(this.saveTabsTimeout);
            }
            this.saveTabsTimeout = setTimeout(() => {
                this.saveOpenTabs();
            }, 2000);
        } catch (error) {
            this.logError('INPUT ERROR', 'Error handling input', error);
        }
    }

    handleKeydown(e) {
        try {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.editor.selectionStart;
                const end = this.editor.selectionEnd;
                const value = this.editor.value;
                this.editor.value = value.substring(0, start) + '    ' + value.substring(end);
                this.editor.selectionStart = this.editor.selectionEnd = start + 4;
            }
        } catch (error) {
            this.logError('KEYDOWN ERROR', 'Error handling keydown', error);
        }
    }

    updateLineNumbers() {
        try {
            const lines = this.editor.value.split('\n').length;
            this.lineNumbers.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
        } catch (error) {
            this.logError('LINE NUMBERS ERROR', 'Error updating line numbers', error);
        }
    }

    syncScroll() {
        try {
            this.lineNumbers.scrollTop = this.editor.scrollTop;
        } catch (error) {
            this.logError('SCROLL ERROR', 'Error syncing scroll', error);
        }
    }

    handlePaste(e) {
        try {
            this.log('INFO', 'Paste event triggered');
            
            // Get pasted text
            const pastedText = e.clipboardData.getData('text');
            this.log('INFO', `Pasted text length: ${pastedText.length}`);
            
            let formatted = null;
            
            // Try JSON formatting
            if (pastedText.trim().startsWith('{') || pastedText.trim().startsWith('[')) {
                try {
                    const parsed = JSON.parse(pastedText);
                    formatted = JSON.stringify(parsed, null, 2);
                    this.log('INFO', 'Successfully formatted as JSON');
                } catch (jsonError) {
                    this.log('INFO', `Not valid JSON: ${jsonError.message}`);
                }
            }
            
            // Try XML/HTML formatting
            if (!formatted && (pastedText.trim().startsWith('<') || pastedText.includes('<?xml'))) {
                try {
                    formatted = this.formatXmlHtml(pastedText);
                    if (formatted !== pastedText) {
                        this.log('INFO', 'Successfully formatted as XML/HTML');
                    }
                } catch (xmlError) {
                    this.log('INFO', `XML/HTML formatting failed: ${xmlError.message}`);
                }
            }
            
            // Try CSS formatting
            if (!formatted && pastedText.includes('{') && pastedText.includes('}') && 
                (pastedText.includes(':') || pastedText.match(/[.#]\w+\s*{/))) {
                try {
                    formatted = this.formatCss(pastedText);
                    if (formatted !== pastedText) {
                        this.log('INFO', 'Successfully formatted as CSS');
                    }
                } catch (cssError) {
                    this.log('INFO', `CSS formatting failed: ${cssError.message}`);
                }
            }
            
            // If we formatted something, insert it
            if (formatted && formatted !== pastedText) {
                e.preventDefault();
                
                // Insert formatted JSON at cursor position
                const start = this.editor.selectionStart;
                const end = this.editor.selectionEnd;
                const before = this.editor.value.substring(0, start);
                const after = this.editor.value.substring(end);
                
                this.editor.value = before + formatted + after;
                this.log('INFO', 'Updated editor value');
                
                // Update cursor position
                const newCursorPos = start + formatted.length;
                this.editor.selectionStart = this.editor.selectionEnd = newCursorPos;
                
                // Update current tab content
                const currentTab = this.tabs.find(t => t.id === this.activeTabId);
                if (currentTab) {
                    currentTab.content = this.editor.value;
                    currentTab.modified = true;
                    this.updateTabTitle();
                }
                
                // Update UI elements
                this.updateLineNumbers();
                this.updateStatusBar();
                
                this.log('INFO', 'Code formatted and pasted successfully');
                this.showToast('Code formatted automatically', 'success');
            }
        } catch (error) {
            this.logError('PASTE ERROR', 'Error handling paste', error);
        }
    }

    formatXmlHtml(text) {
        let formatted = '';
        let indent = 0;
        const tab = '  ';
        
        // Remove existing whitespace between tags
        text = text.replace(/>\s+</g, '><');
        
        // Split by tags
        const tokens = text.split(/(<[^>]+>)/g).filter(t => t.trim());
        
        for (let token of tokens) {
            if (token.startsWith('</')) {
                // Closing tag - decrease indent
                indent = Math.max(0, indent - 1);
                formatted += tab.repeat(indent) + token + '\n';
            } else if (token.startsWith('<')) {
                // Opening or self-closing tag
                const isSelfClosing = token.endsWith('/>') || 
                    /^<(br|hr|img|input|link|meta|area|base|col|command|embed|keygen|param|source|track|wbr)[^>]*>$/i.test(token);
                const isComment = token.startsWith('<!--');
                
                formatted += tab.repeat(indent) + token + '\n';
                
                if (!isSelfClosing && !isComment) {
                    indent++;
                }
            } else {
                // Text content
                if (token.trim()) {
                    formatted += tab.repeat(indent) + token.trim() + '\n';
                }
            }
        }
        
        return formatted.trim();
    }

    formatCss(text) {
        let formatted = '';
        let indent = 0;
        const tab = '  ';
        
        // Remove extra whitespace
        text = text.replace(/\s+/g, ' ').trim();
        
        // Add newlines and indentation
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];
            
            if (char === '{') {
                formatted += ' {\n';
                indent++;
            } else if (char === '}') {
                indent = Math.max(0, indent - 1);
                formatted += '\n' + tab.repeat(indent) + '}';
                if (nextChar && nextChar !== '}') {
                    formatted += '\n\n';
                }
            } else if (char === ';' && indent > 0) {
                formatted += ';\n';
                // Add indentation for next line
                if (nextChar && nextChar !== '}') {
                    formatted += tab.repeat(indent);
                }
            } else if (char === ' ' && formatted.endsWith('\n')) {
                // Skip spaces at start of line
                continue;
            } else {
                formatted += char;
                // Add indentation after newline
                if (char === '\n' && nextChar && nextChar !== '}' && !formatted.endsWith(tab.repeat(indent))) {
                    formatted += tab.repeat(indent);
                }
            }
        }
        
        return formatted.trim();
    }

    handleTextSelection() {
        try {
            // Don't auto-highlight if Find & Replace dialog is open
            const findDialog = document.getElementById('findDialog');
            if (findDialog && findDialog.classList.contains('active')) {
                return;
            }
            
            // Clear any existing highlights
            this.clearHighlights();
            
            const start = this.editor.selectionStart;
            const end = this.editor.selectionEnd;
            
            // Only highlight if text is selected and selection is not too long
            if (start === end || end - start > 100) return;
            
            const selectedText = this.editor.value.substring(start, end);
            
            // Only highlight if selection is not just whitespace and is at least 2 characters
            if (!selectedText.trim() || selectedText.length < 2) return;
            
            // Highlight all occurrences
            this.highlightOccurrences(selectedText);
        } catch (error) {
            this.logError('TEXT SELECTION ERROR', 'Error handling text selection', error);
        }
    }

    highlightOccurrences(searchText) {
        try {
            const content = this.editor.value;
            
            // Remove old highlight layer if exists
            const oldLayer = document.querySelector('.highlight-layer');
            if (oldLayer) {
                oldLayer.remove();
                // Remove old scroll listener
                this.editor.removeEventListener('scroll', this.highlightScrollSync);
            }
            
            // Get computed styles for accurate measurements
            const editorStyles = window.getComputedStyle(this.editor);
            const fontSize = parseFloat(editorStyles.fontSize);
            const lineHeight = parseFloat(editorStyles.lineHeight);
            const paddingLeft = parseFloat(editorStyles.paddingLeft);
            const paddingTop = parseFloat(editorStyles.paddingTop);
            
            // Get actual line numbers width
            const lineNumbers = document.getElementById('lineNumbers');
            const lineNumbersWidth = lineNumbers ? lineNumbers.offsetWidth : 50;
            
            // Measure character width accurately using canvas
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.font = `${fontSize}px ${editorStyles.fontFamily}`;
            const charWidth = ctx.measureText('m').width;
            
            // Create highlight layer positioned over the editor
            const highlightLayer = document.createElement('div');
            highlightLayer.className = 'highlight-layer';
            highlightLayer.style.left = `${lineNumbersWidth}px`;
            
            // Store scroll sync function for removal later
            this.highlightScrollSync = () => {
                highlightLayer.style.transform = `translate(-${this.editor.scrollLeft}px, -${this.editor.scrollTop}px)`;
            };
            this.editor.addEventListener('scroll', this.highlightScrollSync);
            
            // Find all occurrences
            const escapedText = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedText, 'gi');
            let match;
            let occurrenceCount = 0;
            
            while ((match = regex.exec(content)) !== null && occurrenceCount < 1000) {
                const matchStart = match.index;
                
                // Calculate position of this occurrence
                const beforeText = content.substring(0, matchStart);
                const lines = beforeText.split('\n');
                const line = lines.length - 1;
                const col = lines[lines.length - 1].length;
                
                // Create highlight span
                const span = document.createElement('span');
                span.className = 'text-highlight';
                span.style.top = `${line * lineHeight + paddingTop}px`;
                span.style.left = `${col * charWidth + paddingLeft}px`;
                span.style.width = `${match[0].length * charWidth}px`;
                span.style.height = `${lineHeight}px`;
                
                highlightLayer.appendChild(span);
                occurrenceCount++;
            }
            
            if (occurrenceCount > 0) {
                // Insert as direct child of editor-wrapper
                this.editor.parentElement.appendChild(highlightLayer);
                // Initial scroll position
                this.highlightScrollSync();
                this.log('INFO', `Highlighted ${occurrenceCount} occurrences of "${searchText}"`);
            }
        } catch (error) {
            this.logError('HIGHLIGHT ERROR', 'Error highlighting occurrences', error);
        }
    }

    clearHighlights() {
        try {
            // Remove all highlight layers
            const highlightLayers = document.querySelectorAll('.highlight-layer');
            highlightLayers.forEach(layer => layer.remove());
            
            // Remove all individual highlight spans
            const highlights = document.querySelectorAll('.text-highlight');
            highlights.forEach(h => h.remove());
            
            // Remove scroll listener
            if (this.highlightScrollSync) {
                this.editor.removeEventListener('scroll', this.highlightScrollSync);
                this.highlightScrollSync = null;
            }
        } catch (error) {
            this.logError('CLEAR HIGHLIGHTS ERROR', 'Error clearing highlights', error);
        }
    }

    updateStatusBar() {
        try {
            // Handle case when there are no tabs
            if (this.tabs.length === 0) {
                document.getElementById('fileName').textContent = 'No file open';
                document.getElementById('fileSize').textContent = '0 Bytes';
                document.getElementById('lineCol').textContent = 'Line 0, Col 0';
                document.getElementById('charCount').textContent = '0 characters';
                return;
            }
            
            const currentTab = this.tabs.find(t => t.id === this.activeTabId);
            const content = this.editor.value;
            const lines = content.split('\n');
            const cursorPos = this.editor.selectionStart;
            
            let line = 1, col = 1, pos = 0;
            for (let i = 0; i < lines.length; i++) {
                if (pos + lines[i].length >= cursorPos) {
                    line = i + 1;
                    col = cursorPos - pos + 1;
                    break;
                }
                pos += lines[i].length + 1;
            }

            document.getElementById('fileName').textContent = currentTab?.name || 'Untitled';
            document.getElementById('fileSize').textContent = this.formatBytes(content.length);
            document.getElementById('lineCol').textContent = `Line ${line}, Col ${col}`;
            document.getElementById('charCount').textContent = `${content.length} characters`;
        } catch (error) {
            this.logError('STATUS BAR ERROR', 'Error updating status bar', error);
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    newFile() {
        try {
            this.log('INFO', 'Creating new file');
            const newId = Math.max(...this.tabs.map(t => t.id)) + 1;
            this.tabs.push({ id: newId, name: 'Untitled', content: '', modified: false, language: 'text', fileHandle: null });
            this.switchTab(newId);
            this.renderTabs();
        } catch (error) {
            this.logError('NEW FILE ERROR', 'Error creating new file', error);
        }
    }

    openFile(event) {
        try {
            const files = Array.from(event.target.files);
            if (files.length === 0) return;

            console.log('openFile: Starting to load', files.length, 'files');
            this.isLoadingFiles = true;
            console.log('openFile: Set isLoadingFiles to true');
            
            // Limit number of files to prevent crashes
            const MAX_FILES = 10;
            if (files.length > MAX_FILES) {
                this.showToast(`Too many files. Opening first ${MAX_FILES} only.`, 'warn');
                files.length = MAX_FILES;
            }
            
            const maxSize = 50 * 1024 * 1024; // 50MB max per file
            let loadedCount = 0;
            let skippedCount = 0;

            files.forEach((file, index) => {
                // Check file size
                if (file.size > maxSize) {
                    this.showToast(`Skipped ${file.name} (too large: ${this.formatBytes(file.size)})`, 'error');
                    this.log('WARN', `File too large: ${file.name} (${file.size} bytes)`);
                    skippedCount++;
                    return;
                }

                this.log('INFO', `Opening file: ${file.name}`);
                if (index === 0 || files.length === 1) {
                    this.showToast(`Loading ${files.length > 1 ? files.length + ' files' : file.name}...`, 'info');
                }
                
                const reader = new FileReader();
                
                reader.onload = (e) => {
                        try {
                            let content = e.target.result;
                            
                            // Prevent duplicate tabs for same file
                            const existingTab = this.tabs.find(t => t.name === file.name);
                            if (existingTab) {
                                this.switchTab(existingTab.id);
                                this.log('INFO', `${file.name} is already open`);
                                loadedCount++;
                                return;
                            }
                            
                            // Auto-format JSON files
                            const detectedLanguage = this.detectLanguage(file.name);
                            if (detectedLanguage === 'json') {
                                try {
                                    const parsed = JSON.parse(content);
                                    content = JSON.stringify(parsed, null, 2);
                                    this.log('INFO', `Auto-formatted JSON file: ${file.name}`);
                                } catch (jsonError) {
                                    this.log('WARN', `Failed to parse JSON file: ${file.name}`, jsonError);
                                    // Keep original content if parsing fails
                                }
                            }
                            
                            const newId = this.tabs.length > 0 ? Math.max(...this.tabs.map(t => t.id)) + 1 : 0;
                            this.tabs.push({ 
                                id: newId, 
                                name: file.name, 
                                content: content, 
                                modified: false,
                                language: detectedLanguage,
                                fileHandle: null
                            });
                            this.switchTab(newId);
                            this.renderTabs();
                            this.log('INFO', `File opened: ${file.name} (${this.formatBytes(file.size)})`);
                            loadedCount++;
                            
                            // Show summary toast when all files processed
                            if (loadedCount + skippedCount === files.length) {
                                console.log('All files loaded, calling saveOpenTabs...');
                                this.isLoadingFiles = false;
                                this.saveOpenTabs();
                                
                                if (loadedCount > 0) {
                                    this.showToast(`Opened ${loadedCount} file${loadedCount > 1 ? 's' : ''}${skippedCount > 0 ? `, skipped ${skippedCount}` : ''}`, 'success');
                                }
                                event.target.value = ''; // Reset file input
                            }
                        } catch (error) {
                            this.logError('FILE LOAD ERROR', 'Error loading file content', error);
                            this.showToast('Failed to load file', 'error');
                            event.target.value = ''; // Reset file input
                        }
                    };
            
                reader.onerror = (error) => {
                    this.logError('FILE READ ERROR', 'Error reading file', error);
                    this.showToast('Failed to read file', 'error');
                    event.target.value = ''; // Reset file input
                };
                
                reader.readAsText(file);
            });
        } catch (error) {
            this.logError('OPEN FILE ERROR', 'Error opening file', error);
            this.showToast('Failed to open file', 'error');
            if (event.target) event.target.value = ''; // Reset file input
        }
    }

    async openFileWithPicker() {
        try {
            // Use File System Access API if available
            if ('showOpenFilePicker' in window) {
                const options = {
                    multiple: true,
                    types: [{
                        description: 'Text Files',
                        accept: { 'text/*': ['.txt', '.js', '.html', '.css', '.json', '.md', '.py', '.xml', '.csv'] }
                    }]
                };
                
                const fileHandles = await window.showOpenFilePicker(options);
                
                for (const fileHandle of fileHandles) {
                    const file = await fileHandle.getFile();
                    const content = await file.text();
                    
                    // Check if file is already open
                    const existingTab = this.tabs.find(t => t.name === file.name);
                    if (existingTab) {
                        this.switchTab(existingTab.id);
                        this.log('INFO', `${file.name} is already open`);
                        continue;
                    }
                    
                    // Auto-format JSON files
                    let formattedContent = content;
                    const detectedLanguage = this.detectLanguage(file.name);
                    if (detectedLanguage === 'json') {
                        try {
                            const parsed = JSON.parse(content);
                            formattedContent = JSON.stringify(parsed, null, 2);
                            this.log('INFO', `Auto-formatted JSON file: ${file.name}`);
                        } catch (jsonError) {
                            this.log('WARN', `Failed to parse JSON file: ${file.name}`, jsonError);
                        }
                    }
                    
                    const newId = this.tabs.length > 0 ? Math.max(...this.tabs.map(t => t.id)) + 1 : 0;
                    this.tabs.push({
                        id: newId,
                        name: file.name,
                        content: formattedContent,
                        modified: false,
                        language: detectedLanguage,
                        fileHandle: fileHandle // Store the handle for later saving!
                    });
                    this.switchTab(newId);
                    this.renderTabs();
                    this.log('INFO', `File opened with handle: ${file.name}`);
                }
                
                // Save to persist the fileHandles to IndexedDB
                await this.saveOpenTabs();
                this.showToast(`Opened ${fileHandles.length} file${fileHandles.length > 1 ? 's' : ''}`, 'success');
            } else {
                // Fallback to file input for older browsers
                document.getElementById('fileInput').click();
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                this.log('INFO', 'File open cancelled by user');
            } else {
                this.logError('OPEN FILE ERROR', 'Error opening file with picker', error);
                this.showToast('Failed to open file', 'error');
            }
        }
    }

    async openFilesWithHandles(fileHandles) {
        try {
            if (!fileHandles || fileHandles.length === 0) return;
            
            for (const fileHandle of fileHandles) {
                const file = await fileHandle.getFile();
                const content = await file.text();
                
                // Check if file is already open
                const existingTab = this.tabs.find(t => t.name === file.name);
                if (existingTab) {
                    this.switchTab(existingTab.id);
                    this.log('INFO', `${file.name} is already open`);
                    continue;
                }
                
                // Auto-format JSON files
                let formattedContent = content;
                const detectedLanguage = this.detectLanguage(file.name);
                if (detectedLanguage === 'json') {
                    try {
                        const parsed = JSON.parse(content);
                        formattedContent = JSON.stringify(parsed, null, 2);
                        this.log('INFO', `Auto-formatted JSON file: ${file.name}`);
                    } catch (jsonError) {
                        this.log('WARN', `Failed to parse JSON file: ${file.name}`, jsonError);
                    }
                }
                
                const newId = this.tabs.length > 0 ? Math.max(...this.tabs.map(t => t.id)) + 1 : 0;
                this.tabs.push({
                    id: newId,
                    name: file.name,
                    content: formattedContent,
                    modified: false,
                    language: detectedLanguage,
                    fileHandle: fileHandle // Store the handle for later saving!
                });
                this.switchTab(newId);
                this.renderTabs();
                this.log('INFO', `File opened with handle: ${file.name}`);
            }
            
            // Save to persist the fileHandles to IndexedDB
            await this.saveOpenTabs();
            this.showToast(`Opened ${fileHandles.length} file${fileHandles.length > 1 ? 's' : ''}`, 'success');
        } catch (error) {
            this.logError('OPEN FILES ERROR', 'Error opening files with handles', error);
            this.showToast('Failed to open file', 'error');
        }
    }

    detectLanguage(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const langMap = {
            'js': 'javascript', 'py': 'python', 'html': 'html',
            'css': 'css', 'json': 'json', 'md': 'markdown', 'txt': 'text'
        };
        return langMap[ext] || 'text';
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    async saveFile() {
        try {
            const currentTab = this.tabs.find(t => t.id === this.activeTabId);
            if (!currentTab) {
                this.log('ERROR', 'No active tab found');
                return;
            }

            let filename = currentTab.name;
            this.log('INFO', `Attempting to save. Current filename: "${filename}"`);
            
            // Check if it's an untitled file (strict check)
            const isUntitled = filename === 'Untitled' || /^Untitled-\d+$/.test(filename);
            this.log('INFO', `Is untitled file: ${isUntitled}`);

            // Try using File System Access API if available (no download notification)
            if ('showSaveFilePicker' in window) {
                try {
                    let handle = currentTab.fileHandle;
                    this.log('INFO', `File handle exists: ${!!handle}`);
                    
                    // If we don't have a handle yet, show the picker to get one
                    if (!handle) {
                        this.log('INFO', 'Showing file picker dialog (needed for write access)');
                        const options = {
                            suggestedName: isUntitled ? 'document.txt' : filename,
                            types: [{
                                description: 'Text Files',
                                accept: { 'text/plain': ['.txt', '.js', '.html', '.css', '.json', '.md', '.py'] }
                            }]
                        };
                        handle = await window.showSaveFilePicker(options);
                        currentTab.fileHandle = handle;
                        this.log('INFO', `Stored file handle: ${!!currentTab.fileHandle}`);
                    } else {
                        this.log('INFO', 'Reusing existing file handle');
                    }
                    
                    const writable = await handle.createWritable();
                    await writable.write(this.editor.value);
                    await writable.close();
                    
                    // Update tab name with saved filename
                    currentTab.name = handle.name;
                    currentTab.language = this.detectLanguage(handle.name);
                    currentTab.modified = false;
                    this.updateTabTitle();
                    this.renderTabs();
                    await this.saveOpenTabs(); // Save after updating fileHandle
                    this.log('INFO', `File saved: ${handle.name}`);
                    this.showToast(`File saved as ${handle.name}`, 'success');
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') {
                        this.log('INFO', 'Save cancelled by user');
                        this.showToast('Save cancelled', 'info');
                        return;
                    }
                    // Fall back to traditional download
                    this.log('WARN', 'File System Access API failed, using fallback', err);
                }
            }

            // Fallback: traditional download method
            // For untitled files, always prompt for filename
            if (isUntitled) {
                this.log('INFO', 'Showing save as dialog');
                const newFilename = prompt('Save As - Enter filename:', 'document.txt');
                this.log('INFO', `User entered: "${newFilename}"`);
                
                if (!newFilename || newFilename.trim() === '') {
                    this.log('INFO', 'Save cancelled by user');
                    this.showToast('Save cancelled', 'info');
                    return; // User cancelled
                }
                filename = newFilename.trim();
                // Update tab name
                currentTab.name = filename;
                currentTab.language = this.detectLanguage(filename);
                this.renderTabs();
                this.log('INFO', `File renamed to: ${filename}`);
            }

            this.log('INFO', `Saving file: ${filename}`);
            const blob = new Blob([this.editor.value], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            
            // Cleanup with slight delay
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            
            currentTab.modified = false;
            this.updateTabTitle();
            this.renderTabs();
            this.log('INFO', `File saved: ${filename}`);
            this.showToast(`File saved as ${filename}`, 'success');
        } catch (error) {
            this.logError('SAVE ERROR', 'Error saving file', error);
            this.showToast('Failed to save file', 'error');
        }
    }

    closeTab(tabId) {
        try {
            const tab = this.tabs.find(t => t.id === tabId);
            if (!tab) return;

            if (tab.modified && !confirm(`${tab.name} has unsaved changes. Close anyway?`)) {
                return;
            }

            this.log('INFO', `Closing tab: ${tab.name}`);
            
            // Clean up IndexedDB entry
            this.clearFileHandleFromIndexedDB(tabId);
            
            this.tabs = this.tabs.filter(t => t.id !== tabId);
            
            if (this.tabs.length === 0) {
                this.tabs.push({ id: 0, name: 'Untitled', content: '', modified: false, language: 'text', fileHandle: null });
            }
            
            if (this.activeTabId === tabId) {
                this.switchTab(this.tabs[0].id);
            }
            
            this.renderTabs();
            this.saveOpenTabs();
        } catch (error) {
            this.logError('CLOSE TAB ERROR', 'Error closing tab', error);
        }
    }

    switchTab(tabId) {
        try {
            const tab = this.tabs.find(t => t.id === tabId);
            if (!tab) return;

            this.activeTabId = tabId;
            this.editor.value = tab.content;
            document.getElementById('languageSelect').value = tab.language;
            
            this.updateLineNumbers();
            this.updateStatusBar();
            this.renderTabs();
            
            if (!this.isLoadingFiles) {
                this.saveOpenTabs();
            }
            
            this.log('INFO', `Switched to tab: ${tab.name}`);
        } catch (error) {
            this.logError('SWITCH TAB ERROR', 'Error switching tab', error);
        }
    }

    renderTabs() {
        try {
            const container = document.getElementById('tabsContainer');
            const tabsHtml = this.tabs.map(tab => `
                <div class="tab ${tab.id === this.activeTabId ? 'active' : ''}" data-tab-id="${tab.id}">
                    <span class="tab-title">${tab.name}${tab.modified ? ' •' : ''}</span>
                    <button class="tab-close" data-tab-id="${tab.id}">×</button>
                </div>
            `).join('');
            
            container.innerHTML = tabsHtml + '<button class="new-tab-btn" id="newTabBtn">+</button>';
            
            // Re-attach new tab button listener
            const newTabBtn = document.getElementById('newTabBtn');
            if (newTabBtn) {
                newTabBtn.addEventListener('click', () => this.newFile());
            }
        } catch (error) {
            this.logError('RENDER TABS ERROR', 'Error rendering tabs', error);
        }
    }

    updateTabTitle() {
        this.renderTabs();
    }

    changeLanguage(language) {
        try {
            const currentTab = this.tabs.find(t => t.id === this.activeTabId);
            if (currentTab) {
                currentTab.language = language;
                this.log('INFO', `Language changed to: ${language}`);
            }
        } catch (error) {
            this.logError('LANGUAGE ERROR', 'Error changing language', error);
        }
    }

    find() {
        try {
            // Clear any existing highlights before opening dialog
            this.clearHighlights();
            
            this.log('INFO', 'Opening find dialog');
            document.getElementById('findDialog').classList.add('active');
            document.getElementById('findInput').focus();
        } catch (error) {
            this.logError('FIND ERROR', 'Error opening find dialog', error);
        }
    }

    replace() {
        try {
            this.log('INFO', 'Opening replace dialog');
            document.getElementById('findDialog').classList.add('active');
            document.getElementById('replaceInput').focus();
        } catch (error) {
            this.logError('REPLACE ERROR', 'Error opening replace dialog', error);
        }
    }

    findNext() {
        try {
            const searchTerm = document.getElementById('findInput').value;
            if (!searchTerm) return;

            const caseSensitive = document.getElementById('caseSensitive').checked;
            const wholeWord = document.getElementById('wholeWord').checked;

            // Clear any highlights from Search All Files
            this.clearHighlights();

            // Get content and current position
            const content = this.editor.value;
            const currentPos = this.editor.selectionStart + 1;
            let index = this.findInText(content, searchTerm, currentPos, caseSensitive, wholeWord);
            
            if (index !== -1) {
                // Found match after current position
                this.editor.focus();
                this.editor.setSelectionRange(index, index + searchTerm.length);
                
                // After setting selection, get the ACTUAL line number from the editor
                const actualStart = this.editor.selectionStart;
                const textBeforeSelection = this.editor.value.substring(0, actualStart);
                const lineNumber = textBeforeSelection.split('\n').length;
                
                const message = `Found at line ${lineNumber}`;
                document.getElementById('findResults').textContent = message;
                
                this.scrollToSelection();
                this.moveDialogIfObscured();
            } else {
                // Wrap to beginning
                const firstIndex = this.findInText(content, searchTerm, 0, caseSensitive, wholeWord);
                if (firstIndex !== -1) {
                    this.editor.focus();
                    this.editor.setSelectionRange(firstIndex, firstIndex + searchTerm.length);
                    
                    // After setting selection, get the ACTUAL line number from the editor
                    const actualStart = this.editor.selectionStart;
                    const textBeforeSelection = this.editor.value.substring(0, actualStart);
                    const lineNumber = textBeforeSelection.split('\n').length;
                    
                    const message = `Wrapped to line ${lineNumber}`;
                    document.getElementById('findResults').textContent = message;
                    
                    this.scrollToSelection();
                    this.moveDialogIfObscured();
                } else {
                    document.getElementById('findResults').textContent = 'No matches found';
                }
            }
        } catch (error) {
            this.logError('FIND NEXT ERROR', 'Error finding next', error);
        }
    }

    findPrevious() {
        try {
            const searchTerm = document.getElementById('findInput').value;
            if (!searchTerm) return;

            const caseSensitive = document.getElementById('caseSensitive').checked;
            const wholeWord = document.getElementById('wholeWord').checked;

            // Clear any highlights from Search All Files
            this.clearHighlights();

            // Get content and current position
            const content = this.editor.value;
            const currentPos = this.editor.selectionStart - 1;
            let index = this.findInTextReverse(content, searchTerm, currentPos, caseSensitive, wholeWord);
            
            if (index !== -1) {
                // Found match before current position
                this.editor.focus();
                this.editor.setSelectionRange(index, index + searchTerm.length);
                
                const actualStart = this.editor.selectionStart;
                const textBeforeSelection = this.editor.value.substring(0, actualStart);
                const lineNumber = textBeforeSelection.split('\n').length;
                
                const message = `Found at line ${lineNumber}`;
                document.getElementById('findResults').textContent = message;
                
                this.scrollToSelection();
                this.moveDialogIfObscured();
            } else {
                // Wrap to end
                const lastIndex = this.findInTextReverse(content, searchTerm, content.length, caseSensitive, wholeWord);
                if (lastIndex !== -1) {
                    this.editor.focus();
                    this.editor.setSelectionRange(lastIndex, lastIndex + searchTerm.length);
                    
                    const actualStart = this.editor.selectionStart;
                    const textBeforeSelection = this.editor.value.substring(0, actualStart);
                    const lineNumber = textBeforeSelection.split('\n').length;
                    
                    const message = `Wrapped to line ${lineNumber}`;
                    document.getElementById('findResults').textContent = message;
                    
                    this.scrollToSelection();
                    this.moveDialogIfObscured();
                } else {
                    document.getElementById('findResults').textContent = 'No matches found';
                }
            }
        } catch (error) {
            this.logError('FIND PREVIOUS ERROR', 'Error finding previous', error);
        }
    }

    findInTextReverse(text, searchTerm, startPos, caseSensitive, wholeWord) {
        const searchText = caseSensitive ? text.substring(0, startPos) : text.substring(0, startPos).toLowerCase();
        const searchFor = caseSensitive ? searchTerm : searchTerm.toLowerCase();
        
        let index = searchText.lastIndexOf(searchFor);
        
        if (wholeWord && index !== -1) {
            // Check if match is a whole word
            const before = index > 0 ? searchText[index - 1] : ' ';
            const after = index + searchFor.length < text.length ? text[index + searchFor.length] : ' ';
            const isWordChar = (char) => /\w/.test(char);
            
            if (isWordChar(before) || isWordChar(after)) {
                // Not a whole word, search for previous occurrence
                return this.findInTextReverse(text, searchTerm, index, caseSensitive, wholeWord);
            }
        }
        
        return index;
    }

    scrollToSelection() {
        try {
            // Use temporary div to measure actual rendered height (handles line wrapping)
            const selectionStart = this.editor.selectionStart;
            
            // Create a temporary div with the same styling as the editor
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute';
            tempDiv.style.visibility = 'hidden';
            tempDiv.style.whiteSpace = window.getComputedStyle(this.editor).whiteSpace;
            tempDiv.style.wordWrap = window.getComputedStyle(this.editor).wordWrap;
            tempDiv.style.font = window.getComputedStyle(this.editor).font;
            tempDiv.style.width = this.editor.clientWidth + 'px';
            tempDiv.style.padding = window.getComputedStyle(this.editor).padding;
            tempDiv.style.border = window.getComputedStyle(this.editor).border;
            tempDiv.style.lineHeight = window.getComputedStyle(this.editor).lineHeight;
            tempDiv.style.letterSpacing = window.getComputedStyle(this.editor).letterSpacing;
            tempDiv.style.wordSpacing = window.getComputedStyle(this.editor).wordSpacing;
            
            document.body.appendChild(tempDiv);
            
            // Get text before selection
            const textBefore = this.editor.value.substring(0, selectionStart);
            tempDiv.textContent = textBefore;
            
            // Measure the height of content before selection
            const heightBefore = tempDiv.scrollHeight;
            
            // Clean up
            document.body.removeChild(tempDiv);
            
            // Position at 25% from top of viewport
            const viewportHeight = this.editor.clientHeight;
            const targetScroll = Math.max(0, heightBefore - viewportHeight * 0.25);
            
            // Apply scroll
            const maxScroll = Math.max(0, this.editor.scrollHeight - this.editor.clientHeight);
            this.editor.scrollTop = Math.min(targetScroll, maxScroll);
        } catch (error) {
            this.logError('SCROLL TO SELECTION ERROR', 'Error scrolling to selection', error);
        }
    }

    findInText(text, searchTerm, startPos, caseSensitive, wholeWord) {
        const searchText = caseSensitive ? text : text.toLowerCase();
        const searchFor = caseSensitive ? searchTerm : searchTerm.toLowerCase();
        
        let index = searchText.indexOf(searchFor, startPos);
        
        if (wholeWord && index !== -1) {
            // Check if match is a whole word
            const before = index > 0 ? searchText[index - 1] : ' ';
            const after = index + searchFor.length < searchText.length ? searchText[index + searchFor.length] : ' ';
            const isWordChar = (char) => /\w/.test(char);
            
            if (isWordChar(before) || isWordChar(after)) {
                // Not a whole word, search for next occurrence
                return this.findInText(text, searchTerm, index + 1, caseSensitive, wholeWord);
            }
        }
        
        return index;
    }

    searchInAllFiles(searchTerm, caseSensitive, wholeWord) {
        let resultsHtml = '';
        let totalMatches = 0;
        const fileResults = [];

        this.tabs.forEach(tab => {
            const content = tab.content;
            const lines = content.split('\n');
            const matches = [];

            lines.forEach((line, index) => {
                let searchIn = caseSensitive ? line : line.toLowerCase();
                let searchFor = caseSensitive ? searchTerm : searchTerm.toLowerCase();
                
                if (wholeWord) {
                    const regex = new RegExp(`\\b${searchFor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, caseSensitive ? '' : 'i');
                    if (regex.test(line)) {
                        matches.push({ lineNum: index + 1, line: line });
                    }
                } else {
                    if (searchIn.includes(searchFor)) {
                        matches.push({ lineNum: index + 1, line: line });
                    }
                }
            });

            if (matches.length > 0) {
                totalMatches += matches.length;
                fileResults.push({ tab, matches });
                resultsHtml += `<div class="result-file-section">`;
                resultsHtml += `<div class="result-file" data-tab-id="${tab.id}"><span class="collapse-icon">&#9654;</span> 📄 ${tab.name} (${matches.length} match${matches.length > 1 ? 'es' : ''})</div>`;
                resultsHtml += `<div class="result-lines-container collapsed">`;
                
                matches.forEach(match => {
                    const highlightedLine = this.highlightMatch(match.line, searchTerm, caseSensitive);
                    resultsHtml += `<div class="result-line" data-tab-id="${tab.id}" data-line="${match.lineNum}">Line ${match.lineNum}: ${highlightedLine}</div>`;
                });
                
                resultsHtml += `</div></div>`;
            }
        });

        if (totalMatches === 0) {
            document.getElementById('findResults').textContent = 'No matches found in any file';
            this.closeSearchResults();
        } else {
            const summary = `Found ${totalMatches} match${totalMatches > 1 ? 'es' : ''} in ${fileResults.length} file(s)`;
            document.getElementById('findResults').textContent = summary;
            
            const panel = document.getElementById('searchResultsPanel');
            const content = document.getElementById('searchResultsContent');
            console.log('Opening search results panel with', totalMatches, 'matches');
            console.log('Panel element:', panel);
            content.innerHTML = `<div class="search-summary">${summary}</div>${resultsHtml}`;
            panel.classList.add('active');
            // Add bottom padding to editor-container so content isn't hidden by panel
            const panelHeight = panel.offsetHeight || 200;
            document.getElementById('editorContainer').style.paddingBottom = panelHeight + 'px';
            console.log('Panel classes after adding active:', panel.className);
            
            // Add click handlers for collapsible sections
            console.log('About to add click handlers...');
            console.log('Content HTML length:', content.innerHTML.length);
            
            const resultFiles = content.querySelectorAll('.result-file');
            console.log('Found', resultFiles.length, 'result files');
            resultFiles.forEach(fileEl => {
                fileEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const section = fileEl.closest('.result-file-section');
                    const linesContainer = section.querySelector('.result-lines-container');
                    const icon = fileEl.querySelector('.collapse-icon');
                    
                    if (linesContainer.classList.contains('collapsed')) {
                        linesContainer.classList.remove('collapsed');
                        icon.innerHTML = '&#9660;';
                    } else {
                        linesContainer.classList.add('collapsed');
                        icon.innerHTML = '&#9654;';
                    }
                });
            });
            
            // Add click handlers to jump to line
            const resultLines = content.querySelectorAll('.result-line');
            console.log('Found', resultLines.length, 'result lines for click handlers');
            resultLines.forEach((lineEl, index) => {
                console.log('Attaching handler to result line', index, lineEl);
                lineEl.addEventListener('click', (e) => {
                    console.log('CLICK EVENT FIRED on result line!', e.target);
                    const tabId = parseInt(lineEl.dataset.tabId);
                    const lineNum = parseInt(lineEl.dataset.line);
                    console.log('Clicked result: switching to tab', tabId, 'line', lineNum);
                    this.switchTab(tabId);
                    // Use setTimeout to ensure tab switch completes before scrolling
                    setTimeout(() => {
                        this.goToLine(lineNum, searchTerm, caseSensitive);
                        this.moveDialogIfObscured();
                    }, 50);
                }, true);
            });
            
            // Test: Add a click listener to the entire panel to see if ANY clicks are captured
            panel.addEventListener('click', (e) => {
                console.log('Click captured on panel:', e.target, e.target.className);
            }, true);
            
            this.log('INFO', `Found ${totalMatches} matches in ${fileResults.length} files`);
        }
    }

    closeSearchResults() {
        document.getElementById('searchResultsPanel').classList.remove('active');
        // Remove bottom padding from editor-container
        document.getElementById('editorContainer').style.paddingBottom = '';
    }

    initSearchResultsResize() {
        const handle = document.getElementById('searchResultsResizeHandle');
        const panel = document.getElementById('searchResultsPanel');
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = panel.offsetHeight;
            document.body.style.cursor = 'ns-resize';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const deltaY = startY - e.clientY;
            const newHeight = startHeight + deltaY;
            const maxHeight = window.innerHeight * 0.8;
            const minHeight = 150;
            
            if (newHeight >= minHeight && newHeight <= maxHeight) {
                panel.style.height = newHeight + 'px';
                // Update editor-container bottom padding to match new panel height
                if (panel.classList.contains('active')) {
                    document.getElementById('editorContainer').style.paddingBottom = newHeight + 'px';
                }
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
            }
        });
    }

    initDialogDrag() {
        const dialogContent = document.querySelector('#findDialog .dialog-content');
        const header = document.getElementById('findDialogHeader');
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            header.style.cursor = 'grabbing';
            
            // Calculate offset from mouse to dialog-content's top-left
            const rect = dialogContent.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            e.preventDefault();
            
            // Calculate new position
            let newLeft = e.clientX - offsetX;
            let newTop = e.clientY - offsetY;
            
            // Keep dialog within viewport bounds
            const maxX = window.innerWidth - dialogContent.offsetWidth;
            const maxY = window.innerHeight - dialogContent.offsetHeight;
            
            newLeft = Math.max(0, Math.min(newLeft, maxX));
            newTop = Math.max(0, Math.min(newTop, maxY));
            
            // Remove centering transform and set absolute position
            dialogContent.style.transform = 'none';
            dialogContent.style.left = newLeft + 'px';
            dialogContent.style.top = newTop + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                header.style.cursor = 'grab';
            }
        });
        
        // Set cursor style on header
        header.style.cursor = 'grab';
    }

    moveDialogIfObscured() {
        try {
            const dialog = document.querySelector('#findDialog .dialog-content');
            const editor = this.editor;
            
            // Get the position of the selected text in the editor
            const selectionStart = editor.selectionStart;
            const textBefore = editor.value.substring(0, selectionStart);
            const lines = textBefore.split('\n');
            const lineNumber = lines.length - 1;
            const colNumber = lines[lines.length - 1].length;
            
            // Calculate approximate pixel position of the selection
            const lineHeight = 22; // Approximate from CSS
            const charWidth = 8; // Approximate monospace char width
            const editorRect = editor.getBoundingClientRect();
            const lineNumbersWidth = document.getElementById('lineNumbers').offsetWidth;
            
            const selectionY = editorRect.top + (lineNumber * lineHeight) - editor.scrollTop + 12; // 12 is padding
            const selectionX = editorRect.left + lineNumbersWidth + (colNumber * charWidth) - editor.scrollLeft + 12;
            
            // Get dialog position and dimensions
            const dialogRect = dialog.getBoundingClientRect();
            
            // Check if selection is obscured by dialog
            const isObscured = selectionX >= dialogRect.left && 
                              selectionX <= dialogRect.right &&
                              selectionY >= dialogRect.top && 
                              selectionY <= dialogRect.bottom;
            
            if (isObscured) {
                // Move dialog to the right side to avoid obscuring the selection
                const viewportWidth = window.innerWidth;
                const dialogWidth = dialogRect.width;
                
                // Position dialog on the right side with some margin
                dialog.style.left = 'auto';
                dialog.style.right = '20px';
                dialog.style.top = '100px'; // Keep it below browser tabs
                dialog.style.transform = 'none';
            }
        } catch (error) {
            this.logError('MOVE DIALOG ERROR', 'Error moving dialog', error);
        }
    }

    highlightMatch(text, searchTerm, caseSensitive) {
        const escapeHtml = (str) => str.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
        const escapedText = escapeHtml(text);
        
        if (caseSensitive) {
            return escapedText.replace(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'g'), '<span class="match-highlight">$1</span>');
        } else {
            return escapedText.replace(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<span class="match-highlight">$1</span>');
        }
    }

    searchAllFilesNow() {
        try {
            const searchTerm = document.getElementById('findInput').value;
            if (!searchTerm) {
                this.showToast('Please enter search text', 'info');
                return;
            }
            
            const caseSensitive = document.getElementById('caseSensitive').checked;
            const wholeWord = document.getElementById('wholeWord').checked;
            
            this.searchInAllFiles(searchTerm, caseSensitive, wholeWord);
        } catch (error) {
            this.logError('SEARCH ALL FILES ERROR', 'Error searching all files', error);
        }
    }

    countOccurrences() {
        try {
            const searchTerm = document.getElementById('findInput').value;
            if (!searchTerm) return;

            const searchScopeElement = document.querySelector('input[name="searchScope"]:checked');
            const searchScope = searchScopeElement ? searchScopeElement.value : 'current';
            const caseSensitive = document.getElementById('caseSensitive').checked;
            const wholeWord = document.getElementById('wholeWord').checked;

            if (searchScope === 'current') {
                const count = this.countInText(this.editor.value, searchTerm, caseSensitive, wholeWord);
                document.getElementById('findResults').textContent = `Found ${count} occurrence${count !== 1 ? 's' : ''}`;
                this.log('INFO', `Count: ${count} occurrences of "${searchTerm}"`);
            } else {
                // Use searchInAllFiles to show detailed results panel
                this.searchInAllFiles(searchTerm, caseSensitive, wholeWord);
            }
        } catch (error) {
            this.logError('COUNT ERROR', 'Error counting occurrences', error);
        }
    }

    countInText(text, searchTerm, caseSensitive, wholeWord) {
        const searchText = caseSensitive ? text : text.toLowerCase();
        const searchFor = caseSensitive ? searchTerm : searchTerm.toLowerCase();
        
        if (wholeWord) {
            const regex = new RegExp(`\\b${searchFor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, caseSensitive ? 'g' : 'gi');
            return (text.match(regex) || []).length;
        } else {
            let count = 0;
            let pos = 0;
            while ((pos = searchText.indexOf(searchFor, pos)) !== -1) {
                count++;
                pos += searchFor.length;
            }
            return count;
        }
    }

    replaceOne() {
        try {
            const searchTerm = document.getElementById('findInput').value;
            const replaceTerm = document.getElementById('replaceInput').value;
            
            if (!searchTerm) return;

            const start = this.editor.selectionStart;
            const end = this.editor.selectionEnd;
            const selected = this.editor.value.substring(start, end);
            
            if (selected === searchTerm) {
                // Use execCommand to preserve undo stack
                this.editor.focus();
                document.execCommand('insertText', false, replaceTerm);
                this.handleInput();
                this.log('INFO', `Replaced: ${searchTerm} with ${replaceTerm}`);
                document.getElementById('findResults').textContent = 'Replaced 1 occurrence';
            }
            
            this.findNext();
        } catch (error) {
            this.logError('REPLACE ONE ERROR', 'Error replacing', error);
        }
    }

    replaceAll() {
        try {
            const searchTerm = document.getElementById('findInput').value;
            const replaceTerm = document.getElementById('replaceInput').value;
            
            if (!searchTerm) return;

            const originalContent = this.editor.value;
            const newContent = originalContent.split(searchTerm).join(replaceTerm);
            const count = (originalContent.match(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
            
            if (count === 0) {
                document.getElementById('findResults').textContent = 'No matches found';
                return;
            }
            
            // Use execCommand to preserve undo stack
            // Note: Undo will select all text (limitation of select() + execCommand)
            this.editor.focus();
            this.editor.select();
            document.execCommand('insertText', false, newContent);
            
            this.handleInput();
            
            this.log('INFO', `Replaced all: ${count} occurrences`);
            document.getElementById('findResults').textContent = `Replaced ${count} occurrences`;
            this.showToast(`Replaced ${count} occurrences`, 'success');
        } catch (error) {
            this.logError('REPLACE ALL ERROR', 'Error replacing all', error);
        }
    }

    closeDialog() {
        document.getElementById('findDialog').classList.remove('active');
    }

    toggleTheme() {
        try {
            this.theme = this.theme === 'dark' ? 'light' : 'dark';
            document.body.classList.toggle('light-theme');
            localStorage.setItem('edita_theme', this.theme);
            this.log('INFO', `Theme: ${this.theme}`);
        } catch (error) {
            this.logError('THEME ERROR', 'Error toggling theme', error);
        }
    }

    loadTheme() {
        try {
            const saved = localStorage.getItem('edita_theme');
            if (saved) {
                this.theme = saved;
                if (this.theme === 'light') document.body.classList.add('light-theme');
            }
        } catch (error) {
            this.logError('LOAD THEME ERROR', 'Error loading theme', error);
        }
    }

    loadVerticalTabsPreference() {
        try {
            const stored = localStorage.getItem('edita_vertical_tabs');
            // Default to vertical if no preference stored
            const isVertical = stored === null ? true : stored === 'true';
            
            if (isVertical) {
                document.getElementById('tabsContainer').classList.add('vertical');
                document.getElementById('editorContainer').classList.add('vertical-tabs');
                // Save the default preference
                if (stored === null) {
                    localStorage.setItem('edita_vertical_tabs', 'true');
                }
            }
        } catch (error) {
            this.logError('LOAD VERTICAL TABS ERROR', 'Error loading vertical tabs preference', error);
        }
    }

    showLogs() {
        try {
            this.log('INFO', 'Opening logs');
            this.loadLogsFromStorage();
            const logsContent = document.getElementById('logsContent');
            
            if (this.logs.length === 0) {
                logsContent.textContent = 'No logs available.';
            } else {
                const formattedLogs = this.logs.map(log => {
                    let entry = `[${log.timestamp}] [${log.level}] ${log.message}`;
                    if (log.data) entry += `\n${log.data}`;
                    return entry;
                }).join('\n\n---\n\n');
                logsContent.textContent = formattedLogs;
            }
            
            document.getElementById('logsDialog').classList.add('active');
        } catch (error) {
            this.logError('SHOW LOGS ERROR', 'Error showing logs', error);
        }
    }

    closeLogsDialog() {
        document.getElementById('logsDialog').classList.remove('active');
    }

    clearLogs() {
        try {
            if (confirm('Clear all logs?')) {
                this.logs = [];
                localStorage.removeItem('edita_logs');
                document.getElementById('logsContent').textContent = 'No logs available.';
                this.log('INFO', 'Logs cleared');
            }
        } catch (error) {
            this.logError('CLEAR LOGS ERROR', 'Error clearing logs', error);
        }
    }

    exportLogs() {
        try {
            this.log('INFO', 'Exporting logs');
            const logsJson = JSON.stringify(this.logs, null, 2);
            const blob = new Blob([logsJson], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `edita_logs_${new Date().toISOString().replace(/:/g, '-')}.json`;
            a.click();
            URL.revokeObjectURL(url);
            this.showToast('Logs exported', 'success');
        } catch (error) {
            this.logError('EXPORT LOGS ERROR', 'Error exporting logs', error);
        }
    }

    installPWA() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            this.deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    this.log('INFO', 'PWA installed');
                    this.showToast('App installed successfully!', 'success');
                }
                this.deferredPrompt = null;
                document.getElementById('installPrompt').style.display = 'none';
            });
        }
    }

    toggleVerticalTabs() {
        try {
            const tabsContainer = document.getElementById('tabsContainer');
            const editorContainer = document.getElementById('editorContainer');
            const isVertical = tabsContainer.classList.toggle('vertical');
            
            if (isVertical) {
                editorContainer.classList.add('vertical-tabs');
            } else {
                editorContainer.classList.remove('vertical-tabs');
            }
            
            localStorage.setItem('edita_vertical_tabs', isVertical);
            this.log('INFO', `Vertical tabs: ${isVertical}`);
            this.showToast(`Tabs ${isVertical ? 'vertical' : 'horizontal'}`, 'info');
        } catch (error) {
            this.logError('VERTICAL TABS ERROR', 'Error toggling vertical tabs', error);
        }
    }

    findInFiles() {
        try {
            this.log('INFO', 'Opening find dialog with all files scope');
            document.getElementById('findDialog').classList.add('active');
            document.getElementById('searchScopeAll').checked = true;
            document.getElementById('findInput').focus();
        } catch (error) {
            this.logError('FIND IN FILES ERROR', 'Error opening find dialog', error);
        }
    }

    searchAllTabs() {
        // This method is deprecated - use the unified search dialog with "All Open Files" option instead
        try {
            this.findInFiles();
        } catch (error) {
            this.logError('SEARCH ALL TABS ERROR', 'Error opening search dialog', error);
        }
    }

    goToLine(lineNum, searchTerm = null, caseSensitive = false) {
        try {
            console.log('Going to line:', lineNum, 'searchTerm:', searchTerm);
            const lines = this.editor.value.split('\n');
            let charCount = 0;
            
            for (let i = 0; i < Math.min(lineNum - 1, lines.length); i++) {
                charCount += lines[i].length + 1;
            }
            
            this.editor.focus();
            
            // If searchTerm provided, find and select only the search term in the line
            if (searchTerm && lines[lineNum - 1]) {
                const line = lines[lineNum - 1];
                const searchIn = caseSensitive ? line : line.toLowerCase();
                const searchFor = caseSensitive ? searchTerm : searchTerm.toLowerCase();
                const termIndex = searchIn.indexOf(searchFor);
                
                if (termIndex !== -1) {
                    // Select only the search term
                    this.editor.setSelectionRange(charCount + termIndex, charCount + termIndex + searchTerm.length);
                } else {
                    // Fallback: select entire line if term not found
                    this.editor.setSelectionRange(charCount, charCount + (lines[lineNum - 1]?.length || 0));
                }
            } else {
                // No search term: select entire line
                this.editor.setSelectionRange(charCount, charCount + (lines[lineNum - 1]?.length || 0));
            }
            
            // Use temp div for accurate scrolling
            this.scrollToSelection();
            this.updateStatusBar();
            
            console.log('Jumped to line', lineNum, 'at char position', charCount);
        } catch (error) {
            this.logError('GO TO LINE ERROR', 'Error going to line', error);
        }
    }
}

// Initialize
let edita;
try {
    edita = new Edita();
} catch (error) {
    console.error('Failed to initialize Edita:', error);
    alert('Failed to initialize Edita. Check console for details.');
}
