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
            this.registerSelectionEventHandlers();
            this._progressIndicator.removeAllDecorations(); // Do this before the call to setUnderlineColor since the decoration object will be recreated
            this._progressIndicator.setUnderlineColor(config.progressIndicatorUnderlineColor);
            this._progressIndicator.setMaxLinesToDecorate(config.maxLinesToDecorate);
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
        // GenXs Performance: Use debounced handler to prevent excessive decoration updates during rapid selection changes
        vscode.window.onDidChangeTextEditorSelection(event => this.debouncedDecorateLines(event), this, subscriptions);
        this._disposableSubscriptions = vscode.Disposable.from(...subscriptions);
    }

    private unregisterSelectionEventHandlers() {
        if (this._disposableSubscriptions) {
            this._disposableSubscriptions.dispose();
            this._disposableSubscriptions = null;
        }
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