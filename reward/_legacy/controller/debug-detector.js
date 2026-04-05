const { exec } = require('child_process');

/**
 * Safely escape PowerShell arguments to prevent command injection
 * @param {string} arg - Argument to escape
 */
function escapePowerShellArg(arg) {
    // Escape single quotes for PowerShell
    return arg.replace(/'/g, "''");
}

console.log('🔍 Scanning all processes for "genlogin"...');

// Use a safer approach with proper escaping and filtering
const escapedPattern = escapePowerShellArg('genlogin');
const cmd = `Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*${escapedPattern}*' } | Select-Object ProcessId, Name, CommandLine | ConvertTo-Json -Compress`;

exec(`powershell -NoProfile -Command "${cmd}"`, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout) => {
    if (err) {
        console.error('Error scanning processes:', err.message);
        process.exit(1);
    }
    try {
        const results = JSON.parse(stdout);
        console.log('--- PROCESS SCAN RESULTS ---');
        if (Array.isArray(results)) {
            console.log(`Found ${results.length} processes containing "genlogin":`);
            results.forEach(proc => {
                console.log(`  PID: ${proc.ProcessId}, Name: ${proc.Name}`);
            });
        } else if (results) {
            console.log('Found 1 process:');
            console.log(`  PID: ${results.ProcessId}, Name: ${results.Name}`);
        } else {
            console.log('No processes found.');
        }
        console.log('---------------------------');
    } catch (parseErr) {
        console.error('Failed to parse output:', parseErr.message);
        console.log('Raw output:', stdout);
    }
});
