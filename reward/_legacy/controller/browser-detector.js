// =============================================
// BROWSER DETECTOR (Simplified)
// Finds running GenLogin browser instances
// =============================================

import { exec } from 'child_process';
import path from 'path';

/**
 * Safely escape WMIC query arguments
 * @param {string} arg - Argument to escape
 */
function escapeWmicArg(arg) {
    // For WMIC, escape double quotes by doubling them
    return arg.replace(/"/g, '""');
}

/**
 * Get list of running GenLogin browser profiles
 * @returns {Promise<Array<{profileId: string, name: string, debugPort: number}>>}
 */
export async function getRunningProfiles() {
    return new Promise((resolve) => {
        // Use WMIC with better filtering and error handling
        const escapedName = escapeWmicArg('chrome.exe');
        const cmd = `wmic process where "name='${escapedName}'" get commandline /format:list 2>&1`;

        exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
            if (err && stderr) {
                console.error('Error scanning browser processes:', stderr);
                resolve([]);
                return;
            }

            const detected = new Map();
            let profileCount = 0;

            try {
                for (const line of stdout.split('\n')) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('CommandLine=')) continue;

                    // decodeURIComponent for Unicode, fallback to raw
                    let cmdLine;
                    try {
                        cmdLine = decodeURIComponent(trimmed.substring('CommandLine='.length));
                    } catch (e) {
                        cmdLine = trimmed.substring('CommandLine='.length);
                    }

                    // Check for GenLogin markers (case-insensitive)
                    const cmdLineLower = cmdLine.toLowerCase();
                    if (!cmdLineLower.includes('.genlogin') && !cmdLineLower.includes('genlogin')) {
                        continue;
                    }

                    // Extract user-data-dir path
                    const dirMatch = cmdLine.match(/--user-data-dir[=\s]+(?:"([^"]+)"|([^\s]+))/i);
                    if (!dirMatch) continue;

                    const fullPath = dirMatch[1] || dirMatch[2];
                    const folderName = path.basename(fullPath);

                    // Get unique ID from folder name (last segment after split by _)
                    const parts = folderName.split('_');
                    const uniqueId = parts[parts.length - 1];

                    if (detected.has(uniqueId)) continue;

                    // Extract remote debugging port
                    const portMatch = cmdLine.match(/--remote-debugging-port[=\s:](\d+)/i);
                    const port = portMatch ? parseInt(portMatch[1], 10) : null;

                    if (port && port > 0 && port <= 65535) {
                        profileCount++;
                        detected.set(uniqueId, {
                            profileId: uniqueId,
                            name: `Profile_${uniqueId}`,
                            debugPort: port
                        });
                    }
                }
            } catch (e) {
                console.error('Error parsing process output:', e.message);
                resolve([]);
                return;
            }

            const result = Array.from(detected.values());
            if (result.length > 0) {
                console.log(`✅ Found ${result.length} GenLogin browser profile(s)`);
            } else {
                console.log('⚠️ No GenLogin browsers detected');
            }
            resolve(result);
        });
    });
}
