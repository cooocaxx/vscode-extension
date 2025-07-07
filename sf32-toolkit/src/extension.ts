import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// ====================================================================
// 全局变量和辅助函数（确保它们在 activate 函数之前被定义，以便全局可访问）
// ====================================================================

// 用于存储SF32专用终端实例的变量
let sf32Terminal: vscode.Terminal | undefined;
// 用于存储当前选择的开发板型号
let currentBoardModel: string = 'sf32lb52-lcd_n16r8'; // 默认值
// 用于显示当前开发板型号的状态栏项
let boardStatusItem: vscode.StatusBarItem;

// 定义预设的 SF32 开发板列表及其描述
const DEFAULT_SF32_BOARD_MODELS = [
    { label: "sf32lb52-lcd_n16r8", description: "SF32LB52 LCD 开发板 (16MB NOR, 8MB PSRAM)" },
    { label: "sf32lb52-audio_board", description: "SF32LB52 音频开发板" },
    { label: "sf32wb52-eval_board", description: "SF32WB52 评估板" },
    // 你可以在这里添加更多预设的开发板型号
];

/**
 * 获取或创建SF32开发专用的终端。
 * 如果终端不存在或已关闭/退出，则会创建一个新的。
 * @returns {vscode.Terminal} SF32开发终端实例。
 */
function getSF32Terminal(): vscode.Terminal {
    if (!sf32Terminal || sf32Terminal.exitStatus) {
        sf32Terminal = vscode.window.createTerminal(`SF32 开发终端`);
        // 当终端被用户关闭时，清理内部引用
        vscode.window.onDidCloseTerminal(e => {
            if (e === sf32Terminal) {
                sf32Terminal = undefined;
            }
        });
    }
    sf32Terminal.show(); // 确保终端可见
    return sf32Terminal;
}

/**
 * 辅助函数：解析路径，处理波浪号 "~" 和获取默认项目路径
 * 优先级：用户设置 > 工作区根目录 > 工作区'project'子目录
 * @param inputPath 用户在设置中输入的路径。
 * @param useWorkspaceRootAsDefault 如果为 true，当 inputPath 为空时，尝试自动检测项目路径。
 * @returns 解析后的绝对路径，如果无法解析或未找到工作区，则返回 undefined。
 */
function resolvePath(inputPath: string | undefined, useWorkspaceRootAsDefault: boolean = false): string | undefined {
    let resolvedPath = inputPath;

    if (!resolvedPath && useWorkspaceRootAsDefault) {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;

            // 1. 尝试检查工作区根目录是否是SF32项目
            const sconstructRootPath = path.join(workspaceRoot, 'SConstruct');
            const kconfigRootPath = path.join(workspaceRoot, 'Kconfig');
            const rtconfigPyRootPath = path.join(workspaceRoot, 'rtconfig.py');

            if (fs.existsSync(sconstructRootPath) && fs.existsSync(kconfigRootPath) && fs.existsSync(rtconfigPyRootPath)) {
                resolvedPath = workspaceRoot;
                vscode.window.showInformationMessage(`SF32 项目路径未设置，已自动使用工作区根目录: ${resolvedPath}`);
            } else {
                // 2. 如果根目录不是，再尝试 'project' 子目录
                const potentialSubdirProjectPath = path.join(workspaceRoot, 'project');
                const sconstructSubdirPath = path.join(potentialSubdirProjectPath, 'SConstruct');
                const kconfigSubdirPath = path.join(potentialSubdirProjectPath, 'Kconfig');
                const rtconfigPySubdirPath = path.join(potentialSubdirProjectPath, 'rtconfig.py');

                if (fs.existsSync(sconstructSubdirPath) && fs.existsSync(kconfigSubdirPath) && fs.existsSync(rtconfigPySubdirPath)) {
                    resolvedPath = potentialSubdirProjectPath;
                    vscode.window.showInformationMessage(`SF32 项目路径未设置，已自动使用工作区子目录: ${resolvedPath}`);
                } else {
                    vscode.window.showWarningMessage('无法自动获取SF32项目路径：工作区根目录及其"project"子目录均未检测到SF32项目特征。请手动在设置中配置SF32项目路径。');
                    return undefined; // 都没有找到，返回undefined
                }
            }
        } else {
            vscode.window.showWarningMessage('无法自动获取项目路径：未打开任何工作区文件夹。请手动在设置中配置SF32项目路径。');
            return undefined;
        }
    }

    // 处理波浪号 "~"
    if (resolvedPath && resolvedPath.startsWith('~')) {
        return path.join(os.homedir(), resolvedPath.slice(1));
    }
    return resolvedPath;
}

