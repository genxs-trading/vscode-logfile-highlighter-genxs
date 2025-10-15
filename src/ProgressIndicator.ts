import * as vscode from 'vscode';
import { TimePeriodCalculator } from './TimePeriodCalculator';
import { SelectionHelper } from './SelectionHelper';
import moment = require('moment');
import { Constants } from './Constants';
import { TimeWithMicroseconds } from './TimeWithMicroseconds';
import { TimestampParser } from './TimestampParsers/TimestampParser';

export class ProgressIndicator {

    private _decorationFilled: vscode.TextEditorDecorationType;;
    private _decorationUnfilled: vscode.TextEditorDecorationType;;
    private _timeCalculator: TimePeriodCalculator;
    private _selectionHelper: SelectionHelper;
    private _timestampParser: TimestampParser;
    private _maxLinesToDecorate: number = 1000000;

    constructor(timeCalculator: TimePeriodCalculator, selectionHelper: SelectionHelper, timestampParser: TimestampParser) {
        this._timeCalculator = timeCalculator;
        this._selectionHelper = selectionHelper;
        this._timestampParser = timestampParser;
    }

    public setUnderlineColor(color: string) {
        this._decorationFilled = vscode.window.createTextEditorDecorationType({
            borderWidth: '0 0 2px 0',
            borderStyle: 'solid',
            borderColor: color,
        });
        this._decorationUnfilled = vscode.window.createTextEditorDecorationType({
            borderWidth: '0 0 2px 0',
            borderStyle: 'solid',
            borderColor: '#404040', // Dark gray for unfilled portion
        });
    }

    public setMaxLinesToDecorate(maxLines: number) {
        this._maxLinesToDecorate = maxLines;
    }

    /**
     * Decorates the lines in the specified range of the given text editor.
     * 
     * @param editor - The text editor in which to decorate the lines.
     * @param startLine - The starting line of the range to decorate.
     * @param endLine - The ending line of the range to decorate.
     */
    public decorateLines(editor: vscode.TextEditor, startLine: number, endLine: number) {
        const doc = editor.document;

        // GenXs Performance: Skip decoration for very large selections to avoid performance issues
        const selectionSize = endLine - startLine + 1;
        console.log('ProgressIndicator: decorateLines called with', selectionSize, 'lines (max:', this._maxLinesToDecorate, ')');
        if (selectionSize > this._maxLinesToDecorate) {
            vscode.window.showInformationMessage(
                `Selection is too large (${selectionSize} lines). Maximum is ${this._maxLinesToDecorate} lines. ` +
                `You can increase this in settings: logFileHighlighter.maxLinesToDecorate`
            );
            return;
        }

        // First pass: collect all timestamps with their line numbers
        // Only collect lines that match the custom microsecond format
        let lineTimestamps: Array<{line: number, timestamp: TimeWithMicroseconds, matchIndex: number, width: number, duration?: moment.Duration}> = [];
        for (let line = startLine; line <= endLine; line++) {
            var lineText = editor.document.lineAt(line).text;
            var timestamp = this._timestampParser.getTimestampFromText(lineText);
            
            if (line < startLine + 5) {
                console.log('ProgressIndicator: Line', line, 'text:', lineText.substring(0, 100));
                console.log('ProgressIndicator: Parsed timestamp:', timestamp);
            }
            
            // Only include timestamps that are time-only (duration-based, not full dates)
            // This filters to only custom microsecond format timestamps
            if (timestamp && timestamp.duration) {
                let timestampWithMicroseconds = new TimeWithMicroseconds(timestamp.moment, timestamp.microseconds);
                lineTimestamps.push({
                    line: line,
                    timestamp: timestampWithMicroseconds,
                    matchIndex: timestamp.matchIndex,
                    width: timestamp.original.length,
                    duration: timestamp.duration
                });
            }
        }
        console.log('ProgressIndicator: Collected', lineTimestamps.length, 'custom format timestamps');

        // Need at least 2 timestamps to calculate progress
        if (lineTimestamps.length < 2) {
            console.log('ProgressIndicator: Not enough custom format timestamps found');
            return;
        }

        // Calculate total duration from first to last custom timestamp
        const firstTimestamp = lineTimestamps[0];
        const lastTimestamp = lineTimestamps[lineTimestamps.length - 1];
        
        const startTimeValue = firstTimestamp.duration!.asMilliseconds() * 1000 + firstTimestamp.timestamp.microseconds;
        const endTimeValue = lastTimestamp.duration!.asMilliseconds() * 1000 + lastTimestamp.timestamp.microseconds;
        const totalDurationInMicroseconds = endTimeValue - startTimeValue;
        
        console.log('ProgressIndicator: Total duration =', totalDurationInMicroseconds, 'microseconds (from', lineTimestamps.length, 'timestamps)');

        if (totalDurationInMicroseconds <= 0) {
            console.log('ProgressIndicator: Duration is zero or negative, skipping decorations');
            return;
        }

        // Second pass: create decorations based on cumulative progress
        let filledRanges: vscode.Range[] = [];
        let unfilledRanges: vscode.Range[] = [];
        
        for (let i = 0; i < lineTimestamps.length; i++) {
            const current = lineTimestamps[i];
            
            // Calculate current time value (all timestamps here are time-only with duration)
            const currentTimeValue = current.duration!.asMilliseconds() * 1000 + current.timestamp.microseconds;

            // Calculate progress from start to this line (0.0 to 1.0)
            const elapsedTime = currentTimeValue - startTimeValue;
            const progress = totalDurationInMicroseconds > 0 ? elapsedTime / totalDurationInMicroseconds : 0;

            // Clamp progress between 0 and 1
            const clampedProgress = Math.max(0, Math.min(1, progress));

            // Calculate decoration width based on progress
            // Minimum 1 char for visibility, maximum is the timestamp width
            const decorationCharacterCount = Math.max(1, Math.min(current.width, Math.floor(current.width * clampedProgress)));

            // Filled portion (green)
            if (decorationCharacterCount > 0) {
                const filledRange = new vscode.Range(
                    current.line,
                    current.matchIndex,
                    current.line,
                    current.matchIndex + decorationCharacterCount
                );
                filledRanges.push(filledRange);
            }
            
            // Unfilled portion (gray) - the rest of the timestamp
            if (decorationCharacterCount < current.width) {
                const unfilledRange = new vscode.Range(
                    current.line,
                    current.matchIndex + decorationCharacterCount,
                    current.line,
                    current.matchIndex + current.width
                );
                unfilledRanges.push(unfilledRange);
            }
        }

        if (this._decorationFilled && this._decorationUnfilled) {
            editor.setDecorations(this._decorationFilled, filledRanges);
            editor.setDecorations(this._decorationUnfilled, unfilledRanges);
            vscode.commands.executeCommand('setContext', Constants.ContextNameIsShowingProgressIndicators, true);
        } else {
            console.log('ProgressIndicator: decorations are not initialized, skipping setDecorations');
        }
    }

    removeAllDecorations() {
        if (this._decorationFilled) {
            vscode.window.visibleTextEditors.forEach(editor => {
                editor.setDecorations(this._decorationFilled, []);
            });
        }
        if (this._decorationUnfilled) {
            vscode.window.visibleTextEditors.forEach(editor => {
                editor.setDecorations(this._decorationUnfilled, []);
            });
        }

        vscode.commands.executeCommand('setContext', Constants.ContextNameIsShowingProgressIndicators, false);
    }
}
