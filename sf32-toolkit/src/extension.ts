import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { SerialPort } from 'serialport';

// ====================================================================
// 全局变量和辅助函数
// ====================================================================

let sf32Terminal: vscode.Terminal | undefined;
let currentBoardModel: string = 'sf32lb52-lcd_n16r8'; // 默认值
let boardStatusItem: vscode.StatusBarItem;
let serialPortStatusItem: vscode.StatusBarItem; // 串口状态栏项

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

// 路径解析函数，处理 ~ 符号
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

function updateSerialPortStatus() {
    const config = vscode.workspace.getConfiguration('sf32');
    const serialPort = config.get<string>('serialPort');
    serialPortStatusItem.text = `$(plug) Serial: ${serialPort || '未设置'}`;
    serialPortStatusItem.tooltip = `当前选择的串口: ${serialPort || '点击选择串口'}`;
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

async function selectSerialPort() {
    try {
        vscode.window.showInformationMessage('正在扫描可用串口...');
        const ports = await SerialPort.list();

        if (ports.length === 0) {
            vscode.window.showWarningMessage('未检测到任何串口设备。请确保设备已连接并驱动已安装。');
            return;
        }

        const quickPickItems = ports.map(p => ({
            label: p.path,
            description: p.manufacturer ? `${p.manufacturer} (${p.pnpId || ''})` : p.pnpId || ''
        }));

        const selectedPort = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: '选择一个串口设备',
            title: 'SF32: 选择串口'
        });

        if (selectedPort) {
            const config = vscode.workspace.getConfiguration('sf32');
            await config.update('serialPort', selectedPort.label, vscode.ConfigurationTarget.Global);
            updateSerialPortStatus();
            vscode.window.showInformationMessage(`已选择串口: ${selectedPort.label}`);
        } else {
            vscode.window.showInformationMessage('未选择串口，已取消操作。');
        }
    } catch (error: any) {
        vscode.window.showErrorMessage(`扫描串口失败: ${error.message || error}`);
        console.error('Serial port scan error:', error);
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

        const sconstructRootPath = path.join(workspaceRoot, 'SConstruct');
        const kconfigRootPath = path.join(workspaceRoot, 'Kconfig');
        const rtconfigPyRootPath = path.join(workspaceRoot, 'rtconfig.py');

        console.log(`SF32 Toolkit: 检查根目录文件存在性 -`);
        console.log(`  SConstruct (root): ${fs.existsSync(sconstructRootPath)} (${sconstructRootPath})`);
        console.log(`  Kconfig (root): ${fs.existsSync(kconfigRootPath)} (${kconfigRootPath})`);
        console.log(`  rtconfig.py (root): ${fs.existsSync(rtconfigPyRootPath)} (${rtconfigPyRootPath})`);


        if (fs.existsSync(sconstructRootPath) &&
            fs.existsSync(kconfigRootPath) &&
            fs.existsSync(rtconfigPyRootPath)) {
            isSf32Project = true;
            actualProjectPathForActivation = workspaceRoot;
            console.log(`SF32 Toolkit: 在工作区根目录检测到 SF32 项目特征。`);
        } else {
            console.log(`SF32 Toolkit: 根目录未检测到项目，尝试 'project' 子目录。`);
            const potentialSubdirProjectPath = path.join(workspaceRoot, 'project');

            const sconstructSubdirPath = path.join(potentialSubdirProjectPath, 'SConstruct');
            const kconfigSubdirPath = path.join(potentialSubdirProjectPath, 'Kconfig');
            const rtconfigPySubdirPath = path.join(potentialSubdirProjectPath, 'rtconfig.py');

            console.log(`SF32 Toolkit: 检查 'project' 子目录文件存在性 -`);
            console.log(`  SConstruct (subdir): ${fs.existsSync(sconstructSubdirPath)} (${sconstructSubdirPath})`);
            console.log(`  Kconfig (subdir): ${fs.existsSync(kconfigSubdirPath)} (${kconfigSubdirPath})`);
            console.log(`  rtconfig.py (subdir): ${fs.existsSync(rtconfigPySubdirPath)} (${rtconfigPySubdirPath})`);

            if (fs.existsSync(sconstructSubdirPath) &&
                fs.existsSync(kconfigSubdirPath) &&
                fs.existsSync(rtconfigPySubdirPath)) {
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

        // --- 创建状态栏项 ---
        boardStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
        boardStatusItem.command = 'sf32.selectBoard';
        updateBoardStatus();
        boardStatusItem.show();
        context.subscriptions.push(boardStatusItem);

        serialPortStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 102);
        serialPortStatusItem.command = 'sf32.selectSerialPort';
        updateSerialPortStatus();
        serialPortStatusItem.show();
        context.subscriptions.push(serialPortStatusItem);

        const setupEnvButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        setupEnvButton.command = 'sf32.setupEnvironment';
        setupEnvButton.text = `$(gear) Env`;
        setupEnvButton.tooltip = '点击设置 SF32 开发环境';
        setupEnvButton.show();
        context.subscriptions.push(setupEnvButton);

        const buildButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        buildButton.command = 'sf32.build';
        buildButton.text = `$(tools) Build`;
        buildButton.tooltip = '点击编译 SF32 项目';
        buildButton.show();
        context.subscriptions.push(buildButton);

        // Download 按钮
        const downloadButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
        downloadButton.command = 'sf32.download';
        downloadButton.text = `$(arrow-down) Download`;
        downloadButton.tooltip = '点击烧录 SF32 项目程序';
        downloadButton.show();
        context.subscriptions.push(downloadButton);

        const menuconfigButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
        menuconfigButton.command = 'sf32.menuconfig';
        menuconfigButton.text = `$(list-unordered) Menu`;
        menuconfigButton.tooltip = '点击打开 SF32 菜单配置';
        menuconfigButton.show();
        context.subscriptions.push(menuconfigButton);

        const cleanButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96);
        cleanButton.command = 'sf32.clean';
        cleanButton.text = `$(trash) Clean`;
        cleanButton.tooltip = '点击清理 SF32 项目';
        cleanButton.show();
        context.subscriptions.push(cleanButton);
    }

    // --- 注册命令 ---

    // 1. 设置环境命令：只执行一次环境加载和目录切换
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
            // Windows: 切换到SDK目录，执行export.ps1，再切换到项目目录
            command = `Set-Location -Path "${sdkPath}"; .\\export.ps1; Set-Location -Path "${projectPath}"`;
        } else {
            // macOS/Linux: 切换到SDK目录，执行export.sh，再切换到项目目录
            command = `cd "${sdkPath}" && . ./export.sh && cd "${projectPath}"`;
        }

        term.sendText(command);
        vscode.window.showInformationMessage('SF32 环境已设置完毕，并已切换到项目目录！');
    });

    // 2. 编译命令：直接在已设置的环境和目录中执行 SCons
    let disposableBuild = vscode.commands.registerCommand('sf32.build', async () => {
        const config = vscode.workspace.getConfiguration('sf32');
        const projectPathConfig = config.get<string>('projectPath');
        const resolvedProjectPath = resolvePath(projectPathConfig, true);

        // 提示用户先设置环境
        if (!resolvedProjectPath) {
            vscode.window.showWarningMessage('SF32 项目路径未设置。请先点击 "Env" 按钮设置开发环境，或在VS Code设置中配置 "SF32 Toolkit: Project Path"。');
            return;
        }

        const term = getSF32Terminal();
        // 假设终端当前已经在正确的项目目录下，直接执行 scons
        const sconsCommand = `scons --board=${currentBoardModel} -j16`;
        term.sendText(sconsCommand);
        vscode.window.showInformationMessage(`SF32 项目 (${currentBoardModel}) 正在编译中...`);
    });

    // 3. 菜单配置命令：直接在已设置的环境和目录中执行 SCons menuconfig
    let disposableMenuconfig = vscode.commands.registerCommand('sf32.menuconfig', async () => {
        const config = vscode.workspace.getConfiguration('sf32');
        const projectPathConfig = config.get<string>('projectPath');
        const resolvedProjectPath = resolvePath(projectPathConfig, true);

        if (!resolvedProjectPath) {
            vscode.window.showWarningMessage('SF32 项目路径未设置。请先点击 "Env" 按钮设置开发环境，或在VS Code设置中配置 "SF32 Toolkit: Project Path"。');
            return;
        }

        const term = getSF32Terminal();
        // 假设终端当前已经在正确的项目目录下，直接执行 scons menuconfig
        const menuconfigCommand = `scons --board=${currentBoardModel} --menuconfig`;
        term.sendText(menuconfigCommand);
        vscode.window.showInformationMessage(`SF32 菜单配置 (${currentBoardModel}) 已打开。`);
    });

    // 4. 清理命令：直接在已设置的环境和目录中执行 SCons clean
    let disposableClean = vscode.commands.registerCommand('sf32.clean', async () => {
        const config = vscode.workspace.getConfiguration('sf32');
        const projectPathConfig = config.get<string>('projectPath');
        const resolvedProjectPath = resolvePath(projectPathConfig, true);

        if (!resolvedProjectPath) {
            vscode.window.showWarningMessage('SF32 项目路径未设置。请先点击 "Env" 按钮设置开发环境，或在VS Code设置中配置 "SF32 Toolkit: Project Path"。');
            return;
        }

        const term = getSF32Terminal();
        // 假设终端当前已经在正确的项目目录下，直接执行 scons clean
        const cleanCommand = `scons --board=${currentBoardModel} -c`;
        term.sendText(cleanCommand);
        vscode.window.showInformationMessage(`SF32 项目 (${currentBoardModel}) 清理完成。`);
    });

    // 5. 选择开发板命令
    let disposableSelectBoard = vscode.commands.registerCommand('sf32.selectBoard', selectBoardModel);

    // 6. 选择串口命令
    let disposableSelectSerialPort = vscode.commands.registerCommand('sf32.selectSerialPort', selectSerialPort);

    // 7. 烧录 (Download) 命令：不依赖于当前终端的目录，直接调用 sftool
    let disposableDownload = vscode.commands.registerCommand('sf32.download', async () => {
        const config = vscode.workspace.getConfiguration('sf32');
        const projectPathConfig = config.get<string>('projectPath');
        const resolvedProjectPath = resolvePath(projectPathConfig, true); // 仍然获取项目路径，用于构建固件路径
        const serialPort = config.get<string>('serialPort');
        let sftoolCommandPrefix = config.get<string>('sftoolCommandPrefix');

        if (!sftoolCommandPrefix) {
            const setupSftool = await vscode.window.showWarningMessage(
                'sftool 工具调用前缀未配置。请在VS Code设置中配置 "SF32 Toolkit: Sftool Command Prefix"。' +
                '例如：`C:\\Users\\youruser\\.sifli\\tools\\sftool\\0.1.7\\sftool` (Windows) 或 `/usr/local/bin/sftool`。' +
                '请确保您提供的字符串就是可以在终端直接运行的命令前缀，**它不会被自动添加双引号**。',
                '去设置', '取消'
            );
            if (setupSftool === '去设置') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'sf32.sftoolCommandPrefix');
            }
            return;
        }

        if (!serialPort) {
            const setupSerial = await vscode.window.showWarningMessage(
                'SF32 串口号未配置。请点击状态栏的 "Serial: 未设置" 按钮进行选择。',
                '去选择串口', '取消'
            );
            if (setupSerial === '去选择串口') {
                vscode.commands.executeCommand('sf32.selectSerialPort');
            }
            return;
        }

        if (!resolvedProjectPath) {
            vscode.window.showWarningMessage('无法确定项目路径以查找固件文件。请确保工作区已打开或已配置 "SF32 Toolkit: Project Path"。');
            return;
        }
        const buildDir = path.join(resolvedProjectPath, `build_${currentBoardModel}_hcpu`);

        const bootloaderPath = path.join(buildDir, 'bootloader', 'bootloader.bin');
        const mainBinPath = path.join(buildDir, 'main.bin');
        const ftabPath = path.join(buildDir, 'ftab', 'ftab.bin');

        if (!fs.existsSync(bootloaderPath)) {
            vscode.window.showWarningMessage(`烧录文件缺失: ${bootloaderPath}。请先编译项目。`);
            return;
        }
        if (!fs.existsSync(mainBinPath)) {
            vscode.window.showWarningMessage(`烧录文件缺失: ${mainBinPath}。请先编译项目。`);
            return;
        }
        if (!fs.existsSync(ftabPath)) {
            vscode.window.showWarningMessage(`烧录文件缺失: ${ftabPath}。请先编译项目。`);
            return;
        }

        // 关键修正：将路径和地址组合后，再用双引号包裹整个字符串
        // 对于 Windows 路径，保留反斜杠，它们在双引号内是字面量。
        const formattedBootloaderParam = `"${bootloaderPath}@0x12010000"`;
        const formattedMainBinParam = `"${mainBinPath}@0x12020000"`;
        const formattedFtabParam = `"${ftabPath}@0x12000000"`;


        const downloadFilePaths = `${formattedBootloaderParam} ${formattedMainBinParam} ${formattedFtabParam}`;

        let downloadCommand: string;

        if (process.platform === 'win32') {
            // Windows: 串口名例如 "COM3"
            downloadCommand = `${sftoolCommandPrefix} -p "${serialPort}" -c SF32LB52 write_flash ${downloadFilePaths}`;
        } else {
            // macOS/Linux: 串口名例如 "/dev/ttyUSB0"
            // macOS/Linux 下路径通常是正斜杠，为了保险起见，将路径参数中的反斜杠替换为正斜杠。
            // sftoolCommandPrefix 用户设置时就应该确保其在各自平台的可执行性。
            downloadCommand = `${sftoolCommandPrefix} -p "${serialPort}" -c SF32LB52 write_flash ${downloadFilePaths.replace(/\\/g, '/')}`;
        }

        const term = getSF32Terminal();
        term.sendText(downloadCommand);
        vscode.window.showInformationMessage(`SF32 项目 (${currentBoardModel}) 正在烧录中...`);
    });

    context.subscriptions.push(
        disposableSetup,
        disposableBuild,
        disposableMenuconfig,
        disposableClean,
        disposableSelectBoard,
        disposableSelectSerialPort,
        disposableDownload
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
    if (serialPortStatusItem) {
        serialPortStatusItem.dispose();
    }
}