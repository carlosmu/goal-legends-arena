"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHammurabiServer = startHammurabiServer;
exports.spawnAuthServer = spawnAuthServer;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const beautiful_logs_1 = require("../../logic/beautiful-logs");
const log_1 = require("../../components/log");
const utils_1 = require("./utils");
const HAMMURABI_PACKAGE = '@dcl/hammurabi-server';
const HAMMURABI_VERSION = 'next';
/**
 * Registers cleanup handlers on the global process object
 * Returns a function to remove the handlers
 */
function registerProcessCleanup(cleanup) {
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('exit', cleanup);
    return () => {
        process.off('SIGTERM', cleanup);
        process.off('SIGINT', cleanup);
        process.off('exit', cleanup);
    };
}
/**
 * Find the system node binary from PATH (avoids using Electron's execPath in Creator Hub).
 */
function findSystemNode() {
    const nodeBin = /^win/.test(process.platform) ? 'node.exe' : 'node';
    const dirs = (process.env.PATH || '').split(path_1.delimiter);
    for (const dir of dirs) {
        const candidate = path_1.join(dir, nodeBin);
        try { if (fs_1.existsSync(candidate)) return candidate; } catch { /* skip */ }
    }
    return nodeBin; // fallback: hope it's on PATH
}
/**
 * Starts the Multiplayer Server process.
 * PATCH: prefers local hammurabi-test/ install (already patched login.js).
 * Falls back to npx with shell:true (required on Windows to avoid EINVAL).
 */
function startHammurabiServer(components, workingDir, realm) {
    (0, beautiful_logs_1.printProgressInfo)(components.logger, `Starting ${log_1.colors.bold('Multiplayer Server')} with realm: ${log_1.colors.bold(realm)}`);
    const env = (0, utils_1.isElectronEnvironment)() ? { ...(0, utils_1.getSpawnEnv)(), npm_config_prefix: workingDir } : (0, utils_1.getSpawnEnv)();
    // --- PATCH: try local hammurabi-test installation first ---
    const localEntry = path_1.join(workingDir, 'hammurabi-test', 'node_modules', '@dcl', 'hammurabi-server', 'dist', 'cli.js');
    if (fs_1.existsSync(localEntry)) {
        const nodeExe = (0, utils_1.isElectronEnvironment)() ? findSystemNode() : process.execPath;
        (0, beautiful_logs_1.printProgressInfo)(components.logger, `[PATCH] Using local hammurabi-test at ${localEntry}`);
        const hammurabiProcess = (0, child_process_1.spawn)(nodeExe, [localEntry, `--realm=${realm}`], { cwd: workingDir, shell: false, stdio: 'inherit', env });
        hammurabiProcess.on('error', (error) => {
            (0, beautiful_logs_1.printWarning)(components.logger, `Multiplayer Server process error: ${error.message}`);
        });
        const cleanup = () => { if (!hammurabiProcess.killed) hammurabiProcess.kill('SIGTERM'); };
        const removeCleanup = registerProcessCleanup(cleanup);
        hammurabiProcess.on('close', (code) => {
            removeCleanup();
            if (code !== 0 && code !== null) (0, beautiful_logs_1.printWarning)(components.logger, `Multiplayer Server exited with code ${code}`);
        });
        return hammurabiProcess;
    }
    // --- Fallback: use npx (shell:true required on Windows for npx.cmd) ---
    const npxArgs = ['--yes', `${HAMMURABI_PACKAGE}@${HAMMURABI_VERSION}`, `--realm=${realm}`];
    const npxCliJs = (0, utils_1.findNpxCliJs)();
    const hammurabiProcess = npxCliJs
        ? (0, child_process_1.spawn)(process.execPath, [npxCliJs, ...npxArgs], { cwd: workingDir, shell: false, stdio: 'inherit', env })
        : (0, child_process_1.spawn)((0, utils_1.getNpxBin)(), npxArgs, { cwd: workingDir, shell: true, stdio: 'inherit', env });
    hammurabiProcess.on('error', (error) => {
        (0, beautiful_logs_1.printWarning)(components.logger, `Multiplayer Server process error: ${error.message}`);
    });
    const cleanup = () => { if (!hammurabiProcess.killed) hammurabiProcess.kill('SIGTERM'); };
    const removeCleanup = registerProcessCleanup(cleanup);
    hammurabiProcess.on('close', (code) => {
        removeCleanup();
        if (code !== 0 && code !== null) (0, beautiful_logs_1.printWarning)(components.logger, `Multiplayer Server exited with code ${code}`);
    });
    return hammurabiProcess;
}
/**
 * Spawns the multiplayer server for the project.
 * In the auth-server SDK, all scenes are authoritative multiplayer.
 * Uses npx to handle installation and execution in a single step (works in Electron).
 *
 * @param components - Preview components including logger
 * @param project - The project to start the multiplayer server for
 * @param realm - The realm URL to pass to the hammurabi server
 * @returns The ChildProcess if started, undefined otherwise
 */
function spawnAuthServer(components, project, realm) {
    try {
        return startHammurabiServer(components, project.workingDirectory, realm);
    }
    catch (error) {
        (0, beautiful_logs_1.printWarning)(components.logger, `Failed to start Multiplayer Server: ${error.message}`);
        return undefined;
    }
}
//# sourceMappingURL=hammurabi-server.js.map