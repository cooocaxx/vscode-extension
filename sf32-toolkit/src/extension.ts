import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// ====================================================================
// 全局变量和辅助函数
// ====================================================================

let sf32Terminal: vscode.Terminal | undefined;
let currentBoardModel: string = 'sf32lb52-lcd_n16r8'; // 默认值
let boardStatusItem: vscode.StatusBarItem;

const DEFAULT_SF32_BOARD_MODELS = [
    { label: "sf32lb52-lcd_n16r8", description: "SF32LB52 LCD 开发板 (16MB NOR, 8MB PSRAM)" },
    { label: "sf32lb52-audio_board", description: "SF32LB52 音频开发板" },
    { label: "sf32wb52-eval_board", description: "SF32WB52 评估板" },
];

function getSF32Terminal(): vscode.Terminal {
    if (!sf32Terminal || sf32Terminal.exitStatus) {
        sf32Terminal = vscode.window.createTerminal(`SF32 开发终端`);
        vscode.window.onDidCloseTerminal(e => {
            if (e === sf32Terminal) {
                sf32Terminal = undefined;
            }
        });
    }
    sf32Terminal.show();
    return sf32Terminal;
}

function resolvePath(inputPath: string | undefined, useWorkspaceRootAsDefault: boolean = false): string | undefined {
    let resolvedPath = inputPath;

    if (!resolvedPath && useWorkspaceRootAsDefault) {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

            const sconstructRootPath = path.join(workspaceRoot, 'SConstruct');
            const kconfigRootPath = path.join(workspaceRoot, 'Kconfig');
            const rtconfigPyRootPath = path.join(workspaceRoot, 'rtconfig.py');

            if (fs.existsSync(sconstructRootPath) && fs.existsSync(kconfigRootPath) && fs.existsSync(rtconfigPyRootPath)) {
                resolvedPath = workspaceRoot;
                vscode.window.showInformationMessage(`SF32 项目路径未设置，已自动使用工作区根目录: ${resolvedPath}`);
            } else {
                const potentialSubdirProjectPath = path.join(workspaceRoot, 'project');
                const sconstructSubdirPath = path.join(potentialSubdirProjectPath, 'SConstruct');
                const kconfigSubdirPath = path.join(potentialSubdirProjectPath, 'Kconfig');
                const rtconfigPySubdirPath = path.join(potentialSubdirProjectPath, 'rtconfig.py');

                if (fs.existsSync(sconstructSubdirPath) && fs.existsSync(kconfigSubdirPath) && fs.existsSync(rtconfigPySubdirPath)) {
                    resolvedPath = potentialSubdirProjectPath;
                    vscode.window.showInformationMessage(`SF32 项目路径未设置，已自动使用工作区子目录: ${resolvedPath}`);
                } else {
                    vscode.window.showWarningMessage('无法自动获取SF32项目路径：工作区根目录及其"project"子目录均未检测到SF32项目特征。请手动在设置中配置SF32项目路径。');
                    return undefined;
                }
            }
        } else {
            vscode.window.showWarningMessage('无法自动获取项目路径：未打开任何工作区文件夹。请手动在设置中配置SF32项目路径。');
            return undefined;
        }
    }

    if (resolvedPath && resolvedPath.startsWith('~')) {
        return path.join(os.homedir(), resolvedPath.slice(1));
    }
    return resolvedPath;
}

function updateBoardStatus() {
    boardStatusItem.text = `$(circuit-board) SF32 Board: ${currentBoardModel}`;
    boardStatusItem.tooltip = `当前选择的 SF32 开发板: ${currentBoardModel}\n点击切换开发板`;
}

async function selectBoardModel() {
    const config = vscode.workspace.getConfiguration('sf32');
    const customBoardModels = config.get<string[]>('customBoardModels') || [];

    const allBoardModels = [...DEFAULT_SF32_BOARD_MODELS];
    for (const customModel of customBoardModels) {
        if (!allBoardModels.some(item => item.label === customModel)) {
            allBoardModels.push({ label: customModel, description: "自定义开发板" });
        }
    }

    const pick = await vscode.window.showQuickPick(
        allBoardModels,
        {
            placeHolder: "选择一个 SF32 开发板型号 (包含自定义板型)",
            title: "选择 SF32 开发板",
            canPickMany: false
        }
    );

    if (pick && pick.label !== currentBoardModel) {
        currentBoardModel = pick.label;
        updateBoardStatus();
        vscode.window.showInformationMessage(`SF32 开发板已切换为: ${currentBoardModel}`);
    } else if (!pick) {
        vscode.window.showInformationMessage('未选择开发板，已取消操作。');
    }
}


// ====================================================================
// 激活插件函数 (activate)
// ====================================================================

