'use strict';

import * as vscode from 'vscode';
import { ProgressIndicator } from './ProgressIndicator';

export class ProgressIndicatorController {

    private _progressIndicator: ProgressIndicator;
    private _disposableSubscriptions: vscode.Disposable;
    private _statusBarItem: vscode.StatusBarItem;
    // GenXs Performance: Debounce selection changes to avoid excessive decoration updates
    private _debounceTimer: NodeJS.Timeout | undefined;
    private readonly _debounceDelay = 150; // milliseconds

    constructor(progressIndicator: ProgressIndicator) {
        this._progressIndicator = progressIndicator;

        this.init();

        vscode.workspace.onDidChangeConfiguration(() => { this.onDidChangeConfiguration(); }, this);
    }

    public removeDecorations() {
        // Clear any pending debounce timer
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = undefined;
        }
        this._progressIndicator.removeAllDecorations();
        this.clearEditorSelections();
    }

    private clearEditorSelections() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            // Get the current active cursor position
            const currentPosition = editor.selection.active;
            // Clear selections by setting the selection to the current cursor position
            editor.selection = new vscode.Selection(currentPosition, currentPosition);
        }
    }

    private getConfiguration(): { enableProgressIndicator: boolean, progressIndicatorUnderlineColor: string, maxLinesToDecorate: number } {
        const config = vscode.workspace.getConfiguration('logFileHighlighter');

        const enableProgressIndicator = config.get('enableProgressIndicator', true);
        const progressIndicatorUnderlineColor = config.get('progressIndicatorUnderlineColor', '#00ff1f8f');
        const maxLinesToDecorate = config.get('maxLinesToDecorate', 1000000);

        return {
            enableProgressIndicator,
            progressIndicatorUnderlineColor,
            maxLinesToDecorate
        };
    }

    public dispose() {
        // Clear any pending debounce timer
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = undefined;
        }
        this._statusBarItem.dispose();
        this._disposableSubscriptions.dispose();
    }

    private onDidChangeConfiguration(): void {
        this.init();
    }

    private init() {
        const config = this.getConfiguration();

        if (config.enableProgressIndicator) {
            this._progressIndicator.removeAllDecorations(); // Do this before the call to setUnderlineColor since the decoration object will be recreated
            this._progressIndicator.setUnderlineColor(config.progressIndicatorUnderlineColor);
            this._progressIndicator.setMaxLinesToDecorate(config.maxLinesToDecorate);
            this.registerSelectionEventHandlers();
        }
        else {
            // Remove all decorations in case they're disabled now or have changed settings
            this._progressIndicator.removeAllDecorations();

            // Unregister all event listeners
            this.unregisterSelectionEventHandlers();
        }
    }

    private registerSelectionEventHandlers() {
        this.unregisterSelectionEventHandlers();

        const subscriptions: vscode.Disposable[] = [];
        
        // Decorate on file open/switch
        vscode.window.onDidChangeActiveTextEditor(editor => {
            console.log('ProgressIndicatorController: Active editor changed:', editor ? editor.document.fileName : 'none');
            if (editor) {
                this.decorateEntireFile(editor);
            }
        }, this, subscriptions);
        
        // Decorate on document changes (optional - can be removed if too frequent)
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document) {
                this.debouncedDecorateEntireFile(editor);
            }
        }, this, subscriptions);
        
        // Also decorate the currently active editor immediately
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            this.decorateEntireFile(activeEditor);
        }
        
        this._disposableSubscriptions = vscode.Disposable.from(...subscriptions);
    }

    private unregisterSelectionEventHandlers() {
        if (this._disposableSubscriptions) {
            this._disposableSubscriptions.dispose();
            this._disposableSubscriptions = null;
        }
    }

    /// Decorates the entire file with progress bars
    private decorateEntireFile(editor: vscode.TextEditor) {
        try {
            const document = editor.document;
            const startLine = 0;
            const endLine = document.lineCount - 1;
            
            console.log('ProgressIndicatorController: Decorating entire file -', document.lineCount, 'lines from', document.fileName);
            this._progressIndicator.decorateLines(editor, startLine, endLine);
        } catch (error) {
            console.error('Error while decorating entire file:', error);
            vscode.window.showErrorMessage('Error decorating file: ' + error);
        }
    }

    /// Debounced version of decorateEntireFile
    private debouncedDecorateEntireFile(editor: vscode.TextEditor) {
        // Clear any existing timer
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
        }

        // Set a new timer to execute after the debounce delay
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = undefined;
            this.decorateEntireFile(editor);
        }, this._debounceDelay);
    }

    /// GenXs Performance: Debounced version of decorateLines to reduce excessive updates
    /// during rapid selection changes (e.g., when using arrow keys or dragging).
    /// Waits for selection to stabilize before applying decorations.
    private debouncedDecorateLines(event: vscode.TextEditorSelectionChangeEvent) {
        // Clear any existing timer
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
        }

        // Set a new timer to execute after the debounce delay
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = undefined;
            this.decorateLines(event);
        }, this._debounceDelay);
    }

    /// Decorates the lines in the specified range of the given text editor.
    private decorateLines(event: vscode.TextEditorSelectionChangeEvent) {
        try {
            if (event.textEditor === vscode.window.activeTextEditor) {
                for (const selection of event.selections) {
                    this._progressIndicator.decorateLines(event.textEditor, selection.start.line, selection.end.line);
                }
            }
        } catch (error) {
            console.error('Error while decorating lines:', error);
            vscode.window.showErrorMessage('An error occurred while decorating lines: ' + error.message);
        }
    }
}