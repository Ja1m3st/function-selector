const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Extension "function-selector" está activa');

    let disposable = vscode.commands.registerCommand('function-selector.selectFunction', async function () {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            vscode.window.showInformationMessage('No hay editor activo');
            return;
        }

        const document = editor.document;
        const position = editor.selection.active;
        const text = document.getText();
        const offset = document.offsetAt(position);
        
        const functionRange = findFunctionAtPosition(text, offset, document);
        
        if (functionRange) {
            editor.selection = new vscode.Selection(functionRange.start, functionRange.end);
            editor.revealRange(new vscode.Range(functionRange.start, functionRange.end));
            vscode.window.showInformationMessage('Función seleccionada');
        } else {
            vscode.window.showInformationMessage('No se encontró ninguna función en esta posición');
        }
    });

    context.subscriptions.push(disposable);
}

/**
 * Encuentra el rango de una función en la posición dada
 */
function findFunctionAtPosition(text, offset, document) {
    const position = document.positionAt(offset);
    const lineNumber = position.line;
    const functionKeywords = ['function', 'def', 'void', 'int', 'char', 'float', 'double', 'public', 'private', 'protected', 'static', 'async', 'const', 'let', 'var', 'class'];
    
    let bestMatch = null;
    let bestMatchLength = Infinity;
    
    for (let i = lineNumber; i >= 0; i--) {
        const line = document.lineAt(i);
        const lineTrimmed = line.text.trim();
        
        const hasFunctionKeyword = functionKeywords.some(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`);
            return regex.test(lineTrimmed);
        });
        
        const looksLikeFunction = hasFunctionKeyword || 
                                   lineTrimmed.match(/=\s*\([^)]*\)\s*=>/) ||
                                   lineTrimmed.match(/=\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*=>/) || 
                                   lineTrimmed.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*\s*\([^)]*\)\s*[{:]/) ||
                                   lineTrimmed.match(/^\w+\s+\w+\s*\([^)]*\)\s*\{/);
        
        if (looksLikeFunction) {
            const functionLineStart = document.offsetAt(new vscode.Position(i, 0));
            const functionEnd = findFunctionEnd(text, functionLineStart, document);
            
            if (functionEnd && functionLineStart <= offset && functionEnd >= offset) {
                const matchLength = functionEnd - functionLineStart;
                
                if (matchLength < bestMatchLength) {
                    bestMatch = {
                        start: new vscode.Position(i, 0),
                        end: document.positionAt(functionEnd)
                    };
                    bestMatchLength = matchLength;
                }
            }
        }
    }
    
    return bestMatch;
}

/**
 * Tokeniza el código: elimina strings y comentarios, deja solo la estructura
 */
function tokenizeCode(text, start) {
    const result = new Array(text.length - start).fill(' ');
    let i = 0;
    
    while (start + i < text.length) {
        const char = text[start + i];
        const next = start + i + 1 < text.length ? text[start + i + 1] : '';
        
        // Comentario multilínea /* */
        if (char === '/' && next === '*') {
            i += 2;
            while (start + i < text.length - 1) {
                if (text[start + i] === '*' && text[start + i + 1] === '/') {
                    i += 2;
                    break;
                }
                i++;
            }
            continue;
        }
        
        // Comentario de línea //
        if (char === '/' && next === '/') {
            i += 2;
            while (start + i < text.length && text[start + i] !== '\n') {
                i++;
            }
            if (start + i < text.length) {
                result[i] = '\n';
                i++;
            }
            continue;
        }
        
        // String con comillas dobles "..."
        if (char === '"') {
            i++;
            while (start + i < text.length) {
                if (text[start + i] === '\\') {
                    i += 2;
                    continue;
                }
                if (text[start + i] === '"') {
                    i++;
                    break;
                }
                i++;
            }
            continue;
        }
        
        // String con comillas simples '...'
        if (char === "'") {
            i++;
            while (start + i < text.length) {
                if (text[start + i] === '\\') {
                    i += 2;
                    continue;
                }
                if (text[start + i] === "'") {
                    i++;
                    break;
                }
                i++;
            }
            continue;
        }
        
        // Template string `...`
        if (char === '`') {
            i++;
            while (start + i < text.length) {
                if (text[start + i] === '\\') {
                    i += 2;
                    continue;
                }
                if (text[start + i] === '`') {
                    i++;
                    break;
                }
                i++;
            }
            continue;
        }
        
        // Mantener el carácter tal cual
        result[i] = char;
        i++;
    }
    
    return result.join('');
}

/**
 * Encuentra el final de una función
 */
function findFunctionEnd(text, start, document) {
    let openBraceIndex = -1;
    let colonIndex = -1;
    
    const searchLimit = Math.min(start + 2000, text.length);
    
    // MEJORADO: Buscar el paréntesis de cierre ) primero
    let closingParenIndex = -1;
    let parenCount = 0;
    let foundOpenParen = false;
    
    for (let i = start; i < searchLimit; i++) {
        if (text[i] === '(') {
            foundOpenParen = true;
            parenCount++;
        } else if (text[i] === ')') {
            parenCount--;
            if (foundOpenParen && parenCount === 0) {
                closingParenIndex = i;
                break;
            }
        }
    }
    
    // Ahora buscar { o : DESPUÉS del paréntesis de cierre
    const searchStart = closingParenIndex !== -1 ? closingParenIndex : start;
    
    for (let i = searchStart; i < searchLimit; i++) {
        if (text[i] === '{' && openBraceIndex === -1) {
            openBraceIndex = i;
            break;
        }
        if (text[i] === ':' && colonIndex === -1) {
            colonIndex = i;
        }
        if (colonIndex !== -1 && text[i] === '\n') {
            break;
        }
    }
    
    // Python
    if (colonIndex !== -1 && (openBraceIndex === -1 || colonIndex < openBraceIndex)) {
        return findPythonFunctionEnd(text, start, document);
    }
    
    if (openBraceIndex === -1) {
        return null;
    }

    // Tokenizar: eliminar todos los strings y comentarios
    const tokenized = tokenizeCode(text, openBraceIndex);
    
    // Contar llaves en el texto tokenizado
    let braceCount = 1;
    
    for (let i = 1; i < tokenized.length; i++) {
        if (tokenized[i] === '{') {
            braceCount++;
        } else if (tokenized[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
                return openBraceIndex + i + 1;
            }
        }
    }
    
    return null;
}

/**
 * Encuentra el final de una función Python usando indentación
 */
function findPythonFunctionEnd(text, start, document) {
    const startPos = document.positionAt(start);
    const startLine = startPos.line;
    const lines = text.split('\n');
    const defLine = lines[startLine];
    const baseIndent = defLine.match(/^\s*/)[0].length;
    
    for (let i = startLine + 1; i < lines.length; i++) {
        const line = lines[i];
    
        if (line.trim().length === 0) {
            continue;
        }
        
        const lineIndent = line.match(/^\s*/)[0].length; 
        
        if (lineIndent <= baseIndent) {
            const prevLineEnd = document.offsetAt(new vscode.Position(i - 1, lines[i - 1].length));
            return prevLineEnd;
        }
    }
    
    return text.length;
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};