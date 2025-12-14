// Edita - Advanced Text Editor with Error Logging
class Edita {
    constructor() {
        this.editor = document.getElementById('editor');
        this.lineNumbers = document.getElementById('lineNumbers');
        this.tabs = [{ id: 0, name: 'Untitled', content: '', modified: false, language: 'text' }];
        this.activeTabId = 0;
        this.logs = [];
        this.theme = 'dark';
        this.findIndex = 0;
        this.deferredPrompt = null;
        
        this.init();
    }

    init() {
        try {
            this.log('INFO', 'Initializing Edita...');
            
            // Event listeners for editor
            this.editor.addEventListener('input', () => this.handleInput());
            this.editor.addEventListener('scroll', () => this.syncScroll());
            this.editor.addEventListener('keydown', (e) => this.handleKeydown(e));
            this.editor.addEventListener('click', () => this.updateStatusBar());
            this.editor.addEventListener('keyup', () => this.updateStatusBar());
            
            // Toolbar buttons
            document.getElementById('newBtn').addEventListener('click', () => this.newFile());
            document.getElementById('openBtn').addEventListener('click', () => document.getElementById('fileInput').click());
            document.getElementById('saveBtn').addEventListener('click', () => this.saveFile());
            document.getElementById('findBtn').addEventListener('click', () => this.find());
            document.getElementById('replaceBtn').addEventListener('click', () => this.replace());
            document.getElementById('themeBtn').addEventListener('click', () => this.toggleTheme());
            document.getElementById('logsBtn').addEventListener('click', () => this.showLogs());
            document.getElementById('newTabBtn').addEventListener('click', () => this.newFile());
            
            // File input
            document.getElementById('fileInput').addEventListener('change', (e) => this.openFile(e));
            
            // Language select
            document.getElementById('languageSelect').addEventListener('change', (e) => this.changeLanguage(e.target.value));
            
            // Find/Replace dialog
            document.getElementById('findNextBtn').addEventListener('click', () => this.findNext());
            document.getElementById('replaceOneBtn').addEventListener('click', () => this.replaceOne());
            document.getElementById('replaceAllBtn').addEventListener('click', () => this.replaceAll());
            document.getElementById('closeDialogBtn').addEventListener('click', () => this.closeDialog());
            
            // Logs dialog
            document.getElementById('clearLogsBtn').addEventListener('click', () => this.clearLogs());
            document.getElementById('exportLogsBtn').addEventListener('click', () => this.exportLogs());
            document.getElementById('closeLogsBtn').addEventListener('click', () => this.closeLogsDialog());
            
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

            this.updateLineNumbers();
            this.updateStatusBar();
            this.loadTheme();
            this.loadLogsFromStorage();
            
            this.log('INFO', 'Edita initialized successfully');
            this.showToast('Welcome to Edita!', 'success');
        } catch (error) {
            this.logError('INIT ERROR', 'Failed to initialize', error);
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
            this.updateLineNumbers();
            this.updateStatusBar();
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

    updateStatusBar() {
        try {
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
            this.tabs.push({ id: newId, name: 'Untitled', content: '', modified: false, language: 'text' });
            this.switchTab(newId);
            this.renderTabs();
        } catch (error) {
            this.logError('NEW FILE ERROR', 'Error creating new file', error);
        }
    }

    openFile(event) {
        try {
            const file = event.target.files[0];
            if (!file) return;

            this.log('INFO', `Opening file: ${file.name}`);
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const content = e.target.result;
                    const newId = Math.max(...this.tabs.map(t => t.id)) + 1;
                    this.tabs.push({ 
                        id: newId, 
                        name: file.name, 
                        content: content, 
                        modified: false,
                        language: this.detectLanguage(file.name)
                    });
                    this.switchTab(newId);
                    this.renderTabs();
                    this.log('INFO', `File opened: ${file.name}`);
                } catch (error) {
                    this.logError('FILE LOAD ERROR', 'Error loading file', error);
                }
            };
            
            reader.onerror = (error) => {
                this.logError('FILE READ ERROR', 'Error reading file', error);
            };
            
            reader.readAsText(file);
        } catch (error) {
            this.logError('OPEN FILE ERROR', 'Error opening file', error);
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

    saveFile() {
        try {
            const currentTab = this.tabs.find(t => t.id === this.activeTabId);
            if (!currentTab) return;

            this.log('INFO', `Saving file: ${currentTab.name}`);
            const blob = new Blob([this.editor.value], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = currentTab.name;
            a.click();
            URL.revokeObjectURL(url);
            
            currentTab.modified = false;
            this.updateTabTitle();
            this.log('INFO', `File saved: ${currentTab.name}`);
            this.showToast('File saved successfully!', 'success');
        } catch (error) {
            this.logError('SAVE ERROR', 'Error saving file', error);
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
            this.tabs = this.tabs.filter(t => t.id !== tabId);
            
            if (this.tabs.length === 0) {
                this.tabs.push({ id: 0, name: 'Untitled', content: '', modified: false, language: 'text' });
            }
            
            if (this.activeTabId === tabId) {
                this.switchTab(this.tabs[0].id);
            }
            
            this.renderTabs();
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
            document.getElementById('newTabBtn').addEventListener('click', () => this.newFile());
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

            const content = this.editor.value;
            const currentPos = this.editor.selectionStart + 1;
            const index = content.indexOf(searchTerm, currentPos);
            
            if (index !== -1) {
                this.editor.focus();
                this.editor.setSelectionRange(index, index + searchTerm.length);
                this.log('INFO', `Found: ${searchTerm} at ${index}`);
                document.getElementById('findResults').textContent = `Found at position ${index}`;
            } else {
                const firstIndex = content.indexOf(searchTerm);
                if (firstIndex !== -1) {
                    this.editor.setSelectionRange(firstIndex, firstIndex + searchTerm.length);
                    document.getElementById('findResults').textContent = 'Wrapped to beginning';
                } else {
                    document.getElementById('findResults').textContent = 'No matches found';
                }
            }
        } catch (error) {
            this.logError('FIND NEXT ERROR', 'Error finding next', error);
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
                const content = this.editor.value;
                this.editor.value = content.substring(0, start) + replaceTerm + content.substring(end);
                this.editor.setSelectionRange(start, start + replaceTerm.length);
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
            
            this.editor.value = newContent;
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
}

// Initialize
let edita;
try {
    edita = new Edita();
} catch (error) {
    console.error('Failed to initialize Edita:', error);
    alert('Failed to initialize Edita. Check console for details.');
}
