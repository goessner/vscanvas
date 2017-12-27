/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan Goessner - 2017-18. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 * (s. )
 *--------------------------------------------------------------------------------------------*/
'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const webSocket = require('ws');

const ContentProvider = {  // factory class ...
    create: function () { let o = Object.create(this.prototype); o.constructor.apply(o, arguments); return o; },
    prototype: {
        constructor: function (context, wssurl) {
            this.emitter = new vscode.EventEmitter();
            this.wssurl = wssurl;
            this.basePath = context.asAbsolutePath('.');
            this._waiting = false;
        },
        provideTextDocumentContent: function (uri, token) {
            if (!token || !token.isCancellationRequested) {
                return ContentProvider.template(vscode.window.activeTextEditor.document.getText(), this.wssurl);
            }
        },
        get onDidChange() { return this.emitter.event; },
        update: function (uri, socket, channel) {
            if (!this._waiting) {
                this._waiting = true;
                setTimeout(() => {
                    this._waiting = false;
                    this.emitter.fire(uri);
                }, 300);
            }
        }
    },
    template: function (code, url) {
        let tmplpath = path.dirname(vscode.window.activeTextEditor.document.uri.fsPath);
        // static global template
        //let tmpl = fs.readFileSync(vscode.extensions.getExtension("goessner.vscanvas").extensionPath + '/template.html', 'UTF-8');
        // custom local template
        let tmpl = fs.readFileSync(tmplpath + '/template.html', 'UTF-8');
        tmpl =  tmpl.replace(/\$\{url\}/g, url)
                    .replace(/\$\{code\}/g, code)
                    .replace(/\$\{tmplpath\}/g, tmplpath)
//        console.log(tmpl)
        return tmpl;
    }
}

exports.activate = function activate(context) {
    const previewUri = vscode.Uri.parse('vscanvas://extension/vscanvas');
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    const promise = new Promise((resolve, reject) => {
        let provider;
        const server = new webSocket.Server({ port: 0 });
        server.on('listening', () => {
            let wssurl = 'ws://127.0.0.1:' + server._server.address().port;
            server.on('connection', ws => {
                ws.on('message', msg => {
                    if (typeof msg === 'string') { // pingback message to client debug-console
                        vscode.debug.activeDebugConsole.append(msg+'\n');
                    } 
                    else { console.error(`Unhandled message type: ${typeof msg}`); }
                });
            });

            provider = ContentProvider.create(context, wssurl);
            context.subscriptions.push(
                vscode.workspace.registerTextDocumentContentProvider('vscanvas',provider)
            );

            vscode.workspace.onDidChangeTextDocument(evt => {
                provider.update(previewUri);
            });
          
            resolve();
        });

        context.subscriptions.push(new vscode.Disposable(() => { server.close(); }));

        // Note that the second argument to registerCommand() must be executed asynchronously 
        // because `promise` has not been assigned yet.
        var disposable = vscode.commands.registerCommand('extension.canvasPreview', () => {
            promise.then(() => {
                vscode.commands.executeCommand(
                    'vscode.previewHtml',
                    previewUri,
                    vscode.ViewColumn.Two,
                    'Canvas Preview: '+path.basename(vscode.window.activeTextEditor.document.uri.fsPath)
                  ).then(null, vscode.window.showErrorMessage);
                statusBarItem.hide();
            });
        });

        context.subscriptions.push(disposable);
    });

    statusBarItem.text = `$(file-media) vscanvas`;
    statusBarItem.command = 'extension.canvasPreview';
    statusBarItem.show();
}

// this method is called when your extension is deactivated
exports.deactivate = function deactivate() {}
