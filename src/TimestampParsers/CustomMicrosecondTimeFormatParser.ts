'use strict';
import { TimestampFormatParser, TimestampMatch } from "./TimestampParser";

/**
 * Parser for time format with microseconds separated by tilde: HH:MM:SS.mmmmmm~us
 * Example: 17:13:42.901377~002
 * Where 901 is milliseconds, 377 is microseconds, ~002 is additional precision
 */
export class CustomMicrosecondTimeFormatParser implements TimestampFormatParser {
    // Pattern: HH:MM:SS.mmmmmm
    // Matches anywhere in the line (no ^ anchor)
    private pattern = new RegExp(`^(\\d{2}:\\d{2}:\\d{2})\\.(\\d{3})(?<microseconds>\\d{3})`);

    parse(text: string): TimestampMatch | null {
        const match = this.pattern.exec(text);
        if (match) {
            // Normalize to moment.duration format: HH:MM:SS.mmm
            // Keep the full time (HH:MM:SS) and append milliseconds
            const timeWithMilliseconds = `${match[1]}.${match[2]}`;
            return {
                match: match,
                normalizedTimestamp: timeWithMilliseconds,
                containsDate: false
            } as TimestampMatch;
        }
        return null;
    }
}