/**
 * 更新状态栏中显示的当前开发板型号。
 */
function updateBoardStatus() {
    boardStatusItem.text = `$(circuit-board) SF32 Board: ${currentBoardModel}`;
    boardStatusItem.tooltip = `当前选择的 SF32 开发板: ${currentBoardModel}\n点击切换开发板`;
}

/**
 * 弹出 Quick Pick 供用户选择开发板型号。
 */
async function selectBoardModel() {
    const config = vscode.workspace.getConfiguration('sf32');
    const customBoardModels = config.get<string[]>('customBoardModels') || [];

    // 将自定义板型转换为 Quick Pick Item 格式，并添加到预设列表中
    const allBoardModels = [...DEFAULT_SF32_BOARD_MODELS];
    for (const customModel of customBoardModels) {
        // 避免重复添加与默认板型同名的自定义板型，或者重复添加已有的自定义板型
        if (!allBoardModels.some(item => item.label === customModel)) {
            allBoardModels.push({ label: customModel, description: "自定义开发板" });
        }
    }

    const pick = await vscode.window.showQuickPick(
        allBoardModels,
        {
            placeHolder: "选择一个 SF32 开发板型号 (包含自定义板型)",
            title: "选择 SF32 开发板",
            canPickMany: false // 确保只能单选
        }
    );

    if (pick && pick.label !== currentBoardModel) {
        currentBoardModel = pick.label;
        updateBoardStatus();
        vscode.window.showInformationMessage(`SF32 开发板已切换为: ${currentBoardModel}`);
    } else if (!pick) {
        // 用户取消选择
        vscode.window.showInformationMessage('未选择开发板，已取消操作。');
    }
}


// ====================================================================
// 激活插件函数 (activate)
// ====================================================================

