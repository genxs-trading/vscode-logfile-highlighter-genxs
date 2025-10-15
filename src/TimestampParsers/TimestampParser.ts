'use strict';

import moment = require("moment");
import { TimeFormatParser } from "./TimeFormatParser";
import { CustomMicrosecondTimeFormatParser } from "./CustomMicrosecondTimeFormatParser";
// GenXs Performance: Use custom parser first, then ISO for fallback
// Uncomment additional parsers if needed for other log formats:
// import { DanishDateFormatParser } from "./DanishDateFormatParser";
// import { IsoDateFormatParser } from "./IsoDateFormatParser";
// import { USDateFormatParser } from "./USDateFormatParser";
// import { DanishDateTimeFormatParser } from "./DanishDateTimeFormatParser";
import { IsoDateTimeFormatParser } from "./IsoDateTimeFormatParser";
// import { USDateTimeFormatParser } from "./USDateTimeFormatParser";
// import { LittleEndianDateFormatParser } from "./LittleEndianDateFormatParser";
// import { LittleEndianDateTimeFormatParser } from "./LittleEndianDateTimeFormatParser";
import { IsoSlimDateTimeFormatParser } from "./IsoSlimDateTimeFormatParser";

export class TimestampParser {
    private parsers: TimestampFormatParser[];

    constructor() {
        // GenXs Performance: Use custom parser first (most common), then ISO for fallback.
        // This handles both time-only timestamps and full ISO datetime timestamps.
        // The custom parser matches: HH:MM:SS.mmmmmm (e.g., 17:13:42.901377)
        // ISO parser handles: YYYY-MM-DD HH:MM:SS+TZ (e.g., 2025-09-25 22:26:38+02:00)
        this.parsers = [
            new CustomMicrosecondTimeFormatParser(), // 17:13:42.901377 (custom format - most common)
            new IsoDateTimeFormatParser(),           // 2025-09-25 22:26:38+02:00 (fallback for mixed logs)
            new IsoSlimDateTimeFormatParser()        // 2020-01-28T14:45:30.123Z (fallback)
        ];
    }

    public getTimestampFromText(text: string): ParsedTimestamp | undefined {
        for (const parser of this.parsers) {
            const match = parser.parse(text);
            if (match) {
                return this._createTimestampFromMatch(match);
            }
        }
        return undefined;
    }

    private _createTimestampFromMatch(match: TimestampMatch): ParsedTimestamp {
        // console.log('TimestampParser', match);
        const microsecondsMatch = match.match.groups?.microseconds;
        let microseconds = 0;

        if (microsecondsMatch) {
            microseconds = parseInt(microsecondsMatch);
        }
        const matchedString = match.match[0];
        const normalizedTimestamp = match.normalizedTimestamp;

        return {
            original: matchedString,
            matchIndex: match.match.index,
            moment: match.containsDate ? moment(normalizedTimestamp, moment.ISO_8601) : undefined,
            duration: !match.containsDate ? moment.duration(normalizedTimestamp) : undefined,
            microseconds: microseconds
        } as ParsedTimestamp;
    }
}

export interface TimestampFormatParser {
    parse(text: string): TimestampMatch | null;
}

/**
 * Represents a match of a timestamp within a log file.
 */
export class TimestampMatch {
    /**
     * The regular expression match result.
     */
    public match: RegExpExecArray;

    /**
     * The timestamp representation that can be parsed by moment.js.
     */
    public normalizedTimestamp: string;

    /**
     * Indicates whether the timestamp contains a date.
     */
    public containsDate: boolean;
}

export class ParsedTimestamp {
    original: string;
    matchIndex: number;
    moment?: moment.Moment;
    duration?: moment.Duration;
    microseconds: number;
}