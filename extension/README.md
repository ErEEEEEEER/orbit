# ORBIT 原生新标签页扩展

适用于 Windows 和 macOS 的 Chrome。页面、星轨、字体、背景和五个默认网站图标均在本地加载，不经过网页重定向。搜索、打开网站、天气和新增网站的远程图标仍需联网。

## 安装

1. 将 ZIP 解压到一个准备长期保留的文件夹，例如文档中的 ORBIT。
2. 在 Chrome 地址栏打开 chrome://extensions 。
3. 停用 Infinity、New Tab Redirect 等其他新标签页扩展。
4. 打开右上角“开发者模式”。
5. 点击“加载已解压的扩展程序”，选择包含 manifest.json 的文件夹。
6. 打开一个新标签页；如果 Chrome 询问是否保留更改，选择保留。

安装后请保留这个文件夹。不要直接选择 ZIP，也不要双击 index.html。

## 数据与权限

收藏、城市和动画设置保存在当前扩展的本地存储中。网站版和扩展版的存储互相独立，默认五个收藏已内置；之前自行添加的收藏需要在扩展中重新添加。两台电脑目前各自保存设置。

扩展仅申请两个天气服务域名的网络权限。没有浏览历史、浏览器书签、网页注入或邮箱读取权限。Outlook 入口目前只是打开邮箱，未连接未读消息功能。

所有脚本、字体及背景均随包提供。自定义网站的 favicon 通过 Google 图标服务获取，可在断网时回退为文字。

## 更新

用新版本文件覆盖原文件夹，然后在 chrome://extensions 点击 ORBIT 的刷新按钮。保持文件夹路径不变，以保留当前扩展身份和本地设置。卸载可能清除设置。

## 关于 CRX

这是 Manifest V3 原生 Chrome 扩展。Windows/macOS 的普通 Chrome 对商店外 CRX 有安装限制，因此个人使用提供官方支持的“加载已解压”方式。以后如需商店一键安装及自动更新，可另行提交 Chrome Web Store。

官方说明：https://developer.chrome.com/docs/extensions/how-to/distribute
