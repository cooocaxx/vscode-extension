# SF32 Toolkit for VS Code

这是一个专为 **SF32 微控制器**开发设计的 VS Code 扩展，旨在显著**简化 VS code 平台上的开发流程**。


![alt text](images/img.png)
---

## 核心功能

* **环境设置**: 快速配置 SF32 SDK 开发环境，确保您的终端能够正确识别所有必要的工具链。
* **项目编译**: 一键启动 SF32 项目的编译过程，支持多核并行编译（默认 `-j16`）。
* **菜单配置**: 方便地通过 VS Code 直接打开 Kconfig 菜单，图形化配置您的项目参数和功能。
* **项目清理**: 轻松清理编译生成的所有中间文件和目标文件，保持项目目录整洁。
* **开发板选择**: 通过 VS Code 底部状态栏快速切换预设或自定义的开发板型号，确保编译目标正确。
* **串口选择**: 通过 VS Code 底部状态栏快速切换串口目标，确保下载正确。

---

## 如何开始使用

1.  **打开 SF32 工程**:
    * 直接在 VS Code 中打开您的 **SF32 项目根目录**（即包含 `SConstruct`、`Kconfig` 和 `rtconfig.py` 的文件夹）。
    * 如果您的 SF32 项目位于工作区根目录下的 `project` 子目录中，直接打开父级工作区也能被插件自动识别。
2.  **配置 SDK 路径**: 在 VS Code 设置 (`Code` > `Preferences` > `Settings` 或 `文件` > `首选项` > `设置`) 中，搜索 **"SF32 Toolkit: Sdk Path"**，并填写您的 SF32 SDK 的绝对路径（例如：`~/Documents/OpenSiFli/SiFli-SDK`）。
3.  **底部状态栏**: 完成上述步骤后，VS Code 底部状态栏将出现一系列 SF32 相关按钮：`SF32 Board: <型号>`, `Env`, `Build`,`Download`, `Menu`, `Clean`。
4.  **选择开发板**: 点击 `SF32 Board: <型号>` 按钮，从列表中选择您当前使用的开发板型号。
5.  **设置环境**: 点击 `Env` 按钮，插件将为您在终端中设置好 SF32 开发环境并切换到项目目录。**此操作通常只需在每次新开终端或遇到路径问题时执行一次。**
6.  **执行操作**:
    * 点击 `Serial` 按钮选择你的串口。
    * 点击 `Build` 按钮编译您的项目。
    * 点击 `Download` 按钮下载编译项目。
    * 点击 `Menu` 按钮打开菜单配置界面。
    * 点击 `Clean` 按钮清理项目文件。

---

## 插件配置项

您可以通过 VS Code 设置 (Preferences > Settings) 来进一步配置 SF32 Toolkit：

* **`sf32.sdkPath`**: SF32 SDK 的安装路径（例如：`~/Documents/OpenSiFli/SiFli-SDK`）。**这是使用插件前必须设置的项。**
* **`sf32.projectPath`**: SF32 项目的特定路径。**通常无需手动设置**，插件会优先自动检测当前工作区根目录或其 `project` 子目录。仅在自动检测失败或您有特殊项目结构时才需要配置。
* **`sf32.customBoardModels`**:用于添加您自定义的开发板型号。这些自定义型号将显示在 `SF32 Board` 选择列表中。例如：`[my_custom_board, another_board]`。

* **`sf32.sftoolPath`**:用于添加您sftool 。将在下载中使用。例如：`[你的sftool "C:\tools\sftool\0.1.7\sftool.exe", 实际填入 "C:\tools\sftool\0.1.7\sftool"]`。