export function activate(context: vscode.ExtensionContext) {
    console.log('--- SF32 Toolkit 插件正在尝试激活 ---');

    let isSf32Project = false;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let actualProjectPathForActivation: string | undefined;

    if (workspaceFolders && workspaceFolders.length > 0) {
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        console.log(`SF32 Toolkit: 当前工作区根目录: ${workspaceRoot}`);

        const sconstructPathRoot = path.join(workspaceRoot, 'SConstruct');
        const kconfigPathRoot = path.join(workspaceRoot, 'Kconfig');
        const rtconfigPyPathRoot = path.join(workspaceRoot, 'rtconfig.py');

        console.log(`SF32 Toolkit: 检查根目录文件存在性 -`);
        console.log(`  SConstruct (root): ${fs.existsSync(sconstructPathRoot)} (${sconstructPathRoot})`);
        console.log(`  Kconfig (root): ${fs.existsSync(kconfigPathRoot)} (${kconfigPathRoot})`);
        console.log(`  rtconfig.py (root): ${fs.existsSync(rtconfigPyPathRoot)} (${rtconfigPyPathRoot})`);


        if (fs.existsSync(sconstructPathRoot) &&
            fs.existsSync(kconfigPathRoot) &&
            fs.existsSync(rtconfigPyPathRoot)) {
            isSf32Project = true;
            actualProjectPathForActivation = workspaceRoot;
            console.log(`SF32 Toolkit: 在工作区根目录检测到 SF32 项目特征。`);
        } else {
            console.log(`SF32 Toolkit: 根目录未检测到项目，尝试 'project' 子目录。`);
            const potentialSubdirProjectPath = path.join(workspaceRoot, 'project');

            const sconstructPathSubdir = path.join(potentialSubdirProjectPath, 'SConstruct');
            const kconfigPathSubdir = path.join(potentialSubdirProjectPath, 'Kconfig');
            const rtconfigPyPathSubdir = path.join(potentialSubdirProjectPath, 'rtconfig.py');

            console.log(`SF32 Toolkit: 检查 'project' 子目录文件存在性 -`);
            console.log(`  SConstruct (subdir): ${fs.existsSync(sconstructPathSubdir)} (${sconstructPathSubdir})`);
            console.log(`  Kconfig (subdir): ${fs.existsSync(kconfigPathSubdir)} (${kconfigPathSubdir})`);
            console.log(`  rtconfig.py (subdir): ${fs.existsSync(rtconfigPyPathSubdir)} (${rtconfigPyPathSubdir})`);

            if (fs.existsSync(sconstructPathSubdir) &&
                fs.existsSync(kconfigPathSubdir) &&
                fs.existsSync(rtconfigPyPathSubdir)) {
                isSf32Project = true;
                actualProjectPathForActivation = potentialSubdirProjectPath;
                console.log(`SF32 Toolkit: 在 'project' 子目录检测到 SF32 项目特征。`);
            }
        }
    }

    if (!isSf32Project) {
        console.log('SF32 Toolkit: 未检测到 SF32 项目特征，只注册命令，不显示状态栏按钮。');
    } else {
        console.log(`SF32 Toolkit: 检测到 SF32 项目在 ${actualProjectPathForActivation}，完全激活并显示状态栏按钮。`);

        // --- 创建状态栏项 (新增一个 Download 按钮，并调整 Build 按钮优先级) ---
        boardStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
        boardStatusItem.command = 'sf32.selectBoard';
        updateBoardStatus();
        boardStatusItem.show();
        context.subscriptions.push(boardStatusItem);

        const setupEnvButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        setupEnvButton.command = 'sf32.setupEnvironment';
        setupEnvButton.text = `$(gear) Env`;
        setupEnvButton.tooltip = '点击设置 SF32 开发环境';
        setupEnvButton.show();
        context.subscriptions.push(setupEnvButton);

        const buildButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99); // 优先级调整
        buildButton.command = 'sf32.build';
        buildButton.text = `$(tools) Build`;
        buildButton.tooltip = '点击编译 SF32 项目';
        buildButton.show();
        context.subscriptions.push(buildButton);

        // 新增 Download 按钮
        const downloadButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98); // 优先级高于 Build
        downloadButton.command = 'sf32.download';
        // downloadButton.text = `$(cloud-download) Download`;
        downloadButton.text = `$(arrow-down) Download`; //
        downloadButton.tooltip = '点击烧录 SF32 项目程序';
        downloadButton.show();
        context.subscriptions.push(downloadButton);



        const menuconfigButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97); // 优先级调整
        menuconfigButton.command = 'sf32.menuconfig';
        menuconfigButton.text = `$(list-unordered) Menu`;
        menuconfigButton.tooltip = '点击打开 SF32 菜单配置';
        menuconfigButton.show();
        context.subscriptions.push(menuconfigButton);

        const cleanButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96); // 优先级调整
        cleanButton.command = 'sf32.clean';
        cleanButton.text = `$(trash) Clean`;
        cleanButton.tooltip = '点击清理 SF32 项目';
        cleanButton.show();
        context.subscriptions.push(cleanButton);
    }

    // --- 注册命令 ---
    // (省略重复的代码以保持简洁，但请确保在你的文件中这些命令都是完整的)
    let disposableSetup = vscode.commands.registerCommand('sf32.setupEnvironment', async () => {
        const config = vscode.workspace.getConfiguration('sf32');
        let sdkPath = resolvePath(config.get<string>('sdkPath'));
        let projectPath = resolvePath(config.get<string>('projectPath'), true);

        if (!sdkPath) {
            vscode.window.showErrorMessage('SF32 SDK路径未配置。请在VS Code设置中配置 "SF32 Toolkit: Sdk Path"！');
            return;
        }
        if (!projectPath) {
            return;
        }

        const term = getSF32Terminal();
        let command: string;

        if (process.platform === 'win32') {
            command = `Set-Location -Path "${sdkPath}"; .\\export.ps1; Set-Location -Path "${projectPath}"`;
        } else {
            command = `cd "${sdkPath}" && . ./export.sh && cd "${projectPath}"`;
        }

        term.sendText(command);
        vscode.window.showInformationMessage('SF32 环境已设置完毕，并已切换到项目目录！');
    });

    let disposableBuild = vscode.commands.registerCommand('sf32.build', async () => {
        const config = vscode.workspace.getConfiguration('sf32');
        const projectPathConfig = config.get<string>('projectPath');
        const resolvedProjectPath = resolvePath(projectPathConfig, true);

        if (!resolvedProjectPath) {
            vscode.window.showWarningMessage('请先点击 "Env" 按钮设置 SF32 开发环境，或者在设置中配置 SF32 项目路径。');
            return;
        }

        const term = getSF32Terminal();
        term.sendText(`scons --board=${currentBoardModel} -j16`);
        vscode.window.showInformationMessage(`SF32 项目 (${currentBoardModel}) 正在编译中...`);
    });

    let disposableMenuconfig = vscode.commands.registerCommand('sf32.menuconfig', async () => {
        const config = vscode.workspace.getConfiguration('sf32');
        const projectPathConfig = config.get<string>('projectPath');
        const resolvedProjectPath = resolvePath(projectPathConfig, true);

        if (!resolvedProjectPath) {
            vscode.window.showWarningMessage('请先点击 "Env" 按钮设置 SF32 开发环境，或者在设置中配置 SF32 项目路径。');
            return;
        }

        const term = getSF32Terminal();
        term.sendText(`scons --board=${currentBoardModel} --menuconfig`);
        vscode.window.showInformationMessage(`SF32 菜单配置 (${currentBoardModel}) 已打开。`);
    });

    let disposableClean = vscode.commands.registerCommand('sf32.clean', async () => {
        const config = vscode.workspace.getConfiguration('sf32');
        const projectPathConfig = config.get<string>('projectPath');
        const resolvedProjectPath = resolvePath(projectPathConfig, true);

        if (!resolvedProjectPath) {
            vscode.window.showWarningMessage('请先点击 "Env" 按钮设置 SF32 开发环境，或者在设置中配置 SF32 项目路径。');
            return;
        }

        const term = getSF32Terminal();
        term.sendText(`scons --board=${currentBoardModel} -c`);
        vscode.window.showInformationMessage(`SF32 项目 (${currentBoardModel}) 清理完成。`);
    });

    let disposableSelectBoard = vscode.commands.registerCommand('sf32.selectBoard', selectBoardModel);

    // --- 新增烧录 (Download) 命令 ---
    let disposableDownload = vscode.commands.registerCommand('sf32.download', async () => {
        const config = vscode.workspace.getConfiguration('sf32');
        const projectPathConfig = config.get<string>('projectPath');
        const resolvedProjectPath = resolvePath(projectPathConfig, true);

        if (!resolvedProjectPath) {
            vscode.window.showWarningMessage('请先点击 "Env" 按钮设置 SF32 开发环境，或者在设置中配置 SF32 项目路径。');
            return;
        }

        const term = getSF32Terminal();
        let downloadCommand: string;
        const buildDirName = `build_${currentBoardModel}`; // 例如: build_sf32lb52-lcd_n16r8_hcpu

        if (process.platform === 'win32') {
            // Windows 烧录命令: ./build_sf32lb52-lcd_n16r8_hcpu/uart_download.bat
            downloadCommand = `./${buildDirName + '_hcpu'}/uart_download.bat`;
        } else {
            // macOS/Linux 烧录命令: ./build_sf32lb52-lcd_n16r8_hcpu/uart_download.sh
            downloadCommand = `./${buildDirName + '_hcpu'}/uart_download.sh`;
        }

        term.sendText(downloadCommand);
        vscode.window.showInformationMessage(`SF32 项目 (${currentBoardModel}) 正在烧录中...`);
    });

    context.subscriptions.push(
        disposableSetup,
        disposableBuild,
        disposableMenuconfig,
        disposableClean,
        disposableSelectBoard,
        disposableDownload // 将新命令添加到订阅列表
    );
}

// ====================================================================
// 停用插件函数 (deactivate)
// ====================================================================

export function deactivate() {
    console.log('--- SF32 Toolkit 插件正在停用 ---');
    if (sf32Terminal) {
        sf32Terminal.dispose();
    }
    if (boardStatusItem) {
        boardStatusItem.dispose();
    }
}