/**
 * 激活插件时执行的函数。
 * 在此函数中注册所有命令和创建状态栏项。
 * @param {vscode.ExtensionContext} context - 扩展的上下文，用于管理订阅。
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('--- SF32 Toolkit 插件正在尝试激活 ---');

    // --- 严格的 SF32 项目检查 ---
    let isSf32Project = false;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let actualProjectPathForActivation: string | undefined; // 用于存储实际检测到的项目路径

    if (workspaceFolders && workspaceFolders.length > 0) {
        const workspaceRoot = workspaceFolders[0].uri.fsPath; // 这是当前工作区的根目录
        console.log(`SF32 Toolkit: 当前工作区根目录: ${workspaceRoot}`);

        // **步骤 1: 首先检查工作区根目录本身是否是 SF32 项目**
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
            // **步骤 2: 如果根目录不是，再尝试 'project' 子目录**
            console.log(`SF32 Toolkit: 根目录未检测到项目，尝试 'project' 子目录。`);
            const potentialSubdirProjectPath = path.join(workspaceRoot, 'project');

            const sconstructPathSubdir = path.join(potentialSubdirProjectPath, 'SConstruct');
            const kconfigPathSubdir = path.join(potentialSubdirProjectPath, 'Kconfig');
            const rtconfigPyPathSubdir = path.join(potentialSubdirProjectPath, 'rtconfig.py');

            console.log(`SF32 Toolkit: 检查 'project' 子目录文件存在性 -`);
            // 修正拼写错误：kconfigSubdirPath -> kconfigPathSubdir
            console.log(`  SConstruct (subdir): ${fs.existsSync(sconstructPathSubdir)} (${sconstructPathSubdir})`);
            console.log(`  Kconfig (subdir): ${fs.existsSync(kconfigPathSubdir)} (${kconfigPathSubdir})`); // 修正此处
            // 修正拼写错误：rtconfigPySubdirPath -> rtconfigPyPathSubdir
            console.log(`  rtconfig.py (subdir): ${fs.existsSync(rtconfigPyPathSubdir)} (${rtconfigPyPathSubdir})`); // 修正此处

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
        // --- 创建状态栏项 (只在检测到 SF32 项目时创建) ---
        // boardStatusItem, updateBoardStatus, currentBoardModel 等在文件顶部已声明为全局变量
        boardStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101); // 位置靠左，优先级高
        boardStatusItem.command = 'sf32.selectBoard'; // 点击它执行选择板型的命令
        updateBoardStatus(); // 初始化显示默认板型
        boardStatusItem.show();
        context.subscriptions.push(boardStatusItem);

        const setupEnvButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        setupEnvButton.command = 'sf32.setupEnvironment';
        setupEnvButton.text = `$(gear) Env`; // 使用 Octicons 图标
        setupEnvButton.tooltip = '点击设置 SF32 开发环境';
        setupEnvButton.show();
        context.subscriptions.push(setupEnvButton);

        const buildButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        buildButton.command = 'sf32.build';
        buildButton.text = `$(tools) Build`;
        buildButton.tooltip = '点击编译 SF32 项目';
        buildButton.show();
        context.subscriptions.push(buildButton);

        const menuconfigButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
        menuconfigButton.command = 'sf32.menuconfig';
        menuconfigButton.text = `$(list-unordered) Menu`;
        menuconfigButton.tooltip = '点击打开 SF32 菜单配置';
        menuconfigButton.show();
        context.subscriptions.push(menuconfigButton);

        const cleanButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
        cleanButton.command = 'sf32.clean';
        cleanButton.text = `$(trash) Clean`;
        cleanButton.tooltip = '点击清理 SF32 项目';
        cleanButton.show();
        context.subscriptions.push(cleanButton);
    }


    // --- 注册命令 ---
    // getSF32Terminal, currentBoardModel, selectBoardModel 等在文件顶部已声明为全局变量
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

        const term = getSF32Terminal(); // 全局函数
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

        const term = getSF32Terminal(); // 全局函数
        term.sendText(`scons --board=${currentBoardModel} -j16`); // 全局变量
        vscode.window.showInformationMessage(`SF32 项目 (${currentBoardModel}) 正在编译中...`); // 全局变量
    });

    let disposableMenuconfig = vscode.commands.registerCommand('sf32.menuconfig', async () => {
        const config = vscode.workspace.getConfiguration('sf32');
        const projectPathConfig = config.get<string>('projectPath');
        const resolvedProjectPath = resolvePath(projectPathConfig, true);

        if (!resolvedProjectPath) {
            vscode.window.showWarningMessage('请先点击 "Env" 按钮设置 SF32 开发环境，或者在设置中配置 SF32 项目路径。');
            return;
        }

        const term = getSF32Terminal(); // 全局函数
        term.sendText(`scons --board=${currentBoardModel} --menuconfig`); // 全局变量
        vscode.window.showInformationMessage(`SF32 菜单配置 (${currentBoardModel}) 已打开。`); // 全局变量
    });

    let disposableClean = vscode.commands.registerCommand('sf32.clean', async () => {
        const config = vscode.workspace.getConfiguration('sf32');
        const projectPathConfig = config.get<string>('projectPath');
        const resolvedProjectPath = resolvePath(projectPathConfig, true);

        if (!resolvedProjectPath) {
            vscode.window.showWarningMessage('请先点击 "Env" 按钮设置 SF32 开发环境，或者在设置中配置 SF32 项目路径。');
            return;
        }

        const term = getSF32Terminal(); // 全局函数
        term.sendText(`scons --board=${currentBoardModel} -c`); // 全局变量
        vscode.window.showInformationMessage(`SF32 项目 (${currentBoardModel}) 清理完成。`); // 全局变量
    });

    let disposableSelectBoard = vscode.commands.registerCommand('sf32.selectBoard', selectBoardModel); // 全局函数


    context.subscriptions.push(
        disposableSetup,
        disposableBuild,
        disposableMenuconfig,
        disposableClean,
        disposableSelectBoard
    );
}

// ====================================================================
// 停用插件函数 (deactivate)
// ====================================================================

/**
 * 停用插件时执行的函数。
 * 在此函数中清理所有资源。
 */
export function deactivate() {
    console.log('--- SF32 Toolkit 插件正在停用 ---'); // 用于调试
    if (sf32Terminal) {
        sf32Terminal.dispose(); // 关闭并清理终端
    }
    if (boardStatusItem) {
        boardStatusItem.dispose(); // 清理状态栏项
    }
}